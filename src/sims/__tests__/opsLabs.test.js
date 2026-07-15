import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createK8sSim } from '../k8sSim.js';
import { OPS_LABS } from '../../data/opsLabs.js';
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

const SNAP_SAVE = 'etcdctl snapshot save /backup/snap.db --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key';

/* ---------- PodDisruptionBudgets & drain ---------- */

describe('pdb + drain', () => {
  const seedPdb = (sim) => sim.engine.put({
    apiVersion: 'policy/v1', kind: 'PodDisruptionBudget',
    metadata: { name: 'web-pdb', namespace: 'default', creationTimestamp: Date.now() },
    spec: { minAvailable: 2, selector: { matchLabels: { app: 'web' } } },
    status: {}, sim: {},
  });

  it('kubectl get/describe pdb show live allowed disruptions', () => {
    const { sim, runner, settle } = boot();
    sim.engine.makeDeployment({ name: 'web', replicas: 2, image: 'nginx' });
    seedPdb(sim);
    settle(6);
    const out = runner.run('kubectl get pdb').text;
    expect(out).toContain('web-pdb');
    expect(out).toMatch(/ALLOWED DISRUPTIONS/);
    expect(out).toMatch(/web-pdb\s+2\s+N\/A\s+0/);
    expect(runner.run('kubectl describe pdb web-pdb').text).toContain('Allowed disruptions:  0');
  });

  it('imperative create poddisruptionbudget works', () => {
    const { sim, runner } = boot();
    const out = runner.run('kubectl create poddisruptionbudget api-pdb --selector=app=api --max-unavailable=1');
    expect(out.errors).toEqual([]);
    const pdb = sim.engine.get('PodDisruptionBudget', 'default', 'api-pdb');
    expect(pdb.spec.maxUnavailable).toBe(1);
    expect(pdb.spec.selector.matchLabels).toEqual({ app: 'api' });
  });

  it('drain refuses evictions that would violate the budget, but still cordons', () => {
    const { sim, runner, settle, flags } = boot();
    sim.engine.makeDeployment({ name: 'web', replicas: 2, image: 'nginx' });
    seedPdb(sim);
    settle(6);
    const out = runner.run('kubectl drain worker-2');
    expect(out.text).toContain("violate the pod's disruption budget");
    expect(flags.has('drain-blocked')).toBe(true);
    const n = sim.engine.get('Node', null, 'worker-2');
    expect(n.spec.unschedulable).toBe(true);
    // the protected pod survived
    settle(3);
    const d = sim.engine.get('Deployment', 'default', 'web');
    expect(sim.engine.ownedPods(d).some((p) => p.spec.nodeName === 'worker-2')).toBe(true);
  });

  it('scaling up makes room and the retried drain succeeds', () => {
    const { sim, runner, settle, flags } = boot();
    sim.engine.makeDeployment({ name: 'web', replicas: 2, image: 'nginx' });
    seedPdb(sim);
    settle(6);
    runner.run('kubectl drain worker-2');
    runner.run('kubectl scale deployment web --replicas=3');
    settle(10);
    const out = runner.run('kubectl drain worker-2');
    expect(out.text).toContain('drained');
    expect(flags.has('drained:worker-2')).toBe(true);
    settle(6);
    const d = sim.engine.get('Deployment', 'default', 'web');
    const pods = sim.engine.ownedPods(d);
    expect(pods.every((p) => p.spec.nodeName !== 'worker-2')).toBe(true);
    expect(pods.filter((p) => p.status.ready).length).toBeGreaterThanOrEqual(2);
  });

  it('PDBs apply via manifest and survive -o yaml', () => {
    const { sim, runner } = boot();
    sim.files.write('pdb.yaml', [
      'apiVersion: policy/v1', 'kind: PodDisruptionBudget',
      'metadata: {name: db-pdb}',
      'spec:', '  minAvailable: 1', '  selector: {matchLabels: {app: db}}',
    ].join('\n'));
    expect(runner.run('kubectl apply -f pdb.yaml').errors).toEqual([]);
    const y = runner.run('kubectl get pdb db-pdb -o yaml').text;
    expect(y).toContain('minAvailable: 1');
  });
});

/* ---------- ssh + kubeadm upgrade ---------- */

