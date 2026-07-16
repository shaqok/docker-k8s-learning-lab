/**
 * Storage Drills lab (improvement-plan step 15): PersistentVolume /
 * PersistentVolumeClaim / StorageClass binding (static + dynamic), the
 * pod-dies-data-survives lesson (contrasted with emptyDir, which doesn't
 * survive), the classic "PVC stuck Pending" fault, and StatefulSet
 * volumeClaimTemplates giving each ordinal its own durable identity.
 */

const APP_YAML = `# Mission: apply this and watch the PVC bind (to the pre-seeded static PV),
# then the Deployment's pod mount it.
#     kubectl apply -f app.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data-claim
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 1Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  replicas: 1
  selector:
    matchLabels: {app: app}
  template:
    metadata:
      labels: {app: app}
    spec:
      containers:
      - name: app
        image: nginx:1.27
        volumeMounts:
        - name: data
          mountPath: /data
        - name: cache
          mountPath: /cache
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: data-claim
      - name: cache
        emptyDir: {}
`;

const BROKEN_PVC_YAML = `# Mission: apply this — it asks for more space than any PV can offer, and has
# no storageClassName, so it will sit Pending. Check why: kubectl describe pvc wrong-claim
#     kubectl apply -f broken-pvc.yaml
# Then fix it: storageClassName is IMMUTABLE once a PVC exists, so the fix is
# delete + recreate, not edit-in-place —
#     kubectl delete pvc wrong-claim
# uncomment the line below, then re-apply. The StorageClass provisions a fresh
# PersistentVolume on demand instead of waiting for a static one to match.
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: wrong-claim
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 5Gi
  # storageClassName: standard
`;

const BROKEN_PVC_YAML_FIXED = BROKEN_PVC_YAML.replace('  # storageClassName: standard', '  storageClassName: standard');

const STS_YAML = `# Mission: apply this and watch TWO PersistentVolumeClaims appear, one per
# ordinal (data-web-0, data-web-1) — StatefulSet's volumeClaimTemplates.
#     kubectl apply -f web.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: web
spec:
  serviceName: web
  replicas: 2
  selector:
    matchLabels: {app: web}
  template:
    metadata:
      labels: {app: web}
    spec:
      containers:
      - name: web
        image: nginx:1.27
        volumeMounts:
        - name: data
          mountPath: /data
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: [ReadWriteOnce]
      resources:
        requests:
          storage: 1Gi
      storageClassName: standard
`;

const appPod = (e) => e.list('Pod').find((p) => p.sim.owner === 'default/app' && p.status.state !== 'Terminating');
const wasAppPodDeleted = (flags) => !!(flags && [...flags].some((f) => f.startsWith('deleted:Pod/app-')));

