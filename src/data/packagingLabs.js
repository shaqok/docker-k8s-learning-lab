/**
 * Packaging & GitOps drill labs (improvement-plan step 16) — Helm, Kustomize, and
 * a GitOps drift-reconciliation lab, on the shared k8s engine/kubectl. Same shape
 * as the other drill sets: `{ id, tab, title, brief, docs, starterFiles, setup?,
 * missions:[{id,desc,check}], solve }` run through `LabRunner`. Missions are
 * graded LIVE against engine state; `check(engine, flags, files)` — `flags` is
 * the set of onMission ids the CLI fired.
 */
import { buildKustomization } from '../sims/k8s/kustomize.js';

const HELM_D = 'https://helm.sh/docs';
const K8S_D = 'https://kubernetes.io/docs';

/** True if any revision the release ever rendered (not just the current live state —
 * a later `helm rollback` shouldn't erase credit for an earlier lesson) had a doc
 * matching `pred`. Revision history stores the full rendered manifest set per rev. */
const releaseEverRendered = (engine, pred) => {
  const rel = engine.get('HelmRelease', 'default', 'myrelease');
  return !!rel && rel.sim.history.some((h) => h.docs.some(pred));
};

/* ---------------- 1 · Helm ---------------- */

const CHART_YAML = `name: mychart\nversion: 1.0.0\n`;

const VALUES_YAML = `replicaCount: 1
image:
  repository: nginx
  tag: "1.27"
service:
  enabled: false
extraEnv: []
`;

