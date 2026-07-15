import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createK8sSim } from '../k8sSim.js';
import { qosOf, parseMem, parseCpu, K8S_NODE_ALLOC } from '../k8s/engine.js';
import { CKAD_LABS } from '../../data/ckadLabs.js';
import { makeRunner } from './helpers.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function boot({ starterFiles = {} } = {}) {
  const flags = new Set();
  const sim = createK8sSim({ starterFiles, onMission: (id) => flags.add(id) });
  const runner = makeRunner(sim);
  const settle = (cycles = 30) => {
    for (let i = 0; i < cycles; i++) {
      sim.reconcile();
      vi.advanceTimersByTime(2000);
    }
  };
  return { sim, runner, settle, flags };
}

/* ---------- engine units ---------- */

describe('resource parsing & QoS', () => {
  it('parses memory and cpu quantities', () => {
    expect(parseMem('512Mi')).toBe(512);
    expect(parseMem('1Gi')).toBe(1024);
    expect(parseMem(undefined)).toBe(null);
    expect(parseCpu('250m')).toBe(250);
    expect(parseCpu('1')).toBe(1000);
    expect(parseCpu('0.5')).toBe(500);
  });

  it('assigns QoS classes like the real API server', () => {
    const { sim } = boot();
    const e = sim.engine;
    const mk = (name, resources) => e.makePod({ name, image: 'nginx', resources, nodeName: 'worker-1' });
    expect(qosOf(mk('be', null))).toBe('BestEffort');
    expect(qosOf(mk('bu', { requests: { cpu: '100m' } }))).toBe('Burstable');
    expect(qosOf(mk('gu', { requests: { cpu: '250m', memory: '256Mi' }, limits: { cpu: '250m', memory: '256Mi' } }))).toBe('Guaranteed');
    // only limits set → requests default to limits → still Guaranteed
    expect(qosOf(mk('gu2', { limits: { cpu: '1', memory: '1Gi' } }))).toBe('Guaranteed');
  });
});

describe('scheduler resource capacity', () => {
  it('leaves an oversized request Pending with Insufficient memory', () => {
    const { sim, runner, settle } = boot();
    sim.engine.makePod({ name: 'big', image: 'nginx', resources: { requests: { memory: '4Gi' } } });
    settle(5);
    const p = sim.engine.get('Pod', 'default', 'big');
    expect(p.status.state).toBe('Pending');
    expect(runner.run('kubectl get events').text).toContain('Insufficient memory');
  });

  it('schedules once the request fits', () => {
    const { sim, settle } = boot();
    sim.engine.makePod({ name: 'ok', image: 'nginx', resources: { requests: { memory: '512Mi', cpu: '250m' } } });
    settle(5);
    expect(sim.engine.get('Pod', 'default', 'ok').status.ready).toBe(true);
  });
});

describe('probes & app faults', () => {
  const probes = {
    readinessProbe: { httpGet: { path: '/healthz', port: 80 }, periodSeconds: 2, failureThreshold: 3 },
    livenessProbe: { httpGet: { path: '/', port: 80 }, periodSeconds: 2, failureThreshold: 5 },
  };

  it('liveness failure restarts the container and cures the hang', () => {
    const { sim, settle } = boot();
    sim.engine.makeDeployment({ name: 'web', replicas: 1, image: 'nginx', containerPort: 80, ...probes });
    settle(5);
    const pod = sim.engine.list('Pod').find((p) => p.sim.owner === 'default/web');
    sim.engine.setAppState(pod, 'hang');
    settle(10);
    expect(pod.status.restarts).toBeGreaterThanOrEqual(1);
    expect(pod.sim.app).toBe('ok');
    expect(pod.status.ready).toBe(true);
  });

  it('readiness failure removes the pod from endpoints without a restart', () => {
    const { sim, settle } = boot();
    sim.engine.makeDeployment({ name: 'web', replicas: 1, image: 'nginx', containerPort: 80, ...probes });
    const svc = sim.engine.makeService({ name: 'web', selector: { app: 'web' }, port: 80 });
    settle(5);
    const pod = sim.engine.list('Pod').find((p) => p.sim.owner === 'default/web');
    expect(sim.engine.endpointsOf(svc).length).toBe(1);
    sim.engine.setAppState(pod, '503');
    settle(10);
    expect(pod.status.ready).toBe(false);
    expect(pod.status.restarts).toBe(0);
    expect(sim.engine.endpointsOf(svc).length).toBe(0);
    sim.engine.setAppState(pod, 'ok');
    expect(pod.status.ready).toBe(true);
  });

  it('a pod without probes stays Ready even when the app hangs (the trap)', () => {
    const { sim, settle } = boot();
    sim.engine.makeDeployment({ name: 'legacy', replicas: 1, image: 'httpd' });
    settle(5);
    const pod = sim.engine.list('Pod').find((p) => p.sim.owner === 'default/legacy');
    sim.engine.setAppState(pod, 'hang');
    settle(10);
    expect(pod.status.ready).toBe(true);
    expect(pod.status.restarts).toBe(0);
  });
});

