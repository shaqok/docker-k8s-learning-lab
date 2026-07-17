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

describe('PersistentVolume / PersistentVolumeClaim binding', () => {
  it('binds a PVC to a matching static Available PV', () => {
    e.makePV({ name: 'pv1', capacity: '2Gi', accessModes: ['ReadWriteOnce'], reclaimPolicy: 'Retain' });
    e.makePVC({ name: 'claim1', accessModes: ['ReadWriteOnce'], requestStorage: '1Gi' });
    settle(3);
    const pvc = e.get('PersistentVolumeClaim', 'default', 'claim1');
    const pv = e.get('PersistentVolume', null, 'pv1');
    expect(pvc.status.phase).toBe('Bound');
    expect(pvc.spec.volumeName).toBe('pv1');
    expect(pv.status.phase).toBe('Bound');
    expect(pv.spec.claimRef).toEqual({ namespace: 'default', name: 'claim1' });
  });

  it('does not statically bind across a storageClassName mismatch (even when capacity fits)', () => {
    e.makePV({ name: 'pv-unclassed', capacity: '2Gi', accessModes: ['ReadWriteOnce'] }); // storageClassName ''
    e.makePVC({ name: 'claim-classed', accessModes: ['ReadWriteOnce'], requestStorage: '1Gi', storageClassName: 'nonexistent' });
    settle(3);
    const pvc = e.get('PersistentVolumeClaim', 'default', 'claim-classed');
    expect(pvc.status.phase).toBe('Pending');
    expect(pvc.sim.pendingReasons.join(' ')).toMatch(/storageclass.*not found/);
  });

  it('dynamically provisions a PV via StorageClass when no static PV matches', () => {
    e.makeStorageClass({ name: 'standard', provisioner: 'sim.io/dynamic', reclaimPolicy: 'Delete' });
    e.makePVC({ name: 'claim2', accessModes: ['ReadWriteOnce'], requestStorage: '1Gi', storageClassName: 'standard' });
    settle(3);
    const pvc = e.get('PersistentVolumeClaim', 'default', 'claim2');
    expect(pvc.status.phase).toBe('Bound');
    const pv = e.get('PersistentVolume', null, pvc.spec.volumeName);
    expect(pv.sim.dynamic).toBe(true);
    expect(pv.spec.persistentVolumeReclaimPolicy).toBe('Delete');
  });

  it('leaves a PVC Pending with a reason when nothing can satisfy it', () => {
    e.makePVC({ name: 'claim3', accessModes: ['ReadWriteOnce'], requestStorage: '1Gi' });
    settle(3);
    const pvc = e.get('PersistentVolumeClaim', 'default', 'claim3');
    expect(pvc.status.phase).toBe('Pending');
    expect(pvc.sim.pendingReasons.length).toBeGreaterThan(0);
  });
});

describe('scheduling gate for PVC-backed pods', () => {
  it('a pod referencing an unbound PVC stays Pending, then schedules once the PVC binds', () => {
    e.makeNode({ name: 'worker-1' });
    e.makePVC({ name: 'claim4', accessModes: ['ReadWriteOnce'], requestStorage: '1Gi' });
    e.makePod({
      name: 'p1', image: 'nginx',
      volumes: [{ name: 'data', persistentVolumeClaim: { claimName: 'claim4' } }],
      volumeMounts: [{ name: 'data', mountPath: '/data' }],
    });
    settle(3);
    let pod = e.get('Pod', 'default', 'p1');
    expect(pod.spec.nodeName).toBeFalsy();
    expect(pod.sim.pendingReasons.join(' ')).toMatch(/unbound immediate PersistentVolumeClaims/);
    e.makePV({ name: 'pv4', capacity: '1Gi', accessModes: ['ReadWriteOnce'] });
    settle(5);
    pod = e.get('Pod', 'default', 'p1');
    expect(pod.spec.nodeName).toBeTruthy();
  });
});

describe('volume data durability', () => {
  it('PV-backed data survives pod delete+recreate; emptyDir does not', () => {
    e.makeNode({ name: 'worker-1' });
    e.makePV({ name: 'pv5', capacity: '1Gi', accessModes: ['ReadWriteOnce'] });
    e.makePVC({ name: 'claim5', accessModes: ['ReadWriteOnce'], requestStorage: '1Gi' });
    settle(3);
    const mkApp = () => e.makePod({
      name: 'app1', image: 'nginx',
      volumes: [{ name: 'data', persistentVolumeClaim: { claimName: 'claim5' } }, { name: 'cache', emptyDir: {} }],
      volumeMounts: [{ name: 'data', mountPath: '/data' }, { name: 'cache', mountPath: '/cache' }],
    });
    mkApp();
    settle(30);
    let pod = e.get('Pod', 'default', 'app1');
    expect(pod.status.ready).toBe(true);
    e.resolveVolumeStore(pod, 'data').set('msg', 'hi');
    e.resolveVolumeStore(pod, 'cache').set('tmp', 'x');
    e.markTerminating(pod);
    settle(3);
    mkApp();
    settle(30);
    const pod2 = e.get('Pod', 'default', 'app1');
    expect(pod2.status.ready).toBe(true);
    expect(e.resolveVolumeStore(pod2, 'data').get('msg')).toBe('hi');
    expect(e.resolveVolumeStore(pod2, 'cache').has('tmp')).toBe(false);
  });
});

