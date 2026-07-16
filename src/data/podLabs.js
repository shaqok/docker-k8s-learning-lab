/**
 * Pod Design lab (improvement-plan step 13): sidecars, initContainers, and the
 * kubectl fidelity that comes with more than one container in a pod. Same
 * shape/grading model as the other drill sets — a healthy playground with a
 * fault-injection widget and missions graded LIVE against engine state.
 */

const WEB_DEPLOY_YAML = `# Mission: add a 'log-shipper' sidecar to this Deployment, then:
#     kubectl apply -f web.yaml
# Watch READY go from 1/1 to 2/2 on each pod.
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 2
  selector:
    matchLabels: {app: web}
  template:
    metadata:
      labels: {app: web}
    spec:
      containers:
      - name: nginx
        image: nginx:1.27
        ports:
        - containerPort: 80
        readinessProbe:
          httpGet: {path: /, port: 80}
          periodSeconds: 2
          failureThreshold: 3
      # - name: log-shipper
      #   image: busybox
      #   command: ["sh", "-c", "sleep infinity"]
      #   ports:
      #   - containerPort: 8080
      #   readinessProbe:
      #     httpGet: {path: /, port: 8080}
      #     periodSeconds: 2
      #     failureThreshold: 3
`;

const APP_POD_YAML = `# Mission: give this pod an initContainer that must finish before the main
# container starts, then: kubectl apply -f app.yaml
# Watch STATUS go Init:0/1 -> PodInitializing -> Running.
apiVersion: v1
kind: Pod
metadata:
  name: app
  labels:
    app: app
spec:
  # initContainers:
  # - name: init-db
  #   image: busybox
  #   command: ["sh", "-c", "sleep 1"]
  containers:
  - name: app
    image: nginx:1.27
`;

const podsOf = (engine, name) =>
  engine.list('Pod').filter((p) => p.sim.owner === 'default/' + name && p.status.state !== 'Terminating');

