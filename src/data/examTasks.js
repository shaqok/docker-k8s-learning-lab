import { SCENARIOS } from './scenarios.js';
import { canI } from '../sims/k8s/rbac.js';
import { canConnect, policiesFor } from '../sims/k8s/netpol.js';
import { resolveHttp } from '../sims/k8s/routing.js';
import { qosOf } from '../sims/k8s/engine.js';
import { createSupplyChainSim } from '../sims/supplyChainSim.js';

/**
 * Mock-exam task sets (improvement-plan step 9). A task looks like a scenario
 * — { id, domain, weight, brief, setup(engine, files), checks[], solution,
 * solve(sim, run, settle) } — plus an exam-domain id and a weight. There is
 * no Check button during the exam: grading happens once, at the end (or at
 * timeout), against each task's live cluster state. Partial credit per check,
 * exactly like the real exam. `checks[].test(engine, sim)` gets the sim too,
 * for host-level state (etcd snapshots). Weights are relative — the score is
 * earnedWeight / totalWeight.
 * Troubleshooting tasks reuse the Troubleshooting Gym scenarios verbatim:
 * same broken cluster, exam framing.
 */

const readyPods = (e, ns, name) => {
  const d = e.get('Deployment', ns, name);
  if (!d) return [];
  return e.ownedPods(d).filter((p) => p.status.ready && p.status.state === 'Running');
};
const alivePod = (e, ns, name) => {
  const p = e.get('Pod', ns, name);
  return p && p.status.state !== 'Terminating' ? p : null;
};

/** Wrap a Troubleshooting Gym scenario as an exam task. */
function fromScenario(scenarioId, domain, weight) {
  const s = SCENARIOS.find((x) => x.id === scenarioId);
  return {
    id: 'fix-' + s.id,
    domain,
    weight,
    brief: s.brief,
    docs: s.docs,
    setup: s.setup,
    checks: s.checks,
    solution: s.solution,
    solve: s.solve,
  };
}

/* ---- tasks shared by both exams (same cluster work, per-exam domain/weight) ---- */

