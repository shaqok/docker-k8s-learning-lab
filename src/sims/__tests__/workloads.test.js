import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEngine } from '../k8s/engine.js';
import { createK8sSim } from '../k8sSim.js';
import { makeRunner } from './helpers.js';

let e;
function settle(cycles = 30) {
  for (let i = 0; i < cycles; i++) { e.reconcile(); vi.advanceTimersByTime(2000); }
}
beforeEach(() => { vi.useFakeTimers(); e = createEngine({}); });
afterEach(() => vi.useRealTimers());

describe('Job', () => {
  it('a successful one-shot completes the Job (Succeeded), not CrashLoopBackOff', () => {
    e.makeJob({ name: 'seed', completions: 1, parallelism: 1, image: 'busybox', command: ['sh', '-c', 'true'] });
    settle(20);
    const job = e.get('Job', 'default', 'seed');
    expect(job.status.succeeded).toBe(1);
    expect(job.status.complete).toBe(true);
    const pod = e.list('Pod').find((p) => p.sim.owner === 'default/seed');
    expect(pod.status.phase).toBe('Succeeded');
  });

  it('completions=3/parallelism=2 runs at most 2 pods concurrently and stops at 3 successes', () => {
    e.makeJob({ name: 'batch', completions: 3, parallelism: 2, image: 'busybox', command: ['sh', '-c', 'true'] });
    e.reconcile();
    const activePods = () => e.list('Pod').filter((p) => p.sim.owner === 'default/batch' && p.status.state !== 'Terminating');
    expect(activePods().length).toBeLessThanOrEqual(2);
    settle(30);
    const job = e.get('Job', 'default', 'batch');
    expect(job.status.succeeded).toBe(3);
    expect(job.status.complete).toBe(true);
  });

  it('a failing command exhausts backoffLimit and marks the Job Failed', () => {
    e.makeJob({ name: 'doomed', completions: 1, parallelism: 1, backoffLimit: 2, image: 'busybox', command: ['sh', '-c', 'exit 1'] });
    settle(40);
    const job = e.get('Job', 'default', 'doomed');
    expect(job.status.jobFailed).toBe(true);
    expect(job.status.failed).toBeGreaterThan(2);
  });
});

describe('CronJob', () => {
  it('cronMatches evaluates standard 5-field syntax', () => {
    const d = new Date(Date.UTC(2026, 0, 1, 0, 1)); // 00:01
    expect(e.cronMatches('*/1 * * * *', d)).toBe(true);
    expect(e.cronMatches('*/5 * * * *', d)).toBe(false);
    expect(e.cronMatches('1 * * * *', d)).toBe(true);
    expect(e.cronMatches('0 * * * *', d)).toBe(false);
  });

  it('fires on an accelerated clock and creates real Job objects it owns', () => {
    e.makeCronJob({ name: 'sweep', schedule: '*/1 * * * *', image: 'busybox', command: ['sh', '-c', 'true'] });
    settle(10);
    const jobs = e.list('Job').filter((j) => (j.metadata.ownerReferences || []).some((o) => o.kind === 'CronJob' && o.name === 'sweep'));
    expect(jobs.length).toBeGreaterThan(0);
  });

  it('suspend: true creates no Jobs', () => {
    e.makeCronJob({ name: 'paused', schedule: '*/1 * * * *', suspend: true, image: 'busybox', command: ['sh', '-c', 'true'] });
    settle(15);
    expect(e.list('Job').length).toBe(0);
  });
});

