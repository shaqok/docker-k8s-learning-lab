import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createK8sSim } from '../k8sSim.js';
import { mainContainer, qosOf } from '../k8s/engine.js';
import { POD_LABS } from '../../data/podLabs.js';
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

/* ---------- engine units: multi-container pods ---------- */

describe('multi-container pod engine behavior', () => {
  it('runs initContainers to completion, in order, before any main container starts', () => {
    const { sim, settle } = boot();
    const e = sim.engine;
    e.makePod({
      name: 'seq', labels: {},
      initContainers: [{ name: 'a', image: 'busybox', command: ['sh', '-c', 'sleep 1'] }, { name: 'b', image: 'busybox', command: ['sh', '-c', 'sleep 1'] }],
      containers: [{ name: 'main', image: 'nginx:1.27' }],
    });
    e.reconcile();
    expect(e.get('Pod', 'default', 'seq').status.state).toBe('Init:0/2');
    settle(30);
    const p = e.get('Pod', 'default', 'seq');
    expect(p.status.state).toBe('Running');
    expect(p.status.ready).toBe(true);
    expect(p.status.initContainerStatuses.every((cs) => cs.state === 'Terminated')).toBe(true);
  });

  it('READY is all-containers-ready; a crashing sidecar does not affect the main container', () => {
    const { sim, settle } = boot();
    const e = sim.engine;
    e.makePod({
      name: 'two', labels: {},
      containers: [{ name: 'main', image: 'nginx:1.27' }, { name: 'bad', image: 'busybox', command: ['sh', '-c', 'exit 1'] }],
    });
    settle(25);
    const p = e.get('Pod', 'default', 'two');
    expect(p.status.ready).toBe(false);
    const main = p.status.containerStatuses.find((c) => c.name === 'main');
    const bad = p.status.containerStatuses.find((c) => c.name === 'bad');
    expect(main.ready).toBe(true);
    expect(bad.state).toBe('CrashLoopBackOff');
  });

  it('setAppState(pod, containerName, state) targets one container independently', () => {
    const { sim, settle } = boot();
    const e = sim.engine;
    const probe = { httpGet: { path: '/', port: 80 }, periodSeconds: 2, failureThreshold: 3 };
    e.makePod({
      name: 'three', labels: {},
      containers: [
        { name: 'main', image: 'nginx:1.27', readinessProbe: probe },
        { name: 'side', image: 'busybox', command: ['sh', '-c', 'sleep infinity'], ports: [{ containerPort: 80 }], readinessProbe: probe },
      ],
    });
    settle(5);
    e.setAppState(e.get('Pod', 'default', 'three'), 'side', 'hang');
    settle(10);
    const p = e.get('Pod', 'default', 'three');
    const main = p.status.containerStatuses.find((c) => c.name === 'main');
    const side = p.status.containerStatuses.find((c) => c.name === 'side');
    expect(main.ready).toBe(true);
    expect(side.ready).toBe(false);
    expect(p.status.ready).toBe(false);
  });

  it('qosOf requires every container to qualify for Guaranteed', () => {
    const { sim } = boot();
    const e = sim.engine;
    e.makePod({
      name: 'g', labels: {},
      containers: [
        { name: 'a', image: 'redis', resources: { requests: { cpu: '250m', memory: '256Mi' }, limits: { cpu: '250m', memory: '256Mi' } } },
        { name: 'b', image: 'busybox', command: ['sh', '-c', 'sleep infinity'] },
      ],
    });
    expect(qosOf(e.get('Pod', 'default', 'g'))).toBe('Burstable');
  });

  it('mainContainer() is the seam every legacy call site migrates through', () => {
    const { sim } = boot();
    const p = sim.engine.makePod({ name: 'legacy', image: 'nginx' });
    expect(mainContainer(p).image).toBe('nginx');
  });

  it('shows a transient PodInitializing state between the last initContainer finishing and the main containers starting', () => {
    const { sim, settle } = boot();
    const e = sim.engine;
    e.makePod({
      name: 'seq2', labels: {},
      initContainers: [{ name: 'a', image: 'busybox', command: ['sh', '-c', 'sleep 1'] }],
      containers: [{ name: 'main', image: 'nginx:1.27' }],
    });
    e.reconcile();
    vi.advanceTimersByTime(800); // past the init container's own delay (500-800ms), short of the PodInitializing->main-phase delay (400-700ms more)
    expect(e.get('Pod', 'default', 'seq2').status.state).toBe('PodInitializing');
    settle(30);
    expect(e.get('Pod', 'default', 'seq2').status.state).toBe('Running');
  });

  it('a pod created from a multi-container Deployment template does not alias the template\'s container objects', () => {
    const { sim, runner, settle } = boot();
    const e = sim.engine;
    e.makeDeployment({
      name: 'dep', replicas: 1,
      containers: [{ name: 'a', image: 'nginx:1.27' }, { name: 'b', image: 'busybox', command: ['sh', '-c', 'sleep infinity'] }],
    });
    settle(25);
    const before = e.list('Pod').find((p) => p.sim.owner === 'default/dep').spec.containers.find((c) => c.name === 'a').image;
    expect(before).toBe('nginx:1.27');
    runner.run('kubectl set image deployment/dep a=nginx:1.28');
    // the OLD pod (not yet rolled) must still report its original image —
    // set image must not retroactively mutate an already-created pod's spec.
    const stillOld = e.list('Pod').find((p) => p.sim.owner === 'default/dep' && p.spec.containers.find((c) => c.name === 'a').image === 'nginx:1.27');
    expect(stillOld).toBeTruthy();
  });

  it('a multi-container pod stuck on a missing ConfigMap ref reports the error on every containerStatuses entry', () => {
    const { sim, settle } = boot();
    const e = sim.engine;
    e.makePod({
      name: 'cfgstuck', labels: {},
      containers: [
        { name: 'main', image: 'nginx:1.27', env: [{ name: 'X', valueFrom: { configMapKeyRef: { name: 'missing-cm', key: 'k' } } }] },
        { name: 'side', image: 'busybox', command: ['sh', '-c', 'sleep infinity'] },
      ],
    });
    settle(10);
    const p = e.get('Pod', 'default', 'cfgstuck');
    expect(p.status.state).toBe('CreateContainerConfigError');
    expect(p.status.containerStatuses.every((cs) => cs.state === 'CreateContainerConfigError')).toBe(true);
  });

  it('does not fire the heal mission for a replacement pod that still has a permanently crashing container', () => {
    const { sim, settle, flags } = boot();
    const e = sim.engine;
    e.makeDeployment({
      name: 'crashy', replicas: 1,
      containers: [{ name: 'main', image: 'nginx:1.27' }, { name: 'bad', image: 'busybox', command: ['sh', '-c', 'exit 1'] }],
    });
    settle(25);
    const p = e.list('Pod').find((x) => x.sim.owner === 'default/crashy');
    e.deletePodAndHeal(p); // arms the heal-detection window
    settle(25);
    expect(flags.has('heal')).toBe(false);
  });
});