describe('kubeadm upgrade sequence', () => {
  it('host commands demand a node; ssh gets you there', () => {
    const { runner } = boot();
    expect(runner.run('kubeadm upgrade plan').text).toContain('command not found');
    expect(runner.run('ssh nope').text).toContain('Could not resolve hostname');
    expect(runner.run('ssh control-plane').errors).toEqual([]);
    expect(runner.run('hostname').text).toBe('control-plane');
    runner.run('exit');
    expect(runner.run('hostname').text).toBe('exam-terminal');
  });

  it('upgrade apply requires the new kubeadm package first', () => {
    const { runner } = boot();
    runner.run('ssh control-plane');
    const out = runner.run('kubeadm upgrade apply v1.34.0');
    expect(out.text).toContain('higher than the kubeadm version');
    runner.run('apt-get install -y kubeadm=1.34.0-1.1');
    expect(runner.run('kubeadm upgrade apply v1.34.0').text).toContain('SUCCESS');
  });

  it('apply bumps control-plane images but NOT the node VERSION (that is the kubelet)', () => {
    const { sim, runner } = boot();
    runner.run('ssh control-plane');
    runner.run('apt-get install -y kubeadm=1.34.0-1.1');
    runner.run('kubeadm upgrade apply v1.34.0');
    const api = sim.engine.list('Pod', { ns: 'kube-system' }).find((p) => p.metadata.labels.component === 'kube-apiserver');
    expect(api.spec.containers[0].image).toContain(':v1.34.0');
    expect(sim.engine.get('Node', null, 'control-plane').sim.version).toBe('v1.33.2');
    // kubelet upgrade completes it
    runner.run('apt-get install -y kubelet=1.34.0-1.1');
    runner.run('systemctl restart kubelet');
    expect(sim.engine.get('Node', null, 'control-plane').sim.version).toBe('v1.34.0');
    runner.run('exit');
    expect(runner.run('kubectl get nodes').text).toMatch(/control-plane.+v1\.34\.0/);
  });

  it('kubeadm upgrade node refuses to run before the control plane is upgraded', () => {
    const { runner, flags } = boot();
    runner.run('ssh worker-1');
    runner.run('apt-get install -y kubeadm=1.34.0-1.1');
    expect(runner.run('kubeadm upgrade node').text).toContain('control plane is still v1.33.2');
    expect(flags.has('kubeadm-node:worker-1')).toBe(false);
  });

  it('restarting the kubelet on a cordoned node fires the drained-upgrade flag', () => {
    const { runner, flags } = boot();
    runner.run('ssh control-plane');
    runner.run('apt-get install -y kubeadm=1.34.0-1.1');
    runner.run('kubeadm upgrade apply v1.34.0');
    runner.run('exit');
    runner.run('kubectl drain worker-1');
    runner.run('ssh worker-1');
    runner.run('apt-get install -y kubeadm=1.34.0-1.1');
    runner.run('kubeadm upgrade node');
    runner.run('apt-get install -y kubelet=1.34.0-1.1');
    runner.run('systemctl restart kubelet');
    expect(flags.has('kubeadm-node:worker-1')).toBe(true);
    expect(flags.has('kubelet-cordoned:worker-1')).toBe(true);
  });
});

/* ---------- etcd snapshot / restore + certs ---------- */

describe('etcd backup & restore', () => {
  it('snapshot save demands the control-plane and the TLS flags', () => {
    const { runner, flags } = boot();
    runner.run('ssh worker-1');
    expect(runner.run(SNAP_SAVE).text).toContain('context deadline exceeded');
    runner.run('exit');
    runner.run('ssh control-plane');
    expect(runner.run('etcdctl snapshot save /backup/snap.db').text).toContain('context deadline exceeded');
    expect(flags.has('etcd-save')).toBe(false);
    expect(runner.run(SNAP_SAVE).text).toContain('Snapshot saved at /backup/snap.db');
    expect(flags.has('etcd-save')).toBe(true);
  });

  it('restore requires a fresh --data-dir and rolls the cluster back', () => {
    const { sim, runner, settle, flags } = boot();
    sim.engine.makeDeployment({ name: 'payments', replicas: 2, image: 'nginx' });
    settle(6);
    runner.run('ssh control-plane');
    runner.run(SNAP_SAVE);
    runner.run('exit');
    runner.run('kubectl delete deployment payments');
    settle(3);
    expect(sim.engine.get('Deployment', 'default', 'payments')).toBeFalsy();
    runner.run('ssh control-plane');
    expect(runner.run('etcdutl snapshot restore /backup/snap.db').text).toContain('not empty');
    expect(runner.run('etcdutl snapshot restore /backup/nope.db --data-dir /var/lib/etcd-restore').text).toContain('no such file');
    const out = runner.run('etcdutl snapshot restore /backup/snap.db --data-dir /var/lib/etcd-restore');
    expect(out.text).toContain('restored snapshot');
    expect(flags.has('etcd-restore')).toBe(true);
    settle(6);
    const d = sim.engine.get('Deployment', 'default', 'payments');
    expect(d).toBeTruthy();
    expect(sim.engine.ownedPods(d).filter((p) => p.status.ready).length).toBe(2);
  });

  it('stale Terminating timers cannot kill restored objects', () => {
    const { sim, runner, settle } = boot();
    sim.engine.makeDeployment({ name: 'payments', replicas: 1, image: 'nginx' });
    settle(6);
    runner.run('ssh control-plane');
    runner.run(SNAP_SAVE);
    runner.run('exit');
    runner.run('kubectl delete deployment payments');
    // restore IMMEDIATELY — the 900ms termination timers are still pending
    runner.run('ssh control-plane');
    runner.run('etcdutl snapshot restore /backup/snap.db --data-dir /var/lib/etcd-restore');
    settle(6);
    const d = sim.engine.get('Deployment', 'default', 'payments');
    expect(sim.engine.ownedPods(d).filter((p) => p.status.ready).length).toBe(1);
  });

  it('cert inspection: kubeadm certs check-expiration and openssl both work', () => {
    const { runner, flags } = boot();
    runner.run('ssh control-plane');
    const out = runner.run('kubeadm certs check-expiration');
    expect(out.text).toContain('apiserver');
    expect(out.text).toContain('RESIDUAL TIME');
    expect(flags.has('cert-inspect')).toBe(true);
    const ossl = runner.run('openssl x509 -in /etc/kubernetes/pki/apiserver.crt -noout -dates');
    expect(ossl.text).toContain('notAfter=');
    expect(runner.run('openssl x509 -in /wrong/path.crt -noout -dates').text).toContain('No such file');
  });
});

/* ---------- the labs themselves ---------- */

describe.each(OPS_LABS.map((l) => [l.id, l]))('ops lab %s', (id, lab) => {
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
