/**
 * Security (CKS) drill labs (improvement-plan step 17) — one lab per official
 * CKS domain, on the shared k8s engine/kubectl (+ a combined Docker/k8s sim
 * for the supply-chain lab). Same shape as the other drill sets: `{ id, tab,
 * title, brief, docs, starterFiles, setup?, missions:[{id,desc,check}], solve }`
 * run through `LabRunner`. Missions are graded LIVE against engine state;
 * `check(engine, flags, files)` — `flags` is the set of onMission ids the CLI
 * fired.
 */
import { canI } from '../sims/k8s/rbac.js';
import { canConnect } from '../sims/k8s/netpol.js';

const K8S_D = 'https://kubernetes.io/docs';
const CKS_D = 'https://kubernetes.io/docs/tasks/administer-cluster';

/* ---------------- 1 · Cluster Setup ---------------- */

const clusterSetupLab = {
  id: 'cluster-setup',
  tab: { en: '🏗 Cluster Setup', ko: '🏗 클러스터 설정' },
  title: { en: 'Cluster Setup — CIS-benchmark the control plane', ko: '클러스터 설정 — 컨트롤 플레인 CIS 벤치마크' },
  brief: {
    en: "A stock kubeadm cluster ships with a few insecure defaults. <code>ssh control-plane</code>, then <code>kube-bench run --targets=master</code> audits the API server and etcd against CIS Benchmark checks — exactly what an exam task or a real security review does first. Fix each FAIL with <code>harden FLAG on|off</code> (the on/off maps 1:1 onto the real <code>--flag=true/false</code>), then re-run kube-bench until everything is green.",
    ko: "기본 kubeadm 클러스터는 몇 가지 안전하지 않은 기본값으로 시작합니다. <code>ssh control-plane</code> 후 <code>kube-bench run --targets=master</code>로 API 서버와 etcd를 CIS Benchmark 기준으로 점검하세요 — 실제 시험 과제나 보안 점검이 가장 먼저 하는 일입니다. 각 FAIL은 <code>harden FLAG on|off</code>로 고치고(on/off는 실제 <code>--flag=true/false</code>에 그대로 대응), 모두 초록이 될 때까지 kube-bench를 다시 실행하세요.",
  },
  docs: [
    { label: 'CIS Kubernetes Benchmark (kube-bench)', url: 'https://github.com/aquasecurity/kube-bench' },
    { label: 'Securing a Cluster', url: K8S_D + '/tasks/administer-cluster/securing-a-cluster/' },
  ],
  missions: [
    { id: 'bench-fail', desc: { en: '🏗 <code>ssh control-plane</code>, then <code>kube-bench run --targets=master</code> — see the FAILs', ko: '🏗 <code>ssh control-plane</code> 후 <code>kube-bench run --targets=master</code> — FAIL을 확인하세요' },
      check: (e, f) => f.has('kube-bench') },
    { id: 'harden-anon', desc: { en: '🔒 <code>harden anonymous-auth off</code>', ko: '🔒 <code>harden anonymous-auth off</code>' },
      check: (e, f) => f.has('harden:anonymous-auth') },
    { id: 'harden-profiling', desc: { en: '🔒 <code>harden profiling off</code>', ko: '🔒 <code>harden profiling off</code>' },
      check: (e, f) => f.has('harden:profiling') },
    { id: 'harden-etcd', desc: { en: '🔒 <code>harden etcd-client-cert-auth on</code>', ko: '🔒 <code>harden etcd-client-cert-auth on</code>' },
      check: (e, f) => f.has('harden:etcd-client-cert-auth') },
    { id: 'bench-pass', desc: { en: '✅ <code>kube-bench run --targets=master</code> again — 0 checks FAIL', ko: '✅ <code>kube-bench run --targets=master</code>를 다시 — FAIL 0개' },
      check: (e, f) => f.has('kube-bench-pass:master') },
  ],
  solve(sim, run) {
    run('ssh control-plane');
    run('kube-bench run --targets=master');
    run('harden anonymous-auth off');
    run('harden profiling off');
    run('harden etcd-client-cert-auth on');
    run('kube-bench run --targets=master');
    run('exit');
  },
};

/* ---------------- 2 · Cluster Hardening ---------------- */

