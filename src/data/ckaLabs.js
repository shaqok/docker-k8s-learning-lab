import { canI } from '../sims/k8s/rbac.js';

/**
 * CKA drill labs (improvement-plan step 6): scheduler workbench + RBAC
 * simulator. Same shape as the CKAD drills: each lab is a live playground —
 * `{ id, setup(engine, files), missions: [{id, desc, check(engine, flags)}],
 * solve(sim, run, settle) }` — with missions graded live every reconcile tick.
 * `flags` is the set of onMission ids the terminal fired ('can-i', …).
 */

const CUDA_POD_YAML = `# gpu-1 carries taint gpu=true:NoSchedule and label accelerator=nvidia.
# Mission: make this pod land there — it needs BOTH a toleration (to be
# allowed) and a nodeSelector/affinity (to be attracted). Then:
#     kubectl apply -f cuda-pod.yaml
apiVersion: v1
kind: Pod
metadata:
  name: cuda
spec:
  # tolerations:
  # - key: gpu
  #   operator: Equal
  #   value: "true"
  #   effect: NoSchedule
  # nodeSelector:
  #   accelerator: nvidia
  containers:
  - name: cuda
    image: nginx:1.27
`;

const HA_DEPLOY_YAML = `# Mission: 3 replicas that MUST land on 3 different nodes.
# Uncomment the requiredDuringScheduling podAntiAffinity and apply.
# (The sim treats every topologyKey as kubernetes.io/hostname.)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ha
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ha
  template:
    metadata:
      labels:
        app: ha
    spec:
      # affinity:
      #   podAntiAffinity:
      #     requiredDuringSchedulingIgnoredDuringExecution:
      #     - labelSelector:
      #         matchLabels:
      #           app: ha
      #       topologyKey: kubernetes.io/hostname
      containers:
      - name: web
        image: nginx:1.27
`;

const FAST_POD_YAML = `# Mission: pin this pod to the SSD node with a nodeSelector, then apply.
apiVersion: v1
kind: Pod
metadata:
  name: fast
spec:
  # nodeSelector:
  #   disktype: ssd
  containers:
  - name: redis
    image: redis
`;

const CI_SUBJECT = { kind: 'ServiceAccount', name: 'ci', namespace: 'build' };