describe('memory limits & OOMKill', () => {
  it('OOMKills a leaking container at its limit and restarts it', () => {
    const { sim, runner, settle } = boot();
    sim.engine.makePod({ name: 'hog', image: 'busybox', command: ['sh', '-c', 'sleep infinity'], resources: { limits: { memory: '128Mi' } } });
    settle(5);
    const pod = sim.engine.get('Pod', 'default', 'hog');
    sim.engine.setLeak(pod, true);
    settle(10);
    expect(pod.sim.oomCount).toBeGreaterThanOrEqual(1);
    expect(pod.status.restarts).toBeGreaterThanOrEqual(1);
    expect(runner.run('kubectl get events').text).toContain('exit code 137');
    expect(runner.run('kubectl describe pod hog').text).toContain('OOMKilled');
  });

  it('without a limit the leak just grows (capped at node memory)', () => {
    const { sim, settle } = boot();
    sim.engine.makePod({ name: 'hog', image: 'busybox', command: ['sh', '-c', 'sleep infinity'] });
    settle(5);
    const pod = sim.engine.get('Pod', 'default', 'hog');
    sim.engine.setLeak(pod, true);
    settle(50);
    expect(pod.sim.oomCount || 0).toBe(0);
    expect(pod.sim.memMi).toBe(K8S_NODE_ALLOC.memMi);
  });

  it('kubectl top pods shows live usage', () => {
    const { sim, runner, settle, flags } = boot();
    sim.engine.makeDeployment({ name: 'api', replicas: 1, image: 'redis' });
    settle(5);
    const out = runner.run('kubectl top pods').text;
    expect(out).toMatch(/NAME\s+CPU\(cores\)\s+MEMORY\(bytes\)/);
    expect(out).toMatch(/api-\S+\s+\d+m\s+\d+Mi/);
    expect(flags.has('top')).toBe(true);
  });
});

describe('ConfigMap/Secret consumption', () => {
  const applyAppPod = (runner, sim) => {
    sim.files.write('app.yaml', [
      'apiVersion: v1', 'kind: Pod', 'metadata:', '  name: app', 'spec:', '  containers:',
      '  - name: app', '    image: nginx', '    env:', '    - name: APP_COLOR', '      valueFrom:',
      '        configMapKeyRef: {name: app-config, key: APP_COLOR}',
      '    volumeMounts:', '    - name: creds', '      mountPath: /etc/creds',
      '  volumes:', '  - name: creds', '    secret: {secretName: db-secret}',
    ].join('\n'));
    return runner.run('kubectl apply -f app.yaml');
  };

  it('holds the pod in CreateContainerConfigError until the refs exist, then self-heals', () => {
    const { sim, runner, settle } = boot();
    applyAppPod(runner, sim);
    settle(5);
    const pod = sim.engine.get('Pod', 'default', 'app');
    expect(pod.status.state).toBe('CreateContainerConfigError');
    expect(runner.run('kubectl get events').text).toContain('configmap "app-config" not found');
    runner.run('kubectl create configmap app-config --from-literal=APP_COLOR=blue');
    runner.run('kubectl create secret generic db-secret --from-literal=password=hunter2');
    settle(10);
    expect(pod.status.state).toBe('Running');
    expect(pod.status.ready).toBe(true);
  });

  it('exec resolves env refs and mounted secret files (decoded)', () => {
    const { sim, runner, settle, flags } = boot();
    runner.run('kubectl create configmap app-config --from-literal=APP_COLOR=blue');
    runner.run('kubectl create secret generic db-secret --from-literal=password=hunter2');
    applyAppPod(runner, sim);
    settle(10);
    expect(runner.run('kubectl exec app -- env').text).toContain('APP_COLOR=blue');
    expect(runner.run('kubectl exec app -- cat /etc/creds/password').text).toContain('hunter2');
    expect(runner.run('kubectl exec app -- cat /etc/creds/nope').errors.join('')).toContain('No such file');
    expect(flags.has('cfg-env')).toBe(true);
    expect(flags.has('cfg-cat')).toBe(true);
  });
});

/* ---------- the labs themselves ---------- */

describe.each(CKAD_LABS.map((l) => [l.id, l]))('ckad lab %s', (id, lab) => {
  it('starts with every mission incomplete', () => {
    const { sim, settle, flags } = boot({ starterFiles: lab.starterFiles });
    lab.setup(sim.engine, sim.files);
    settle(8);
    const res = lab.missions.map((m) => !!m.check(sim.engine, flags));
    expect(res).not.toContain(true);
  });

  it('is fully solvable by the reference solution', () => {
    const { sim, runner, settle, flags } = boot({ starterFiles: lab.starterFiles });
    lab.setup(sim.engine, sim.files);
    settle(5);
    lab.solve(sim, (cmd) => runner.run(cmd), settle);
    settle(40);
    const res = lab.missions.map((m) => !!m.check(sim.engine, flags));
    expect(res, lab.missions.map((m, i) => `${res[i] ? '✓' : '✗'} ${m.id}`).join(' | ')).not.toContain(false);
  });

  it('has complete bilingual content', () => {
    for (const f of [lab.tab, lab.title, lab.brief]) { expect(f.en).toBeTruthy(); expect(f.ko).toBeTruthy(); }
    expect(lab.missions.length).toBeGreaterThanOrEqual(3);
    for (const m of lab.missions) { expect(m.desc.en).toBeTruthy(); expect(m.desc.ko).toBeTruthy(); }
    expect(lab.docs.length).toBeGreaterThanOrEqual(1);
  });
});