describe('StatefulSet volumeClaimTemplates', () => {
  it('gives each ordinal its own deterministically-named PVC that survives pod recreation', () => {
    e.makeNode({ name: 'worker-1' });
    e.makeStorageClass({ name: 'standard', reclaimPolicy: 'Delete' });
    e.makeStatefulSet({
      name: 'db', replicas: 2, image: 'postgres',
      volumeClaimTemplates: [{ metadata: { name: 'data' }, spec: { accessModes: ['ReadWriteOnce'], resources: { requests: { storage: '1Gi' } }, storageClassName: 'standard' } }],
    });
    settle(40);
    const pvc0 = e.get('PersistentVolumeClaim', 'default', 'data-db-0');
    const pvc1 = e.get('PersistentVolumeClaim', 'default', 'data-db-1');
    expect(pvc0.status.phase).toBe('Bound');
    expect(pvc1.status.phase).toBe('Bound');
    const pod0 = e.get('Pod', 'default', 'db-0');
    e.resolveVolumeStore(pod0, 'data').set('id', 'zero');
    e.markTerminating(pod0);
    settle(40);
    const pod0b = e.get('Pod', 'default', 'db-0');
    expect(pod0b.status.ready).toBe(true);
    expect(e.resolveVolumeStore(pod0b, 'data').get('id')).toBe('zero');
    expect(e.get('PersistentVolumeClaim', 'default', 'data-db-0')).toBe(pvc0);
  });
});

describe('kubectl fidelity for storage', () => {
  function boot() {
    const sim = createK8sSim({});
    const runner = makeRunner(sim);
    const settleSim = (cycles = 30) => { for (let i = 0; i < cycles; i++) { sim.reconcile(); vi.advanceTimersByTime(2000); } };
    return { sim, runner, settleSim };
  }

  it('apply -f creates StorageClass + PVC with real get/describe fidelity', () => {
    const { sim, runner, settleSim } = boot();
    sim.files.write('storage.yaml', `apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: standard
provisioner: sim.io/dynamic
reclaimPolicy: Delete
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data-claim
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 1Gi
  storageClassName: standard
`);
    runner.run('kubectl apply -f storage.yaml');
    settleSim(5);
    expect(runner.run('kubectl get storageclass').text).toMatch(/standard\s+sim\.io\/dynamic/);
    expect(runner.run('kubectl get pvc').text).toMatch(/data-claim\s+Bound/);
    expect(runner.run('kubectl describe pvc data-claim').text).toContain('Bound');
  });

  it('a PVC stuck Pending is reported with a reason in get and describe', () => {
    const { sim, runner, settleSim } = boot();
    sim.files.write('pvc.yaml', `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: stuck
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 1Gi
`);
    runner.run('kubectl apply -f pvc.yaml');
    settleSim(5);
    expect(runner.run('kubectl get pvc').text).toMatch(/stuck\s+Pending/);
    expect(runner.run('kubectl describe pvc stuck').text).toContain('no persistent volumes available');
  });

  it('delete pvc with reclaimPolicy Delete removes the bound PV too', () => {
    const { sim, runner, settleSim } = boot();
    sim.engine.makePV({ name: 'pv-del', capacity: '1Gi', accessModes: ['ReadWriteOnce'], reclaimPolicy: 'Delete' });
    sim.engine.makePVC({ name: 'claim-del', accessModes: ['ReadWriteOnce'], requestStorage: '1Gi' });
    settleSim(3);
    runner.run('kubectl delete pvc claim-del');
    expect(sim.engine.get('PersistentVolume', null, 'pv-del')).toBeFalsy();
  });

  it('delete pvc with reclaimPolicy Retain releases (not deletes) the PV', () => {
    const { sim, runner, settleSim } = boot();
    sim.engine.makePV({ name: 'pv-ret', capacity: '1Gi', accessModes: ['ReadWriteOnce'], reclaimPolicy: 'Retain' });
    sim.engine.makePVC({ name: 'claim-ret', accessModes: ['ReadWriteOnce'], requestStorage: '1Gi' });
    settleSim(3);
    runner.run('kubectl delete pvc claim-ret');
    const pv = sim.engine.get('PersistentVolume', null, 'pv-ret');
    expect(pv.status.phase).toBe('Released');
    expect(pv.spec.claimRef).toBeNull();
  });

  it('exec write/read round-trips through a PVC-backed mount, and read-only ConfigMap mounts refuse writes', () => {
    const { sim, runner, settleSim } = boot();
    sim.engine.makePV({ name: 'pv-w', capacity: '1Gi', accessModes: ['ReadWriteOnce'] });
    sim.engine.makePVC({ name: 'claim-w', accessModes: ['ReadWriteOnce'], requestStorage: '1Gi' });
    sim.engine.put({ apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'cm', namespace: 'default', creationTimestamp: Date.now() }, data: { 'k': 'v' }, spec: {}, status: {}, sim: {} });
    settleSim(3);
    sim.engine.makePod({
      name: 'writer', image: 'nginx',
      volumes: [{ name: 'data', persistentVolumeClaim: { claimName: 'claim-w' } }, { name: 'cfg', configMap: { name: 'cm' } }],
      volumeMounts: [{ name: 'data', mountPath: '/data' }, { name: 'cfg', mountPath: '/cfg' }],
    });
    settleSim(30);
    runner.run(`kubectl exec writer -- sh -c 'echo hello > /data/msg'`);
    expect(runner.run('kubectl exec writer -- cat /data/msg').text).toContain('hello');
    expect(runner.run(`kubectl exec writer -- sh -c 'echo x > /cfg/k'`).errors.join('')).toMatch(/Read-only file system/);
  });
});