export const STORAGE_LABS = [
  {
    id: 'pvc',
    tab: { en: '💾 PVC Lifecycle', ko: '💾 PVC 라이프사이클' },
    title: { en: 'PersistentVolumeClaim lifecycle — bind, mount, survive', ko: 'PersistentVolumeClaim 라이프사이클 — 바인딩, 마운트, 생존' },
    brief: {
      en: 'A <code>PersistentVolumeClaim</code> only <b>requests</b> storage — it binds to a matching static <code>PersistentVolume</code> if one exists, or a <code>StorageClass</code> provisions one on demand. Apply <code>app.yaml</code> and watch <code>data-claim</code> bind, then the <code>app</code> pod mount it. Write to it, delete the pod, and watch the <b>replacement</b> pod (new name, same PVC) still have your data — then try the same trick with the <code>emptyDir</code> volume on the same pod and watch it come back <i>empty</i>. Finally, apply <code>broken-pvc.yaml</code>: it asks for more space than any PV offers and has no <code>storageClassName</code>, so it sits <code>Pending</code> — the classic exam fault. <code>storageClassName</code> is immutable once a PVC exists, so the fix is delete + recreate with a class set, which provisions a fresh PV dynamically.',
      ko: '<code>PersistentVolumeClaim</code>은 스토리지를 <b>요청</b>만 합니다 — 조건이 맞는 정적 <code>PersistentVolume</code>이 있으면 거기에 바인딩되고, 없으면 <code>StorageClass</code>가 즉석에서 하나를 프로비저닝합니다. <code>app.yaml</code>을 적용해 <code>data-claim</code>이 바인딩되는 걸 보고, <code>app</code> 파드가 마운트하는 걸 확인하세요. 데이터를 쓰고 파드를 지운 뒤 <b>교체된</b> 파드(이름은 새것, PVC는 그대로)에도 데이터가 남아있는지 확인하고, 같은 파드의 <code>emptyDir</code> 볼륨으로 똑같이 해보면 <i>비어있는</i> 채로 돌아오는 걸 보게 됩니다. 마지막으로 <code>broken-pvc.yaml</code>을 적용하면 — 어떤 PV보다도 큰 용량을 요청하고 <code>storageClassName</code>도 없어서 <code>Pending</code> 상태로 멈춥니다(전형적인 시험 장애 상황). <code>storageClassName</code>은 PVC가 생성된 후에는 불변이므로, 고치려면 삭제 후 클래스를 지정해 재생성해야 하고 그러면 StorageClass가 새 PV를 동적으로 프로비저닝합니다.',
    },
    docs: [
      { label: 'Persistent Volumes', url: 'https://kubernetes.io/docs/concepts/storage/persistent-volumes/' },
      { label: 'Storage Classes', url: 'https://kubernetes.io/docs/concepts/storage/storage-classes/' },
    ],
    starterFiles: { 'app.yaml': APP_YAML, 'broken-pvc.yaml': BROKEN_PVC_YAML },
    setup(engine) {
      engine.makeStorageClass({ name: 'standard', provisioner: 'sim.io/dynamic', reclaimPolicy: 'Delete' });
      engine.makePV({ name: 'data-pv', capacity: '1Gi', accessModes: ['ReadWriteOnce'], reclaimPolicy: 'Retain' });
    },
    missions: [
      {
        id: 'bind',
        desc: { en: '💾 Apply <code>app.yaml</code> — <code>data-claim</code> binds to the pre-seeded static PV <code>data-pv</code>', ko: '💾 <code>app.yaml</code>을 적용 — <code>data-claim</code>이 미리 준비된 정적 PV <code>data-pv</code>에 바인딩됩니다' },
        check: (e) => { const c = e.get('PersistentVolumeClaim', 'default', 'data-claim'); return !!(c && c.status.phase === 'Bound' && c.spec.volumeName === 'data-pv'); },
      },
      {
        id: 'mount',
        desc: { en: '📦 The <code>app</code> pod mounts <code>data-claim</code> at <code>/data</code> and becomes Ready', ko: '📦 <code>app</code> 파드가 <code>data-claim</code>을 <code>/data</code>에 마운트하고 Ready가 됩니다' },
        check: (e) => { const p = appPod(e); return !!(p && p.status.ready && (p.spec.volumes || []).some((v) => v.persistentVolumeClaim && v.persistentVolumeClaim.claimName === 'data-claim')); },
      },
      {
        id: 'pending',
        desc: { en: "🚫 Apply <code>broken-pvc.yaml</code> — <code>wrong-claim</code> sits <code>Pending</code>. Check why: <code>kubectl describe pvc wrong-claim</code>", ko: '🚫 <code>broken-pvc.yaml</code>을 적용 — <code>wrong-claim</code>이 <code>Pending</code> 상태로 멈춥니다. 이유 확인: <code>kubectl describe pvc wrong-claim</code>' },
        check: (e, flags) => !!(flags && flags.has('pvc-pending:wrong-claim')),
      },
      {
        id: 'dynamic-bind',
        desc: { en: '🛠 Fix it: <code>kubectl delete pvc wrong-claim</code>, uncomment <code>storageClassName</code>, re-apply — a fresh PV is provisioned dynamically', ko: '🛠 수정: <code>kubectl delete pvc wrong-claim</code> 후 <code>storageClassName</code> 주석 해제하고 재적용 — 새 PV가 동적으로 프로비저닝됩니다' },
        check: (e) => {
          const c = e.get('PersistentVolumeClaim', 'default', 'wrong-claim');
          if (!c || c.status.phase !== 'Bound') return false;
          const pv = e.get('PersistentVolume', null, c.spec.volumeName);
          return !!(pv && pv.sim.dynamic);
        },
      },
      {
        id: 'write',
        desc: { en: "✍️ Write into the mounted PVC: <code>kubectl exec app-xxxxx -- sh -c 'echo hi > /data/msg'</code>", ko: "✍️ 마운트된 PVC에 쓰기: <code>kubectl exec app-xxxxx -- sh -c 'echo hi > /data/msg'</code>" },
        check: (e, flags) => !!(flags && flags.has('vol-write:pvc')),
      },
      {
        id: 'survive',
        desc: { en: '♻️ Delete the <code>app</code> pod — the Deployment replaces it with a new name, but <code>cat /data/msg</code> on the NEW pod still shows your data', ko: '♻️ <code>app</code> 파드를 삭제 — Deployment가 새 이름으로 교체하지만, 새 파드에서 <code>cat /data/msg</code>를 실행하면 여전히 데이터가 남아있습니다' },
        check: (e, flags) => {
          if (!wasAppPodDeleted(flags)) return false;
          const p = appPod(e);
          if (!p || !p.status.ready) return false;
          const store = e.resolveVolumeStore(p, 'data');
          return !!(store && store.get('msg') === 'hi');
        },
      },
      {
        id: 'emptydir-gone',
        desc: { en: "💨 Now write to the <code>emptyDir</code> mount too (<code>/cache/tmp</code>) — after the same pod delete, the NEW pod's <code>/cache</code> is empty. emptyDir dies with the pod; the PVC doesn't.", ko: "💨 <code>emptyDir</code> 마운트(<code>/cache/tmp</code>)에도 써 보세요 — 같은 방식으로 파드를 지우면 새 파드의 <code>/cache</code>는 비어 있습니다. emptyDir은 파드와 함께 죽지만 PVC는 그렇지 않습니다." },
        check: (e, flags) => {
          if (!flags || !flags.has('vol-write:emptydir') || !wasAppPodDeleted(flags)) return false;
          const p = appPod(e);
          if (!p || !p.status.ready) return false;
          const store = e.resolveVolumeStore(p, 'cache');
          return !!(store && !store.has('tmp'));
        },
      },
    ],
    solve(sim, run, settle) {
      const e = sim.engine;
      settle(5);
      run('kubectl apply -f app.yaml');
      settle(20);
      const p1 = appPod(e);
      run(`kubectl exec ${p1.metadata.name} -- sh -c 'echo hi > /data/msg'`);
      run(`kubectl exec ${p1.metadata.name} -- sh -c 'echo temp > /cache/tmp'`);
      settle(3);
      run('kubectl apply -f broken-pvc.yaml');
      settle(10);
      run('kubectl delete pvc wrong-claim');
      sim.files.write('broken-pvc.yaml', BROKEN_PVC_YAML_FIXED);
      run('kubectl apply -f broken-pvc.yaml');
      settle(10);
      run(`kubectl delete pod ${p1.metadata.name}`);
      settle(25);
      const p2 = appPod(e);
      run(`kubectl exec ${p2.metadata.name} -- cat /data/msg`);
      settle(5);
    },
  },
  {
    id: 'statefulset',
    tab: { en: '🔢 StatefulSet Storage', ko: '🔢 StatefulSet 스토리지' },
    title: { en: 'StatefulSet volumeClaimTemplates — one PVC per ordinal', ko: 'StatefulSet volumeClaimTemplates — 순번마다 하나의 PVC' },
    brief: {
      en: 'A <code>StatefulSet</code>\'s <code>volumeClaimTemplates</code> gives every ordinal its OWN <code>PersistentVolumeClaim</code>, deterministically named (<code>data-web-0</code>, <code>data-web-1</code>) — not one shared claim. Apply <code>web.yaml</code> and watch both PVCs bind and both pods come up in order (<code>web-1</code> waits for <code>web-0</code> to be Ready — OrderedReady). Write different data into <code>web-0</code> and <code>web-1</code>, delete <code>web-0</code>, and watch it come back with the SAME name and the SAME data — ordinal identity plus storage identity, together.',
      ko: 'StatefulSet의 <code>volumeClaimTemplates</code>는 순번마다 각자의 <code>PersistentVolumeClaim</code>을 결정론적 이름(<code>data-web-0</code>, <code>data-web-1</code>)으로 만들어줍니다 — 공유되는 클레임 하나가 아닙니다. <code>web.yaml</code>을 적용하면 두 PVC가 바인딩되고 두 파드가 순서대로 뜨는 걸 볼 수 있습니다(<code>web-1</code>은 <code>web-0</code>이 Ready가 될 때까지 기다립니다 — OrderedReady). <code>web-0</code>과 <code>web-1</code>에 서로 다른 데이터를 쓰고 <code>web-0</code>을 지우면, 같은 이름·같은 데이터로 되돌아오는 걸 확인하세요 — 순번 정체성과 스토리지 정체성이 함께 유지됩니다.',
    },
    docs: [
      { label: 'StatefulSets', url: 'https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/' },
      { label: 'Volume Claim Templates', url: 'https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/#volume-claim-templates' },
    ],
    starterFiles: { 'web.yaml': STS_YAML },
    setup(engine) {
      engine.makeStorageClass({ name: 'standard', provisioner: 'sim.io/dynamic', reclaimPolicy: 'Delete' });
    },
    missions: [
      {
        id: 'pvc-per-ordinal',
        desc: { en: '🔢 Apply <code>web.yaml</code> — TWO PVCs appear and bind: <code>data-web-0</code> and <code>data-web-1</code>', ko: '🔢 <code>web.yaml</code>을 적용 — <code>data-web-0</code>과 <code>data-web-1</code> 두 PVC가 생기고 바인딩됩니다' },
        check: (e) => ['data-web-0', 'data-web-1'].every((n) => { const c = e.get('PersistentVolumeClaim', 'default', n); return !!(c && c.status.phase === 'Bound'); }),
      },
      {
        id: 'ordinal-ready',
        desc: { en: '✅ Both <code>web-0</code> and <code>web-1</code> reach Running/Ready (in order — check <code>kubectl get pods</code> mid-rollout)', ko: '✅ <code>web-0</code>과 <code>web-1</code> 모두 Running/Ready가 됩니다 (순서대로 — 진행 중에 <code>kubectl get pods</code>로 확인)' },
        check: (e) => { const p0 = e.get('Pod', 'default', 'web-0'); const p1 = e.get('Pod', 'default', 'web-1'); return !!(p0 && p0.status.ready && p1 && p1.status.ready); },
      },
      {
        id: 'identity-survives',
        desc: { en: "✍️ Write to <code>web-0</code>'s volume (<code>echo zero &gt; /data/id</code>), delete the pod, and confirm the pod named <code>web-0</code> comes back with the same data", ko: "✍️ <code>web-0</code>의 볼륨에 쓰기(<code>echo zero &gt; /data/id</code>) 후 파드를 지우고, <code>web-0</code>이라는 이름의 파드가 같은 데이터로 돌아오는지 확인" },
        check: (e, flags) => {
          if (!flags || !flags.has('vol-write:pvc') || !flags.has('deleted:Pod/web-0')) return false;
          const p0 = e.get('Pod', 'default', 'web-0');
          if (!p0 || !p0.status.ready) return false;
          const store = e.resolveVolumeStore(p0, 'data');
          return !!(store && store.get('id') === 'zero');
        },
      },
      {
        id: 'distinct-storage',
        desc: { en: "🔀 Write different data into <code>web-1</code> too (<code>echo one &gt; /data/id</code>) — each ordinal's storage is genuinely its own, not shared", ko: '🔀 <code>web-1</code>에도 다른 데이터를 쓰세요(<code>echo one &gt; /data/id</code>) — 각 순번의 스토리지는 진짜로 독립적이며 공유되지 않습니다' },
        check: (e) => {
          const p0 = e.get('Pod', 'default', 'web-0');
          const p1 = e.get('Pod', 'default', 'web-1');
          if (!p0 || !p1 || !p0.status.ready || !p1.status.ready) return false;
          const s0 = e.resolveVolumeStore(p0, 'data');
          const s1 = e.resolveVolumeStore(p1, 'data');
          return !!(s0 && s1 && s0.get('id') === 'zero' && s1.get('id') === 'one');
        },
      },
    ],
    solve(sim, run, settle) {
      settle(5);
      run('kubectl apply -f web.yaml');
      settle(35); // OrderedReady: web-1 waits for web-0
      run(`kubectl exec web-0 -- sh -c 'echo zero > /data/id'`);
      run(`kubectl exec web-1 -- sh -c 'echo one > /data/id'`);
      settle(3);
      run('kubectl delete pod web-0');
      settle(30);
      run('kubectl exec web-0 -- cat /data/id');
      settle(5);
    },
  },
];

export const STORAGE_MISSION_TOTAL = STORAGE_LABS.reduce((s, l) => s + l.missions.length, 0);
