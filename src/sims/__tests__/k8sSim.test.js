import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createK8sSim } from '../k8sSim.js';
import { makeRunner } from './helpers.js';

let sim, missions, runner;

/** Alternate reconcile + timer advance until the cluster settles. */
function settle(cycles = 25) {
  for (let i = 0; i < cycles; i++) {
    sim.reconcile();
    vi.advanceTimersByTime(2000);
  }
}

/** Pod rows from `kubectl get pods` output (skips header / "No resources"). */
function podRows() {
  const out = runner.run('kubectl get pods').text;
  return out
    .split('\n')
    .filter((l) => /Running|Pending|ContainerCreating|Terminating|CrashLoopBackOff|ImagePullBackOff|Completed|Error/.test(l))
    .map((l) => ({ name: l.trim().split(/\s+/)[0], line: l }));
}

beforeEach(() => {
  vi.useFakeTimers();
  missions = [];
  sim = createK8sSim({ onMission: (id) => missions.push(id) });
  runner = makeRunner(sim);
});

afterEach(() => vi.useRealTimers());

describe('cluster basics', () => {
  it('get nodes lists the 3-node cluster and fires the mission', () => {
    const r = runner.run('kubectl get nodes');
    expect(r.text).toContain('control-plane');
    expect(r.text).toContain('worker-1');
    expect(r.text).toContain('worker-2');
    expect(missions).toContain('nodes');
  });

  it('non-kubectl commands are rejected', () => {
    expect(runner.run('ls').errors.length).toBe(1);
    expect(runner.run('docker ps').errors.length).toBe(1);
  });

  it('unknown resource type errors', () => {
    expect(runner.run('kubectl get bananas').errors.join('')).toContain("doesn't have a resource type");
  });
});

describe('deployments & reconciliation', () => {
  it('create deployment converges to N running pods', () => {
    const r = runner.run('kubectl create deployment web --image=nginx --replicas=3');
    expect(r.text).toContain('deployment.apps/web created');
    expect(missions).toContain('create');
    settle();
    const rows = podRows();
    expect(rows.length).toBe(3);
    expect(rows.every((p) => p.line.includes('Running'))).toBe(true);
  });

  it('duplicate deployment name errors', () => {
    runner.run('kubectl create deployment web --image=nginx');
    expect(runner.run('kubectl create deployment web --image=nginx').errors.length).toBe(1);
  });

  it('self-heals a deleted pod with a new name', () => {
    runner.run('kubectl create deployment web --image=nginx --replicas=3');
    settle();
    const before = podRows().map((p) => p.name);
    const victim = before[0];
    const r = runner.run(`kubectl delete pod ${victim}`);
    expect(r.text).toContain('deleted');
    settle();
    const after = podRows().map((p) => p.name);
    expect(after.length).toBe(3);
    expect(after).not.toContain(victim);
    expect(missions).toContain('heal');
  });

  it('scales up and down', () => {
    runner.run('kubectl create deployment web --image=nginx --replicas=2');
    settle();
    runner.run('kubectl scale deployment web --replicas=5');
    settle();
    expect(podRows().length).toBe(5);
    expect(missions).toContain('scale');
    runner.run('kubectl scale deployment web --replicas=1');
    settle();
    expect(podRows().length).toBe(1);
  });

  it('pods beyond node capacity stay Pending', () => {
    runner.run('kubectl create deployment web --image=nginx --replicas=3');
    settle();
    runner.run('kubectl scale deployment web --replicas=10');
    settle();
    const rows = podRows();
    expect(rows.filter((p) => p.line.includes('Running')).length).toBe(8); // 2 workers × 4
    expect(rows.filter((p) => p.line.includes('Pending')).length).toBe(2);
  });

  it('delete deployment removes its pods', () => {
    runner.run('kubectl create deployment web --image=nginx --replicas=2');
    settle();
    runner.run('kubectl delete deployment web');
    settle();
    expect(podRows().length).toBe(0);
  });
});

describe('services', () => {
  it('expose creates a service; duplicate errors', () => {
    runner.run('kubectl create deployment web --image=nginx --replicas=2');
    settle();
    expect(runner.run('kubectl expose deployment web --port=80').text).toContain('service/web exposed');
    expect(missions).toContain('expose');
    expect(runner.run('kubectl get services').text).toContain('web');
    expect(runner.run('kubectl expose deployment web --port=80').errors.length).toBe(1);
  });
});

describe('rolling updates', () => {
  it('set image replaces all pods with the new image', () => {
    runner.run('kubectl create deployment web --image=nginx --replicas=3');
    settle();
    runner.run('kubectl set image deployment/web nginx=nginx:1.27');
    expect(missions).toContain('rollout');
    settle(60);
    expect(podRows().length).toBe(3);
    const status = runner.run('kubectl rollout status deployment/web');
    expect(status.text).toContain('successfully rolled out');
  });
});

describe('introspection', () => {
  it('describe pod shows node and controller', () => {
    runner.run('kubectl create deployment web --image=nginx --replicas=1');
    settle();
    const name = podRows()[0].name;
    const r = runner.run(`kubectl describe pod ${name}`);
    expect(r.text).toContain('Namespace:');
    expect(r.text).toContain('worker');
  });

  it('NotFound errors for missing objects', () => {
    expect(runner.run('kubectl delete pod nope').errors.join('')).toContain('NotFound');
    expect(runner.run('kubectl scale deployment nope --replicas=2').errors.join('')).toContain('NotFound');
    expect(runner.run('kubectl describe pod nope').errors.join('')).toContain('NotFound');
  });
});