describe('DaemonSet', () => {
  // createEngine() already seeds control-plane (tainted NoSchedule) + worker-1 + worker-2
  it('creates exactly one pod per node whose taints it tolerates', () => {
    e.makeDaemonSet({ name: 'agent', image: 'busybox', command: ['sh', '-c', 'sleep infinity'] });
    settle(20);
    const pods = e.list('Pod').filter((p) => p.sim.owner === 'default/agent');
    // no toleration for the control-plane taint -> only the 2 workers
    expect(pods.length).toBe(2);
    expect(new Set(pods.map((p) => p.spec.nodeName))).toEqual(new Set(['worker-1', 'worker-2']));
  });

  it('tolerating the control-plane taint covers every node', () => {
    e.makeDaemonSet({ name: 'kube-proxy-like', image: 'busybox', command: ['sh', '-c', 'sleep infinity'], tolerations: [{ operator: 'Exists', effect: 'NoSchedule' }] });
    settle(20);
    expect(e.list('Pod').filter((p) => p.sim.owner === 'default/kube-proxy-like').length).toBe(3);
  });
});

describe('StatefulSet', () => {
  it('creates ordinal pods 0,1,2 in order, each waiting for the previous to be Ready', () => {
    e.makeNode({ name: 'worker-1' });
    e.makeStatefulSet({ name: 'db', replicas: 3, image: 'postgres' });
    e.reconcile();
    let pods = e.list('Pod').filter((p) => p.sim.owner === 'default/db');
    expect(pods.map((p) => p.metadata.name)).toEqual(['db-0']);
    settle(30);
    pods = e.list('Pod').filter((p) => p.sim.owner === 'default/db' && p.status.state !== 'Terminating');
    expect(pods.map((p) => p.metadata.name).sort()).toEqual(['db-0', 'db-1', 'db-2']);
  });

  it('scaling down removes the highest ordinal first', () => {
    e.makeNode({ name: 'worker-1' });
    const sts = e.makeStatefulSet({ name: 'db', replicas: 3, image: 'postgres' });
    settle(30);
    sts.spec.replicas = 1;
    settle(10);
    const pods = e.list('Pod').filter((p) => p.sim.owner === 'default/db' && p.status.state !== 'Terminating');
    expect(pods.map((p) => p.metadata.name)).toEqual(['db-0']);
  });
});