const shopPod = (e, app) => e.list('Pod', { ns: 'shop' }).find((p) => p.metadata.labels.app === app);
const shopHasDenyAll = (e) => e.list('NetworkPolicy', { ns: 'shop' }).some((p) => p.spec.podSelector && !Object.keys(p.spec.podSelector).length && (p.spec.policyTypes || []).includes('Ingress'));

const clusterHardeningLab = {
  id: 'cluster-hardening',
  tab: { en: '🛡 Cluster Hardening', ko: '🛡 클러스터 강화' },
  title: { en: 'Cluster Hardening — least-privilege RBAC + default-deny NetworkPolicy', ko: '클러스터 강화 — 최소 권한 RBAC + 기본 거부 NetworkPolicy' },
  brief: {
    en: "The <code>ci</code> ServiceAccount in <code>shop</code> is bound to a Role granting <code>*</code> on <code>*</code> — effectively cluster-admin inside the namespace. Delete that RoleBinding, then grant only what <code>ci</code> actually needs (<code>get,list</code> on <code>pods</code>). Separately, <code>shop</code> has no NetworkPolicy at all — every pod can reach every other pod. Lock it down: a default-deny policy, then one explicit allow so <code>api</code> can still reach <code>db</code> on port 5432.",
    ko: "<code>shop</code>의 <code>ci</code> ServiceAccount는 <code>*</code>에 대한 <code>*</code>를 허용하는 Role에 바인딩되어 있습니다 — 사실상 네임스페이스 안의 cluster-admin입니다. 그 RoleBinding을 지우고, <code>ci</code>가 실제로 필요한 것만(<code>pods</code>에 대한 <code>get,list</code>) 부여하세요. 한편 <code>shop</code>에는 NetworkPolicy가 전혀 없어 모든 파드가 서로 접근할 수 있습니다. 기본 거부 정책을 걸고, <code>api</code>가 <code>db</code>의 5432 포트에는 여전히 접근할 수 있도록 명시적 허용을 하나 추가하세요.",
  },
  docs: [
    { label: 'Using RBAC Authorization', url: K8S_D + '/reference/access-authn-authz/rbac/' },
    { label: 'Network Policies', url: K8S_D + '/tasks/administer-cluster/declare-network-policy/' },
  ],
  setup(engine) {
    engine.makeNamespace('shop');
    engine.makeServiceAccount('ci', 'shop');
    engine.put({
      apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'Role',
      metadata: { name: 'god-mode', namespace: 'shop' },
      rules: [{ apiGroups: ['*'], resources: ['*'], verbs: ['*'] }],
      spec: {}, status: {}, sim: {},
    });
    engine.put({
      apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'RoleBinding',
      metadata: { name: 'ci-god', namespace: 'shop' },
      roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'Role', name: 'god-mode' },
      subjects: [{ kind: 'ServiceAccount', name: 'ci', namespace: 'shop' }],
      spec: {}, status: {}, sim: {},
    });
    engine.makeDeployment({ name: 'db', ns: 'shop', labels: { app: 'db' }, image: 'postgres', containerPort: 5432 });
    engine.makeDeployment({ name: 'api', ns: 'shop', labels: { app: 'api' }, image: 'nginx', containerPort: 80 });
  },
  missions: [
    { id: 'delete-broad', desc: { en: '🗑️ <code>kubectl delete rolebinding ci-god -n shop</code> — the cluster-admin-equivalent grant is gone', ko: '🗑️ <code>kubectl delete rolebinding ci-god -n shop</code> — cluster-admin급 권한 제거' },
      check: (e) => !e.get('RoleBinding', 'shop', 'ci-god') },
    { id: 'create-minimal', desc: { en: '📜 Create a minimal Role + RoleBinding: <code>ci</code> can <code>get,list</code> <code>pods</code> in <code>shop</code> — and nothing more', ko: '📜 최소 Role + RoleBinding 생성: <code>ci</code>가 <code>shop</code>에서 <code>pods</code>에 대해 <code>get,list</code>만 가능하도록' },
      check: (e) => {
        const subject = { kind: 'ServiceAccount', name: 'ci', namespace: 'shop' };
        return canI(e, { verb: 'get', resource: 'pods', subject, ns: 'shop' }) && !canI(e, { verb: 'delete', resource: 'pods', subject, ns: 'shop' });
      } },
    { id: 'default-deny', desc: { en: '🚫 Apply a default-deny NetworkPolicy in <code>shop</code> (empty podSelector, <code>policyTypes: [Ingress]</code>, no rules)', ko: '🚫 <code>shop</code>에 기본 거부 NetworkPolicy 적용(빈 podSelector, <code>policyTypes: [Ingress]</code>, 규칙 없음)' },
      check: (e) => shopHasDenyAll(e) },
    { id: 'allow-api-to-db', desc: { en: '✅ Add one explicit allow on top of it: ingress to <code>db</code> from <code>app=api</code> on port 5432 — <code>api</code> can reach <code>db</code> again, nothing else can', ko: '✅ 그 위에 명시적 허용 하나 추가: <code>app=api</code>에서 5432 포트로 <code>db</code>에 대한 ingress — <code>api</code>는 다시 <code>db</code>에 접근할 수 있고, 다른 건 불가능' },
      check: (e) => { const api = shopPod(e, 'api'); const db = shopPod(e, 'db'); return !!api && !!db && shopHasDenyAll(e) && canConnect(e, { from: api, to: db, port: 5432 }).allowed; } },
  ],
  solve(sim, run) {
    run('kubectl delete rolebinding ci-god -n shop');
    run('kubectl create role pod-reader -n shop --verb=get,list --resource=pods');
    run('kubectl create rolebinding ci-reader -n shop --role=pod-reader --serviceaccount=shop:ci');
    sim.files.write('deny-all.yaml', 'apiVersion: networking.k8s.io/v1\nkind: NetworkPolicy\nmetadata:\n  name: deny-all\n  namespace: shop\nspec:\n  podSelector: {}\n  policyTypes:\n  - Ingress\n');
    run('kubectl apply -f deny-all.yaml');
    sim.files.write('allow-api-db.yaml', 'apiVersion: networking.k8s.io/v1\nkind: NetworkPolicy\nmetadata:\n  name: allow-api-db\n  namespace: shop\nspec:\n  podSelector:\n    matchLabels:\n      app: db\n  policyTypes:\n  - Ingress\n  ingress:\n  - from:\n    - podSelector:\n        matchLabels:\n          app: api\n    ports:\n    - port: 5432\n');
    run('kubectl apply -f allow-api-db.yaml');
  },
};

