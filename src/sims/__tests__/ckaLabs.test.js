import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createK8sSim } from '../k8sSim.js';
import { canI, parseAsSubject, normResource } from '../k8s/rbac.js';
import { CKA_LABS } from '../../data/ckaLabs.js';
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

/* ---------- scheduler: nodeAffinity & pod (anti-)affinity ---------- */

describe('nodeAffinity scheduling', () => {
  const ssdAffinity = {
    nodeAffinity: {
      requiredDuringSchedulingIgnoredDuringExecution: {
        nodeSelectorTerms: [{ matchExpressions: [{ key: 'disktype', operator: 'In', values: ['ssd'] }] }],
      },
    },
  };

  it('places a pod only on a node matching required nodeAffinity', () => {
    const { sim, settle } = boot();
    sim.engine.makeNode({ name: 'worker-3', labels: { disktype: 'ssd' } });
    sim.engine.makePod({ name: 'fast', image: 'redis', affinity: ssdAffinity });
    settle(5);
    expect(sim.engine.get('Pod', 'default', 'fast').spec.nodeName).toBe('worker-3');
  });

  it('leaves the pod Pending with the affinity reason when nothing matches', () => {
    const { sim, runner, settle } = boot();
    sim.engine.makePod({ name: 'fast', image: 'redis', affinity: ssdAffinity });
    settle(5);
    const p = sim.engine.get('Pod', 'default', 'fast');
    expect(p.status.state).toBe('Pending');
    expect(p.sim.pendingReasons.join(' ')).toContain("didn't match Pod's node affinity/selector");
    expect(runner.run('kubectl describe pod fast').text).toContain('FailedScheduling');
  });
});

describe('podAntiAffinity scheduling', () => {
  const anti = {
    podAntiAffinity: {
      requiredDuringSchedulingIgnoredDuringExecution: [
        { labelSelector: { matchLabels: { app: 'ha' } }, topologyKey: 'kubernetes.io/hostname' },
      ],
    },
  };

  it('spreads replicas across distinct nodes and strands the excess', () => {
    const { sim, settle } = boot(); // 2 schedulable workers
    sim.engine.makeDeployment({ name: 'ha', replicas: 3, image: 'nginx', affinity: anti });
    settle(20);
    const pods = sim.engine.list('Pod').filter((p) => p.sim.owner === 'default/ha' && p.status.state !== 'Terminating');
    const placed = pods.filter((p) => p.spec.nodeName);
    expect(placed.length).toBe(2);
    expect(new Set(placed.map((p) => p.spec.nodeName)).size).toBe(2);
    const stuck = pods.find((p) => !p.spec.nodeName);
    expect(stuck.sim.pendingReasons.join(' ')).toContain("didn't match pod anti-affinity rules");
  });

  it('a third node unblocks the stranded replica', () => {
    const { sim, settle } = boot();
    sim.engine.makeDeployment({ name: 'ha', replicas: 3, image: 'nginx', affinity: anti });
    settle(10);
    sim.engine.makeNode({ name: 'worker-3' });
    settle(10);
    const pods = sim.engine.list('Pod').filter((p) => p.sim.owner === 'default/ha' && p.status.state !== 'Terminating');
    expect(new Set(pods.map((p) => p.spec.nodeName)).size).toBe(3);
  });

  it('applying a deployment manifest keeps the affinity in the pod template', () => {
    const { sim, runner, settle } = boot();
    sim.files.write('ha.yaml', [
      'apiVersion: apps/v1', 'kind: Deployment', 'metadata: {name: ha}',
      'spec:', '  replicas: 2', '  selector: {matchLabels: {app: ha}}',
      '  template:', '    metadata: {labels: {app: ha}}',
      '    spec:', '      affinity:', '        podAntiAffinity:',
      '          requiredDuringSchedulingIgnoredDuringExecution:',
      '          - labelSelector: {matchLabels: {app: ha}}', '            topologyKey: kubernetes.io/hostname',
      '      containers:', '      - {name: web, image: nginx}',
    ].join('\n'));
    runner.run('kubectl apply -f ha.yaml');
    settle(15);
    const d = sim.engine.get('Deployment', 'default', 'ha');
    expect(d.spec.template.spec.affinity.podAntiAffinity).toBeTruthy();
    const pods = sim.engine.ownedPods(d);
    expect(new Set(pods.map((p) => p.spec.nodeName)).size).toBe(2);
  });
});

/* ---------- rbac: engine + kubectl ---------- */