const exposeTask = (domain, weight) => ({
  id: 'svc-expose',
  docs: [
    { label: 'Services', url: 'https://kubernetes.io/docs/concepts/services-networking/service/' },
    { label: 'kubectl expose', url: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_expose/' },
  ],
  domain,
  weight,
  brief: {
    en: 'The <code>api</code> Deployment (2 replicas, port 80) has no Service. <b>Expose it inside the cluster as a Service named <code>api</code> listening on port <code>8080</code> and forwarding to container port <code>80</code>.</b> The Service must have endpoints.',
    ko: '<code>api</code> Deployment(레플리카 2, 포트 80)에 Service가 없습니다. <b>클러스터 내부용 Service <code>api</code>로 노출하세요: 수신 포트 <code>8080</code>, 컨테이너 포트 <code>80</code>으로 전달.</b> Service에 endpoint가 있어야 합니다.',
  },
  setup(engine) {
    engine.makeDeployment({ name: 'api', replicas: 2, image: 'httpd', containerPort: 80 });
  },
  checks: [
    { desc: { en: 'Service api exists with port 8080 → targetPort 80', ko: 'Service api가 port 8080 → targetPort 80으로 존재' }, test: (e) => { const s = e.get('Service', 'default', 'api'); return !!s && Number(s.spec.ports[0].port) === 8080 && Number(s.spec.ports[0].targetPort) === 80; } },
    { desc: { en: 'Service api has at least one endpoint', ko: 'Service api에 endpoint가 1개 이상' }, test: (e) => { const s = e.get('Service', 'default', 'api'); return !!s && e.endpointsOf(s).length >= 1; } },
  ],
  solution: {
    en: '<code>kubectl expose deployment api --port=8080 --target-port=80</code>. The selector is copied from the Deployment, so endpoints appear as soon as pods are Ready. port = where the Service listens; targetPort = where the container listens.',
    ko: '<code>kubectl expose deployment api --port=8080 --target-port=80</code>. 셀렉터는 Deployment에서 복사되므로 파드가 Ready 되는 즉시 endpoint가 생깁니다. port = Service가 듣는 곳, targetPort = 컨테이너가 듣는 곳.',
  },
  solve(sim, run, settle) {
    settle(6);
    run('kubectl expose deployment api --port=8080 --target-port=80');
    settle(4);
  },
});

const netpolTask = (domain, weight) => ({
  id: 'netpol-db',
  docs: [
    { label: 'Network policies', url: 'https://kubernetes.io/docs/concepts/services-networking/network-policies/' },
  ],
  domain,
  weight,
  brief: {
    en: 'Namespace <code>default</code> runs three pods behind Services: <code>frontend</code>, <code>api</code>, <code>db</code> (labels <code>app=frontend/api/db</code>; db serves port <code>5432</code>). Security demands an allow-list: <b>apply a default-deny ingress policy for the whole namespace, then allow ONLY <code>app=api</code> to reach <code>app=db</code> on TCP <code>5432</code>.</b> frontend must stay blocked.',
    ko: '<code>default</code> 네임스페이스에 Service 뒤의 파드 셋이 있습니다: <code>frontend</code>, <code>api</code>, <code>db</code>(레이블 <code>app=frontend/api/db</code>; db는 <code>5432</code> 포트). 보안팀이 허용 목록을 요구합니다: <b>네임스페이스 전체에 기본 거부 ingress 정책을 적용한 뒤, <code>app=api</code>만 <code>app=db</code>의 TCP <code>5432</code>에 접근하도록 허용하세요.</b> frontend는 계속 차단되어야 합니다.',
  },
  setup(engine) {
    engine.makePod({ name: 'frontend', labels: { app: 'frontend' }, image: 'nginx:1.27' });
    engine.makePod({ name: 'api', labels: { app: 'api' }, image: 'httpd' });
    engine.makePod({ name: 'db', labels: { app: 'db' }, image: 'postgres' });
    engine.makeService({ name: 'frontend', selector: { app: 'frontend' }, port: 80 });
    engine.makeService({ name: 'api', selector: { app: 'api' }, port: 80 });
    engine.makeService({ name: 'db', selector: { app: 'db' }, port: 5432 });
  },
  checks: [
    {
      desc: { en: 'A policy selects the namespace pods for Ingress (default-deny in place)', ko: '정책이 네임스페이스 파드들의 Ingress를 선택함 (기본 거부 적용됨)' },
      test: (e) => {
        const f = alivePod(e, 'default', 'frontend');
        return !!f && policiesFor(e, f, 'Ingress').length > 0;
      },
    },
    {
      desc: { en: 'api → db:5432 is allowed', ko: 'api → db:5432 허용됨' },
      test: (e) => {
        const a = alivePod(e, 'default', 'api'), d = alivePod(e, 'default', 'db');
        return !!a && !!d && canConnect(e, { from: a, to: d, port: 5432 }).allowed;
      },
    },
    {
      desc: { en: 'frontend → db:5432 stays blocked', ko: 'frontend → db:5432 계속 차단됨' },
      test: (e) => {
        const f = alivePod(e, 'default', 'frontend'), d = alivePod(e, 'default', 'db');
        return !!f && !!d && !canConnect(e, { from: f, to: d, port: 5432 }).allowed;
      },
    },
  ],
  solution: {
    en: 'Two policies. First default-deny: <code>podSelector: {}</code> + <code>policyTypes: [Ingress]</code> and no rules — every pod\'s inbound is now dropped. Then the hole: a policy selecting <code>app: db</code> with <code>ingress.from.podSelector app: api</code> and <code>ports 5432</code>. Policies are additive allow-lists; nothing re-opens frontend.',
    ko: '정책 두 개. 먼저 기본 거부: <code>podSelector: {}</code> + <code>policyTypes: [Ingress]</code>, 규칙 없음 — 모든 파드의 인바운드가 차단됩니다. 그다음 구멍: <code>app: db</code>를 선택하고 <code>ingress.from.podSelector app: api</code> + <code>ports 5432</code>인 정책. 정책은 누적 허용 목록이라 frontend는 다시 열리지 않습니다.',
  },
  solve(sim, run, settle) {
    settle(6);
    sim.files.write('deny.yaml', 'apiVersion: networking.k8s.io/v1\nkind: NetworkPolicy\nmetadata:\n  name: default-deny\nspec:\n  podSelector: {}\n  policyTypes:\n  - Ingress\n');
    sim.files.write('allow.yaml', 'apiVersion: networking.k8s.io/v1\nkind: NetworkPolicy\nmetadata:\n  name: db-allow-api\nspec:\n  podSelector:\n    matchLabels:\n      app: db\n  policyTypes:\n  - Ingress\n  ingress:\n  - from:\n    - podSelector:\n        matchLabels:\n          app: api\n    ports:\n    - protocol: TCP\n      port: 5432\n');
    run('kubectl apply -f deny.yaml');
    run('kubectl apply -f allow.yaml');
    settle(2);
  },
});

const ingressTask = (domain, weight) => ({
  id: 'ingress-shop',
  docs: [
    { label: 'Ingress', url: 'https://kubernetes.io/docs/concepts/services-networking/ingress/' },
    { label: 'kubectl create ingress', url: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_create/kubectl_create_ingress/' },
  ],
  domain,
  weight,
  brief: {
    en: 'The <code>web</code> Deployment sits behind Service <code>web</code> (port 80), but there is no way in from outside. <b>Create an Ingress named <code>shop</code> that routes <code>http://shop.example.com/</code> to Service <code>web</code> on port <code>80</code>.</b> Verify like an external client: <code>curl http://shop.example.com/</code>.',
    ko: '<code>web</code> Deployment가 Service <code>web</code>(포트 80) 뒤에 있지만 밖에서 들어올 길이 없습니다. <b><code>http://shop.example.com/</code>을 Service <code>web</code>의 포트 <code>80</code>으로 라우팅하는 Ingress <code>shop</code>을 만드세요.</b> 외부 클라이언트처럼 검증: <code>curl http://shop.example.com/</code>.',
  },
  setup(engine) {
    engine.makeDeployment({ name: 'web', replicas: 2, image: 'nginx:1.27', containerPort: 80 });
    engine.makeService({ name: 'web', selector: { app: 'web' }, port: 80, targetPort: 80 });
  },
  checks: [
    { desc: { en: 'Ingress shop exists', ko: 'Ingress shop 존재' }, test: (e) => !!e.get('Ingress', 'default', 'shop') },
    { desc: { en: 'curl http://shop.example.com/ answers 200 from web', ko: 'curl http://shop.example.com/ 이 web에서 200 응답' }, test: (e) => { const r = resolveHttp(e, { host: 'shop.example.com', path: '/' }); return r.status === 200; } },
  ],
  solution: {
    en: 'One line: <code>kubectl create ingress shop --rule=shop.example.com/=web:80</code> (or the YAML equivalent with pathType Prefix). The Ingress is only rules — the (simulated) controller does the proxying.',
    ko: '한 줄: <code>kubectl create ingress shop --rule=shop.example.com/=web:80</code> (또는 pathType Prefix의 YAML 등가물). Ingress는 규칙일 뿐 — (시뮬레이션된) 컨트롤러가 프록시를 담당합니다.',
  },
  solve(sim, run, settle) {
    settle(6);
    run('kubectl create ingress shop --rule=shop.example.com/=web:80');
    settle(2);
  },
});

const rollingTask = (domain, weight) => ({
  id: 'roll-image',
  docs: [
    { label: 'Deployments', url: 'https://kubernetes.io/docs/concepts/workloads/controllers/deployment/' },
    { label: 'kubectl set image', url: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_set/kubectl_set_image/' },
  ],
  domain,
  weight,
  brief: {
    en: 'Deployment <code>api</code> runs 3 replicas of <code>nginx:1.25</code>. A security patch shipped. <b>Update the Deployment to <code>nginx:1.27</code> with a rolling update; all 3 replicas must end Running &amp; Ready on the new image.</b>',
    ko: 'Deployment <code>api</code>가 <code>nginx:1.25</code> 레플리카 3개로 돌고 있습니다. 보안 패치가 나왔습니다. <b>롤링 업데이트로 <code>nginx:1.27</code>로 올리세요. 3개 레플리카 모두 새 이미지로 Running &amp; Ready여야 합니다.</b>',
  },
  setup(engine) {
    engine.makeDeployment({ name: 'api', replicas: 3, image: 'nginx:1.25' });
  },
  checks: [
    { desc: { en: 'Deployment api templates nginx:1.27', ko: 'api Deployment 템플릿이 nginx:1.27' }, test: (e) => { const d = e.get('Deployment', 'default', 'api'); return !!d && e.depImage(d) === 'nginx:1.27'; } },
    { desc: { en: 'All 3 replicas Running & Ready', ko: '3개 레플리카 모두 Running & Ready' }, test: (e) => readyPods(e, 'default', 'api').length >= 3 },
  ],
  solution: {
    en: '<code>kubectl set image deployment/api nginx=nginx:1.27</code> (the container is named after the image repo). Watch it roll: <code>kubectl rollout status deployment/api</code>. maxSurge/maxUnavailable keep the app serving throughout.',
    ko: '<code>kubectl set image deployment/api nginx=nginx:1.27</code> (컨테이너 이름은 이미지 repo명). 롤링 확인: <code>kubectl rollout status deployment/api</code>. maxSurge/maxUnavailable이 업데이트 내내 서비스를 유지합니다.',
  },
  solve(sim, run, settle) {
    settle(6);
    run('kubectl set image deployment/api nginx=nginx:1.27');
    settle(20);
  },
});

/* ---------------------------------- CKA ---------------------------------- */

const CKA_TASKS = [
  {
    id: 'rbac-ci',
    docs: [
      { label: 'RBAC', url: 'https://kubernetes.io/docs/reference/access-authn-authz/rbac/' },
      { label: 'Service accounts', url: 'https://kubernetes.io/docs/concepts/security/service-accounts/' },
    ],
    domain: 'arch',
    weight: 7,
    brief: {
      en: 'The CI system needs read access to pods in namespace <code>build</code> — nothing more. <b>Create a ServiceAccount <code>ci</code> in <code>build</code>, a Role <code>pod-reader</code> allowing <code>get,list</code> on <code>pods</code>, and bind them.</b> Verify with <code>kubectl auth can-i list pods --as=system:serviceaccount:build:ci -n build</code>.',
      ko: 'CI 시스템에 <code>build</code> 네임스페이스의 파드 읽기 권한만 필요합니다. <b><code>build</code>에 ServiceAccount <code>ci</code>, <code>pods</code>에 <code>get,list</code>를 허용하는 Role <code>pod-reader</code>를 만들고 바인딩하세요.</b> 검증: <code>kubectl auth can-i list pods --as=system:serviceaccount:build:ci -n build</code>.',
    },
    setup(engine) {
      engine.makeNamespace('build');
    },
    checks: [
      { desc: { en: 'ServiceAccount ci exists in build', ko: 'build에 ServiceAccount ci 존재' }, test: (e) => !!e.get('ServiceAccount', 'build', 'ci') },
      { desc: { en: 'ci can get and list pods in build', ko: 'ci가 build에서 파드 get/list 가능' }, test: (e) => canI(e, { verb: 'get', resource: 'pods', subject: { kind: 'ServiceAccount', name: 'ci', namespace: 'build' }, ns: 'build' }) && canI(e, { verb: 'list', resource: 'pods', subject: { kind: 'ServiceAccount', name: 'ci', namespace: 'build' }, ns: 'build' }) },
      { desc: { en: 'ci can NOT delete pods (least privilege)', ko: 'ci는 파드 delete 불가 (최소 권한)' }, test: (e) => !canI(e, { verb: 'delete', resource: 'pods', subject: { kind: 'ServiceAccount', name: 'ci', namespace: 'build' }, ns: 'build' }) },
    ],
    solution: {
      en: 'Three one-liners: <code>kubectl create sa ci -n build</code>, <code>kubectl create role pod-reader --verb=get,list --resource=pods -n build</code>, <code>kubectl create rolebinding ci-pod-reader --role=pod-reader --serviceaccount=build:ci -n build</code>. Then can-i answers yes/no instantly.',
      ko: '한 줄짜리 셋: <code>kubectl create sa ci -n build</code>, <code>kubectl create role pod-reader --verb=get,list --resource=pods -n build</code>, <code>kubectl create rolebinding ci-pod-reader --role=pod-reader --serviceaccount=build:ci -n build</code>. 그다음 can-i가 즉시 yes/no를 답합니다.',
    },
    solve(sim, run, settle) {
      settle(4);
      run('kubectl create sa ci -n build');
      run('kubectl create role pod-reader --verb=get,list --resource=pods -n build');
      run('kubectl create rolebinding ci-pod-reader --role=pod-reader --serviceaccount=build:ci -n build');
    },
  },
  {
    id: 'pdb-maintenance',
    docs: [
      { label: 'Pod disruption budgets', url: 'https://kubernetes.io/docs/concepts/workloads/pods/disruptions/' },
      { label: 'Safely drain a node', url: 'https://kubernetes.io/docs/tasks/administer-cluster/safely-drain-node/' },
    ],
    domain: 'arch',
    weight: 6,
    brief: {
      en: '<code>worker-2</code> needs a kernel update. Deployment <code>web</code> (2 replicas) is protected by PodDisruptionBudget <code>web-pdb</code> (<code>minAvailable: 2</code>). <b>Empty worker-2 of user pods without ever violating the budget and without modifying or deleting the PDB.</b> The node must end cordoned; web must keep ≥ 2 Ready replicas.',
      ko: '<code>worker-2</code>에 커널 업데이트가 필요합니다. Deployment <code>web</code>(레플리카 2)은 PodDisruptionBudget <code>web-pdb</code>(<code>minAvailable: 2</code>)의 보호를 받습니다. <b>예산을 어기지 않고, PDB를 수정/삭제하지도 않고 worker-2의 사용자 파드를 비우세요.</b> 노드는 cordon 상태로 남고, web은 Ready 레플리카 2개 이상을 유지해야 합니다.',
    },
    setup(engine) {
      engine.makeDeployment({ name: 'web', replicas: 2, image: 'nginx:1.27' });
      engine.put({
        apiVersion: 'policy/v1', kind: 'PodDisruptionBudget',
        metadata: { name: 'web-pdb', namespace: 'default', creationTimestamp: Date.now() },
        spec: { minAvailable: 2, selector: { matchLabels: { app: 'web' } } },
        status: {}, sim: {},
      });
    },
    checks: [
      { desc: { en: 'worker-2 is cordoned and empty of user pods', ko: 'worker-2가 cordon 상태이고 사용자 파드가 없음' }, test: (e) => { const n = e.get('Node', null, 'worker-2'); const podsOn = e.list('Pod', { all: true }).filter((p) => p.spec.nodeName === 'worker-2' && !p.sim.system && p.status.state !== 'Terminating'); return !!n && !!n.spec.unschedulable && podsOn.length === 0; } },
      { desc: { en: 'PDB web-pdb still exists with minAvailable: 2', ko: 'PDB web-pdb가 minAvailable: 2 그대로 존재' }, test: (e) => { const pdb = e.get('PodDisruptionBudget', 'default', 'web-pdb'); return !!pdb && pdb.spec.minAvailable === 2; } },
      { desc: { en: 'web keeps ≥ 2 Running & Ready replicas', ko: 'web이 Running & Ready 레플리카 2개 이상 유지' }, test: (e) => readyPods(e, 'default', 'web').length >= 2 },
    ],
    solution: {
      en: 'A plain <code>kubectl drain worker-2</code> is refused — evicting would leave 1 < minAvailable. Make the budget affordable first: <code>kubectl scale deployment web --replicas=3</code>, wait for Ready, then <code>kubectl drain worker-2 --ignore-daemonsets</code>. The eviction API respects PDBs; kubectl delete would not.',
      ko: '그냥 <code>kubectl drain worker-2</code>는 거부됩니다 — 축출하면 1 < minAvailable. 먼저 예산을 감당 가능하게: <code>kubectl scale deployment web --replicas=3</code>, Ready 대기, 그다음 <code>kubectl drain worker-2 --ignore-daemonsets</code>. eviction API는 PDB를 존중합니다. kubectl delete는 아니고요.',
    },
    solve(sim, run, settle) {
      settle(8);
      run('kubectl scale deployment web --replicas=3');
      settle(12);
      run('kubectl drain worker-2 --ignore-daemonsets');
      settle(8);
    },
  },
  {
    id: 'etcd-backup',
    docs: [
      { label: 'Backing up etcd', url: 'https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/' },
      { label: 'Operating etcd', url: 'https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/' },
    ],
    domain: 'arch',
    weight: 6,
    brief: {
      en: 'Before tomorrow\'s upgrade the platform team wants a cluster backup. <b>On the control-plane node, save an etcd snapshot to <code>/backup/snap.db</code></b> using the API endpoint <code>https://127.0.0.1:2379</code> and the TLS files under <code>/etc/kubernetes/pki/etcd/</code>. (<code>ssh control-plane</code> gets you on the node.)',
      ko: '내일 업그레이드 전에 플랫폼팀이 클러스터 백업을 원합니다. <b>컨트롤 플레인 노드에서 etcd 스냅샷을 <code>/backup/snap.db</code>로 저장하세요.</b> API 엔드포인트는 <code>https://127.0.0.1:2379</code>, TLS 파일은 <code>/etc/kubernetes/pki/etcd/</code> 아래에 있습니다. (<code>ssh control-plane</code>으로 노드에 접속.)',
    },
    setup(engine) {
      engine.makeDeployment({ name: 'payments', replicas: 2, image: 'nginx:1.27' });
    },
    checks: [
      { desc: { en: 'A snapshot exists at /backup/snap.db', ko: '/backup/snap.db 에 스냅샷 존재' }, test: (e, sim) => !!(sim && sim.host.state.snapshots['/backup/snap.db']) },
    ],
    solution: {
      en: '<code>ssh control-plane</code>, then the exam incantation: <code>etcdctl snapshot save /backup/snap.db --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key</code>. Without the three TLS flags the request times out — etcd speaks mutual TLS.',
      ko: '<code>ssh control-plane</code> 후 시험의 주문: <code>etcdctl snapshot save /backup/snap.db --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key</code>. TLS 플래그 셋이 없으면 타임아웃 — etcd는 상호 TLS를 씁니다.',
    },
    solve(sim, run, settle) {
      settle(4);
      run('ssh control-plane');
      run('etcdctl snapshot save /backup/snap.db --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key');
      run('exit');
    },
  },
  {
    id: 'upgrade-cp',
    docs: [
      { label: 'Upgrading kubeadm clusters', url: 'https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/' },
      { label: 'kubeadm upgrade', url: 'https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-upgrade/' },
    ],
    domain: 'arch',
    weight: 6,
    brief: {
      en: 'The cluster runs <b>v1.33.2</b>. <b>Upgrade the control plane to <code>v1.34.0</code></b>: new kubeadm package, <code>kubeadm upgrade apply</code>, then the control-plane node\'s own kubelet (package + restart). The node must end Ready, schedulable, reporting <code>v1.34.0</code>. Workers are tomorrow\'s job — leave them.',
      ko: '클러스터는 <b>v1.33.2</b>입니다. <b>컨트롤 플레인을 <code>v1.34.0</code>으로 업그레이드하세요</b>: 새 kubeadm 패키지 → <code>kubeadm upgrade apply</code> → 컨트롤 플레인 노드 자신의 kubelet(패키지 + 재시작). 노드는 Ready, 스케줄 가능, <code>v1.34.0</code> 보고 상태여야 합니다. 워커는 내일 일이니 두세요.',
    },
    setup(engine) {
      engine.makeDeployment({ name: 'web', replicas: 2, image: 'nginx:1.27' });
    },
    checks: [
      { desc: { en: 'kube-apiserver runs v1.34.0', ko: 'kube-apiserver가 v1.34.0으로 실행' }, test: (e) => { const api = e.list('Pod', { ns: 'kube-system' }).find((p) => p.metadata.labels.component === 'kube-apiserver'); return !!(api && api.spec.containers[0].image.endsWith(':v1.34.0')); } },
      { desc: { en: 'control-plane kubelet reports v1.34.0, Ready, schedulable', ko: '컨트롤 플레인 kubelet이 v1.34.0, Ready, 스케줄 가능' }, test: (e) => { const n = e.get('Node', null, 'control-plane'); return !!(n && n.sim.version === 'v1.34.0' && n.status.ready && !n.spec.unschedulable); } },
    ],
    solution: {
      en: 'On the node (<code>ssh control-plane</code>): <code>apt-get install -y kubeadm=1.34.0-1.1</code> → <code>kubeadm upgrade plan</code> → <code>kubeadm upgrade apply v1.34.0</code> → <code>apt-get install -y kubelet=1.34.0-1.1</code> → <code>systemctl restart kubelet</code>. VERSION in <code>kubectl get nodes</code> is the kubelet — it lags until the restart.',
      ko: '노드에서(<code>ssh control-plane</code>): <code>apt-get install -y kubeadm=1.34.0-1.1</code> → <code>kubeadm upgrade plan</code> → <code>kubeadm upgrade apply v1.34.0</code> → <code>apt-get install -y kubelet=1.34.0-1.1</code> → <code>systemctl restart kubelet</code>. <code>kubectl get nodes</code>의 VERSION은 kubelet 버전 — 재시작 전까지 뒤처져 보입니다.',
    },
    solve(sim, run, settle) {
      settle(4);
      run('ssh control-plane');
      run('apt-get update');
      run('apt-get install -y kubeadm=1.34.0-1.1');
      run('kubeadm upgrade plan');
      run('kubeadm upgrade apply v1.34.0');
      run('apt-get install -y kubelet=1.34.0-1.1');
      run('systemctl restart kubelet');
      run('exit');
      settle(4);
    },
  },
  {
    id: 'deploy-prod',
    docs: [
      { label: 'Deployments', url: 'https://kubernetes.io/docs/concepts/workloads/controllers/deployment/' },
      { label: 'Namespaces', url: 'https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/' },
    ],
    domain: 'workloads',
    weight: 6,
    brief: {
      en: '<b>Create a namespace <code>prod</code>, and in it a Deployment <code>web</code> running 3 replicas of <code>nginx:1.27</code>.</b> All replicas Running &amp; Ready.',
      ko: '<b>네임스페이스 <code>prod</code>를 만들고, 그 안에 <code>nginx:1.27</code> 레플리카 3개를 돌리는 Deployment <code>web</code>을 만드세요.</b> 모든 레플리카가 Running &amp; Ready여야 합니다.',
    },
    setup() {},
    checks: [
      { desc: { en: 'Namespace prod exists', ko: '네임스페이스 prod 존재' }, test: (e) => !!e.get('Namespace', null, 'prod') },
      { desc: { en: 'Deployment web in prod templates nginx:1.27', ko: 'prod의 web Deployment가 nginx:1.27 사용' }, test: (e) => { const d = e.get('Deployment', 'prod', 'web'); return !!d && e.depImage(d) === 'nginx:1.27'; } },
      { desc: { en: '3 replicas Running & Ready', ko: '3개 레플리카 Running & Ready' }, test: (e) => readyPods(e, 'prod', 'web').length >= 3 },
    ],
    solution: {
      en: '<code>kubectl create namespace prod</code>, then <code>kubectl create deployment web --image=nginx:1.27 --replicas=3 -n prod</code>. Remember: without <code>-n</code>, everything silently lands in default.',
      ko: '<code>kubectl create namespace prod</code>, 그다음 <code>kubectl create deployment web --image=nginx:1.27 --replicas=3 -n prod</code>. 기억하세요: <code>-n</code> 없이는 모든 것이 조용히 default로 갑니다.',
    },
    solve(sim, run, settle) {
      settle(2);
      run('kubectl create namespace prod');
      run('kubectl create deployment web --image=nginx:1.27 --replicas=3 -n prod');
      settle(12);
    },
  },
  rollingTask('workloads', 4),
  {
    id: 'ssd-pod',
    docs: [
      { label: 'Assigning pods to nodes', url: 'https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/' },
      { label: 'Labels and selectors', url: 'https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/' },
    ],
    domain: 'workloads',
    weight: 5,
    brief: {
      en: 'Only <code>worker-2</code> has SSDs (label <code>disktype=ssd</code> — verify with <code>kubectl get nodes --show-labels</code>). <b>Create a pod <code>fast-cache</code> (image <code>redis</code>) that is scheduled to SSD nodes via a <code>nodeSelector</code></b>, and ends Running on worker-2.',
      ko: 'SSD는 <code>worker-2</code>에만 있습니다(레이블 <code>disktype=ssd</code> — <code>kubectl get nodes --show-labels</code>로 확인). <b><code>nodeSelector</code>로 SSD 노드에 스케줄되는 파드 <code>fast-cache</code>(이미지 <code>redis</code>)를 만드세요.</b> worker-2에서 Running이어야 합니다.',
    },
    setup(engine) {
      const n = engine.get('Node', null, 'worker-2');
      n.metadata.labels = { ...n.metadata.labels, disktype: 'ssd' };
    },
    checks: [
      { desc: { en: 'Pod fast-cache declares nodeSelector disktype=ssd', ko: 'fast-cache 파드에 nodeSelector disktype=ssd 선언' }, test: (e) => { const p = alivePod(e, 'default', 'fast-cache'); return !!p && !!p.spec.nodeSelector && p.spec.nodeSelector.disktype === 'ssd'; } },
      { desc: { en: 'fast-cache is Running on worker-2', ko: 'fast-cache가 worker-2에서 Running' }, test: (e) => { const p = alivePod(e, 'default', 'fast-cache'); return !!p && p.spec.nodeName === 'worker-2' && p.status.state === 'Running'; } },
    ],
    solution: {
      en: 'Generate and edit: <code>kubectl run fast-cache --image=redis --dry-run=client -o yaml > pod.yaml</code>, add <code>spec.nodeSelector: {disktype: ssd}</code>, <code>kubectl apply -f pod.yaml</code>. The scheduler only considers nodes carrying every nodeSelector label.',
      ko: '생성 후 수정: <code>kubectl run fast-cache --image=redis --dry-run=client -o yaml > pod.yaml</code>, <code>spec.nodeSelector: {disktype: ssd}</code> 추가, <code>kubectl apply -f pod.yaml</code>. 스케줄러는 nodeSelector 레이블을 전부 가진 노드만 고려합니다.',
    },
    solve(sim, run, settle) {
      settle(2);
      sim.files.write('pod.yaml', 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: fast-cache\n  labels:\n    app: fast-cache\nspec:\n  nodeSelector:\n    disktype: ssd\n  containers:\n  - name: redis\n    image: redis\n');
      run('kubectl apply -f pod.yaml');
      settle(8);
    },
  },
  netpolTask('net', 8),
  ingressTask('net', 6),
  exposeTask('net', 6),
  fromScenario('image-typo', 'troubleshooting', 6),
  fromScenario('crashloop', 'troubleshooting', 7),
  fromScenario('svc-selector', 'troubleshooting', 6),
  fromScenario('pending-capacity', 'troubleshooting', 5),
  fromScenario('readiness-probe', 'troubleshooting', 6),
];

/* ---------------------------------- CKAD --------------------------------- */

const CKAD_TASKS = [
  {
    id: 'run-cache',
    docs: [
      { label: 'kubectl run', url: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_run/' },
      { label: 'Pods', url: 'https://kubernetes.io/docs/concepts/workloads/pods/' },
    ],
    domain: 'design',
    weight: 5,
    brief: {
      en: '<b>Run a single pod named <code>cache</code> with image <code>redis</code> in namespace <code>default</code>.</b> It must reach Running &amp; Ready. (One command is enough.)',
      ko: '<b><code>default</code> 네임스페이스에 이미지 <code>redis</code>인 파드 <code>cache</code> 하나를 실행하세요.</b> Running &amp; Ready에 도달해야 합니다. (명령 한 줄이면 충분합니다.)',
    },
    setup() {},
    checks: [
      { desc: { en: 'Pod cache is Running & Ready', ko: 'cache 파드가 Running & Ready' }, test: (e) => { const p = alivePod(e, 'default', 'cache'); return !!p && p.status.state === 'Running' && p.status.ready; } },
    ],
    solution: {
      en: '<code>kubectl run cache --image=redis</code>. Since 1.18, <code>run</code> creates exactly one bare pod — the fastest muscle-memory command on the exam.',
      ko: '<code>kubectl run cache --image=redis</code>. 1.18부터 <code>run</code>은 생 파드 하나만 만듭니다 — 시험에서 가장 빠른 근육 기억 명령.',
    },
    solve(sim, run, settle) {
      settle(2);
      run('kubectl run cache --image=redis');
      settle(8);
    },
  },
  {
    id: 'deploy-tiered',
    docs: [
      { label: 'Deployments', url: 'https://kubernetes.io/docs/concepts/workloads/controllers/deployment/' },
      { label: 'Labels and selectors', url: 'https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/' },
    ],
    domain: 'design',
    weight: 7,
    brief: {
      en: 'Platform conventions demand tier labels. <b>Create a Deployment <code>backend</code> (2 replicas, image <code>httpd</code>) whose pods carry the labels <code>app=backend</code> AND <code>tier=backend</code>.</b> All replicas Running &amp; Ready. (You will need YAML — the imperative command can\'t add extra labels.)',
      ko: '플랫폼 규약이 tier 레이블을 요구합니다. <b>파드에 <code>app=backend</code>와 <code>tier=backend</code> 레이블이 모두 붙는 Deployment <code>backend</code>(레플리카 2, 이미지 <code>httpd</code>)를 만드세요.</b> 모든 레플리카 Running &amp; Ready. (YAML이 필요합니다 — 명령형으로는 레이블을 추가할 수 없어요.)',
    },
    setup() {},
    checks: [
      { desc: { en: 'Deployment backend exists with image httpd', ko: 'backend Deployment가 httpd 이미지로 존재' }, test: (e) => { const d = e.get('Deployment', 'default', 'backend'); return !!d && e.depImage(d).startsWith('httpd'); } },
      { desc: { en: 'Its pods carry app=backend and tier=backend', ko: '파드에 app=backend와 tier=backend 레이블' }, test: (e) => { const pods = readyPods(e, 'default', 'backend'); return pods.length >= 2 && pods.every((p) => p.metadata.labels.app === 'backend' && p.metadata.labels.tier === 'backend'); } },
    ],
    solution: {
      en: 'Generate, then edit: <code>kubectl create deployment backend --image=httpd --replicas=2 --dry-run=client -o yaml > backend.yaml</code>, add <code>tier: backend</code> to <code>spec.template.metadata.labels</code>, apply. (Selector can stay on app=backend — selectors must be a SUBSET of pod labels.)',
      ko: '생성 후 수정: <code>kubectl create deployment backend --image=httpd --replicas=2 --dry-run=client -o yaml > backend.yaml</code>, <code>spec.template.metadata.labels</code>에 <code>tier: backend</code> 추가, apply. (셀렉터는 app=backend만으로 충분 — 셀렉터는 파드 레이블의 부분집합이면 됩니다.)',
    },
    solve(sim, run, settle) {
      settle(2);
      sim.files.write('backend.yaml', 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: backend\nspec:\n  replicas: 2\n  selector:\n    matchLabels: {app: backend}\n  template:\n    metadata:\n      labels: {app: backend, tier: backend}\n    spec:\n      containers:\n      - name: httpd\n        image: httpd\n');
      run('kubectl apply -f backend.yaml');
      settle(10);
    },
  },
  {
    id: 'pod-env',
    docs: [
      { label: 'Define environment variables', url: 'https://kubernetes.io/docs/tasks/inject-data-application/define-environment-variable-container/' },
    ],
    domain: 'design',
    weight: 5,
    brief: {
      en: '<b>Create a pod <code>debugger</code> (image <code>busybox</code>, command <code>sleep infinity</code>) with the environment variable <code>MODE=debug</code>.</b> Verify with <code>kubectl exec debugger -- env</code>.',
      ko: '<b>환경 변수 <code>MODE=debug</code>를 가진 파드 <code>debugger</code>(이미지 <code>busybox</code>, 명령 <code>sleep infinity</code>)를 만드세요.</b> 검증: <code>kubectl exec debugger -- env</code>.',
    },
    setup() {},
    checks: [
      { desc: { en: 'Pod debugger is Running', ko: 'debugger 파드가 Running' }, test: (e) => { const p = alivePod(e, 'default', 'debugger'); return !!p && p.status.state === 'Running'; } },
      { desc: { en: 'It carries env MODE=debug', ko: '환경 변수 MODE=debug 보유' }, test: (e) => { const p = alivePod(e, 'default', 'debugger'); return !!p && (p.spec.containers[0].env || []).some((v) => v.name === 'MODE' && v.value === 'debug'); } },
    ],
    solution: {
      en: 'YAML via dry-run, then add the env block: <code>spec.containers[0].env: [{name: MODE, value: debug}]</code>, apply. Plain values inline; config that varies belongs in ConfigMaps.',
      ko: 'dry-run으로 YAML을 만들고 env 블록 추가: <code>spec.containers[0].env: [{name: MODE, value: debug}]</code>, apply. 값이 환경마다 달라지면 ConfigMap으로 옮기세요.',
    },
    solve(sim, run, settle) {
      settle(2);
      sim.files.write('debugger.yaml', 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: debugger\n  labels:\n    run: debugger\nspec:\n  containers:\n  - name: busybox\n    image: busybox\n    command: ["sleep", "infinity"]\n    env:\n    - name: MODE\n      value: debug\n');
      run('kubectl apply -f debugger.yaml');
      settle(8);
    },
  },
  {
    id: 'scale-web',
    docs: [
      { label: 'kubectl scale', url: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_scale/' },
      { label: 'Deployments', url: 'https://kubernetes.io/docs/concepts/workloads/controllers/deployment/' },
    ],
    domain: 'deploy',
    weight: 4,
    brief: {
      en: 'Black Friday traffic is coming. <b>Scale Deployment <code>web</code> from 1 to 4 replicas</b>; all 4 Running &amp; Ready.',
      ko: '블랙 프라이데이 트래픽이 옵니다. <b>Deployment <code>web</code>을 레플리카 1에서 4로 스케일하세요.</b> 4개 모두 Running &amp; Ready.',
    },
    setup(engine) {
      engine.makeDeployment({ name: 'web', replicas: 1, image: 'nginx:1.27' });
    },
    checks: [
      { desc: { en: 'web has 4 desired replicas', ko: 'web의 원하는 레플리카가 4' }, test: (e) => { const d = e.get('Deployment', 'default', 'web'); return !!d && d.spec.replicas === 4; } },
      { desc: { en: 'All 4 Running & Ready', ko: '4개 모두 Running & Ready' }, test: (e) => readyPods(e, 'default', 'web').length >= 4 },
    ],
    solution: {
      en: '<code>kubectl scale deployment web --replicas=4</code> — the ReplicaSet controller fans out the difference. (In production this is the HPA\'s job.)',
      ko: '<code>kubectl scale deployment web --replicas=4</code> — 차이만큼 ReplicaSet 컨트롤러가 만들어냅니다. (프로덕션에선 HPA의 일.)',
    },
    solve(sim, run, settle) {
      settle(6);
      run('kubectl scale deployment web --replicas=4');
      settle(10);
    },
  },
  rollingTask('deploy', 6),
  fromScenario('rollback', 'deploy', 7),
  {
    id: 'liveness-ping',
    docs: [
      { label: 'Probes', url: 'https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/' },
    ],
    domain: 'observe',
    weight: 6,
    brief: {
      en: 'Deployment <code>ping</code> (2 replicas of <code>nginx:1.27</code>, port 80) sometimes wedges silently — nobody notices until users do. <b>Add a liveness probe: HTTP GET <code>/healthz</code> on port <code>80</code>.</b> Both replicas must be Running &amp; Ready with the probe in place.',
      ko: 'Deployment <code>ping</code>(<code>nginx:1.27</code> 레플리카 2, 포트 80)이 가끔 조용히 멈춥니다 — 사용자가 먼저 알아챕니다. <b>liveness 프로브를 추가하세요: 포트 <code>80</code>에 HTTP GET <code>/healthz</code>.</b> 프로브가 적용된 채 두 레플리카 모두 Running &amp; Ready여야 합니다.',
    },
    setup(engine) {
      engine.makeDeployment({ name: 'ping', replicas: 2, image: 'nginx:1.27', containerPort: 80 });
    },
    checks: [
      { desc: { en: 'ping templates a liveness probe GET /healthz:80', ko: 'ping 템플릿에 liveness 프로브 GET /healthz:80' }, test: (e) => { const d = e.get('Deployment', 'default', 'ping'); const lp = d && d.spec.template.spec.containers[0].livenessProbe; return !!(lp && lp.httpGet && lp.httpGet.path === '/healthz' && Number(lp.httpGet.port) === 80); } },
      { desc: { en: 'Both replicas Running & Ready', ko: '두 레플리카 모두 Running & Ready' }, test: (e) => readyPods(e, 'default', 'ping').length >= 2 },
    ],
    solution: {
      en: 'Edit the Deployment YAML (<code>kubectl edit deployment ping</code> or export/apply) and add under the container: <code>livenessProbe: {httpGet: {path: /healthz, port: 80}}</code>. Liveness restarts a wedged container; readiness only unplugs it from the Service.',
      ko: 'Deployment YAML을 수정(<code>kubectl edit deployment ping</code> 또는 내보내기/적용)해 컨테이너 아래에 추가: <code>livenessProbe: {httpGet: {path: /healthz, port: 80}}</code>. liveness는 멈춘 컨테이너를 재시작하고, readiness는 Service에서 분리만 합니다.',
    },
    solve(sim, run, settle) {
      settle(6);
      sim.files.write('ping.yaml', 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: ping\nspec:\n  replicas: 2\n  selector:\n    matchLabels: {app: ping}\n  template:\n    metadata:\n      labels: {app: ping}\n    spec:\n      containers:\n      - name: nginx\n        image: nginx:1.27\n        ports:\n        - containerPort: 80\n        livenessProbe:\n          httpGet:\n            path: /healthz\n            port: 80\n');
      run('kubectl apply -f ping.yaml');
      settle(14);
    },
  },
  fromScenario('crashloop', 'observe', 7),
  {
    id: 'cm-dbhost',
    docs: [
      { label: 'ConfigMaps', url: 'https://kubernetes.io/docs/concepts/configuration/configmap/' },
      { label: 'Configure a pod to use a ConfigMap', url: 'https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/' },
    ],
    domain: 'env',
    weight: 7,
    brief: {
      en: 'Deployment <code>web</code> (image <code>nginx:1.27</code>) hardcodes nothing — config comes from outside. <b>Create a ConfigMap <code>app-config</code> with <code>db_host=postgres.prod</code>, and inject it into web\'s container as env var <code>DB_HOST</code> (via <code>configMapKeyRef</code>).</b> Replicas must be Running &amp; Ready.',
      ko: 'Deployment <code>web</code>(이미지 <code>nginx:1.27</code>)은 아무것도 하드코딩하지 않습니다 — 설정은 밖에서 옵니다. <b><code>db_host=postgres.prod</code>를 담은 ConfigMap <code>app-config</code>를 만들고, web 컨테이너에 환경 변수 <code>DB_HOST</code>로 주입하세요(<code>configMapKeyRef</code> 사용).</b> 레플리카는 Running &amp; Ready여야 합니다.',
    },
    setup(engine) {
      engine.makeDeployment({ name: 'web', replicas: 2, image: 'nginx:1.27' });
    },
    checks: [
      { desc: { en: 'ConfigMap app-config holds db_host=postgres.prod', ko: 'ConfigMap app-config에 db_host=postgres.prod' }, test: (e) => { const cm = e.get('ConfigMap', 'default', 'app-config'); return !!cm && cm.data && cm.data.db_host === 'postgres.prod'; } },
      { desc: { en: 'web injects DB_HOST from app-config/db_host', ko: 'web이 app-config/db_host에서 DB_HOST 주입' }, test: (e) => { const d = e.get('Deployment', 'default', 'web'); const env = (d && d.spec.template.spec.containers[0].env) || []; return env.some((v) => v.name === 'DB_HOST' && v.valueFrom && v.valueFrom.configMapKeyRef && v.valueFrom.configMapKeyRef.name === 'app-config' && v.valueFrom.configMapKeyRef.key === 'db_host'); } },
      { desc: { en: '2 replicas Running & Ready', ko: '2개 레플리카 Running & Ready' }, test: (e) => readyPods(e, 'default', 'web').length >= 2 },
    ],
    solution: {
      en: '<code>kubectl create configmap app-config --from-literal=db_host=postgres.prod</code>, then edit the Deployment: <code>env: [{name: DB_HOST, valueFrom: {configMapKeyRef: {name: app-config, key: db_host}}}]</code> and apply. Verify inside: <code>kubectl exec POD -- env</code>.',
      ko: '<code>kubectl create configmap app-config --from-literal=db_host=postgres.prod</code>, 그다음 Deployment 수정: <code>env: [{name: DB_HOST, valueFrom: {configMapKeyRef: {name: app-config, key: db_host}}}]</code> 후 apply. 확인: <code>kubectl exec 파드 -- env</code>.',
    },
    solve(sim, run, settle) {
      settle(6);
      run('kubectl create configmap app-config --from-literal=db_host=postgres.prod');
      sim.files.write('web.yaml', 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  replicas: 2\n  selector:\n    matchLabels: {app: web}\n  template:\n    metadata:\n      labels: {app: web}\n    spec:\n      containers:\n      - name: nginx\n        image: nginx:1.27\n        env:\n        - name: DB_HOST\n          valueFrom:\n            configMapKeyRef:\n              name: app-config\n              key: db_host\n');
      run('kubectl apply -f web.yaml');
      settle(14);
    },
  },
  {
    id: 'secret-creds',
    docs: [
      { label: 'Secrets', url: 'https://kubernetes.io/docs/concepts/configuration/secret/' },
      { label: 'Distribute credentials securely', url: 'https://kubernetes.io/docs/tasks/inject-data-application/distribute-credentials-secure/' },
    ],
    domain: 'env',
    weight: 6,
    brief: {
      en: 'The db password must never sit in YAML. <b>Create a Secret <code>db-creds</code> with <code>password=s3cr3t</code>, and inject it into Deployment <code>api</code> (image <code>redis</code>) as env var <code>DB_PASSWORD</code> via <code>secretKeyRef</code>.</b> Then look at the object with <code>kubectl get secret db-creds -o yaml</code> — notice it is only base64.',
      ko: 'DB 비밀번호는 YAML에 그대로 있으면 안 됩니다. <b><code>password=s3cr3t</code>인 Secret <code>db-creds</code>를 만들고, Deployment <code>api</code>(이미지 <code>redis</code>)에 <code>secretKeyRef</code>로 환경 변수 <code>DB_PASSWORD</code>를 주입하세요.</b> 그런 다음 <code>kubectl get secret db-creds -o yaml</code>로 확인 — base64일 뿐임을 보세요.',
    },
    setup(engine) {
      engine.makeDeployment({ name: 'api', replicas: 2, image: 'redis' });
    },
    checks: [
      { desc: { en: 'Secret db-creds holds password (base64 of s3cr3t)', ko: 'Secret db-creds에 password 보관 (s3cr3t의 base64)' }, test: (e) => { const s = e.get('Secret', 'default', 'db-creds'); return !!s && s.data && s.data.password === 'czNjcjN0'; } },
      { desc: { en: 'api injects DB_PASSWORD from db-creds/password', ko: 'api가 db-creds/password에서 DB_PASSWORD 주입' }, test: (e) => { const d = e.get('Deployment', 'default', 'api'); const env = (d && d.spec.template.spec.containers[0].env) || []; return env.some((v) => v.name === 'DB_PASSWORD' && v.valueFrom && v.valueFrom.secretKeyRef && v.valueFrom.secretKeyRef.name === 'db-creds' && v.valueFrom.secretKeyRef.key === 'password'); } },
      { desc: { en: '2 replicas Running & Ready', ko: '2개 레플리카 Running & Ready' }, test: (e) => readyPods(e, 'default', 'api').length >= 2 },
    ],
    solution: {
      en: '<code>kubectl create secret generic db-creds --from-literal=password=s3cr3t</code>, then in the Deployment: <code>env: [{name: DB_PASSWORD, valueFrom: {secretKeyRef: {name: db-creds, key: password}}}]</code>, apply. Secrets are base64-ENCODED, not encrypted — RBAC and encryption-at-rest do the real protecting.',
      ko: '<code>kubectl create secret generic db-creds --from-literal=password=s3cr3t</code>, 그다음 Deployment에: <code>env: [{name: DB_PASSWORD, valueFrom: {secretKeyRef: {name: db-creds, key: password}}}]</code>, apply. Secret은 base64 인코딩일 뿐 암호화가 아닙니다 — 진짜 보호는 RBAC과 저장 시 암호화.',
    },
    solve(sim, run, settle) {
      settle(6);
      run('kubectl create secret generic db-creds --from-literal=password=s3cr3t');
      sim.files.write('api.yaml', 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: api\nspec:\n  replicas: 2\n  selector:\n    matchLabels: {app: api}\n  template:\n    metadata:\n      labels: {app: api}\n    spec:\n      containers:\n      - name: redis\n        image: redis\n        env:\n        - name: DB_PASSWORD\n          valueFrom:\n            secretKeyRef:\n              name: db-creds\n              key: password\n');
      run('kubectl apply -f api.yaml');
      settle(14);
    },
  },
  {
    id: 'qos-guaranteed',
    docs: [
      { label: 'Quality of service', url: 'https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/' },
      { label: 'Resource management', url: 'https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/' },
    ],
    domain: 'env',
    weight: 6,
    brief: {
      en: 'The <code>cache</code> Deployment (2 replicas, image <code>redis</code>) keeps getting evicted under node pressure. <b>Give its pods the <code>Guaranteed</code> QoS class</b>: requests equal to limits for both CPU (<code>100m</code>) and memory (<code>128Mi</code>). Replicas Running &amp; Ready.',
      ko: '<code>cache</code> Deployment(레플리카 2, 이미지 <code>redis</code>)가 노드 압박 때마다 축출됩니다. <b>파드에 <code>Guaranteed</code> QoS 클래스를 주세요</b>: CPU(<code>100m</code>)와 메모리(<code>128Mi</code>) 모두 requests = limits. 레플리카는 Running &amp; Ready.',
    },
    setup(engine) {
      engine.makeDeployment({ name: 'cache', replicas: 2, image: 'redis' });
    },
    checks: [
      { desc: { en: 'cache pods are QoS class Guaranteed', ko: 'cache 파드의 QoS 클래스가 Guaranteed' }, test: (e) => { const pods = readyPods(e, 'default', 'cache'); return pods.length >= 2 && pods.every((p) => qosOf(p) === 'Guaranteed'); } },
    ],
    solution: {
      en: 'Edit the Deployment and set <code>resources: {requests: {cpu: 100m, memory: 128Mi}, limits: {cpu: 100m, memory: 128Mi}}</code>, apply. Guaranteed (requests = limits everywhere) is evicted last; BestEffort first. Check with <code>kubectl describe pod</code> → QoS Class.',
      ko: 'Deployment를 수정해 <code>resources: {requests: {cpu: 100m, memory: 128Mi}, limits: {cpu: 100m, memory: 128Mi}}</code> 설정 후 apply. Guaranteed(전부 requests = limits)는 가장 늦게 축출, BestEffort는 가장 먼저. <code>kubectl describe pod</code> → QoS Class로 확인.',
    },
    solve(sim, run, settle) {
      settle(6);
      sim.files.write('cache.yaml', 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: cache\nspec:\n  replicas: 2\n  selector:\n    matchLabels: {app: cache}\n  template:\n    metadata:\n      labels: {app: cache}\n    spec:\n      containers:\n      - name: redis\n        image: redis\n        resources:\n          requests: {cpu: 100m, memory: 128Mi}\n          limits: {cpu: 100m, memory: 128Mi}\n');
      run('kubectl apply -f cache.yaml');
      settle(14);
    },
  },
  {
    id: 'sa-viewer',
    docs: [
      { label: 'Service accounts', url: 'https://kubernetes.io/docs/concepts/security/service-accounts/' },
      { label: 'RBAC', url: 'https://kubernetes.io/docs/reference/access-authn-authz/rbac/' },
    ],
    domain: 'env',
    weight: 6,
    brief: {
      en: 'A read-only dashboard needs an identity. <b>Create ServiceAccount <code>viewer</code> in <code>default</code>, a ClusterRole <code>pod-view</code> (<code>get,list</code> on <code>pods</code>), and a RoleBinding <code>viewer-binding</code> in <code>default</code> granting it to viewer.</b> Verify: <code>kubectl auth can-i list pods --as=system:serviceaccount:default:viewer</code>.',
      ko: '읽기 전용 대시보드에 신원이 필요합니다. <b><code>default</code>에 ServiceAccount <code>viewer</code>, <code>pods</code>에 <code>get,list</code>인 ClusterRole <code>pod-view</code>, 그것을 viewer에게 부여하는 RoleBinding <code>viewer-binding</code>(default)을 만드세요.</b> 검증: <code>kubectl auth can-i list pods --as=system:serviceaccount:default:viewer</code>.',
    },
    setup() {},
    checks: [
      { desc: { en: 'ServiceAccount viewer exists', ko: 'ServiceAccount viewer 존재' }, test: (e) => !!e.get('ServiceAccount', 'default', 'viewer') },
      { desc: { en: 'viewer can list pods in default', ko: 'viewer가 default에서 파드 list 가능' }, test: (e) => canI(e, { verb: 'list', resource: 'pods', subject: { kind: 'ServiceAccount', name: 'viewer', namespace: 'default' }, ns: 'default' }) },
      { desc: { en: 'viewer can NOT delete pods', ko: 'viewer는 파드 delete 불가' }, test: (e) => !canI(e, { verb: 'delete', resource: 'pods', subject: { kind: 'ServiceAccount', name: 'viewer', namespace: 'default' }, ns: 'default' }) },
    ],
    solution: {
      en: '<code>kubectl create sa viewer</code>; <code>kubectl create clusterrole pod-view --verb=get,list --resource=pods</code>; <code>kubectl create rolebinding viewer-binding --clusterrole=pod-view --serviceaccount=default:viewer</code>. A RoleBinding referencing a ClusterRole caps the grant to the binding\'s namespace — the reusable-permissions pattern.',
      ko: '<code>kubectl create sa viewer</code>; <code>kubectl create clusterrole pod-view --verb=get,list --resource=pods</code>; <code>kubectl create rolebinding viewer-binding --clusterrole=pod-view --serviceaccount=default:viewer</code>. ClusterRole을 참조하는 RoleBinding은 권한을 바인딩의 네임스페이스로 제한합니다 — 재사용 가능한 권한 패턴.',
    },
    solve(sim, run, settle) {
      settle(2);
      run('kubectl create sa viewer');
      run('kubectl create clusterrole pod-view --verb=get,list --resource=pods');
      run('kubectl create rolebinding viewer-binding --clusterrole=pod-view --serviceaccount=default:viewer');
    },
  },
  exposeTask('net', 6),
  netpolTask('net', 8),
  ingressTask('net', 6),
];

/* ----------------------------------- CKS ---------------------------------- */

const CKS_TASKS = [
  {
    id: 'harden-api-surface',
    docs: [
      { label: 'Controlling access to the API', url: 'https://kubernetes.io/docs/concepts/security/controlling-access/' },
      { label: 'Securing a cluster', url: 'https://kubernetes.io/docs/tasks/administer-cluster/securing-a-cluster/' },
    ],
    domain: 'clusterSetup',
    weight: 5,
    brief: {
      en: 'The API server ships with anonymous requests and profiling both enabled — needless attack surface. <b>On the control-plane, disable both: <code>--anonymous-auth=false</code> and <code>--profiling=false</code>.</b>',
      ko: 'API 서버가 익명 요청과 profiling을 모두 켠 채로 떠 있습니다 — 불필요한 공격 표면입니다. <b>컨트롤 플레인에서 둘 다 끄세요: <code>--anonymous-auth=false</code>, <code>--profiling=false</code>.</b>',
    },
    setup() {},
    checks: [
      { desc: { en: '--anonymous-auth is false', ko: '--anonymous-auth가 false' }, test: (e, sim) => sim.host.state.clusterConfig.anonymousAuth === false },
      { desc: { en: '--profiling is false', ko: '--profiling이 false' }, test: (e, sim) => sim.host.state.clusterConfig.profiling === false },
    ],
    solution: {
      en: '<code>ssh control-plane</code>, then <code>harden anonymous-auth off</code> and <code>harden profiling off</code>. <code>kube-bench run --targets=master</code> confirms both flip to PASS.',
      ko: '<code>ssh control-plane</code> 후 <code>harden anonymous-auth off</code>와 <code>harden profiling off</code>. <code>kube-bench run --targets=master</code>로 둘 다 PASS인지 확인.',
    },
    solve(sim, run, settle) {
      settle(2);
      run('ssh control-plane');
      run('harden anonymous-auth off');
      run('harden profiling off');
      run('exit');
    },
  },
  {
    id: 'harden-etcd-tls',
    docs: [
      { label: 'Operating etcd', url: 'https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/' },
      { label: 'PKI certificates', url: 'https://kubernetes.io/docs/setup/best-practices/certificates/' },
    ],
    domain: 'clusterSetup',
    weight: 5,
    brief: {
      en: 'etcd currently accepts client connections without verifying client certificates. <b>Require mutual TLS: enable <code>--client-cert-auth</code> on etcd.</b>',
      ko: 'etcd가 클라이언트 인증서 검증 없이 연결을 받아들이고 있습니다. <b>상호 TLS를 요구하세요: etcd의 <code>--client-cert-auth</code>를 켜세요.</b>',
    },
    setup() {},
    checks: [
      { desc: { en: '--client-cert-auth is true on etcd', ko: 'etcd의 --client-cert-auth가 true' }, test: (e, sim) => sim.host.state.clusterConfig.etcdClientCertAuth === true },
    ],
    solution: {
      en: '<code>ssh control-plane</code>, then <code>harden etcd-client-cert-auth on</code>.',
      ko: '<code>ssh control-plane</code> 후 <code>harden etcd-client-cert-auth on</code>.',
    },
    solve(sim, run, settle) {
      settle(2);
      run('ssh control-plane');
      run('harden etcd-client-cert-auth on');
      run('exit');
    },
  },
  {
    id: 'rbac-minimal-monitoring',
    docs: [
      { label: 'RBAC', url: 'https://kubernetes.io/docs/reference/access-authn-authz/rbac/' },
    ],
    domain: 'clusterHardening',
    weight: 7,
    brief: {
      en: 'The observability agent needs read-only access to pods in <code>monitoring</code> — nothing more. <b>Create ServiceAccount <code>otel</code> in <code>monitoring</code>, a Role <code>pod-reader</code> allowing <code>get,list</code> on <code>pods</code>, and bind them.</b> Verify with <code>kubectl auth can-i</code>.',
      ko: '관측 에이전트는 <code>monitoring</code>의 파드에 읽기 전용 접근만 필요합니다. <b><code>monitoring</code>에 ServiceAccount <code>otel</code>, <code>pods</code>에 <code>get,list</code>를 허용하는 Role <code>pod-reader</code>를 만들고 바인딩하세요.</b> <code>kubectl auth can-i</code>로 검증.',
    },
    setup(engine) { engine.makeNamespace('monitoring'); },
    checks: [
      { desc: { en: 'ServiceAccount otel exists in monitoring', ko: 'monitoring에 ServiceAccount otel 존재' }, test: (e) => !!e.get('ServiceAccount', 'monitoring', 'otel') },
      { desc: { en: 'otel can get and list pods in monitoring', ko: 'otel이 monitoring에서 파드 get/list 가능' }, test: (e) => canI(e, { verb: 'get', resource: 'pods', subject: { kind: 'ServiceAccount', name: 'otel', namespace: 'monitoring' }, ns: 'monitoring' }) && canI(e, { verb: 'list', resource: 'pods', subject: { kind: 'ServiceAccount', name: 'otel', namespace: 'monitoring' }, ns: 'monitoring' }) },
      { desc: { en: 'otel can NOT delete pods (least privilege)', ko: 'otel은 파드 delete 불가 (최소 권한)' }, test: (e) => !canI(e, { verb: 'delete', resource: 'pods', subject: { kind: 'ServiceAccount', name: 'otel', namespace: 'monitoring' }, ns: 'monitoring' }) },
    ],
    solution: {
      en: '<code>kubectl create sa otel -n monitoring</code>; <code>kubectl create role pod-reader --verb=get,list --resource=pods -n monitoring</code>; <code>kubectl create rolebinding otel-reader --role=pod-reader --serviceaccount=monitoring:otel -n monitoring</code>.',
      ko: '<code>kubectl create sa otel -n monitoring</code>; <code>kubectl create role pod-reader --verb=get,list --resource=pods -n monitoring</code>; <code>kubectl create rolebinding otel-reader --role=pod-reader --serviceaccount=monitoring:otel -n monitoring</code>.',
    },
    solve(sim, run, settle) {
      settle(2);
      run('kubectl create sa otel -n monitoring');
      run('kubectl create role pod-reader --verb=get,list --resource=pods -n monitoring');
      run('kubectl create rolebinding otel-reader --role=pod-reader --serviceaccount=monitoring:otel -n monitoring');
    },
  },
  netpolTask('clusterHardening', 8),
  {
    id: 'revoke-overbroad',
    docs: [
      { label: 'RBAC', url: 'https://kubernetes.io/docs/reference/access-authn-authz/rbac/' },
      { label: 'Security checklist', url: 'https://kubernetes.io/docs/concepts/security/security-checklist/' },
    ],
    domain: 'clusterHardening',
    weight: 5,
    brief: {
      en: 'ServiceAccount <code>legacy-app</code> is bound to a ClusterRole granting <code>*</code> on <code>*</code> cluster-wide, via ClusterRoleBinding <code>legacy-admin</code> — a forgotten cluster-admin-equivalent grant. <b>Revoke it.</b> <code>legacy-app</code> must lose all access.',
      ko: 'ServiceAccount <code>legacy-app</code>가 ClusterRoleBinding <code>legacy-admin</code>을 통해 클러스터 전역 <code>*</code>에 대한 <code>*</code>를 허용하는 ClusterRole에 바인딩되어 있습니다 — 잊혀진 cluster-admin급 권한입니다. <b>이를 회수하세요.</b> <code>legacy-app</code>은 모든 권한을 잃어야 합니다.',
    },
    setup(engine) {
      engine.makeServiceAccount('legacy-app', 'default');
      engine.put({
        apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'ClusterRole',
        metadata: { name: 'god-mode-cluster' },
        rules: [{ apiGroups: ['*'], resources: ['*'], verbs: ['*'] }],
        spec: {}, status: {}, sim: {},
      });
      engine.put({
        apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'ClusterRoleBinding',
        metadata: { name: 'legacy-admin' },
        roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'ClusterRole', name: 'god-mode-cluster' },
        subjects: [{ kind: 'ServiceAccount', name: 'legacy-app', namespace: 'default' }],
        spec: {}, status: {}, sim: {},
      });
    },
    checks: [
      { desc: { en: 'ClusterRoleBinding legacy-admin is gone', ko: 'ClusterRoleBinding legacy-admin 삭제됨' }, test: (e) => !e.get('ClusterRoleBinding', null, 'legacy-admin') },
      { desc: { en: 'legacy-app can no longer get pods', ko: 'legacy-app가 더 이상 파드 get 불가' }, test: (e) => !canI(e, { verb: 'get', resource: 'pods', subject: { kind: 'ServiceAccount', name: 'legacy-app', namespace: 'default' }, ns: 'default' }) },
    ],
    solution: {
      en: '<code>kubectl delete clusterrolebinding legacy-admin</code>. The ClusterRole can stay (unused, unbound); only the binding grants anything.',
      ko: '<code>kubectl delete clusterrolebinding legacy-admin</code>. ClusterRole 자체는 남아 있어도 됩니다(바인딩되지 않으면 미사용) — 권한을 부여하는 건 바인딩뿐입니다.',
    },
    solve(sim, run) {
      run('kubectl delete clusterrolebinding legacy-admin');
    },
  },
  {
    id: 'kubelet-hardening',
    docs: [
      { label: 'Kubelet configuration', url: 'https://kubernetes.io/docs/reference/config-api/kubelet-config.v1beta1/' },
      { label: 'Securing a cluster', url: 'https://kubernetes.io/docs/tasks/administer-cluster/securing-a-cluster/' },
    ],
    domain: 'systemHardening',
    weight: 15,
    brief: {
      en: '<code>worker-1</code>\'s kubelet serves its read-only port (10255) with no authentication. <b>ssh onto it and disable it.</b> Confirm with <code>kube-bench run --targets=node</code>.',
      ko: '<code>worker-1</code>의 kubelet이 인증 없이 읽기 전용 포트(10255)를 서비스하고 있습니다. <b>ssh로 접속해 비활성화하세요.</b> <code>kube-bench run --targets=node</code>로 확인.',
    },
    setup() {},
    checks: [
      { desc: { en: 'kubelet read-only-port is disabled', ko: 'kubelet 읽기 전용 포트 비활성화됨' }, test: (e, sim) => sim.host.state.clusterConfig.kubeletReadOnlyPort === false },
    ],
    solution: {
      en: '<code>ssh worker-1</code>, then <code>harden kubelet-read-only-port off</code>.',
      ko: '<code>ssh worker-1</code> 후 <code>harden kubelet-read-only-port off</code>.',
    },
    solve(sim, run, settle) {
      settle(2);
      run('ssh worker-1');
      run('harden kubelet-read-only-port off');
      run('exit');
    },
  },
  {
    id: 'psa-migrate-payments',
    docs: [
      { label: 'Pod security standards', url: 'https://kubernetes.io/docs/concepts/security/pod-security-standards/' },
      { label: 'Enforce pod security standards', url: 'https://kubernetes.io/docs/tasks/configure-pod-container/enforce-standards-namespace-labels/' },
    ],
    domain: 'microserviceVuln',
    weight: 12,
    brief: {
      en: 'Namespace <code>payments</code> predates any Pod Security policy — pod <code>legacy</code> runs with <code>securityContext.privileged: true</code>. <b>Enforce <code>restricted</code> on the namespace, then replace <code>legacy</code> with a compliant pod of the same name</b> (image <code>nginx</code>; <code>runAsNonRoot</code>, no privilege escalation, all capabilities dropped).',
      ko: '네임스페이스 <code>payments</code>는 Pod Security 정책이 생기기 전부터 있었습니다 — 파드 <code>legacy</code>가 <code>securityContext.privileged: true</code>로 돌고 있습니다. <b>네임스페이스에 <code>restricted</code>를 적용한 뒤, 같은 이름으로 규정을 준수하는 파드로 교체하세요</b>(이미지 <code>nginx</code>; <code>runAsNonRoot</code>, 권한 상승 금지, 모든 capability drop).',
    },
    setup(engine) {
      engine.makeNamespace('payments');
      engine.makePod({ name: 'legacy', ns: 'payments', labels: { app: 'legacy' }, nodeName: 'worker-1', containers: [{ name: 'legacy', image: 'nginx', securityContext: { privileged: true } }] });
    },
    checks: [
      { desc: { en: 'payments is labeled pod-security.kubernetes.io/enforce=restricted', ko: 'payments에 pod-security.kubernetes.io/enforce=restricted 라벨' }, test: (e) => { const ns = e.get('Namespace', null, 'payments'); return !!ns && ns.metadata.labels['pod-security.kubernetes.io/enforce'] === 'restricted'; } },
      { desc: { en: 'pod legacy exists & Running (which proves it passed restricted admission)', ko: 'legacy 파드가 존재하고 Running (restricted 승인을 통과했다는 뜻)' }, test: (e) => { const p = e.get('Pod', 'payments', 'legacy'); return !!p && p.status.state === 'Running'; } },
    ],
    solution: {
      en: '<code>kubectl label namespace payments pod-security.kubernetes.io/enforce=restricted</code>, then <code>kubectl delete pod legacy -n payments</code> (the running privileged pod is NOT retroactively evicted — admission only gates creation), then apply a replacement with <code>securityContext: {runAsNonRoot: true, allowPrivilegeEscalation: false, capabilities: {drop: [ALL]}}</code>.',
      ko: '<code>kubectl label namespace payments pod-security.kubernetes.io/enforce=restricted</code> 후 <code>kubectl delete pod legacy -n payments</code>(실행 중인 privileged 파드는 소급 축출되지 않습니다 — admission은 생성 시에만 걸립니다), 그다음 <code>securityContext: {runAsNonRoot: true, allowPrivilegeEscalation: false, capabilities: {drop: [ALL]}}</code>로 교체본을 적용.',
    },
    solve(sim, run, settle) {
      settle(4);
      run('kubectl label namespace payments pod-security.kubernetes.io/enforce=restricted');
      run('kubectl delete pod legacy -n payments');
      settle(4);
      sim.files.write('legacy.yaml', 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: legacy\n  namespace: payments\n  labels:\n    app: legacy\nspec:\n  containers:\n  - name: legacy\n    image: nginx\n    securityContext:\n      runAsNonRoot: true\n      allowPrivilegeEscalation: false\n      capabilities:\n        drop: [ALL]\n');
      run('kubectl apply -f legacy.yaml');
      settle(8);
    },
  },
  {
    id: 'psa-baseline-batch',
    docs: [
      { label: 'Pod security admission', url: 'https://kubernetes.io/docs/concepts/security/pod-security-admission/' },
      { label: 'Pod security standards', url: 'https://kubernetes.io/docs/concepts/security/pod-security-standards/' },
    ],
    domain: 'microserviceVuln',
    weight: 8,
    brief: {
      en: 'Namespace <code>batch-jobs</code> also predates any Pod Security policy — pod <code>runner</code> was created with the <code>NET_ADMIN</code> capability added, which it doesn\'t need. <b>Enforce <code>baseline</code> on the namespace (unprivileged pods without a full securityContext are still fine at this level), then replace <code>runner</code> with a compliant pod of the same name.</b>',
      ko: '네임스페이스 <code>batch-jobs</code>도 Pod Security 정책이 생기기 전부터 있었습니다 — 파드 <code>runner</code>가 필요도 없는 <code>NET_ADMIN</code> capability를 추가한 채 생성됐습니다. <b>네임스페이스에 <code>baseline</code>을 적용하세요(이 레벨에선 securityContext가 아예 없는 무권한 파드는 괜찮습니다), 그런 뒤 같은 이름으로 규정을 준수하는 파드로 교체하세요.</b>',
    },
    setup(engine) {
      engine.makeNamespace('batch-jobs');
      engine.makePod({ name: 'runner', ns: 'batch-jobs', labels: { app: 'runner' }, nodeName: 'worker-2', containers: [{ name: 'runner', image: 'busybox', command: ['sleep', 'infinity'], securityContext: { capabilities: { add: ['NET_ADMIN'] } } }] });
    },
    checks: [
      { desc: { en: 'batch-jobs is labeled pod-security.kubernetes.io/enforce=baseline', ko: 'batch-jobs에 pod-security.kubernetes.io/enforce=baseline 라벨' }, test: (e) => { const ns = e.get('Namespace', null, 'batch-jobs'); return !!ns && ns.metadata.labels['pod-security.kubernetes.io/enforce'] === 'baseline'; } },
      { desc: { en: 'pod runner exists & Running (which proves it dropped NET_ADMIN)', ko: 'runner 파드가 존재하고 Running (NET_ADMIN을 뺐다는 뜻)' }, test: (e) => { const p = e.get('Pod', 'batch-jobs', 'runner'); return !!p && p.status.state === 'Running'; } },
    ],
    solution: {
      en: '<code>kubectl label namespace batch-jobs pod-security.kubernetes.io/enforce=baseline</code>, then delete and recreate <code>runner</code> without the added capability — baseline only blocks privileged containers and a short list of dangerous capabilities, so a plain busybox pod with no securityContext at all is admitted.',
      ko: '<code>kubectl label namespace batch-jobs pod-security.kubernetes.io/enforce=baseline</code> 후 <code>runner</code>를 추가 capability 없이 삭제·재생성 — baseline은 privileged 컨테이너와 소수의 위험한 capability만 막으므로, securityContext가 아예 없는 평범한 busybox 파드는 승인됩니다.',
    },
    solve(sim, run, settle) {
      settle(4);
      run('kubectl label namespace batch-jobs pod-security.kubernetes.io/enforce=baseline');
      run('kubectl delete pod runner -n batch-jobs');
      settle(4);
      sim.files.write('runner.yaml', 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: runner\n  namespace: batch-jobs\n  labels:\n    app: runner\nspec:\n  containers:\n  - name: runner\n    image: busybox\n    command: ["sleep", "infinity"]\n');
      run('kubectl apply -f runner.yaml');
      settle(8);
    },
  },
  {
    id: 'supply-chain-deploy',
    docs: [
      { label: 'Cloud native security', url: 'https://kubernetes.io/docs/concepts/security/cloud-native-security/' },
      { label: 'Images', url: 'https://kubernetes.io/docs/concepts/containers/images/' },
    ],
    domain: 'supplyChain',
    weight: 12,
    createSim: createSupplyChainSim,
    brief: {
      en: '<code>default</code> requires verified images. <b>Build <code>checkout:v1</code> from the Dockerfile, fix its vulnerable base, scan it clean, sign it, and get it running as pod <code>checkout</code>.</b>',
      ko: '<code>default</code>는 검증된 이미지만 허용합니다. <b>Dockerfile로 <code>checkout:v1</code>을 빌드하고, 취약한 베이스를 고치고, 깨끗하게 스캔하고, 서명한 뒤 파드 <code>checkout</code>으로 띄우세요.</b>',
    },
    setup(engine, files) {
      const ns = engine.get('Namespace', null, 'default');
      ns.metadata.labels['supplychain.sim/verify'] = 'true';
      files.write('Dockerfile', 'FROM node:20\nCOPY . .\nCMD ["node","server.js"]\n');
    },
    checks: [
      { desc: { en: 'checkout:v1 is scanned with 0 vulnerabilities', ko: 'checkout:v1이 스캔되어 취약점 0개' }, test: (e) => { const img = e.docker && e.docker.getImage('checkout:v1'); return !!(img && img.scan && img.scan.findings.length === 0); } },
      { desc: { en: 'checkout:v1 is signed', ko: 'checkout:v1이 서명됨' }, test: (e) => { const img = e.docker && e.docker.getImage('checkout:v1'); return !!(img && img.signed); } },
      { desc: { en: 'pod checkout is running', ko: 'checkout 파드가 실행 중' }, test: (e) => !!e.get('Pod', 'default', 'checkout') },
    ],
    solution: {
      en: '<code>docker build -t checkout:v1 .</code>, <code>trivy image checkout:v1</code> (finds a CVE), switch the Dockerfile to <code>FROM node:20-alpine</code>, rebuild, rescan clean, <code>cosign sign checkout:v1</code>, then <code>kubectl run checkout --image=checkout:v1</code>.',
      ko: '<code>docker build -t checkout:v1 .</code>, <code>trivy image checkout:v1</code>(CVE 발견), Dockerfile을 <code>FROM node:20-alpine</code>으로 바꿔 재빌드, 재스캔으로 클린 확인, <code>cosign sign checkout:v1</code>, 그다음 <code>kubectl run checkout --image=checkout:v1</code>.',
    },
    solve(sim, run, settle) {
      settle(2);
      run('docker build -t checkout:v1 .');
      run('trivy image checkout:v1');
      sim.files.write('Dockerfile', 'FROM node:20-alpine\nCOPY . .\nCMD ["node","server.js"]\n');
      run('docker build -t checkout:v1 .');
      run('trivy image checkout:v1');
      run('cosign sign checkout:v1');
      run('kubectl run checkout --image=checkout:v1');
      settle(4);
    },
  },
  {
    id: 'supply-chain-reject',
    docs: [
      { label: 'Cloud native security', url: 'https://kubernetes.io/docs/concepts/security/cloud-native-security/' },
      { label: 'Admission controllers', url: 'https://kubernetes.io/docs/reference/access-authn-authz/admission-controllers/' },
    ],
    domain: 'supplyChain',
    weight: 8,
    createSim: createSupplyChainSim,
    brief: {
      en: '<code>default</code> requires verified images. Image <code>sidecar:v1</code> is already sitting in the registry, never scanned or signed. <b>Attempt to run it as pod <code>sidecar</code> and confirm the cluster refuses it — the pod must never exist.</b> Do not scan or sign the image; the point is proving the gate works.',
      ko: '<code>default</code>는 검증된 이미지만 허용합니다. 이미지 <code>sidecar:v1</code>은 이미 레지스트리에 있지만 한 번도 스캔·서명되지 않았습니다. <b>파드 <code>sidecar</code>로 실행을 시도해 클러스터가 거부하는지 확인하세요 — 파드는 절대 존재하면 안 됩니다.</b> 이미지를 스캔·서명하지 마세요; 요점은 게이트가 실제로 작동함을 증명하는 것입니다.',
    },
    setup(engine) {
      const ns = engine.get('Namespace', null, 'default');
      ns.metadata.labels['supplychain.sim/verify'] = 'true';
      engine.docker.pull('node:20');
      engine.docker.tagImage('node:20', 'sidecar:v1');
    },
    checks: [
      { desc: { en: 'pod sidecar was never created', ko: 'sidecar 파드가 생성된 적 없음' }, test: (e) => !e.get('Pod', 'default', 'sidecar') },
      { desc: { en: 'the rejection is recorded in the event trail', ko: '거부가 이벤트 기록에 남아 있음' }, test: (e) => e.events.some((ev) => ev.reason === 'FailedCreate' && ev.object === 'Pod/sidecar') },
    ],
    solution: {
      en: '<code>kubectl run sidecar --image=sidecar:v1</code> — refused with "has not been scanned". Nothing else to do; the admission gate already did its job.',
      ko: '<code>kubectl run sidecar --image=sidecar:v1</code> — "has not been scanned"으로 거부됩니다. 더 할 일은 없습니다; admission 게이트가 이미 제 역할을 했습니다.',
    },
    solve(sim, run, settle) {
      settle(2);
      run('kubectl run sidecar --image=sidecar:v1');
      settle(2);
    },
  },
  {
    id: 'audit-rbac',
    docs: [
      { label: 'Auditing', url: 'https://kubernetes.io/docs/tasks/debug/debug-cluster/audit/' },
      { label: 'RBAC', url: 'https://kubernetes.io/docs/reference/access-authn-authz/rbac/' },
    ],
    domain: 'monitoring',
    weight: 10,
    brief: {
      en: 'Grant ServiceAccount <code>bot</code> in <code>default</code> read access to <code>configmaps</code>, then verify it. <b>The grant must show up in the audit trail, not just exist as an unused Role.</b>',
      ko: '<code>default</code>의 ServiceAccount <code>bot</code>에 <code>configmaps</code> 읽기 권한을 부여한 뒤 검증하세요. <b>부여한 권한은 사용되지 않는 Role로만 존재해선 안 되고 감사 기록에 남아야 합니다.</b>',
    },
    setup(engine) { engine.makeServiceAccount('bot', 'default'); },
    checks: [
      { desc: { en: 'bot can get configmaps in default', ko: 'bot이 default에서 configmaps get 가능' }, test: (e) => canI(e, { verb: 'get', resource: 'configmaps', subject: { kind: 'ServiceAccount', name: 'bot', namespace: 'default' }, ns: 'default' }) },
      { desc: { en: 'an RBACAllowed event was recorded for bot', ko: 'bot에 대한 RBACAllowed 이벤트가 기록됨' }, test: (e) => e.events.some((ev) => ev.reason === 'RBACAllowed' && ev.object === 'ServiceAccount/bot') },
    ],
    solution: {
      en: '<code>kubectl create role cm-reader --verb=get,list --resource=configmaps</code>, <code>kubectl create rolebinding bot-cm --role=cm-reader --serviceaccount=default:bot</code>, then <code>kubectl auth can-i get configmaps --as=system:serviceaccount:default:bot</code> — every can-i check is itself audited.',
      ko: '<code>kubectl create role cm-reader --verb=get,list --resource=configmaps</code>, <code>kubectl create rolebinding bot-cm --role=cm-reader --serviceaccount=default:bot</code>, 그다음 <code>kubectl auth can-i get configmaps --as=system:serviceaccount:default:bot</code> — 모든 can-i 검사는 그 자체로 감사됩니다.',
    },
    solve(sim, run) {
      run('kubectl create role cm-reader --verb=get,list --resource=configmaps');
      run('kubectl create rolebinding bot-cm --role=cm-reader --serviceaccount=default:bot');
      run('kubectl auth can-i get configmaps --as=system:serviceaccount:default:bot');
    },
  },
  {
    id: 'audit-psa',
    docs: [
      { label: 'Auditing', url: 'https://kubernetes.io/docs/tasks/debug/debug-cluster/audit/' },
      { label: 'Pod security admission', url: 'https://kubernetes.io/docs/concepts/security/pod-security-admission/' },
    ],
    domain: 'monitoring',
    weight: 10,
    brief: {
      en: 'Namespace <code>edge</code> enforces <code>restricted</code>. <b>Attempt to run a bare pod <code>probe</code> (image <code>nginx</code>, no securityContext) there, and confirm the refusal is recorded for later investigation.</b>',
      ko: '네임스페이스 <code>edge</code>는 <code>restricted</code>를 적용합니다. <b>거기서 아무 securityContext 없는 파드 <code>probe</code>(이미지 <code>nginx</code>)를 실행해 보고, 거부가 나중에 조사할 수 있도록 기록되는지 확인하세요.</b>',
    },
    setup(engine) {
      engine.makeNamespace('edge');
      engine.get('Namespace', null, 'edge').metadata.labels['pod-security.kubernetes.io/enforce'] = 'restricted';
    },
    checks: [
      { desc: { en: 'pod probe was never created in edge', ko: 'edge에 probe 파드가 생성된 적 없음' }, test: (e) => !e.get('Pod', 'edge', 'probe') },
      { desc: { en: 'the rejection is recorded in the event trail', ko: '거부가 이벤트 기록에 남아 있음' }, test: (e) => e.events.some((ev) => ev.reason === 'FailedCreate' && ev.object === 'Pod/probe' && /PodSecurity/.test(ev.message)) },
    ],
    solution: {
      en: '<code>kubectl run probe --image=nginx -n edge</code> — refused, and the FailedCreate event is right there in <code>kubectl get events -n edge</code>.',
      ko: '<code>kubectl run probe --image=nginx -n edge</code> — 거부되고, <code>kubectl get events -n edge</code>에 FailedCreate 이벤트가 바로 보입니다.',
    },
    solve(sim, run) {
      run('kubectl run probe --image=nginx -n edge');
    },
  },
];

export const EXAM_SETS = {
  cka: { durationMin: 120, passPct: 66, tasks: CKA_TASKS },
  ckad: { durationMin: 120, passPct: 66, tasks: CKAD_TASKS },
  cks: { durationMin: 120, passPct: 66, tasks: CKS_TASKS },
};

/** Grade one task: fraction of its checks passing → earned weight. */
export function gradeTask(task, engine, sim) {
  const results = task.checks.map((ch) => {
    try { return !!ch.test(engine, sim); } catch { return false; }
  });
  const passed = results.filter(Boolean).length;
  return { results, earned: (passed / results.length) * task.weight };
}

/** Grade a whole attempt: tasks → score %, pass, per-domain earned/total. */
export function gradeExam(exam, graders) {
  const set = EXAM_SETS[exam];
  const domains = {};
  let earned = 0;
  let total = 0;
  const tasks = set.tasks.map((task, i) => {
    const g = graders(task, i); // { results, earned }
    total += task.weight;
    earned += g.earned;
    if (!domains[task.domain]) domains[task.domain] = { earned: 0, total: 0 };
    domains[task.domain].earned += g.earned;
    domains[task.domain].total += task.weight;
    return { id: task.id, domain: task.domain, weight: task.weight, earned: g.earned, results: g.results };
  });
  const score = Math.round((earned / total) * 100);
  return { score, pass: score >= set.passPct, domains, tasks };
}