/* ---------------- 3 · System Hardening ---------------- */

const systemHardeningLab = {
  id: 'system-hardening',
  tab: { en: '🖥 System Hardening', ko: '🖥 시스템 강화' },
  title: { en: 'System Hardening — the kubelet is a host service, not a kubectl object', ko: '시스템 강화 — kubelet은 kubectl 객체가 아니라 호스트 서비스다' },
  brief: {
    en: "The kubelet's read-only port (10255) serves node/pod info with <b>no authentication</b> — a classic CIS finding. <code>ssh worker-1</code> (any node — this flag isn't control-plane-only) and run <code>kube-bench run --targets=node</code> to see it FAIL, then <code>harden kubelet-read-only-port off</code> and confirm PASS.",
    ko: "kubelet의 읽기 전용 포트(10255)는 <b>인증 없이</b> 노드/파드 정보를 제공합니다 — 전형적인 CIS 지적 사항입니다. <code>ssh worker-1</code>(어느 노드든 가능 — control-plane 전용 플래그가 아닙니다)로 접속해 <code>kube-bench run --targets=node</code>로 FAIL을 확인한 뒤, <code>harden kubelet-read-only-port off</code>로 고치고 PASS를 확인하세요.",
  },
  docs: [
    { label: 'Kubelet authentication/authorization', url: K8S_D + '/reference/access-authn-authz/kubelet-authn-authz/' },
    { label: 'CIS Benchmark — Worker Node Security', url: 'https://github.com/aquasecurity/kube-bench' },
  ],
  missions: [
    { id: 'bench-node-fail', desc: { en: '🖥 <code>ssh worker-1</code>, then <code>kube-bench run --targets=node</code> — see it FAIL', ko: '🖥 <code>ssh worker-1</code> 후 <code>kube-bench run --targets=node</code> — FAIL 확인' },
      check: (e, f) => f.has('kube-bench') },
    { id: 'harden-kubelet-port', desc: { en: '🔒 <code>harden kubelet-read-only-port off</code>', ko: '🔒 <code>harden kubelet-read-only-port off</code>' },
      check: (e, f) => f.has('harden:kubelet-read-only-port') },
    { id: 'bench-node-pass', desc: { en: '✅ <code>kube-bench run --targets=node</code> again — 0 checks FAIL', ko: '✅ <code>kube-bench run --targets=node</code>를 다시 — FAIL 0개' },
      check: (e, f) => f.has('kube-bench-pass:node') },
  ],
  solve(sim, run) {
    run('ssh worker-1');
    run('kube-bench run --targets=node');
    run('harden kubelet-read-only-port off');
    run('kube-bench run --targets=node');
    run('exit');
  },
};