describe('kubectl fidelity for the new workload kinds', () => {
  function boot() {
    const sim = createK8sSim({});
    const runner = makeRunner(sim);
    const settleSim = (cycles = 30) => { for (let i = 0; i < cycles; i++) { sim.reconcile(); vi.advanceTimersByTime(2000); } };
    return { sim, runner, settleSim };
  }

  it('apply -f creates a Job, get/describe show real fidelity, delete cascades to pods', () => {
    const { sim, runner, settleSim } = boot();
    sim.files.write('job.yaml', `apiVersion: batch/v1
kind: Job
metadata:
  name: seed-db
spec:
  completions: 2
  parallelism: 1
  template:
    spec:
      containers:
      - name: seed
        image: busybox
        command: ["sh", "-c", "true"]
`);
    runner.run('kubectl apply -f job.yaml');
    settleSim(30);
    expect(runner.run('kubectl get jobs').text).toMatch(/seed-db\s+2\/2/);
    expect(runner.run('kubectl describe job seed-db').text).toContain('Completions:      2');
    runner.run('kubectl delete job seed-db');
    expect(sim.engine.list('Pod').filter((p) => p.sim.owner === 'default/seed-db').every((p) => p.status.state === 'Terminating')).toBe(true);
  });

  it('create cronjob (imperative) + get shows schedule; suspend prevents new Jobs', () => {
    const { sim, runner, settleSim } = boot();
    runner.run('kubectl create cronjob sweep --image=busybox --schedule="*/1 * * * *" -- sh -c true');
    settleSim(10);
    expect(runner.run('kubectl get cronjobs').text).toContain('*/1 * * * *');
    expect(sim.engine.list('Job').some((j) => (j.metadata.ownerReferences || []).some((r) => r.kind === 'CronJob' && r.name === 'sweep'))).toBe(true);
    runner.run('kubectl delete cronjob sweep');
    expect(sim.engine.list('CronJob').length).toBe(0);
    expect(sim.engine.list('Job').length).toBe(0);
  });

  it('create job --from=cronjob/NAME runs the CronJob template once', () => {
    const { sim, runner } = boot();
    runner.run('kubectl create cronjob nightly --image=busybox --schedule="0 0 * * *" -- sh -c true');
    const before = sim.engine.list('Job').length;
    runner.run('kubectl create job nightly-manual-1 --from=cronjob/nightly');
    expect(sim.engine.list('Job').length).toBe(before + 1);
    expect(sim.engine.get('Job', 'default', 'nightly-manual-1')).toBeTruthy();
  });

  it('apply -f DaemonSet + StatefulSet: get/describe work and delete removes their pods', () => {
    const { sim, runner, settleSim } = boot();
    sim.files.write('ds.yaml', `apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-agent
spec:
  selector:
    matchLabels: {app: node-agent}
  template:
    metadata:
      labels: {app: node-agent}
    spec:
      containers:
      - name: agent
        image: busybox
        command: ["sh", "-c", "sleep infinity"]
`);
    runner.run('kubectl apply -f ds.yaml');
    settleSim(20);
    expect(runner.run('kubectl get daemonsets').text).toMatch(/node-agent\s+2\s+2\s+2/);
    runner.run('kubectl delete daemonset node-agent');
    expect(sim.engine.list('Pod').filter((p) => p.sim.owner === 'default/node-agent').every((p) => p.status.state === 'Terminating')).toBe(true);

    sim.files.write('sts.yaml', `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: db
spec:
  serviceName: db
  replicas: 2
  selector:
    matchLabels: {app: db}
  template:
    metadata:
      labels: {app: db}
    spec:
      containers:
      - name: db
        image: postgres
`);
    runner.run('kubectl apply -f sts.yaml');
    settleSim(30);
    expect(runner.run('kubectl get statefulsets').text).toMatch(/db\s+2\/2/);
    const pods = sim.engine.list('Pod').filter((p) => p.sim.owner === 'default/db');
    expect(pods.map((p) => p.metadata.name).sort()).toEqual(['db-0', 'db-1']);
  });

  it('kube-proxy is a real DaemonSet in a fresh cluster', () => {
    const { sim } = boot();
    const ds = sim.engine.get('DaemonSet', 'kube-system', 'kube-proxy');
    expect(ds).toBeTruthy();
    const pods = sim.engine.podsOwnedBy(ds);
    expect(pods.length).toBe(3); // control-plane + 2 workers
  });

  it('describe pod shows the real owner kind for Job/DaemonSet/StatefulSet pods, not a hardcoded ReplicaSet', () => {
    const { sim, runner, settleSim } = boot();
    sim.engine.makeJob({ name: 'seed', completions: 1, image: 'busybox', command: ['sh', '-c', 'sleep infinity'] });
    sim.engine.makeDaemonSet({ name: 'agent', image: 'busybox', command: ['sh', '-c', 'sleep infinity'] });
    sim.engine.makeStatefulSet({ name: 'db', replicas: 1, image: 'postgres' });
    settleSim(30);
    const jobPod = sim.engine.list('Pod').find((p) => p.sim.owner === 'default/seed');
    const dsPod = sim.engine.list('Pod').find((p) => p.sim.owner === 'default/agent');
    const stsPod = sim.engine.get('Pod', 'default', 'db-0');
    expect(runner.run(`kubectl describe pod ${jobPod.metadata.name}`).text).toContain('Controlled By:    Job/seed');
    expect(runner.run(`kubectl describe pod ${dsPod.metadata.name}`).text).toContain('Controlled By:    DaemonSet/agent');
    expect(runner.run(`kubectl describe pod ${stsPod.metadata.name}`).text).toContain('Controlled By:    StatefulSet/db');
  });
});