export const CKA_LABS = [
  {
    id: 'sched',
    tab: { en: '🧲 Scheduler', ko: '🧲 스케줄러' },
    title: { en: 'Scheduler workbench — taints, labels, and (anti-)affinity', ko: '스케줄러 워크벤치 — taint, 레이블, (안티)어피니티' },
    brief: {
      en: 'Four workers, one of them (<code>gpu-1</code>) tainted <code>gpu=true:NoSchedule</code> and labeled <code>accelerator=nvidia</code>; <code>worker-3</code> is labeled <code>disktype=ssd</code>. Pod <code>pinned</code> is already stuck Pending — <code>kubectl describe pod pinned</code> prints the scheduler\'s real reasons, and the <b>node panel</b> shows them live. Remember the two halves of placement: <b>taints repel</b> (a toleration only lifts the repulsion) and <b>labels attract</b> (nodeSelector / affinity). Anti-affinity is how you force replicas onto different nodes.',
      ko: '워커 4대 중 <code>gpu-1</code>은 <code>gpu=true:NoSchedule</code> taint와 <code>accelerator=nvidia</code> 레이블을 갖고, <code>worker-3</code>은 <code>disktype=ssd</code> 레이블을 갖습니다. 파드 <code>pinned</code>는 이미 Pending에 걸려 있습니다 — <code>kubectl describe pod pinned</code>이 스케줄러의 실제 이유를 출력하고 <b>노드 패널</b>에도 실시간으로 보입니다. 배치의 두 축을 기억하세요: <b>taint는 밀어내고</b>(toleration은 밀어냄을 해제할 뿐) <b>레이블은 끌어당깁니다</b>(nodeSelector / affinity). 레플리카를 서로 다른 노드에 강제하는 방법이 안티어피니티입니다.',
    },
    docs: [
      { label: 'Assigning Pods to Nodes (affinity)', url: 'https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/' },
      { label: 'Taints and Tolerations', url: 'https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/' },
    ],
    starterFiles: { 'cuda-pod.yaml': CUDA_POD_YAML, 'ha.yaml': HA_DEPLOY_YAML, 'fast-pod.yaml': FAST_POD_YAML },
    setup(engine) {
      engine.makeNode({ name: 'worker-3', labels: { disktype: 'ssd' } });
      engine.makeNode({ name: 'gpu-1', labels: { accelerator: 'nvidia' }, taints: [{ key: 'gpu', value: 'true', effect: 'NoSchedule' }] });
      engine.makePod({ name: 'pinned', labels: { run: 'pinned' }, image: 'nginx:1.27', nodeSelector: { disktype: 'nvme' } });
    },
    missions: [
      {
        id: 'sch-why',
        desc: { en: '🔎 <code>pinned</code> is Pending. Read why (<code>kubectl describe pod pinned</code>), then fix it WITHOUT touching the pod: <code>kubectl label node &lt;node&gt; disktype=nvme</code>', ko: '🔎 <code>pinned</code>가 Pending입니다. 이유를 읽고(<code>kubectl describe pod pinned</code>) 파드는 건드리지 말고 고치세요: <code>kubectl label node &lt;노드&gt; disktype=nvme</code>' },
        check: (e) => {
          const p = e.get('Pod', 'default', 'pinned');
          if (!p || !p.status.ready || !p.spec.nodeName) return false;
          const n = e.get('Node', null, p.spec.nodeName);
          return !!(n && n.metadata.labels.disktype === 'nvme');
        },
      },
      {
        id: 'sch-ssd',
        desc: { en: '📌 Pin pod <code>fast</code> (image <code>redis</code>) to the SSD node with a <code>nodeSelector</code> — see <code>fast-pod.yaml</code>', ko: '📌 <code>nodeSelector</code>로 파드 <code>fast</code>(이미지 <code>redis</code>)를 SSD 노드에 고정하세요 — <code>fast-pod.yaml</code> 참고' },
        check: (e) => {
          const p = e.get('Pod', 'default', 'fast');
          if (!p || !p.status.ready || !p.spec.nodeSelector) return false;
          const n = e.get('Node', null, p.spec.nodeName || '');
          return !!(n && n.metadata.labels.disktype === 'ssd');
        },
      },
      {
        id: 'sch-gpu',
        desc: { en: '🎟 Land pod <code>cuda</code> on <code>gpu-1</code>: it needs a toleration for the taint AND a nodeSelector for the label (<code>cuda-pod.yaml</code>)', ko: '🎟 파드 <code>cuda</code>를 <code>gpu-1</code>에 착륙시키세요: taint에 대한 toleration과 레이블에 대한 nodeSelector가 모두 필요합니다 (<code>cuda-pod.yaml</code>)' },
        check: (e) => {
          const p = e.get('Pod', 'default', 'cuda');
          return !!(p && p.status.ready && p.spec.nodeName === 'gpu-1' && (p.spec.tolerations || []).some((t) => t.key === 'gpu'));
        },
      },
      {
        id: 'sch-ha',
        desc: { en: '🛡 Deploy <code>ha</code> (3 replicas) with required <b>podAntiAffinity</b> so every replica lands on a DIFFERENT node (<code>ha.yaml</code>) — then try <code>kubectl scale deployment ha --replicas=4</code> and read why #4 stays Pending', ko: '🛡 필수 <b>podAntiAffinity</b>로 <code>ha</code>(레플리카 3)를 배포해 모든 레플리카가 서로 다른 노드에 놓이게 하세요(<code>ha.yaml</code>) — 그 다음 <code>kubectl scale deployment ha --replicas=4</code>를 해보고 4번째가 왜 Pending인지 읽어보세요' },
        check: (e) => {
          const d = e.get('Deployment', 'default', 'ha');
          const anti = d && d.spec.template.spec.affinity && d.spec.template.spec.affinity.podAntiAffinity;
          if (!anti || !(anti.requiredDuringSchedulingIgnoredDuringExecution || []).length) return false;
          const pods = e.ownedPods(d).filter((p) => p.status.ready);
          return pods.length >= 3 && new Set(pods.map((p) => p.spec.nodeName)).size >= 3;
        },
      },
    ],
    solve(sim, run, settle) {
      settle(5);
      run('kubectl label node worker-1 disktype=nvme');
      sim.files.write('fast-pod.yaml', 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: fast\nspec:\n  nodeSelector:\n    disktype: ssd\n  containers:\n  - name: redis\n    image: redis\n');
      run('kubectl apply -f fast-pod.yaml');
      sim.files.write('cuda-pod.yaml', 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: cuda\nspec:\n  tolerations:\n  - key: gpu\n    operator: Equal\n    value: "true"\n    effect: NoSchedule\n  nodeSelector:\n    accelerator: nvidia\n  containers:\n  - name: cuda\n    image: nginx:1.27\n');
      run('kubectl apply -f cuda-pod.yaml');
      sim.files.write('ha.yaml', 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: ha\nspec:\n  replicas: 3\n  selector:\n    matchLabels: {app: ha}\n  template:\n    metadata:\n      labels: {app: ha}\n    spec:\n      affinity:\n        podAntiAffinity:\n          requiredDuringSchedulingIgnoredDuringExecution:\n          - labelSelector:\n              matchLabels: {app: ha}\n            topologyKey: kubernetes.io/hostname\n      containers:\n      - name: web\n        image: nginx:1.27\n');
      run('kubectl apply -f ha.yaml');
    },
  },

  {
    id: 'rbac',
    tab: { en: '🔐 RBAC', ko: '🔐 RBAC' },
    title: { en: 'RBAC simulator — who may do what, where', ko: 'RBAC 시뮬레이터 — 누가, 무엇을, 어디서' },
    brief: {
      en: 'RBAC is three objects: a <b>subject</b> (here a ServiceAccount), a <b>Role</b> (allowed verb × resource pairs in one namespace — a <b>ClusterRole</b> is the namespace-less version), and a <b>Binding</b> that connects them. Everything is <b>deny-by-default</b>. Namespace <code>build</code> already runs a <code>ci-runner</code> Deployment; your job is to give a <code>ci</code> ServiceAccount exactly the access it needs — no more. Prove every step with <code>kubectl auth can-i … --as=system:serviceaccount:build:ci</code>, or use the live <b>can-i tester</b> in the panel.',
      ko: 'RBAC은 오브젝트 셋의 조합입니다: <b>주체</b>(여기서는 ServiceAccount), 한 네임스페이스 안에서 허용되는 동사 × 리소스 목록인 <b>Role</b>(<b>ClusterRole</b>은 네임스페이스 없는 버전), 그리고 둘을 잇는 <b>Binding</b>. 모든 것은 <b>기본 거부</b>입니다. 네임스페이스 <code>build</code>에는 이미 <code>ci-runner</code> Deployment가 돌고 있습니다. <code>ci</code> ServiceAccount에 딱 필요한 만큼의 권한만 주는 것이 임무입니다. 매 단계 <code>kubectl auth can-i … --as=system:serviceaccount:build:ci</code>로 증명하거나 패널의 실시간 <b>can-i 테스터</b>를 쓰세요.',
    },
    docs: [
      { label: 'Using RBAC Authorization', url: 'https://kubernetes.io/docs/reference/access-authn-authz/rbac/' },
      { label: 'Checking API access (auth can-i)', url: 'https://kubernetes.io/docs/reference/access-authn-authz/authorization/#checking-api-access' },
    ],
    starterFiles: {},
    setup(engine) {
      engine.makeNamespace('build');
      engine.makeDeployment({ name: 'ci-runner', ns: 'build', replicas: 1, image: 'busybox', command: ['sh', '-c', 'sleep infinity'] });
    },
    missions: [
      {
        id: 'rb-sa',
        desc: { en: '👤 Create ServiceAccount <code>ci</code> in namespace <code>build</code>', ko: '👤 네임스페이스 <code>build</code>에 ServiceAccount <code>ci</code>를 만드세요' },
        check: (e) => !!e.get('ServiceAccount', 'build', 'ci'),
      },
      {
        id: 'rb-role',
        desc: { en: '📜 Create Role <code>pod-reader</code> in <code>build</code> allowing <code>get,list,watch</code> on <code>pods</code> (<code>kubectl create role … --verb=… --resource=…</code>)', ko: '📜 <code>build</code>에 <code>pods</code>에 대한 <code>get,list,watch</code>를 허용하는 Role <code>pod-reader</code>를 만드세요 (<code>kubectl create role … --verb=… --resource=…</code>)' },
        check: (e) => {
          const r = e.get('Role', 'build', 'pod-reader');
          return !!(r && (r.rules || []).some((ru) => (ru.resources || []).includes('pods') && (ru.verbs || []).includes('get') && (ru.verbs || []).includes('list')));
        },
      },
      {
        id: 'rb-bind',
        desc: { en: '🔗 Bind them: a RoleBinding in <code>build</code> attaching <code>pod-reader</code> to <code>build:ci</code> — until this exists, the role grants nothing', ko: '🔗 연결하세요: <code>build</code>의 RoleBinding으로 <code>pod-reader</code>를 <code>build:ci</code>에 붙이세요 — 이게 생기기 전까지 Role은 아무 권한도 주지 않습니다' },
        check: (e) => canI(e, { verb: 'list', resource: 'pods', subject: CI_SUBJECT, ns: 'build' }),
      },
      {
        id: 'rb-cani',
        desc: { en: '⚖️ Prove least privilege with <code>kubectl auth can-i</code> as <code>system:serviceaccount:build:ci</code>: reading pods in <code>build</code> → yes, but <code>delete pods</code> must stay <b>no</b>', ko: '⚖️ <code>system:serviceaccount:build:ci</code>로 <code>kubectl auth can-i</code>를 실행해 최소 권한을 증명하세요: <code>build</code>의 파드 읽기 → yes, 하지만 <code>delete pods</code>는 <b>no</b>여야 합니다' },
        check: (e, flags) =>
          !!(flags && flags.has('can-i')) &&
          canI(e, { verb: 'get', resource: 'pods', subject: CI_SUBJECT, ns: 'build' }) &&
          !canI(e, { verb: 'delete', resource: 'pods', subject: CI_SUBJECT, ns: 'build' }),
      },
      {
        id: 'rb-cluster',
        desc: { en: '🌍 Nodes are cluster-scoped: create ClusterRole <code>node-viewer</code> (<code>get,list</code> on <code>nodes</code>) and a ClusterRoleBinding giving it to <code>build:ci</code>', ko: '🌍 노드는 클러스터 범위입니다: ClusterRole <code>node-viewer</code>(<code>nodes</code>에 <code>get,list</code>)와 이를 <code>build:ci</code>에 부여하는 ClusterRoleBinding을 만드세요' },
        check: (e) =>
          !!e.get('ClusterRole', null, 'node-viewer') &&
          canI(e, { verb: 'list', resource: 'nodes', subject: CI_SUBJECT, ns: 'default' }),
      },
    ],
    solve(sim, run) {
      run('kubectl create serviceaccount ci -n build');
      run('kubectl create role pod-reader --verb=get,list,watch --resource=pods -n build');
      run('kubectl create rolebinding read-pods --role=pod-reader --serviceaccount=build:ci -n build');
      run('kubectl auth can-i list pods --as=system:serviceaccount:build:ci -n build');
      run('kubectl auth can-i delete pods --as=system:serviceaccount:build:ci -n build');
      run('kubectl create clusterrole node-viewer --verb=get,list --resource=nodes');
      run('kubectl create clusterrolebinding ci-nodes --clusterrole=node-viewer --serviceaccount=build:ci');
    },
  },
];

export const CKA_MISSION_TOTAL = CKA_LABS.reduce((s, l) => s + l.missions.length, 0);