/* ---------------- 4 · Minimize Microservice Vulnerabilities ---------------- */

const POD_YAML = `apiVersion: v1
kind: Pod
metadata:
  name: secure-app
  namespace: apps
spec:
  containers:
  - name: app
    image: nginx
`;

const podSecurityLab = {
  id: 'pod-security',
  tab: { en: '🔐 Microservice Vulnerabilities', ko: '🔐 마이크로서비스 취약점' },
  title: { en: 'Pod Security Admission — restricted means restricted', ko: 'Pod Security Admission — restricted는 정말 제한적이다' },
  brief: {
    en: "Label <code>apps</code> with <code>pod-security.kubernetes.io/enforce: restricted</code>, then try applying <code>pod.yaml</code> as-is — it's rejected (no <code>securityContext</code> at all fails restricted immediately). Add <code>securityContext: {runAsNonRoot: true, allowPrivilegeEscalation: false, capabilities: {drop: [ALL]}}</code> to the container and apply again.",
    ko: "<code>apps</code>에 <code>pod-security.kubernetes.io/enforce: restricted</code> 라벨을 붙인 뒤 <code>pod.yaml</code>을 그대로 적용해 보세요 — 거부됩니다(<code>securityContext</code>가 아예 없으면 restricted에서 즉시 실패). 컨테이너에 <code>securityContext: {runAsNonRoot: true, allowPrivilegeEscalation: false, capabilities: {drop: [ALL]}}</code>를 추가하고 다시 적용하세요.",
  },
  docs: [
    { label: 'Pod Security Admission', url: K8S_D + '/tasks/configure-pod-container/enforce-standards-namespace-labels/' },
    { label: 'Pod Security Standards', url: K8S_D + '/concepts/security/pod-security-standards/' },
  ],
  starterFiles: { 'pod.yaml': POD_YAML },
  setup(engine) { engine.makeNamespace('apps'); },
  missions: [
    { id: 'label-restricted', desc: { en: '🏷️ <code>kubectl label namespace apps pod-security.kubernetes.io/enforce=restricted</code>', ko: '🏷️ <code>kubectl label namespace apps pod-security.kubernetes.io/enforce=restricted</code>' },
      check: (e) => { const ns = e.get('Namespace', null, 'apps'); return !!ns && ns.metadata.labels['pod-security.kubernetes.io/enforce'] === 'restricted'; } },
    { id: 'blocked', desc: { en: '🚫 <code>kubectl apply -f pod.yaml</code> — rejected: violates PodSecurity "restricted"', ko: '🚫 <code>kubectl apply -f pod.yaml</code> — "restricted" PodSecurity 위반으로 거부' },
      check: (e) => e.events.some((ev) => ev.reason === 'FailedCreate' && ev.object === 'Pod/secure-app' && /PodSecurity/.test(ev.message)) },
    { id: 'admitted', desc: { en: "✅ Add a compliant <code>securityContext</code> to <code>pod.yaml</code> and apply again — it's admitted", ko: '✅ <code>pod.yaml</code>에 규정을 준수하는 <code>securityContext</code>를 추가하고 다시 적용 — 승인됩니다' },
      check: (e) => !!e.get('Pod', 'apps', 'secure-app') },
  ],
  solve(sim, run) {
    run('kubectl label namespace apps pod-security.kubernetes.io/enforce=restricted');
    run('kubectl apply -f pod.yaml');
    sim.files.write('pod.yaml', POD_YAML.replace(
      '    image: nginx\n',
      '    image: nginx\n    securityContext:\n      runAsNonRoot: true\n      allowPrivilegeEscalation: false\n      capabilities:\n        drop: [ALL]\n',
    ));
    run('kubectl apply -f pod.yaml');
  },
};