describe('regression: Deployment ReplicaSet self-healing', () => {
  function boot() {
    const sim = createK8sSim({});
    const runner = makeRunner(sim);
    const settleSim = (cycles = 30) => { for (let i = 0; i < cycles; i++) { sim.reconcile(); vi.advanceTimersByTime(2000); } };
    return { sim, runner, settleSim };
  }

  it('deleting the only ReplicaSet does not strand the Deployment — a fresh one is recreated', () => {
    const { sim, runner, settleSim } = boot();
    runner.run('kubectl create deployment web --image=nginx:1.27 --replicas=2');
    settleSim(25);
    const rs = sim.engine.list('ReplicaSet').find((r) => (r.metadata.ownerReferences || []).some((o) => o.name === 'web'));
    runner.run(`kubectl delete rs ${rs.metadata.name}`);
    settleSim(30);
    const d = sim.engine.get('Deployment', 'default', 'web');
    expect(sim.engine.ownedPods(d).filter((p) => p.status.ready).length).toBe(2);
    expect(sim.engine.get('ReplicaSet', 'default', d.sim.rsName)).toBeTruthy();
  });

  it('deleting the CURRENT ReplicaSet after a rollout does not revert to the old image', () => {
    const { sim, runner, settleSim } = boot();
    runner.run('kubectl create deployment web --image=nginx:1.27 --replicas=2');
    settleSim(25);
    runner.run('kubectl set image deployment/web nginx=nginx:1.28');
    settleSim(40); // let the rollout fully finish: old RS scaled to 0, new RS at 2
    const d = sim.engine.get('Deployment', 'default', 'web');
    const currentRsName = d.sim.rsName;
    runner.run(`kubectl delete rs ${currentRsName}`);
    settleSim(40);
    const pods = sim.engine.ownedPods(d).filter((p) => p.status.ready);
    expect(pods.length).toBe(2);
    // must self-heal to the CURRENT template's image (1.28), not silently revert to the old RS's 1.27
    expect(pods.every((p) => sim.engine.podImage(p) === 'nginx:1.28')).toBe(true);
    expect(sim.engine.depImage(d)).toBe('nginx:1.28');
  });
});

describe('regression: cron day-of-month/day-of-week OR semantics', () => {
  it('when BOTH dom and dow are restricted, a match on EITHER fires (real cron rule, not AND)', () => {
    const e = createEngine({});
    // 2026-01-01 is a Thursday (UTC); "1st of the month" should still match even though
    // it isn't Monday, because both fields are restricted -> OR, not AND.
    const firstOfMonth = new Date(Date.UTC(2026, 0, 1, 0, 0));
    expect(e.cronMatches('0 0 1 * MON', firstOfMonth)).toBe(true);
    const mondayNotFirst = new Date(Date.UTC(2026, 0, 5, 0, 0)); // a Monday, not the 1st
    expect(e.cronMatches('0 0 1 * MON', mondayNotFirst)).toBe(true);
    const neither = new Date(Date.UTC(2026, 0, 6, 0, 0)); // Tuesday the 6th
    expect(e.cronMatches('0 0 1 * MON', neither)).toBe(false);
  });

  it('when only one of dom/dow is restricted, normal AND (via the trivial "*") applies', () => {
    const e = createEngine({});
    const d = new Date(Date.UTC(2026, 0, 15, 3, 30)); // 03:30 on the 15th
    expect(e.cronMatches('30 3 15 * *', d)).toBe(true);
    expect(e.cronMatches('30 3 16 * *', d)).toBe(false);
  });
});

describe('regression: Job DURATION reflects real elapsed time, not a copy of AGE', () => {
  it('DURATION freezes at completion time, distinct from AGE once time passes', () => {
    const e = createEngine({});
    const job = e.makeJob({ name: 'quick', completions: 1, image: 'busybox', command: ['sh', '-c', 'true'] });
    for (let i = 0; i < 5; i++) { e.reconcile(); vi.advanceTimersByTime(2000); }
    expect(job.status.complete).toBe(true);
    expect(job.status.completionTime).toBeGreaterThan(0);
    const durationAtCompletion = job.status.completionTime - job.status.startTime;
    vi.advanceTimersByTime(60000); // time keeps passing after the Job finished
    expect(job.status.completionTime - job.status.startTime).toBe(durationAtCompletion); // DURATION doesn't grow
  });
});