export const POD_LABS = [
  {
    id: 'sidecars',
    tab: { en: '🧩 Pod Design', ko: '🧩 파드 설계' },
    title: { en: 'Multi-container pods — sidecars & initContainers', ko: '멀티 컨테이너 파드 — 사이드카 & initContainer' },
    brief: {
      en: 'A pod can hold more than one container. The <code>web</code> Deployment (behind the <code>web</code> Service) starts with one — add a <b>sidecar</b> in <code>web.yaml</code> and READY goes from <code>1/1</code> to <code>2/2</code>. A pod is only Ready — and only in a Service\'s endpoints — when <i>every</i> container is Ready, so breaking just the sidecar (app panel below) pulls the whole pod out, even with a perfectly healthy main container. Then add an <b>initContainer</b> to <code>app.yaml</code> and watch <code>STATUS</code> walk <code>Init:0/1 → PodInitializing → Running</code> — it must finish before the main container ever starts. Finally, on a multi-container pod <code>kubectl logs</code>/<code>exec</code> need <code>-c NAME</code> — try it, then <code>--previous</code> after a restart.',
      ko: '파드는 컨테이너를 두 개 이상 담을 수 있습니다. <code>web</code> Deployment(<code>web</code> Service 뒤)는 컨테이너 하나로 시작합니다 — <code>web.yaml</code>에 <b>사이드카</b>를 추가하면 READY가 <code>1/1</code>에서 <code>2/2</code>로 바뀝니다. 파드는 <i>모든</i> 컨테이너가 Ready일 때만 Ready이고 Service 엔드포인트에도 들어가므로, 메인 컨테이너가 멀쩡해도 사이드카만 고장 내면(아래 앱 패널) 파드 전체가 빠집니다. 그다음 <code>app.yaml</code>에 <b>initContainer</b>를 추가하고 <code>STATUS</code>가 <code>Init:0/1 → PodInitializing → Running</code>으로 진행하는 걸 보세요 — 메인 컨테이너는 그게 끝나야 시작합니다. 마지막으로 멀티 컨테이너 파드에서는 <code>kubectl logs</code>/<code>exec</code>에 <code>-c 이름</code>이 필요합니다 — 해보고, 재시작 후에는 <code>--previous</code>도 써 보세요.',
    },
    docs: [
      { label: 'Init Containers', url: 'https://kubernetes.io/docs/concepts/workloads/pods/init-containers/' },
      { label: 'Sidecar Containers', url: 'https://kubernetes.io/docs/concepts/workloads/pods/sidecar-containers/' },
    ],
    starterFiles: { 'web.yaml': WEB_DEPLOY_YAML, 'app.yaml': APP_POD_YAML },
    setup(engine) {
      engine.makeDeployment({
        name: 'web', replicas: 2, image: 'nginx:1.27', containerPort: 80,
        readinessProbe: { httpGet: { path: '/', port: 80 }, periodSeconds: 2, failureThreshold: 3 },
      });
      engine.makeService({ name: 'web', selector: { app: 'web' }, port: 80 });
    },
    missions: [
      {
        id: 'sidecar-ready',
        desc: { en: '🧩 Uncomment the <code>log-shipper</code> sidecar in <code>web.yaml</code> and <code>kubectl apply -f</code> it — a <code>web</code> pod shows <code>READY 2/2</code>', ko: '🧩 <code>web.yaml</code>의 <code>log-shipper</code> 사이드카 주석을 풀고 <code>kubectl apply -f</code> — <code>web</code> 파드가 <code>READY 2/2</code>가 됩니다' },
        check: (e) => podsOf(e, 'web').some((p) => p.spec.containers.length === 2 && p.status.ready),
      },
      {
        id: 'sidecar-endpoints',
        desc: { en: '💥 In the app panel, break just the <code>log-shipper</code> sidecar (not the nginx container) — the pod drops out of <code>kubectl get endpoints web</code> even though nginx is fine', ko: '💥 앱 패널에서 <code>log-shipper</code> 사이드카만 고장 내세요(nginx는 그대로) — nginx는 멀쩡해도 파드가 <code>kubectl get endpoints web</code>에서 빠집니다' },
        check: (e) => podsOf(e, 'web').filter((p) => p.spec.containers.length === 2).some((p) => {
          const main = p.status.containerStatuses.find((cs) => cs.name === p.spec.containers[0].name);
          const side = p.status.containerStatuses.find((cs) => cs.name === p.spec.containers[1].name);
          return main && side && main.ready && !side.ready && !p.status.ready;
        }),
      },
      {
        id: 'init-sequence',
        desc: { en: '🚦 Uncomment the <code>init-db</code> initContainer in <code>app.yaml</code> and apply it — watch <code>kubectl get pods</code> show <code>Init:0/1</code> before <code>Running</code>', ko: '🚦 <code>app.yaml</code>의 <code>init-db</code> initContainer 주석을 풀고 apply — <code>kubectl get pods</code>가 <code>Running</code> 전에 <code>Init:0/1</code>을 보여줍니다' },
        check: (e) => {
          const p = e.get('Pod', 'default', 'app');
          return !!(p && p.status.ready && (p.status.initContainerStatuses || []).some((cs) => cs.name === 'init-db' && cs.state === 'Terminated'));
        },
      },
      {
        id: 'logs-c',
        desc: { en: '📜 <code>kubectl logs</code> a <code>web</code> pod without <code>-c</code> — it refuses (which container?). Then: <code>kubectl logs POD -c log-shipper</code>', ko: '📜 <code>-c</code> 없이 <code>web</code> 파드에 <code>kubectl logs</code> — 어느 컨테이너인지 몰라 거부합니다. 그다음: <code>kubectl logs POD -c log-shipper</code>' },
        check: (e, flags) => !!(flags && flags.has('logs-c')),
      },
      {
        id: 'logs-previous',
        desc: { en: '⏮ Give <code>log-shipper</code> a livenessProbe, hang it until the probe restarts the container, then read the crashed instance: <code>kubectl logs POD -c log-shipper --previous</code>', ko: '⏮ <code>log-shipper</code>에 livenessProbe를 달고 프로브가 컨테이너를 재시작할 때까지 행 상태로 둔 뒤, 죽은 인스턴스를 읽으세요: <code>kubectl logs POD -c log-shipper --previous</code>' },
        check: (e, flags) => !!(flags && flags.has('logs-previous')),
      },
    ],
    solve(sim, run, settle) {
      const e = sim.engine;
      settle(5);
      sim.files.write('web.yaml', `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 2
  selector:
    matchLabels: {app: web}
  template:
    metadata:
      labels: {app: web}
    spec:
      containers:
      - name: nginx
        image: nginx:1.27
        ports:
        - containerPort: 80
        readinessProbe:
          httpGet: {path: /, port: 80}
          periodSeconds: 2
          failureThreshold: 3
      - name: log-shipper
        image: busybox
        command: ["sh", "-c", "sleep infinity"]
        ports:
        - containerPort: 8080
        readinessProbe:
          httpGet: {path: /, port: 8080}
          periodSeconds: 2
          failureThreshold: 3
        livenessProbe:
          httpGet: {path: /, port: 8080}
          periodSeconds: 2
          failureThreshold: 3
`);
      run('kubectl apply -f web.yaml');
      settle(15);
      const web = podsOf(e, 'web').find((p) => p.spec.containers.length === 2);
      run(`kubectl logs ${web.metadata.name}`); // refused: which container?
      run(`kubectl logs ${web.metadata.name} -c log-shipper`);
      // 'hang' fails BOTH probes; once the liveness window elapses the sidecar
      // restarts (and heals) — that's what makes --previous meaningful.
      e.setAppState(web, 'log-shipper', 'hang');
      settle(10);
      run(`kubectl logs ${web.metadata.name} -c log-shipper --previous`);
      settle(5); // let the restart finish healing before the next, PERMANENT break
      // '503' only fails readiness (no liveness/restart), so this state — and the
      // pod dropping out of the Service's endpoints — holds at final grading time.
      e.setAppState(web, 'log-shipper', '503');
      settle(5);
      sim.files.write('app.yaml', `apiVersion: v1
kind: Pod
metadata:
  name: app
  labels:
    app: app
spec:
  initContainers:
  - name: init-db
    image: busybox
    command: ["sh", "-c", "sleep 1"]
  containers:
  - name: app
    image: nginx:1.27
`);
      run('kubectl apply -f app.yaml');
      settle(15);
    },
  },
];

export const POD_MISSION_TOTAL = POD_LABS.reduce((s, l) => s + l.missions.length, 0);