/* ---------- kubectl fidelity ---------- */

describe('kubectl fidelity for multi-container pods', () => {
  it('READY shows N/M and describe lists an Init Containers section', () => {
    const { sim, runner, settle } = boot();
    sim.engine.makePod({
      name: 'multi', labels: {},
      initContainers: [{ name: 'init-db', image: 'busybox', command: ['sh', '-c', 'sleep 1'] }],
      containers: [{ name: 'app', image: 'nginx:1.27' }, { name: 'side', image: 'busybox', command: ['sh', '-c', 'sleep infinity'] }],
    });
    settle(25);
    expect(runner.run('kubectl get pods').text).toMatch(/multi\s+2\/2\s+Running/);
    const desc = runner.run('kubectl describe pod multi').text;
    expect(desc).toContain('Init Containers:');
    expect(desc).toContain('init-db');
  });

  it('logs/exec require -c on a multi-container pod and honor it', () => {
    const { sim, runner, settle } = boot();
    sim.engine.makePod({
      name: 'multi', labels: {},
      containers: [{ name: 'app', image: 'nginx:1.27' }, { name: 'side', image: 'busybox', command: ['sh', '-c', 'sleep infinity'] }],
    });
    settle(25);
    expect(runner.run('kubectl logs multi').errors.join('')).toContain('a container name must be specified');
    expect(runner.run('kubectl logs multi -c side').errors.length).toBe(0);
    expect(runner.run('kubectl exec multi -- env').errors.join('')).toContain('a container name must be specified');
    expect(runner.run('kubectl exec multi -c side -- env').errors.length).toBe(0);
  });

  it('describe deployment lists every container in the template, not just the first', () => {
    const { sim, runner, settle } = boot();
    sim.engine.makeDeployment({
      name: 'multidep', replicas: 1,
      containers: [{ name: 'app', image: 'nginx:1.27' }, { name: 'side', image: 'busybox', command: ['sh', '-c', 'sleep infinity'] }],
    });
    settle(25);
    const desc = runner.run('kubectl describe deployment multidep').text;
    expect(desc).toContain('app');
    expect(desc).toContain('side');
    expect(desc).toContain('nginx:1.27');
  });

  it('set image deployment/NAME *=IMAGE updates every container, matching real kubectl', () => {
    const { sim, runner, settle } = boot();
    sim.engine.makeDeployment({
      name: 'multidep', replicas: 1,
      containers: [{ name: 'app', image: 'nginx:1.27' }, { name: 'side', image: 'busybox', command: ['sh', '-c', 'sleep infinity'] }],
    });
    settle(25);
    runner.run('kubectl set image deployment/multidep *=busybox:1.36');
    const d = sim.engine.get('Deployment', 'default', 'multidep');
    expect(d.spec.template.spec.containers.every((c) => c.image === 'busybox:1.36')).toBe(true);
  });
});

/* ---------- the lab itself ---------- */

describe.each(POD_LABS.map((l) => [l.id, l]))('pod lab %s', (id, lab) => {
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