/* ---------------- 5 · Supply Chain Security ---------------- */

const VULN_DOCKERFILE = `FROM node:20
COPY . .
CMD ["node","server.js"]
`;

const supplyChainLab = {
  id: 'supply-chain',
  tab: { en: '📦 Supply Chain', ko: '📦 공급망' },
  title: { en: 'Supply Chain Security — scan, fix, sign, then deploy', ko: '공급망 보안 — 스캔, 수정, 서명 후 배포' },
  brief: {
    en: "<code>default</code> requires verified images (<code>supplychain.sim/verify: true</code>) — kubectl refuses any pod whose image isn't scanned, clean, and signed. Build the app, <code>trivy image app:v1</code> it (it's vulnerable — <code>node:20</code> carries a known CVE), switch to a clean base and rebuild, rescan clean, <code>cosign sign app:v1</code>, then <code>kubectl run</code> it.",
    ko: "<code>default</code> 네임스페이스는 검증된 이미지만 허용합니다(<code>supplychain.sim/verify: true</code>) — kubectl은 스캔·서명되지 않았거나 취약한 이미지의 파드를 거부합니다. 앱을 빌드하고 <code>trivy image app:v1</code>로 스캔하면(취약함 — <code>node:20</code>은 알려진 CVE를 가짐) 클린한 베이스로 바꿔 재빌드, 재스캔으로 클린 확인, <code>cosign sign app:v1</code>, 그리고 <code>kubectl run</code>하세요.",
  },
  docs: [
    { label: 'Trivy', url: 'https://trivy.dev/' },
    { label: 'Sigstore / cosign', url: 'https://docs.sigstore.dev/cosign/signing/overview/' },
  ],
  starterFiles: { Dockerfile: VULN_DOCKERFILE },
  setup(engine) {
    const ns = engine.get('Namespace', null, 'default');
    ns.metadata.labels['supplychain.sim/verify'] = 'true';
  },
  missions: [
    { id: 'build', desc: { en: '🔨 <code>docker build -t app:v1 .</code>', ko: '🔨 <code>docker build -t app:v1 .</code>' },
      check: (e) => !!e.docker?.getImage('app:v1') },
    { id: 'scan', desc: { en: '🔍 <code>trivy image app:v1</code> — see the CVE', ko: '🔍 <code>trivy image app:v1</code> — CVE 확인' },
      check: (e) => !!e.docker?.getImage('app:v1')?.scan },
    { id: 'fix-vuln', desc: { en: '🩹 Switch the Dockerfile to <code>FROM node:20-alpine</code>, rebuild, rescan — 0 vulnerabilities', ko: '🩹 Dockerfile을 <code>FROM node:20-alpine</code>으로 바꿔 재빌드, 재스캔 — 취약점 0개' },
      check: (e) => { const s = e.docker?.getImage('app:v1')?.scan; return !!s && s.findings.length === 0; } },
    { id: 'sign', desc: { en: '✍️ <code>cosign sign app:v1</code>', ko: '✍️ <code>cosign sign app:v1</code>' },
      check: (e) => !!e.docker?.getImage('app:v1')?.signed },
    { id: 'deploy', desc: { en: '🚀 <code>kubectl run app --image=app:v1</code> — admitted', ko: '🚀 <code>kubectl run app --image=app:v1</code> — 승인됨' },
      check: (e) => !!e.get('Pod', 'default', 'app') },
  ],
  solve(sim, run) {
    run('docker build -t app:v1 .');
    run('trivy image app:v1');
    sim.files.write('Dockerfile', VULN_DOCKERFILE.replace('FROM node:20\n', 'FROM node:20-alpine\n'));
    run('docker build -t app:v1 .');
    run('trivy image app:v1');
    run('cosign sign app:v1');
    run('kubectl run app --image=app:v1');
  },
};

