import { SCENARIOS } from './scenarios.js';
import { canI } from '../sims/k8s/rbac.js';
import { canConnect, policiesFor } from '../sims/k8s/netpol.js';
import { resolveHttp } from '../sims/k8s/routing.js';
import { qosOf } from '../sims/k8s/engine.js';

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
    setup: s.setup,
    checks: s.checks,
    solution: s.solution,
    solve: s.solve,
  };
}

/* ---- tasks shared by both exams (same cluster work, per-exam domain/weight) ---- */

const exposeTask = (domain, weight) => ({
  id: 'svc-expose',
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

export const EXAM_SETS = {
  cka: { durationMin: 120, passPct: 66, tasks: CKA_TASKS },
  ckad: { durationMin: 120, passPct: 66, tasks: CKAD_TASKS },
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
