import { rid } from '../sims/util.js';
import { imageKnown } from '../sims/k8s/engine.js';

/**
 * Troubleshooting scenarios — the CKA's biggest domain (30%).
 * Each scenario seeds a broken cluster; the student fixes it in the terminal /
 * YAML editor; `checks` grade the live sim state like the real exam's graders.
 * `solve(sim, run)` is the reference fix, exercised by tests to prove every
 * scenario is solvable.
 */

/** Seed n pods for a deployment, already scheduled; override to break them. */
function seedPods(engine, dep, n, override = null) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = dep.spec.template.spec.containers[0];
    const p = engine.makePod({
      name: dep.sim.rsName + '-' + rid(5),
      ns: dep.metadata.namespace,
      labels: { ...dep.spec.template.metadata.labels },
      image: c.image,
      command: c.command || null,
      readinessProbe: c.readinessProbe || null,
      containerPort: c.ports && c.ports[0] ? c.ports[0].containerPort : null,
      owner: dep.metadata.namespace + '/' + dep.metadata.name,
      rsName: dep.sim.rsName,
      nodeName: 'worker-' + ((i % 2) + 1),
    });
    if (override) override(p, i);
    out.push(p);
  }
  return out;
}

const readyPodsOf = (engine, ns, name) => {
  const d = engine.get('Deployment', ns, name);
  if (!d) return [];
  return engine.ownedPods(d).filter((p) => p.status.ready && p.status.state === 'Running');
};