describe('rbac evaluation', () => {
  it('parses --as subjects', () => {
    expect(parseAsSubject('system:serviceaccount:build:ci')).toEqual({ kind: 'ServiceAccount', name: 'ci', namespace: 'build' });
    expect(parseAsSubject('alice')).toEqual({ kind: 'User', name: 'alice' });
    expect(normResource('Pod')).toBe('pods');
    expect(normResource('pods')).toBe('pods');
  });

  it('namespaces are born with a default ServiceAccount', () => {
    const { sim, runner } = boot();
    runner.run('kubectl create namespace build');
    expect(sim.engine.get('ServiceAccount', 'build', 'default')).toBeTruthy();
  });

  it('role + rolebinding grant inside the namespace only, deny elsewhere', () => {
    const { sim, runner } = boot();
    const e = sim.engine;
    runner.run('kubectl create namespace build');
    runner.run('kubectl create serviceaccount ci -n build');
    runner.run('kubectl create role pod-reader --verb=get,list --resource=pods -n build');
    runner.run('kubectl create rolebinding read-pods --role=pod-reader --serviceaccount=build:ci -n build');
    const subject = { kind: 'ServiceAccount', name: 'ci', namespace: 'build' };
    expect(canI(e, { verb: 'get', resource: 'pods', subject, ns: 'build' })).toBe(true);
    expect(canI(e, { verb: 'delete', resource: 'pods', subject, ns: 'build' })).toBe(false);
    expect(canI(e, { verb: 'get', resource: 'secrets', subject, ns: 'build' })).toBe(false);
    expect(canI(e, { verb: 'get', resource: 'pods', subject, ns: 'default' })).toBe(false);
  });

  it('clusterrole + clusterrolebinding grant everywhere', () => {
    const { sim, runner } = boot();
    runner.run('kubectl create namespace build');
    runner.run('kubectl create serviceaccount ci -n build');
    runner.run('kubectl create clusterrole node-viewer --verb=get,list --resource=nodes');
    runner.run('kubectl create clusterrolebinding ci-nodes --clusterrole=node-viewer --serviceaccount=build:ci');
    const subject = { kind: 'ServiceAccount', name: 'ci', namespace: 'build' };
    expect(canI(sim.engine, { verb: 'list', resource: 'nodes', subject, ns: 'default' })).toBe(true);
    expect(canI(sim.engine, { verb: 'delete', resource: 'nodes', subject, ns: 'default' })).toBe(false);
  });

  it('kubectl auth can-i answers yes/no and fires the mission flag', () => {
    const { runner, flags } = boot();
    runner.run('kubectl create namespace build');
    runner.run('kubectl create serviceaccount ci -n build');
    runner.run('kubectl create role pod-reader --verb=get --resource=pods -n build');
    runner.run('kubectl create rolebinding read-pods --role=pod-reader --serviceaccount=build:ci -n build');
    expect(runner.run('kubectl auth can-i get pods --as=system:serviceaccount:build:ci -n build').text.split('\n')[0]).toBe('yes');
    expect(runner.run('kubectl auth can-i delete pods --as=system:serviceaccount:build:ci -n build').text.split('\n')[0]).toBe('no');
    expect(runner.run('kubectl auth can-i delete pods').text.split('\n')[0]).toBe('yes'); // cluster-admin
    expect(flags.has('can-i')).toBe(true);
  });

  it('rbac objects are visible via get/describe/-o yaml', () => {
    const { runner } = boot();
    runner.run('kubectl create serviceaccount ci');
    runner.run('kubectl create role pod-reader --verb=get,list --resource=pods');
    runner.run('kubectl create rolebinding read-pods --role=pod-reader --serviceaccount=default:ci');
    expect(runner.run('kubectl get sa').text).toContain('ci');
    expect(runner.run('kubectl get role').text).toContain('pod-reader');
    expect(runner.run('kubectl get rolebinding').text).toContain('Role/pod-reader');
    expect(runner.run('kubectl describe role pod-reader').text).toMatch(/pods.*\[get list\]/);
    const y = runner.run('kubectl get rolebinding read-pods -o yaml').text;
    expect(y).toContain('roleRef:');
    expect(y).toContain('kind: ServiceAccount');
  });

  it('applying rbac manifests works too', () => {
    const { sim, runner } = boot();
    sim.files.write('rbac.yaml', [
      'apiVersion: rbac.authorization.k8s.io/v1', 'kind: Role',
      'metadata: {name: cm-reader}', 'rules:',
      '- apiGroups: [""]', '  resources: [configmaps]', '  verbs: [get]',
      '---',
      'apiVersion: rbac.authorization.k8s.io/v1', 'kind: RoleBinding',
      'metadata: {name: cm-read}',
      'roleRef: {kind: Role, name: cm-reader, apiGroup: rbac.authorization.k8s.io}',
      'subjects:', '- {kind: ServiceAccount, name: default, namespace: default}',
    ].join('\n'));
    const out = runner.run('kubectl apply -f rbac.yaml');
    expect(out.errors).toEqual([]);
    expect(canI(sim.engine, { verb: 'get', resource: 'configmaps', subject: { kind: 'ServiceAccount', name: 'default', namespace: 'default' }, ns: 'default' })).toBe(true);
  });
});

/* ---------- the labs themselves ---------- */

describe.each(CKA_LABS.map((l) => [l.id, l]))('cka lab %s', (id, lab) => {
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