/* ---------------- 6 · Monitoring, Logging & Runtime Security ---------------- */

const auditLogLab = {
  id: 'audit-log',
  tab: { en: '📋 Audit Log', ko: '📋 감사 로그' },
  title: { en: 'Audit Log — every RBAC check and admission rejection is an Event', ko: '감사 로그 — 모든 RBAC 검사와 승인 거부는 Event다' },
  brief: {
    en: "Real clusters ship a proper audit log (<code>--audit-log-path</code>); this sim's stand-in is <code>kubectl get events</code>. Every <code>kubectl auth can-i</code> check records an <code>RBACAllowed</code>/<code>RBACDenied</code> event on the subject, and every admission rejection records a <code>FailedCreate</code> event on the pod — <code>kubectl get events</code> (or <code>describe</code>) is how you'd investigate 'who tried to do what' after the fact.",
    ko: "실제 클러스터는 별도의 감사 로그(<code>--audit-log-path</code>)를 남기지만, 이 시뮬레이터에서는 <code>kubectl get events</code>가 그 역할을 합니다. 모든 <code>kubectl auth can-i</code> 검사는 대상에 <code>RBACAllowed</code>/<code>RBACDenied</code> 이벤트를 남기고, 모든 승인 거부는 파드에 <code>FailedCreate</code> 이벤트를 남깁니다 — '누가 무엇을 시도했는지' 사후 조사는 <code>kubectl get events</code>(또는 <code>describe</code>)로 합니다.",
  },
  docs: [
    { label: 'Auditing', url: K8S_D + '/tasks/debug/debug-cluster/audit/' },
    { label: 'Events', url: K8S_D + '/reference/kubernetes-api/cluster-resources/event-v1/' },
  ],
  setup(engine) { engine.makeServiceAccount('auditor', 'default'); },
  missions: [
    { id: 'deny-event', desc: { en: '🚫 <code>kubectl auth can-i delete pods --as=system:serviceaccount:default:auditor</code> — denied, and it shows up in the event trail', ko: '🚫 <code>kubectl auth can-i delete pods --as=system:serviceaccount:default:auditor</code> — 거부되고 이벤트 기록에 남습니다' },
      check: (e) => e.events.some((ev) => ev.reason === 'RBACDenied' && ev.object === 'ServiceAccount/auditor') },
    { id: 'grant-then-allow-event', desc: { en: '✅ Grant <code>auditor</code> <code>get</code> on <code>pods</code>, then <code>can-i</code> again — an <code>RBACAllowed</code> event appears', ko: '✅ <code>auditor</code>에 <code>pods</code>에 대한 <code>get</code>을 부여한 뒤 다시 <code>can-i</code> — <code>RBACAllowed</code> 이벤트 발생' },
      check: (e) => e.events.some((ev) => ev.reason === 'RBACAllowed' && ev.object === 'ServiceAccount/auditor') },
    { id: 'psa-reject-event', desc: { en: '🚫 Label <code>default</code> restricted, then <code>kubectl run bare --image=nginx</code> — the rejection records a <code>FailedCreate</code> event too', ko: '🚫 <code>default</code>를 restricted로 라벨링한 뒤 <code>kubectl run bare --image=nginx</code> — 거부도 <code>FailedCreate</code> 이벤트로 남습니다' },
      check: (e) => e.events.some((ev) => ev.reason === 'FailedCreate' && ev.object === 'Pod/bare') },
  ],
  solve(sim, run) {
    run('kubectl auth can-i delete pods --as=system:serviceaccount:default:auditor');
    run('kubectl create role pod-getter --verb=get --resource=pods');
    run('kubectl create rolebinding auditor-getter --role=pod-getter --serviceaccount=default:auditor');
    run('kubectl auth can-i get pods --as=system:serviceaccount:default:auditor');
    run('kubectl label namespace default pod-security.kubernetes.io/enforce=restricted');
    run('kubectl run bare --image=nginx');
  },
};

export const SECURITY_LABS = [clusterSetupLab, clusterHardeningLab, systemHardeningLab, podSecurityLab, supplyChainLab, auditLogLab];
export const SECURITY_MISSION_TOTAL = SECURITY_LABS.reduce((s, l) => s + l.missions.length, 0);