export const SCENARIOS = [
  {
    id: 'image-typo',
    difficulty: 1,
    title: { en: 'The pull that never lands', ko: '영원히 안 끝나는 pull' },
    brief: {
      en: 'The <code>web</code> Deployment (3 replicas, namespace <code>default</code>) was updated last night and none of its pods are Ready. <b>Make all 3 replicas Running &amp; Ready with a working nginx image.</b>',
      ko: '<code>web</code> Deployment(레플리카 3, 네임스페이스 <code>default</code>)가 어젯밤 업데이트된 뒤 어떤 파드도 Ready가 아닙니다. <b>동작하는 nginx 이미지로 3개 레플리카를 모두 Running &amp; Ready로 만드세요.</b>',
    },
    hints: [
      { en: 'Start where you always start: <code>kubectl get pods</code>. What does the STATUS column say?', ko: '늘 시작하는 곳에서 시작하세요: <code>kubectl get pods</code>. STATUS 열이 뭐라고 하나요?' },
      { en: '<code>kubectl describe pod NAME</code> — the Events section names the exact image it failed to pull. Read it letter by letter.', ko: '<code>kubectl describe pod 이름</code> — Events 섹션에 pull에 실패한 이미지가 그대로 나옵니다. 철자를 한 자씩 읽어보세요.' },
      { en: 'Fix it with <code>kubectl set image deployment/web CONTAINER=nginx:1.27</code> — describe the pod to find the container name.', ko: '<code>kubectl set image deployment/web 컨테이너=nginx:1.27</code> 로 고치세요 — 컨테이너 이름은 describe로 확인.' },
    ],
    setup(engine) {
      const d = engine.makeDeployment({ name: 'web', replicas: 3, image: 'ngnix:1.27' });
      seedPods(engine, d, 3, (p) => {
        p.status.state = 'ImagePullBackOff';
        p.status.phase = 'Pending';
        p.status.ready = false;
        engine.addEvent({ type: 'Warning', reason: 'Failed', object: 'Pod/' + p.metadata.name, message: 'Failed to pull image "ngnix:1.27": repository does not exist or may require authorization' });
      });
    },
    checks: [
      { desc: { en: 'Deployment web uses an image the registry knows', ko: 'web Deployment가 레지스트리에 있는 이미지를 사용' }, test: (e) => imageKnown(e.depImage(e.get('Deployment', 'default', 'web') || { spec: { template: { spec: { containers: [{}] } } } })) },
      { desc: { en: '3 replicas Running & Ready', ko: '3개 레플리카가 Running & Ready' }, test: (e) => readyPodsOf(e, 'default', 'web').length >= 3 },
    ],
    solution: {
      en: '<code>kubectl get pods</code> → ImagePullBackOff. <code>kubectl describe pod NAME</code> → Events: <i>Failed to pull image "ngnix:1.27"</i> — a typo. The container is also named <code>ngnix</code>, so: <code>kubectl set image deployment/web ngnix=nginx:1.27</code>. The Deployment rolls the broken pods away. This is the #1 real-world failure: image name/tag typos.',
      ko: '<code>kubectl get pods</code> → ImagePullBackOff. <code>kubectl describe pod 이름</code> → Events: <i>Failed to pull image "ngnix:1.27"</i> — 오타입니다. 컨테이너 이름도 <code>ngnix</code>이므로: <code>kubectl set image deployment/web ngnix=nginx:1.27</code>. Deployment가 고장 난 파드를 교체합니다. 실무 1위 장애 원인: 이미지 이름/태그 오타.',
    },
    solve(sim, run) { run('kubectl set image deployment/web ngnix=nginx:1.27'); },
  },

  {
    id: 'crashloop',
    difficulty: 2,
    title: { en: 'Dying on arrival', ko: '시작하자마자 사망' },
    brief: {
      en: 'The <code>api</code> Deployment (2 replicas) keeps restarting — hundreds of restarts overnight. <b>Find out why the container dies and fix the Deployment so both replicas stay Running &amp; Ready.</b>',
      ko: '<code>api</code> Deployment(레플리카 2)가 계속 재시작됩니다 — 밤새 수백 번. <b>컨테이너가 죽는 이유를 찾아 두 레플리카가 Running &amp; Ready로 유지되도록 Deployment를 고치세요.</b>',
    },
    hints: [
      { en: 'CrashLoopBackOff means the process inside exits. <code>kubectl logs POD</code> shows its last words.', ko: 'CrashLoopBackOff = 안의 프로세스가 종료된다는 뜻. <code>kubectl logs 파드</code>가 유언을 보여줍니다.' },
      { en: 'What command does the container run? <code>kubectl describe pod POD</code> shows Command; so does <code>kubectl get deploy api -o yaml</code>.', ko: '컨테이너가 무슨 명령을 실행하나요? <code>kubectl describe pod 파드</code>의 Command, 또는 <code>kubectl get deploy api -o yaml</code>.' },
      { en: '<code>kubectl edit deployment api</code> opens the YAML in the editor — remove the broken <code>command:</code> block and <code>kubectl apply -f</code> it.', ko: '<code>kubectl edit deployment api</code>로 YAML을 열어 잘못된 <code>command:</code> 블록을 지우고 <code>kubectl apply -f</code> 하세요.' },
    ],
    setup(engine) {
      const d = engine.makeDeployment({ name: 'api', replicas: 2, image: 'redis', command: ['sh', '-c', 'exit 1'] });
      seedPods(engine, d, 2, (p) => {
        p.status.state = 'CrashLoopBackOff';
        p.status.ready = false;
        p.status.restarts = 247;
        p.sim.crashLog = ['sh: line 0: exit 1', '(the container\'s main process keeps dying — that\'s what CrashLoopBackOff means)'];
        engine.addEvent({ type: 'Warning', reason: 'BackOff', object: 'Pod/' + p.metadata.name, message: `Back-off restarting failed container redis in pod ${p.metadata.name}` });
      });
    },
    checks: [
      { desc: { en: 'No pod of api is crash-looping', ko: 'api 파드 중 CrashLoopBackOff가 없음' }, test: (e) => !e.list('Pod').some((p) => p.sim.owner === 'default/api' && p.status.state === 'CrashLoopBackOff') },
      { desc: { en: '2 replicas Running & Ready', ko: '2개 레플리카가 Running & Ready' }, test: (e) => readyPodsOf(e, 'default', 'api').length >= 2 },
    ],
    solution: {
      en: '<code>kubectl logs POD</code> → the container runs <code>sh -c "exit 1"</code>: someone left a debug command in the template. <code>kubectl edit deployment api</code>, delete the <code>command:</code> block, <code>kubectl apply -f api-deployment.yaml</code>. Applying a template change rolls out fixed pods.',
      ko: '<code>kubectl logs 파드</code> → 컨테이너가 <code>sh -c "exit 1"</code>을 실행합니다: 누군가 디버그 명령을 템플릿에 남겼네요. <code>kubectl edit deployment api</code>에서 <code>command:</code> 블록을 지우고 <code>kubectl apply -f api-deployment.yaml</code>. 템플릿 수정이 적용되며 정상 파드로 교체됩니다.',
    },
    solve(sim, run) {
      sim.files.write('fix.yaml', 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: api\nspec:\n  replicas: 2\n  selector:\n    matchLabels: {app: api}\n  template:\n    metadata:\n      labels: {app: api}\n    spec:\n      containers:\n      - name: redis\n        image: redis\n');
      run('kubectl apply -f fix.yaml');
    },
  },

  {
    id: 'svc-selector',
    difficulty: 2,
    title: { en: 'The service that talks to no one', ko: '아무와도 대화하지 않는 Service' },
    brief: {
      en: 'Users report <code>web</code> is down. The pods look healthy, but requests to the <code>web</code> Service time out. <b>Make the Service route traffic again</b> (verify with <code>kubectl exec probe -- wget -qO- web</code>).',
      ko: '사용자들이 <code>web</code>이 죽었다고 합니다. 파드는 멀쩡해 보이는데 <code>web</code> Service로의 요청이 타임아웃됩니다. <b>Service가 다시 트래픽을 라우팅하게 만드세요</b> (확인: <code>kubectl exec probe -- wget -qO- web</code>).',
    },
    hints: [
      { en: 'A Service routes to pods whose labels match its selector. <code>kubectl describe svc web</code> — what does Endpoints say?', ko: 'Service는 셀렉터와 레이블이 맞는 파드로 라우팅합니다. <code>kubectl describe svc web</code> — Endpoints가 뭐라고 하나요?' },
      { en: 'Compare <code>kubectl get pods --show-labels</code> with the Service selector. Spot the difference.', ko: '<code>kubectl get pods --show-labels</code>와 Service 셀렉터를 비교하세요. 다른 점을 찾아보세요.' },
      { en: '<code>kubectl edit svc web</code> → fix <code>spec.selector</code> → apply.', ko: '<code>kubectl edit svc web</code> → <code>spec.selector</code> 수정 → apply.' },
    ],
    setup(engine) {
      const d = engine.makeDeployment({ name: 'web', replicas: 2, image: 'nginx' });
      seedPods(engine, d, 2);
      engine.makeService({ name: 'web', selector: { app: 'wbe' }, port: 80, targetPort: 80 });
      engine.makePod({ name: 'probe', labels: { run: 'probe' }, image: 'busybox', command: ['sleep', 'infinity'], nodeName: 'worker-1' });
    },
    checks: [
      { desc: { en: 'Service web has at least one endpoint', ko: 'web Service에 endpoint가 1개 이상' }, test: (e) => { const s = e.get('Service', 'default', 'web'); return !!s && e.endpointsOf(s).length >= 1; } },
    ],
    solution: {
      en: '<code>kubectl describe svc web</code> → <i>Endpoints: &lt;none&gt;</i>. <code>kubectl get pods --show-labels</code> → pods carry <code>app=web</code>, but the Service selects <code>app=wbe</code>. Fix via <code>kubectl edit svc web</code> (or re-expose). Empty Endpoints = selector/label mismatch or pods not Ready — this diagnosis is half of all networking questions.',
      ko: '<code>kubectl describe svc web</code> → <i>Endpoints: &lt;none&gt;</i>. <code>kubectl get pods --show-labels</code> → 파드는 <code>app=web</code>인데 Service는 <code>app=wbe</code>를 선택합니다. <code>kubectl edit svc web</code>으로 수정하세요. 빈 Endpoints = 셀렉터/레이블 불일치 또는 not-Ready — 네트워킹 문제 절반이 이 진단입니다.',
    },
    solve(sim, run) {
      sim.files.write('svc.yaml', 'apiVersion: v1\nkind: Service\nmetadata:\n  name: web\nspec:\n  selector: {app: web}\n  ports:\n  - port: 80\n    targetPort: 80\n');
      run('kubectl apply -f svc.yaml');
    },
  },

  {
    id: 'svc-targetport',
    difficulty: 2,
    title: { en: 'Right pods, wrong door', ko: '파드는 맞는데 문이 틀렸다' },
    brief: {
      en: 'The <code>shop</code> Service has endpoints, yet <code>kubectl exec probe -- wget -qO- shop</code> gets connection refused. <b>Fix the Service so the probe pod gets a response.</b>',
      ko: '<code>shop</code> Service에 endpoint가 있는데도 <code>kubectl exec probe -- wget -qO- shop</code>이 connection refused를 받습니다. <b>probe 파드가 응답을 받도록 Service를 고치세요.</b>',
    },
    hints: [
      { en: 'port vs targetPort: port = where the Service listens, targetPort = where the pod listens.', ko: 'port vs targetPort: port = Service가 듣는 곳, targetPort = 파드가 듣는 곳.' },
      { en: 'What port does nginx serve on? What does <code>kubectl describe svc shop</code> say TargetPort is?', ko: 'nginx는 몇 번 포트에서 서비스하나요? <code>kubectl describe svc shop</code>의 TargetPort는요?' },
    ],
    setup(engine) {
      const d = engine.makeDeployment({ name: 'shop', replicas: 2, image: 'nginx', containerPort: 80 });
      seedPods(engine, d, 2);
      engine.makeService({ name: 'shop', selector: { app: 'shop' }, port: 80, targetPort: 8080 });
      engine.makePod({ name: 'probe', labels: { run: 'probe' }, image: 'busybox', command: ['sleep', 'infinity'], nodeName: 'worker-1' });
    },
    checks: [
      { desc: { en: 'Service shop targets the port nginx serves on (80)', ko: 'shop Service가 nginx가 듣는 포트(80)를 가리킴' }, test: (e) => { const s = e.get('Service', 'default', 'shop'); return !!s && Number(s.spec.ports[0].targetPort) === 80 && e.endpointsOf(s).length >= 1; } },
    ],
    solution: {
      en: 'Endpoints exist, so the selector is fine — the connection dies at the pod. <code>kubectl describe svc shop</code>: TargetPort 8080, but nginx listens on 80. <code>kubectl edit svc shop</code> → <code>targetPort: 80</code> → apply. Selector wrong ⇒ empty endpoints; targetPort wrong ⇒ endpoints exist but refuse connections. Learn to tell them apart.',
      ko: 'Endpoints가 있으니 셀렉터는 정상 — 연결이 파드에서 죽는 겁니다. <code>kubectl describe svc shop</code>: TargetPort 8080, 그런데 nginx는 80에서 듣습니다. <code>kubectl edit svc shop</code> → <code>targetPort: 80</code> → apply. 셀렉터 오류 ⇒ 빈 endpoints; targetPort 오류 ⇒ endpoints는 있는데 연결 거부. 이 둘을 구분하세요.',
    },
    solve(sim, run) {
      sim.files.write('svc.yaml', 'apiVersion: v1\nkind: Service\nmetadata:\n  name: shop\nspec:\n  selector: {app: shop}\n  ports:\n  - port: 80\n    targetPort: 80\n');
      run('kubectl apply -f svc.yaml');
    },
  },

  {
    id: 'pending-capacity',
    difficulty: 1,
    title: { en: 'Desired ≠ possible', ko: '원하는 상태 ≠ 가능한 상태' },
    brief: {
      en: 'Someone scaled <code>web</code> to 10 replicas last night; two pods have been Pending ever since. Each worker fits 4 pods and there is no cluster autoscaler. <b>Make desired state achievable: every replica of web Running (keep at least 6).</b>',
      ko: '누군가 어젯밤 <code>web</code>을 레플리카 10으로 스케일했고, 그 뒤로 파드 2개가 계속 Pending입니다. 워커당 파드 4개, 오토스케일러는 없습니다. <b>원하는 상태를 달성 가능하게 만드세요: web의 모든 레플리카가 Running (6개 이상 유지).</b>',
    },
    hints: [
      { en: 'Why is a pod Pending? <code>kubectl describe pod POD</code> or <code>kubectl get events</code> — read the FailedScheduling reason.', ko: '파드가 왜 Pending일까요? <code>kubectl describe pod 파드</code> 또는 <code>kubectl get events</code> — FailedScheduling 사유를 읽으세요.' },
      { en: '2 workers × 4 pods = the cluster fits 8. Desired is 10. In real life: add nodes (autoscaler) or lower replicas. Here you can only do one of those.', ko: '워커 2 × 파드 4 = 클러스터 용량 8. 원하는 상태는 10. 실무라면 노드 추가(오토스케일러) 또는 레플리카 축소. 여기선 후자만 가능합니다.' },
    ],
    setup(engine) {
      const d = engine.makeDeployment({ name: 'web', replicas: 10, image: 'nginx' });
      seedPods(engine, d, 8, (p, i) => { p.spec.nodeName = 'worker-' + ((i % 2) + 1); });
      seedPods(engine, d, 2, (p) => {
        p.spec.nodeName = null;
        p.status.state = 'Pending';
        p.status.phase = 'Pending';
        p.status.ready = false;
        p.status.podIP = null;
      });
    },
    checks: [
      { desc: { en: 'No Pending pods in default', ko: 'default에 Pending 파드 없음' }, test: (e) => !e.list('Pod').some((p) => p.status.state === 'Pending') },
      { desc: { en: 'web fully available with ≥ 6 replicas', ko: 'web이 6개 이상 레플리카로 완전 가용' }, test: (e) => { const d = e.get('Deployment', 'default', 'web'); return !!d && d.spec.replicas >= 6 && readyPodsOf(e, 'default', 'web').length === d.spec.replicas; } },
    ],
    solution: {
      en: '<code>kubectl get events</code> → <i>0/3 nodes available: … out of pod capacity</i>. The cluster fits 8 user pods; desired is 10 — the difference sits Pending forever. <code>kubectl scale deployment web --replicas=8</code>. In production the Cluster Autoscaler watches exactly these Pending pods and buys nodes.',
      ko: '<code>kubectl get events</code> → <i>0/3 nodes available: … out of pod capacity</i>. 클러스터 용량은 8인데 원하는 상태가 10 — 차이만큼 영원히 Pending. <code>kubectl scale deployment web --replicas=8</code>. 프로덕션에선 Cluster Autoscaler가 바로 이 Pending 파드를 보고 노드를 삽니다.',
    },
    solve(sim, run) { run('kubectl scale deployment web --replicas=8'); },
  },

  {
    id: 'cordoned-node',
    difficulty: 1,
    title: { en: 'The forgotten maintenance flag', ko: '깜빡한 점검 플래그' },
    brief: {
      en: '<code>web</code> should run 6 replicas but 2 are Pending, and half the cluster looks idle. Last week ops did kernel maintenance on a node. <b>Get all 6 replicas Running.</b>',
      ko: '<code>web</code>은 레플리카 6이어야 하는데 2개가 Pending이고, 클러스터 절반이 놀고 있습니다. 지난주 운영팀이 한 노드의 커널 점검을 했습니다. <b>6개 레플리카를 모두 Running으로 만드세요.</b>',
    },
    hints: [
      { en: '<code>kubectl get nodes</code> — one of them isn\'t like the others.', ko: '<code>kubectl get nodes</code> — 하나가 다른 애들과 다릅니다.' },
      { en: 'SchedulingDisabled = cordoned. Maintenance is done… so?', ko: 'SchedulingDisabled = cordon 상태. 점검은 끝났다면… 그럼?' },
    ],
    setup(engine) {
      engine.get('Node', null, 'worker-1').spec.unschedulable = true;
      const d = engine.makeDeployment({ name: 'web', replicas: 6, image: 'nginx' });
      seedPods(engine, d, 4, (p) => { p.spec.nodeName = 'worker-2'; });
      seedPods(engine, d, 2, (p) => {
        p.spec.nodeName = null;
        p.status.state = 'Pending';
        p.status.phase = 'Pending';
        p.status.ready = false;
        p.status.podIP = null;
      });
    },
    checks: [
      { desc: { en: 'worker-1 is schedulable again', ko: 'worker-1이 다시 스케줄 가능' }, test: (e) => !e.get('Node', null, 'worker-1').spec.unschedulable },
      { desc: { en: 'All 6 replicas Running & Ready', ko: '6개 레플리카 모두 Running & Ready' }, test: (e) => readyPodsOf(e, 'default', 'web').length >= 6 },
    ],
    solution: {
      en: '<code>kubectl get nodes</code> → worker-1 <i>Ready,SchedulingDisabled</i>: it was cordoned for maintenance and never uncordoned. <code>kubectl uncordon worker-1</code> — the scheduler immediately places the Pending pods. cordon/drain/uncordon is the standard node-maintenance dance (and a guaranteed CKA task).',
      ko: '<code>kubectl get nodes</code> → worker-1 <i>Ready,SchedulingDisabled</i>: 점검 때 cordon 하고 uncordon을 잊었네요. <code>kubectl uncordon worker-1</code> — 스케줄러가 즉시 Pending 파드를 배치합니다. cordon/drain/uncordon은 표준 노드 점검 절차(그리고 CKA 단골 문제)입니다.',
    },
    solve(sim, run) { run('kubectl uncordon worker-1'); },
  },

  {
    id: 'bare-pod',
    difficulty: 1,
    title: { en: 'The pet that must become cattle', ko: '가축이 되어야 할 반려동물' },
    brief: {
      en: 'A teammate launched the payment service as a single bare pod named <code>payments</code>. If it dies at 3am, nothing restarts it. <b>Run payments properly: a Deployment named <code>payments</code> with 2 replicas of <code>redis</code>, then remove the bare pod.</b>',
      ko: '동료가 결제 서비스를 <code>payments</code>라는 생(bare) 파드 하나로 띄웠습니다. 새벽 3시에 죽으면 아무도 되살리지 않죠. <b>제대로 운영하세요: <code>redis</code> 2 레플리카의 <code>payments</code> Deployment를 만들고, 생 파드는 제거하세요.</b>',
    },
    hints: [
      { en: '<code>kubectl describe pod payments</code> → Controlled By: &lt;none&gt;. That\'s the problem.', ko: '<code>kubectl describe pod payments</code> → Controlled By: &lt;none&gt;. 그게 문제입니다.' },
      { en: 'One line creates the Deployment; one line deletes the pod.', ko: 'Deployment 생성 한 줄, 파드 삭제 한 줄.' },
    ],
    setup(engine) {
      engine.makePod({ name: 'payments', labels: { app: 'payments-legacy' }, image: 'redis', nodeName: 'worker-1' });
    },
    checks: [
      { desc: { en: 'Deployment payments has 2 Ready replicas', ko: 'payments Deployment에 Ready 레플리카 2개' }, test: (e) => readyPodsOf(e, 'default', 'payments').length >= 2 },
      { desc: { en: 'The bare pod named exactly "payments" is gone', ko: '"payments"라는 이름의 생 파드가 사라짐' }, test: (e) => { const p = e.get('Pod', 'default', 'payments'); return !p || p.status.state === 'Terminating'; } },
    ],
    solution: {
      en: '<code>kubectl create deployment payments --image=redis --replicas=2</code>, then <code>kubectl delete pod payments</code>. Deployment pods get random names (<code>payments-xxxxx-yyyyy</code>) — the exact-name pod was the bare one. Bare pods don\'t self-heal; this refactor is muscle memory for both exams.',
      ko: '<code>kubectl create deployment payments --image=redis --replicas=2</code>, 그다음 <code>kubectl delete pod payments</code>. Deployment 파드는 무작위 이름(<code>payments-xxxxx-yyyyy</code>)이라, 정확히 그 이름인 파드가 생 파드였습니다. 생 파드는 자가 치유되지 않습니다. 이 리팩터링은 두 시험 모두의 기본기입니다.',
    },
    solve(sim, run) {
      run('kubectl create deployment payments --image=redis --replicas=2');
      run('kubectl delete pod payments');
    },
  },

  {
    id: 'wrong-namespace',
    difficulty: 2,
    title: { en: 'Lost in namespaces', ko: '네임스페이스에서 길을 잃다' },
    brief: {
      en: 'The <code>orders</code> Deployment (image <code>redis</code>, 2 replicas) was shipped to the wrong namespace: it runs in <code>staging</code> but must run in <code>prod</code>. <b>Run orders in prod (2 Ready replicas) and remove it from staging.</b>',
      ko: '<code>orders</code> Deployment(이미지 <code>redis</code>, 레플리카 2)가 잘못된 네임스페이스에 배포됐습니다: 지금 <code>staging</code>에 있는데 <code>prod</code>에 있어야 합니다. <b>prod에서 orders를 돌리고(레플리카 2 Ready) staging에서는 제거하세요.</b>',
    },
    hints: [
      { en: 'Nothing in <code>kubectl get deploy</code>? Resources are namespaced — try <code>-n staging</code>, or <code>-A</code> to see everything.', ko: '<code>kubectl get deploy</code>에 아무것도 없나요? 자원은 네임스페이스에 속합니다 — <code>-n staging</code> 또는 전체를 보는 <code>-A</code>.' },
      { en: 'There is no "move" command. Create it in prod (any way you like), then delete it from staging.', ko: '"이동" 명령은 없습니다. prod에 (원하는 방법으로) 만들고, staging에서 지우세요.' },
      { en: 'Speedrun: <code>kubectl get deploy orders -n staging -o yaml > orders.yaml</code> → edit the namespace → apply.', ko: '스피드런: <code>kubectl get deploy orders -n staging -o yaml > orders.yaml</code> → 네임스페이스 수정 → apply.' },
    ],
    setup(engine) {
      engine.makeNamespace('staging');
      engine.makeNamespace('prod');
      const d = engine.makeDeployment({ name: 'orders', ns: 'staging', replicas: 2, image: 'redis' });
      seedPods(engine, d, 2);
    },
    checks: [
      { desc: { en: 'Deployment orders runs in prod with 2 Ready replicas', ko: 'orders Deployment가 prod에서 레플리카 2 Ready로 실행' }, test: (e) => readyPodsOf(e, 'prod', 'orders').length >= 2 },
      { desc: { en: 'No Deployment orders left in staging', ko: 'staging에 orders Deployment가 없음' }, test: (e) => !e.get('Deployment', 'staging', 'orders') },
    ],
    solution: {
      en: 'Find it: <code>kubectl get deploy -A</code>. Recreate: <code>kubectl create deployment orders --image=redis --replicas=2 -n prod</code> (or export YAML, change <code>metadata.namespace</code>, apply). Remove: <code>kubectl delete deployment orders -n staging</code>. Every kubectl command silently means <code>-n default</code> unless you say otherwise — the exam loves this trap.',
      ko: '찾기: <code>kubectl get deploy -A</code>. 재생성: <code>kubectl create deployment orders --image=redis --replicas=2 -n prod</code> (또는 YAML 내보내서 <code>metadata.namespace</code> 수정 후 apply). 제거: <code>kubectl delete deployment orders -n staging</code>. 모든 kubectl 명령은 말 안 하면 <code>-n default</code>입니다 — 시험이 사랑하는 함정.',
    },
    solve(sim, run) {
      run('kubectl create deployment orders --image=redis --replicas=2 -n prod');
      run('kubectl delete deployment orders -n staging');
    },
  },

  {
    id: 'readiness-probe',
    difficulty: 3,
    title: { en: 'Running, but never Ready', ko: 'Running인데 Ready는 아닌' },
    brief: {
      en: 'Every pod of <code>shop</code> shows <code>Running</code> but <code>0/1</code> Ready, so the <code>shop</code> Service has no endpoints and users see errors. The app itself is fine. <b>Make the pods Ready and the Service serve again.</b>',
      ko: '<code>shop</code>의 모든 파드가 <code>Running</code>인데 <code>0/1</code> Ready라서 <code>shop</code> Service에 endpoint가 없고 사용자는 오류를 봅니다. 앱 자체는 정상입니다. <b>파드를 Ready로 만들고 Service가 다시 동작하게 하세요.</b>',
    },
    hints: [
      { en: 'Running but not Ready = the readiness probe is failing. <code>kubectl describe pod POD</code> → Readiness + Events.', ko: 'Running인데 not Ready = readiness 프로브 실패. <code>kubectl describe pod 파드</code> → Readiness와 Events.' },
      { en: 'The probe checks port 8080. Which port does the container actually declare?', ko: '프로브는 8080 포트를 확인합니다. 컨테이너가 실제로 여는 포트는요?' },
      { en: '<code>kubectl edit deployment shop</code> → fix <code>readinessProbe.httpGet.port</code> to 80 → apply.', ko: '<code>kubectl edit deployment shop</code> → <code>readinessProbe.httpGet.port</code>를 80으로 → apply.' },
    ],
    setup(engine) {
      const d = engine.makeDeployment({ name: 'shop', replicas: 2, image: 'nginx', containerPort: 80, readinessProbe: { httpGet: { path: '/healthz', port: 8080 } } });
      seedPods(engine, d, 2, (p) => {
        p.status.ready = false;
        p.sim.notReadyReason = 'Readiness probe failed: Get "http://10.244.1.x:8080/healthz": connect: connection refused';
        engine.addEvent({ type: 'Warning', reason: 'Unhealthy', object: 'Pod/' + p.metadata.name, message: 'Readiness probe failed: Get "http://10.244.1.x:8080/healthz": connect: connection refused' });
      });
      engine.makeService({ name: 'shop', selector: { app: 'shop' }, port: 80, targetPort: 80 });
    },
    checks: [
      { desc: { en: 'All shop pods Running & Ready (1/1)', ko: 'shop 파드 전부 Running & Ready (1/1)' }, test: (e) => readyPodsOf(e, 'default', 'shop').length >= 2 },
      { desc: { en: 'Service shop has endpoints again', ko: 'shop Service에 endpoint 복구' }, test: (e) => { const s = e.get('Service', 'default', 'shop'); return !!s && e.endpointsOf(s).length >= 1; } },
    ],
    solution: {
      en: '<code>kubectl describe pod POD</code> → <i>Readiness probe failed … :8080</i>, but the container serves on 80. Fix the probe port via <code>kubectl edit deployment shop</code> + apply. Key exam insight: a failing <b>readiness</b> probe doesn\'t restart anything — it just removes the pod from Service endpoints. (Restarting is the <b>liveness</b> probe\'s job.)',
      ko: '<code>kubectl describe pod 파드</code> → <i>Readiness probe failed … :8080</i>, 그런데 컨테이너는 80에서 서비스합니다. <code>kubectl edit deployment shop</code>으로 프로브 포트를 고쳐 apply 하세요. 핵심: <b>readiness</b> 프로브 실패는 아무것도 재시작하지 않습니다 — Service endpoint에서 빠질 뿐. (재시작은 <b>liveness</b>의 일.)',
    },
    solve(sim, run) {
      sim.files.write('fix.yaml', 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: shop\nspec:\n  replicas: 2\n  selector:\n    matchLabels: {app: shop}\n  template:\n    metadata:\n      labels: {app: shop}\n    spec:\n      containers:\n      - name: nginx\n        image: nginx\n        ports:\n        - containerPort: 80\n        readinessProbe:\n          httpGet:\n            path: /healthz\n            port: 80\n');
      run('kubectl apply -f fix.yaml');
    },
  },

  {
    id: 'taint-untolerated',
    difficulty: 3,
    title: { en: 'The invisible fence', ko: '보이지 않는 울타리' },
    brief: {
      en: '<code>cache</code> (4 replicas) has 2 pods Pending even though worker-2 looks half-empty. Nobody remembers touching the nodes. <b>Diagnose why the scheduler avoids worker-2 and get all 4 replicas Running.</b>',
      ko: '<code>cache</code>(레플리카 4)의 파드 2개가 Pending인데 worker-2는 반쯤 비어 보입니다. 노드를 건드린 기억이 있는 사람이 없습니다. <b>스케줄러가 worker-2를 피하는 이유를 진단하고 4개 레플리카를 모두 Running으로 만드세요.</b>',
    },
    hints: [
      { en: '<code>kubectl describe pod POD</code> on a Pending pod — FailedScheduling spells out every node\'s objection.', ko: 'Pending 파드에 <code>kubectl describe pod 파드</code> — FailedScheduling이 노드별 거부 사유를 나열합니다.' },
      { en: '<code>kubectl describe node worker-2</code> → Taints. Untolerated taint = invisible fence.', ko: '<code>kubectl describe node worker-2</code> → Taints. tolerate 못 하는 taint = 보이지 않는 울타리.' },
      { en: 'Remove it: <code>kubectl taint nodes worker-2 KEY:NoSchedule-</code> (note the trailing dash).', ko: '제거: <code>kubectl taint nodes worker-2 KEY:NoSchedule-</code> (끝의 대시 주의).' },
    ],
    setup(engine) {
      const n = engine.get('Node', null, 'worker-2');
      n.spec.taints = [...(n.spec.taints || []), { key: 'maintenance', value: 'true', effect: 'NoSchedule' }];
      const d = engine.makeDeployment({ name: 'cache', replicas: 4, image: 'redis' });
      seedPods(engine, d, 2, (p) => { p.spec.nodeName = 'worker-1'; });
      // worker-1 also hosts other workloads, so only 2 slots were free there
      const filler = engine.makeDeployment({ name: 'legacy', replicas: 2, image: 'httpd' });
      seedPods(engine, filler, 2, (p) => { p.spec.nodeName = 'worker-1'; });
      seedPods(engine, d, 2, (p) => {
        p.spec.nodeName = null;
        p.status.state = 'Pending';
        p.status.phase = 'Pending';
        p.status.ready = false;
        p.status.podIP = null;
      });
    },
    checks: [
      { desc: { en: 'worker-2 no longer carries the maintenance taint', ko: 'worker-2의 maintenance taint 제거됨' }, test: (e) => !(e.get('Node', null, 'worker-2').spec.taints || []).some((t) => t.key === 'maintenance') },
      { desc: { en: 'All 4 cache replicas Running & Ready', ko: 'cache 레플리카 4개 모두 Running & Ready' }, test: (e) => readyPodsOf(e, 'default', 'cache').length >= 4 },
    ],
    solution: {
      en: '<code>kubectl describe pod POD</code> → <i>1 node(s) had untolerated taint {maintenance=true}</i>. <code>kubectl describe node worker-2</code> confirms it. Remove with <code>kubectl taint nodes worker-2 maintenance:NoSchedule-</code>. Taints repel pods; tolerations are the permission slip — the other fix would be adding a toleration to the pod template.',
      ko: '<code>kubectl describe pod 파드</code> → <i>1 node(s) had untolerated taint {maintenance=true}</i>. <code>kubectl describe node worker-2</code>로 확인. <code>kubectl taint nodes worker-2 maintenance:NoSchedule-</code>로 제거하세요. taint는 파드를 밀어내고 toleration은 통행증입니다 — 파드 템플릿에 toleration을 추가하는 것도 다른 해법.',
    },
    solve(sim, run) { run('kubectl taint nodes worker-2 maintenance:NoSchedule-'); },
  },

  {
    id: 'rollback',
    difficulty: 3,
    title: { en: 'The 14:02 deploy', ko: '14시 02분의 배포' },
    brief: {
      en: 'At 14:02 someone shipped <code>checkout</code> v2 and the rollout is wedged: the new pod can\'t pull its image, old pods still carry the traffic. The author is unreachable. <b>Return checkout to the previous working version, all 3 replicas Ready.</b>',
      ko: '14시 02분에 누군가 <code>checkout</code> v2를 배포했고 롤아웃이 낀 상태입니다: 새 파드는 이미지를 못 받고, 옛 파드가 트래픽을 버티는 중. 배포자는 연락 두절. <b>checkout을 이전 정상 버전으로 되돌리고 3개 레플리카를 Ready로 만드세요.</b>',
    },
    hints: [
      { en: '<code>kubectl rollout history deployment/checkout</code> — what did revision 1 run?', ko: '<code>kubectl rollout history deployment/checkout</code> — 리비전 1은 뭘 돌리고 있었나요?' },
      { en: 'You don\'t need to know the old image by heart. There\'s a command that goes back one revision.', ko: '옛 이미지를 외울 필요 없습니다. 한 리비전 뒤로 가는 명령이 있어요.' },
    ],
    setup(engine) {
      const d = engine.makeDeployment({ name: 'checkout', replicas: 3, image: 'nginx:1.25' });
      seedPods(engine, d, 3);
      // simulate the bad 14:02 deploy: new revision with a broken image, wedged
      // mid-rollout (old pods still serving, one new pod stuck) — via the real
      // ReplicaSet the Deployment controller actually uses, not hand-mutated bookkeeping.
      d.spec.template.spec.containers[0].image = 'chekout-svc:2.0';
      engine.rotateDeployment(d);
      const newRs = engine.get('ReplicaSet', 'default', d.sim.rsName);
      newRs.spec.replicas = 1;
      const stuck = engine.makePod({
        name: newRs.metadata.name + '-' + rid(5), labels: { app: 'checkout' }, image: 'chekout-svc:2.0',
        owner: 'default/checkout', rsName: newRs.metadata.name, nodeName: 'worker-1',
      });
      stuck.status.state = 'ImagePullBackOff';
      stuck.status.phase = 'Pending';
      stuck.status.ready = false;
      engine.addEvent({ type: 'Warning', reason: 'Failed', object: 'Pod/' + stuck.metadata.name, message: 'Failed to pull image "chekout-svc:2.0": repository does not exist or may require authorization' });
    },
    checks: [
      { desc: { en: 'checkout no longer references the broken image', ko: 'checkout이 더 이상 고장 난 이미지를 참조하지 않음' }, test: (e) => { const d = e.get('Deployment', 'default', 'checkout'); return !!d && imageKnown(e.depImage(d)); } },
      { desc: { en: 'No ImagePullBackOff pods left', ko: 'ImagePullBackOff 파드가 남아있지 않음' }, test: (e) => !e.list('Pod').some((p) => /ImagePull|ErrImage/.test(p.status.state)) },
      { desc: { en: 'All 3 replicas Running & Ready', ko: '3개 레플리카 모두 Running & Ready' }, test: (e) => readyPodsOf(e, 'default', 'checkout').length >= 3 },
    ],
    solution: {
      en: '<code>kubectl rollout history deployment/checkout</code> → rev 1 ran <code>nginx:1.25</code>, rev 2 the broken <code>chekout-svc:2.0</code>. <code>kubectl rollout undo deployment/checkout</code> rolls back — as revision 3 (history moves forward, even backwards). Notice the rollout was wedged, not down: surge + maxUnavailable kept old pods serving. That\'s why rolling updates are safe to roll back.',
      ko: '<code>kubectl rollout history deployment/checkout</code> → rev 1은 <code>nginx:1.25</code>, rev 2는 고장 난 <code>chekout-svc:2.0</code>. <code>kubectl rollout undo deployment/checkout</code>으로 롤백 — 리비전 3으로요(히스토리는 뒤로 가도 앞으로 쌓입니다). 롤아웃이 낀 것이지 죽은 게 아니었다는 점에 주목: surge + maxUnavailable이 옛 파드로 서비스를 지켰습니다. 롤링 업데이트가 안전하게 롤백되는 이유입니다.',
    },
    solve(sim, run) { run('kubectl rollout undo deployment/checkout'); },
  },
];