const DEPLOYMENT_TPL = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}-web
  labels:
    app: {{ .Release.Name }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app: {{ .Release.Name }}
  template:
    metadata:
      labels:
        app: {{ .Release.Name }}
    spec:
      containers:
      - name: web
        image: {{ .Values.image.repository }}:{{ .Values.image.tag }}
        ports:
        - containerPort: 80
        env:
        {{ range .Values.extraEnv }}
        - name: {{ .name }}
          value: "{{ .value }}"
        {{ end }}
`;

const SERVICE_TPL = `{{ if .Values.service.enabled }}
apiVersion: v1
kind: Service
metadata:
  name: {{ .Release.Name }}-web
spec:
  selector:
    app: {{ .Release.Name }}
  ports:
  - port: 80
    targetPort: 80
{{ end }}
`;

const helmLab = {
  id: 'helm',
  tab: { en: '⎈ Helm', ko: '⎈ Helm' },
  title: { en: 'Helm — values.yaml really drives the rendered chart', ko: 'Helm — values.yaml가 렌더링된 차트를 실제로 좌우한다' },
  brief: {
    en: "<code>chart/templates/*.yaml</code> are Go-templated: <code>{{ .Values.x }}</code> substitutes, <code>{{ if }}</code> can drop a whole object, <code>{{ range }}</code> repeats one per list item. Edit <code>chart/values.yaml</code> in the Manifests pane, then run <code>helm install myrelease chart/</code> / <code>helm upgrade myrelease chart/</code> — <code>--set a.b=c</code> layers an extra override on top of the file. <code>helm history myrelease</code> shows every revision; <code>helm rollback myrelease REV</code> restores one (as a brand-new revision, exactly like <code>kubectl rollout undo</code>).",
    ko: "<code>chart/templates/*.yaml</code>는 Go 템플릿입니다: <code>{{ .Values.x }}</code>는 치환되고, <code>{{ if }}</code>는 객체 전체를 없앨 수 있고, <code>{{ range }}</code>는 리스트 항목마다 반복합니다. Manifests 패널에서 <code>chart/values.yaml</code>을 고친 뒤 <code>helm install myrelease chart/</code> / <code>helm upgrade myrelease chart/</code>를 실행하세요 — <code>--set a.b=c</code>는 파일 위에 얹는 추가 오버라이드입니다. <code>helm history myrelease</code>는 모든 리비전을 보여주고, <code>helm rollback myrelease REV</code>는 (kubectl rollout undo처럼) 새 리비전으로 되돌립니다.",
  },
  docs: [
    { label: 'Using Helm', url: HELM_D + '/intro/using_helm/' },
    { label: 'Chart Template Guide', url: HELM_D + '/chart_template_guide/getting_started/' },
  ],
  starterFiles: {
    'chart/Chart.yaml': CHART_YAML,
    'chart/values.yaml': VALUES_YAML,
    'chart/templates/deployment.yaml': DEPLOYMENT_TPL,
    'chart/templates/service.yaml': SERVICE_TPL,
  },
  missions: [
    { id: 'install', desc: { en: '⎈ Install the chart: <code>helm install myrelease chart/</code> — a <code>myrelease-web</code> Deployment appears', ko: '⎈ 차트 설치: <code>helm install myrelease chart/</code> — <code>myrelease-web</code> Deployment가 나타납니다' },
      check: (e, f) => f.has('helm-install') && !!e.get('Deployment', 'default', 'myrelease-web') },
    { id: 'conditional', desc: { en: '🔀 Flip <code>service.enabled</code> to <code>true</code> in <code>values.yaml</code>, then <code>helm upgrade myrelease chart/</code> — a Service appears (an <code>{{ if }}</code> branching the whole rendered file, not just a substitution)', ko: '🔀 <code>values.yaml</code>의 <code>service.enabled</code>를 <code>true</code>로 바꾸고 <code>helm upgrade myrelease chart/</code> — Service가 생깁니다 (<code>{{ if }}</code>가 단순 치환이 아니라 렌더링된 파일 전체를 좌우함)' },
      check: (e) => releaseEverRendered(e, (d) => d.kind === 'Service') },
    { id: 'upgrade', desc: { en: '⬆️ Bump <code>image.tag</code> to <code>"1.28"</code> in <code>values.yaml</code> and upgrade again — the live container image changes', ko: '⬆️ <code>values.yaml</code>의 <code>image.tag</code>를 <code>"1.28"</code>로 올리고 다시 upgrade — 실행 중 컨테이너 이미지가 바뀝니다' },
      check: (e) => releaseEverRendered(e, (d) => d.kind === 'Deployment' && d.spec.template.spec.containers[0].image === 'nginx:1.28') },
    { id: 'rollback', desc: { en: '⏪ <code>helm rollback myrelease 1</code> — revision 1\'s image (<code>nginx:1.27</code>) comes back, recorded as a brand-new revision', ko: '⏪ <code>helm rollback myrelease 1</code> — 리비전 1의 이미지(<code>nginx:1.27</code>)가 돌아오고, 새 리비전으로 기록됩니다' },
      check: (e) => { const rel = e.get('HelmRelease', 'default', 'myrelease'); const d = e.get('Deployment', 'default', 'myrelease-web'); return !!rel && rel.status.revision >= 3 && !!d && d.spec.template.spec.containers[0].image === 'nginx:1.27'; } },
    { id: 'range', desc: { en: '🔁 Add two entries under <code>extraEnv:</code> in <code>values.yaml</code> and upgrade — <code>{{ range }}</code> emits one env entry per item', ko: '🔁 <code>values.yaml</code>의 <code>extraEnv:</code>에 항목 두 개를 추가하고 upgrade — <code>{{ range }}</code>가 항목마다 env를 하나씩 만듭니다' },
      check: (e) => releaseEverRendered(e, (d) => d.kind === 'Deployment' && (d.spec.template.spec.containers[0].env || []).length >= 2) },
  ],
  solve(sim, run) {
    run('helm install myrelease chart/');
    sim.files.write('chart/values.yaml', 'replicaCount: 1\nimage:\n  repository: nginx\n  tag: "1.28"\nservice:\n  enabled: true\nextraEnv:\n  - name: LOG_LEVEL\n    value: info\n  - name: ENV\n    value: prod\n');
    run('helm upgrade myrelease chart/');
    run('helm rollback myrelease 1');
  },
};

/* ---------------- 2 · Kustomize ---------------- */

const KBASE_KUSTOMIZATION = `resources:\n  - deployment.yaml\n  - service.yaml\n`;

const KBASE_DEPLOYMENT = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 1
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
      - name: api
        image: nginx:1.27
        ports:
        - containerPort: 80
`;

const KBASE_SERVICE = `apiVersion: v1
kind: Service
metadata:
  name: api
spec:
  selector:
    app: api
  ports:
  - port: 80
`;

const KOVERLAY_START = `# Mission: add namePrefix + commonLabels, then patches — see the lab brief.
resources:
  - ../../base
`;

const kustomizeLab = {
  id: 'kustomize',
  tab: { en: '🧬 Kustomize', ko: '🧬 Kustomize' },
  title: { en: 'Kustomize — patch a base without touching it', ko: 'Kustomize — base를 건드리지 않고 패치하기' },
  brief: {
    en: "<code>k8s/base</code> is the plain manifest set; <code>k8s/overlays/prod</code> composes it via <code>resources: [../../base]</code> and layers transformers on top — no copy-pasted YAML. Add <code>namePrefix</code>/<code>commonLabels</code>, then a whole-object <code>patchesStrategicMerge</code>, then an independent RFC-6902 <code>patchesJson6902</code>, applying with <code>kubectl apply -k k8s/overlays/prod</code> each time. <code>kustomize build DIR</code> previews without touching the cluster; the panel below shows a live base-vs-overlay diff.",
    ko: "<code>k8s/base</code>는 순수 매니페스트이고, <code>k8s/overlays/prod</code>는 <code>resources: [../../base]</code>로 이를 조합한 뒤 그 위에 트랜스포머를 얹습니다 — YAML을 복사-붙여넣기하지 않습니다. <code>namePrefix</code>/<code>commonLabels</code>를 추가하고, 객체 전체를 바꾸는 <code>patchesStrategicMerge</code>, 그리고 독립적인 RFC-6902 <code>patchesJson6902</code>를 추가하면서 매번 <code>kubectl apply -k k8s/overlays/prod</code>로 적용하세요. <code>kustomize build DIR</code>는 클러스터를 건드리지 않고 미리보기만 하고, 아래 패널은 base-vs-overlay 실시간 diff를 보여줍니다.",
  },
  docs: [
    { label: 'Declarative Management with Kustomize', url: K8S_D + '/tasks/manage-kubernetes-objects/kustomization/' },
    { label: 'Kustomize reference', url: 'https://kubectl.docs.kubernetes.io/references/kustomize/' },
  ],
  starterFiles: {
    'k8s/base/kustomization.yaml': KBASE_KUSTOMIZATION,
    'k8s/base/deployment.yaml': KBASE_DEPLOYMENT,
    'k8s/base/service.yaml': KBASE_SERVICE,
    'k8s/overlays/prod/kustomization.yaml': KOVERLAY_START,
  },
  missions: [
    { id: 'build', desc: { en: '🧬 Sanity-check the base renders: <code>kustomize build k8s/base</code>', ko: '🧬 base가 잘 렌더링되는지 확인: <code>kustomize build k8s/base</code>' },
      check: (e, f) => f.has('kustomize-build') },
    { id: 'prefix-labels', desc: { en: '🏷️ Add <code>namePrefix: prod-</code> and <code>commonLabels: {env: prod}</code> to the overlay, then <code>kubectl apply -k k8s/overlays/prod</code> — a <code>prod-api</code> Deployment appears, labeled <code>env=prod</code>', ko: '🏷️ 오버레이에 <code>namePrefix: prod-</code>와 <code>commonLabels: {env: prod}</code>를 추가하고 <code>kubectl apply -k k8s/overlays/prod</code> — <code>prod-api</code> Deployment가 <code>env=prod</code> 라벨로 생깁니다' },
      check: (e) => { const d = e.get('Deployment', 'default', 'prod-api'); return !!d && d.metadata.labels && d.metadata.labels.env === 'prod'; } },
    { id: 'strategic-patch', desc: { en: '🩹 Add a <code>patchesStrategicMerge</code> entry bumping <code>prod-api</code> to <code>replicas: 3</code>, re-apply', ko: '🩹 <code>prod-api</code>를 <code>replicas: 3</code>으로 올리는 <code>patchesStrategicMerge</code>를 추가하고 재적용' },
      check: (e) => { const d = e.get('Deployment', 'default', 'prod-api'); return !!d && d.spec.replicas === 3; } },
    { id: 'json6902-patch', desc: { en: '🩹 Add an independent <code>patchesJson6902</code> entry replacing <code>prod-api</code>\'s image with <code>nginx:1.29</code>, re-apply', ko: '🩹 <code>prod-api</code>의 이미지를 <code>nginx:1.29</code>로 바꾸는 독립적인 <code>patchesJson6902</code>를 추가하고 재적용' },
      check: (e) => { const d = e.get('Deployment', 'default', 'prod-api'); return !!d && d.spec.template.spec.containers[0].image === 'nginx:1.29'; } },
    { id: 'diff', desc: { en: '🔍 Compare the two renders: <code>kustomize diff k8s/base k8s/overlays/prod</code>', ko: '🔍 두 렌더링 비교: <code>kustomize diff k8s/base k8s/overlays/prod</code>' },
      check: (e, f) => f.has('kustomize-diff') },
  ],
  solve(sim, run) {
    run('kustomize build k8s/base');
    sim.files.write('k8s/overlays/prod/kustomization.yaml', 'resources:\n  - ../../base\nnamePrefix: prod-\ncommonLabels:\n  env: prod\n');
    run('kubectl apply -k k8s/overlays/prod');
    sim.files.write('k8s/overlays/prod/patch-replicas.yaml', 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: prod-api\nspec:\n  replicas: 3\n');
    sim.files.write('k8s/overlays/prod/kustomization.yaml',
      'resources:\n  - ../../base\nnamePrefix: prod-\ncommonLabels:\n  env: prod\npatchesStrategicMerge:\n  - patch-replicas.yaml\npatchesJson6902:\n  - target: { kind: Deployment, name: prod-api }\n    patch: |\n      - op: replace\n        path: /spec/template/spec/containers/0/image\n        value: nginx:1.29\n');
    run('kubectl apply -k k8s/overlays/prod');
    run('kustomize diff k8s/base k8s/overlays/prod');
  },
};

/* ---------------- 3 · GitOps drift ---------------- */

const GBASE_DEPLOYMENT = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
      - name: nginx
        image: nginx:1.27
        ports:
        - containerPort: 80
`;

const gitopsLab = {
  id: 'gitops',
  tab: { en: '🔄 GitOps drift', ko: '🔄 GitOps 드리프트' },
  title: { en: 'GitOps — hand-edit the cluster, watch it snap back', ko: 'GitOps — 클러스터를 손으로 고치면, 되돌아오는 걸 보세요' },
  brief: {
    en: "<code>prod-app</code> (a <code>GitOpsApp</code>, Argo CD/Flux-flavored) points at <code>overlays/prod</code> and starts with <code>autoSync: false</code>. Hand-edit the live <code>web</code> Deployment (<code>kubectl scale</code>) and watch drift <b>persist</b> — <code>kubectl describe gitopsapp prod-app</code> shows it. <code>gitops sync prod-app</code> reverts it manually. Flip <code>spec.autoSync: true</code> (edit <code>prod-app.yaml</code>, <code>kubectl apply -f</code> it) and hand-edit again — it self-heals with <b>no command</b>, because auto-sync just calls the same sync path automatically. With auto-sync on, even editing the <i>source</i> overlay directly gets picked up on its own — and deleting a GitOps-owned object gets it recreated.",
    ko: "<code>prod-app</code>(Argo CD/Flux 느낌의 <code>GitOpsApp</code>)은 <code>overlays/prod</code>를 가리키고 <code>autoSync: false</code>로 시작합니다. 실행 중인 <code>web</code> Deployment를 손으로 고치면(<code>kubectl scale</code>) 드리프트가 <b>계속 남습니다</b> — <code>kubectl describe gitopsapp prod-app</code>로 확인하세요. <code>gitops sync prod-app</code>는 수동으로 되돌립니다. <code>spec.autoSync: true</code>로 바꾸고(<code>prod-app.yaml</code> 편집 후 <code>kubectl apply -f</code>) 다시 손으로 고치면 — 명령 없이 스스로 낫습니다, auto-sync는 그저 같은 동기화 경로를 자동으로 부르는 것이기 때문입니다. auto-sync가 켜져 있으면 <i>소스</i> 오버레이 자체를 고쳐도 저절로 반영되고, GitOps가 관리하는 객체를 지워도 다시 생겨납니다.",
  },
  docs: [
    { label: 'Argo CD', url: 'https://argo-cd.readthedocs.io/en/stable/' },
    { label: 'Flux concepts', url: 'https://fluxcd.io/flux/concepts/' },
  ],
  starterFiles: {
    'base/kustomization.yaml': 'resources:\n  - deployment.yaml\n',
    'base/deployment.yaml': GBASE_DEPLOYMENT,
    'overlays/prod/kustomization.yaml': 'resources:\n  - ../../base\n',
    'prod-app.yaml': '# kubectl apply -f this after editing spec.autoSync\napiVersion: gitops.sim/v1\nkind: GitOpsApp\nmetadata:\n  name: prod-app\nspec:\n  sourcePath: overlays/prod\n  autoSync: false\n',
  },
  setup(engine, files) {
    const { docs } = buildKustomization(files, 'overlays/prod');
    const dep = docs.find((d) => d.kind === 'Deployment');
    const c = dep.spec.template.spec.containers[0];
    engine.makeDeployment({
      name: dep.metadata.name, ns: dep.metadata.namespace || 'default',
      replicas: dep.spec.replicas, image: c.image,
      containerPort: c.ports && c.ports[0] ? c.ports[0].containerPort : null,
    });
    engine.makeGitOpsApp({ name: 'prod-app', ns: 'default', sourcePath: 'overlays/prod', autoSync: false });
  },
  missions: [
    { id: 'drift-persists', desc: { en: '📌 With <code>autoSync</code> off, <code>kubectl scale deployment web --replicas=5</code> — drift persists (<code>kubectl describe gitopsapp prod-app</code> shows <code>OutOfSync</code>)', ko: '📌 <code>autoSync</code>가 꺼진 채 <code>kubectl scale deployment web --replicas=5</code> — 드리프트가 남습니다(<code>kubectl describe gitopsapp prod-app</code>가 <code>OutOfSync</code>)' },
      check: (e, f) => f.has('gitops-outofsync:prod-app') },
    { id: 'manual-sync', desc: { en: '🔧 <code>gitops sync prod-app</code> — reverts it manually, back to <code>Synced</code>', ko: '🔧 <code>gitops sync prod-app</code> — 수동으로 되돌리고 <code>Synced</code>가 됩니다' },
      check: (e, f) => f.has('gitops-sync') && e.get('GitOpsApp', 'default', 'prod-app').status.syncStatus === 'Synced' },
    { id: 'autosync-heals', desc: { en: '🩹 Flip <code>autoSync: true</code> in <code>prod-app.yaml</code> and <code>kubectl apply -f</code> it, then scale again — it self-heals with <b>no</b> <code>gitops sync</code>', ko: '🩹 <code>prod-app.yaml</code>에서 <code>autoSync: true</code>로 바꿔 <code>kubectl apply -f</code>하고 다시 scale — <code>gitops sync</code> 없이 스스로 낫습니다' },
      check: (e, f) => f.has('scale') && f.has('gitops-autosync:prod-app') && e.get('GitOpsApp', 'default', 'prod-app').spec.autoSync === true },
    { id: 'source-drives-cluster', desc: { en: '📝 With auto-sync on, edit <code>base/deployment.yaml</code>\'s image to <code>nginx:1.28</code> directly — no kubectl command needed, the cluster picks it up on its own', ko: '📝 auto-sync가 켜진 채 <code>base/deployment.yaml</code>의 이미지를 <code>nginx:1.28</code>로 직접 고치세요 — kubectl 명령 없이 클러스터가 스스로 반영합니다' },
      check: (e, f) => { const d = e.get('Deployment', 'default', 'web'); return f.has('gitops-autosync:prod-app') && !!d && d.spec.template.spec.containers[0].image === 'nginx:1.28'; } },
    { id: 'recreate', desc: { en: '🗑️ <code>kubectl delete deploy web</code> with auto-sync on — GitOps recreates it', ko: '🗑️ auto-sync가 켜진 채 <code>kubectl delete deploy web</code> — GitOps가 다시 만듭니다' },
      check: (e, f) => f.has('deleted:Deployment/web') && !!e.get('Deployment', 'default', 'web') },
  ],
  solve(sim, run, settle) {
    const { engine, files } = sim;
    run('kubectl scale deployment web --replicas=5');
    settle();
    run('gitops sync prod-app');
    settle();
    engine.setAutoSync(engine.get('GitOpsApp', 'default', 'prod-app'), true);
    run('kubectl scale deployment web --replicas=7');
    settle();
    files.write('base/deployment.yaml', files.read('base/deployment.yaml').replace('nginx:1.27', 'nginx:1.28'));
    settle();
    run('kubectl delete deploy web');
    settle();
  },
};

export const PACKAGING_LABS = [helmLab, kustomizeLab, gitopsLab];
export const PACKAGING_MISSION_TOTAL = PACKAGING_LABS.reduce((s, l) => s + l.missions.length, 0);
