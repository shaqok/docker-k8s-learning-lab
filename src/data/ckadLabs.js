import { qosOf, effectiveRequests, K8S_NODE_ALLOC } from '../sims/k8s/engine.js';

/**
 * CKAD drill labs (improvement-plan step 5): probes, resources/QoS,
 * ConfigMap/Secret. Unlike the Troubleshooting scenarios (broken cluster →
 * one graded fix), each lab is a healthy playground with a fault-injection
 * widget and a mission list graded LIVE against engine state.
 *
 * Mission checks receive (engine, flags) where `flags` is the set of
 * onMission ids the terminal has fired (used for "run this command" missions).
 * `solve(sim, run, settle)` is the reference path, proven by tests.
 */

const PROBED_POD_YAML = `# Mission: give this pod a readinessProbe (path /ready, port 80),
# then: kubectl apply -f probed-pod.yaml
apiVersion: v1
kind: Pod
metadata:
  name: probed
  labels:
    app: probed
spec:
  containers:
  - name: nginx
    image: nginx:1.27
    ports:
    - containerPort: 80
    # readinessProbe:
    #   httpGet:
    #     path: /ready
    #     port: 80
`;

const BIG_POD_YAML = `# This is the manifest 'big' was created from. No worker has 4Gi free —
# lower the request so it fits, delete the stuck pod, and re-apply.
apiVersion: v1
kind: Pod
metadata:
  name: big
spec:
  containers:
  - name: app
    image: nginx:1.27
    resources:
      requests:
        cpu: 250m
        memory: 4Gi
`;

const HOG_POD_YAML = `# 'hog' runs with NO resources block (QoS: BestEffort).
# Mission: recreate it with a memory limit so a leak gets contained:
#     resources:
#       limits:
#         memory: 128Mi
apiVersion: v1
kind: Pod
metadata:
  name: hog
spec:
  containers:
  - name: hog
    image: busybox
    command: ["sh", "-c", "sleep infinity"]
`;

const APP_POD_YAML = `# This pod consumes config two ways: an env var from a ConfigMap and a
# Secret mounted as files. Apply it before creating them and you'll meet
# CreateContainerConfigError — the kubelet retries until the refs exist.
apiVersion: v1
kind: Pod
metadata:
  name: app
spec:
  containers:
  - name: app
    image: nginx:1.27
    env:
    - name: APP_COLOR
      valueFrom:
        configMapKeyRef:
          name: app-config
          key: APP_COLOR
    volumeMounts:
    - name: creds
      mountPath: /etc/creds
  volumes:
  - name: creds
    secret:
      secretName: db-secret
`;

const podsOf = (engine, name) =>
  engine.list('Pod').filter((p) => p.sim.owner === 'default/' + name && p.status.state !== 'Terminating');

export const CKAD_LABS = [
  {
    id: 'probes',
    tab: { en: '🩺 Probes', ko: '🩺 프로브' },
    title: { en: 'Liveness vs readiness — teach the cluster to see health', ko: 'Liveness vs readiness — 클러스터에게 헬스체크 가르치기' },
    brief: {
      en: 'The <code>web</code> Deployment (2 replicas, behind the <code>web</code> Service) carries both probes; <code>legacy</code> has none. Use the <b>app panel</b> below the terminal to break the app <i>inside</i> a container, then watch what each probe does: <b>readiness</b> failure silently pulls the pod out of Service endpoints (no restart); <b>liveness</b> failure gets the container restarted. Detection takes <code>periodSeconds × failureThreshold</code> — watch the events. A pod with no probes stays "Ready" even when the app is dead: that is the trap.',
      ko: '<code>web</code> Deployment(레플리카 2, <code>web</code> Service 뒤)에는 두 프로브가 모두 있고 <code>legacy</code>에는 없습니다. 터미널 아래 <b>앱 패널</b>로 컨테이너 <i>안의</i> 앱을 고장 내고 각 프로브가 뭘 하는지 보세요: <b>readiness</b> 실패는 재시작 없이 조용히 파드를 Service 엔드포인트에서 뺍니다. <b>liveness</b> 실패는 컨테이너를 재시작시킵니다. 감지에는 <code>periodSeconds × failureThreshold</code>만큼 걸립니다 — 이벤트를 보세요. 프로브가 없는 파드는 앱이 죽어도 "Ready"로 남습니다: 그게 함정입니다.',
    },
    docs: [
      { label: 'Liveness / readiness probes', url: 'https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/' },
      { label: 'Pod lifecycle', url: 'https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/' },
    ],
    starterFiles: { 'probed-pod.yaml': PROBED_POD_YAML },
    setup(engine) {
      engine.makeDeployment({
        name: 'web', replicas: 2, image: 'nginx:1.27', containerPort: 80,
        readinessProbe: { httpGet: { path: '/healthz', port: 80 }, periodSeconds: 2, failureThreshold: 3 },
        livenessProbe: { httpGet: { path: '/', port: 80 }, periodSeconds: 2, failureThreshold: 5 },
      });
      engine.makeService({ name: 'web', selector: { app: 'web' }, port: 80 });
      engine.makeDeployment({ name: 'legacy', replicas: 1, image: 'httpd' });
    },
    missions: [
      {
        id: 'probe-hang',
        desc: { en: '💥 Hang a <code>web</code> pod (app panel) and let the <b>liveness</b> probe restart it — RESTARTS goes up, the pod heals', ko: '💥 <code>web</code> 파드를 행(hang) 상태로 만들고(앱 패널) <b>liveness</b> 프로브가 재시작하게 두세요 — RESTARTS가 올라가고 파드가 회복됩니다' },
        check: (e) => podsOf(e, 'web').some((p) => p.status.restarts >= 1),
      },
      {
        id: 'probe-503',
        desc: { en: '🤒 Make a <code>web</code> pod serve 503s: <b>readiness</b> fails → it leaves the Service endpoints, but is NOT restarted (check <code>kubectl get endpoints</code>)', ko: '🤒 <code>web</code> 파드가 503을 반환하게 하세요: <b>readiness</b>가 실패해 Service 엔드포인트에서 빠지지만 재시작되지는 않습니다 (<code>kubectl get endpoints</code> 확인)' },
        check: (e) => podsOf(e, 'web').some((p) => p.status.state === 'Running' && !p.status.ready && p.sim.app === '503'),
      },
      {
        id: 'probe-apply',
        desc: { en: '📝 Edit <code>probed-pod.yaml</code>: add an httpGet readinessProbe (path <code>/ready</code>, port 80) and <code>kubectl apply -f</code> it — pod <code>probed</code> Running &amp; Ready', ko: '📝 <code>probed-pod.yaml</code>에 httpGet readinessProbe(경로 <code>/ready</code>, 포트 80)를 추가하고 <code>kubectl apply -f</code> — 파드 <code>probed</code>가 Running &amp; Ready' },
        check: (e) => {
          const p = e.get('Pod', 'default', 'probed');
          const rp = p && p.spec.containers[0].readinessProbe;
          return !!(rp && rp.httpGet && Number(rp.httpGet.port) === 80 && p.status.ready);
        },
      },
      {
        id: 'probe-legacy',
        desc: { en: '🛡 <code>legacy</code> is blind — hang it and note the cluster still says Ready. Then give the <code>legacy</code> Deployment a readinessProbe (<code>kubectl edit deployment legacy</code> → apply)', ko: '🛡 <code>legacy</code>는 장님입니다 — 행 상태로 만들어도 클러스터는 Ready라고 합니다. <code>legacy</code> Deployment에 readinessProbe를 추가하세요 (<code>kubectl edit deployment legacy</code> → apply)' },
        check: (e) => {
          const d = e.get('Deployment', 'default', 'legacy');
          if (!d || !d.spec.template.spec.containers[0].readinessProbe) return false;
          const pods = podsOf(e, 'legacy');
          return pods.length >= 1 && pods.every((p) => p.status.ready);
        },
      },
    ],
    solve(sim, run, settle) {
      const e = sim.engine;
      settle(5);
      const [a, b] = podsOf(e, 'web');
      e.setAppState(a, 'hang');
      e.setAppState(b, '503');
      sim.files.write('probed-pod.yaml', 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: probed\n  labels: {app: probed}\nspec:\n  containers:\n  - name: nginx\n    image: nginx:1.27\n    ports:\n    - containerPort: 80\n    readinessProbe:\n      httpGet: {path: /ready, port: 80}\n');
      run('kubectl apply -f probed-pod.yaml');
      sim.files.write('legacy.yaml', 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: legacy\nspec:\n  replicas: 1\n  selector:\n    matchLabels: {app: legacy}\n  template:\n    metadata:\n      labels: {app: legacy}\n    spec:\n      containers:\n      - name: httpd\n        image: httpd\n        readinessProbe:\n          httpGet: {path: /, port: 80}\n');
      run('kubectl apply -f legacy.yaml');
    },
  },

  {
    id: 'qos',
    tab: { en: '⚖️ Resources & QoS', ko: '⚖️ 자원과 QoS' },
    title: { en: 'Requests, limits, QoS — and the OOMKill you can see coming', ko: 'Requests, limits, QoS — 그리고 예고된 OOMKill' },
    brief: {
      en: '<b>Requests</b> are what the scheduler reserves (each worker here allocates <code>' + K8S_NODE_ALLOC.memMi + 'Mi</code> / <code>' + K8S_NODE_ALLOC.cpuM + 'm</code>); <b>limits</b> are where the kernel steps in — exceed <code>limits.memory</code> and the container is OOMKilled (exit code 137). Requests==limits earns QoS <b>Guaranteed</b>; some values, <b>Burstable</b>; none, <b>BestEffort</b> (first to be evicted). Pod <code>big</code> is already stuck Pending, and <code>hog</code> has a leak button waiting in the app panel. <code>kubectl top pods</code> shows live usage.',
      ko: '<b>Requests</b>는 스케줄러가 예약하는 양이고(여기 워커는 각각 <code>' + K8S_NODE_ALLOC.memMi + 'Mi</code> / <code>' + K8S_NODE_ALLOC.cpuM + 'm</code>), <b>limits</b>는 커널이 개입하는 선입니다 — <code>limits.memory</code>를 넘으면 컨테이너가 OOMKill(종료 코드 137)됩니다. requests==limits면 QoS <b>Guaranteed</b>, 일부만 있으면 <b>Burstable</b>, 없으면 <b>BestEffort</b>(가장 먼저 축출). 파드 <code>big</code>은 이미 Pending에 걸려 있고, <code>hog</code>에는 앱 패널의 누수 버튼이 기다립니다. <code>kubectl top pods</code>로 실시간 사용량을 보세요.',
    },
    docs: [
      { label: 'Resource requests & limits', url: 'https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/' },
      { label: 'Pod Quality of Service', url: 'https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/' },
    ],
    starterFiles: { 'big.yaml': BIG_POD_YAML, 'hog.yaml': HOG_POD_YAML },
    setup(engine) {
      engine.makeDeployment({
        name: 'api', replicas: 2, image: 'redis',
        resources: { requests: { cpu: '250m', memory: '256Mi' }, limits: { memory: '512Mi' } },
      });
      engine.makePod({ name: 'hog', labels: { run: 'hog' }, image: 'busybox', command: ['sh', '-c', 'sleep infinity'] });
      engine.makePod({ name: 'big', labels: { run: 'big' }, image: 'nginx:1.27', resources: { requests: { cpu: '250m', memory: '4Gi' } } });
    },
    missions: [
      {
        id: 'qos-fit',
        desc: { en: '📏 <code>big</code> is Pending — <code>kubectl describe pod big</code> tells you why. Fix <code>big.yaml</code> so the request fits a worker, delete the stuck pod, re-apply', ko: '📏 <code>big</code>이 Pending입니다 — <code>kubectl describe pod big</code>이 이유를 알려줍니다. <code>big.yaml</code>의 요청량을 워커에 들어가게 고치고, 걸린 파드를 지운 뒤 다시 apply' },
        check: (e) => {
          const p = e.get('Pod', 'default', 'big');
          if (!p || !p.status.ready) return false;
          const req = effectiveRequests(p.spec.containers[0]);
          return req.memMi > 0 && req.memMi <= K8S_NODE_ALLOC.memMi;
        },
      },
      {
        id: 'qos-guaranteed',
        desc: { en: '🥇 Create pod <code>steady</code> (image <code>redis</code>) with requests == limits (e.g. cpu 250m / memory 256Mi) — QoS class <b>Guaranteed</b>. Verify: <code>kubectl describe pod steady</code>', ko: '🥇 requests == limits(예: cpu 250m / memory 256Mi)로 파드 <code>steady</code>(이미지 <code>redis</code>)를 만드세요 — QoS 클래스 <b>Guaranteed</b>. 확인: <code>kubectl describe pod steady</code>' },
        check: (e) => {
          const p = e.get('Pod', 'default', 'steady');
          return !!(p && p.status.ready && qosOf(p) === 'Guaranteed');
        },
      },
      {
        id: 'qos-top',
        desc: { en: '📊 Watch live usage with <code>kubectl top pods</code> (and <code>kubectl top nodes</code>)', ko: '📊 <code>kubectl top pods</code>(그리고 <code>kubectl top nodes</code>)로 실시간 사용량을 보세요' },
        check: (e, flags) => !!(flags && flags.has('top')),
      },
      {
        id: 'qos-oom',
        desc: { en: '💣 Contain the leak: recreate <code>hog</code> with <code>limits.memory: 128Mi</code> (see <code>hog.yaml</code>), start the leak in the app panel, and watch the OOMKill (exit 137) + restart', ko: '💣 누수를 가두세요: <code>hog</code>를 <code>limits.memory: 128Mi</code>로 다시 만들고(<code>hog.yaml</code> 참고) 앱 패널에서 누수를 시작한 뒤 OOMKill(종료 코드 137)과 재시작을 지켜보세요' },
        check: (e) => {
          const p = e.get('Pod', 'default', 'hog');
          const lim = p && p.spec.containers[0].resources && p.spec.containers[0].resources.limits;
          return !!(p && lim && lim.memory && (p.sim.oomCount || 0) >= 1);
        },
      },
    ],
    solve(sim, run, settle) {
      const e = sim.engine;
      settle(5);
      run('kubectl delete pod big');
      run('kubectl delete pod hog');
      settle(3);
      sim.files.write('big.yaml', 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: big\nspec:\n  containers:\n  - name: app\n    image: nginx:1.27\n    resources:\n      requests: {cpu: 250m, memory: 512Mi}\n');
      run('kubectl apply -f big.yaml');
      sim.files.write('steady.yaml', 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: steady\nspec:\n  containers:\n  - name: redis\n    image: redis\n    resources:\n      requests: {cpu: 250m, memory: 256Mi}\n      limits: {cpu: 250m, memory: 256Mi}\n');
      run('kubectl apply -f steady.yaml');
      sim.files.write('hog.yaml', 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: hog\nspec:\n  containers:\n  - name: hog\n    image: busybox\n    command: ["sh", "-c", "sleep infinity"]\n    resources:\n      limits: {memory: 128Mi}\n');
      run('kubectl apply -f hog.yaml');
      settle(5);
      run('kubectl top pods');
      e.setLeak(e.get('Pod', 'default', 'hog'), true);
    },
  },

  {
    id: 'config',
    tab: { en: '🔐 ConfigMaps & Secrets', ko: '🔐 ConfigMap과 Secret' },
    title: { en: 'ConfigMap & Secret — env vars, mounted files, and the base64 “gotcha”', ko: 'ConfigMap & Secret — 환경변수, 파일 마운트, 그리고 base64의 함정' },
    brief: {
      en: 'Config lives outside the image. The manifest <code>app-pod.yaml</code> (editor →) wants an env var from ConfigMap <code>app-config</code> and files from Secret <code>db-secret</code>. Build both with imperative commands (<code>--from-literal</code>), apply the pod, then <code>kubectl exec</code> in and read the results. Two lessons hide here: apply the pod <i>before</i> its config and you get <code>CreateContainerConfigError</code> (self-heals once the refs exist), and a Secret is only <b>base64-encoded</b> — inside the container it is plain text.',
      ko: '설정은 이미지 밖에 삽니다. 매니페스트 <code>app-pod.yaml</code>(에디터 →)은 ConfigMap <code>app-config</code>의 환경변수와 Secret <code>db-secret</code>의 파일을 원합니다. 명령형 커맨드(<code>--from-literal</code>)로 둘을 만들고 파드를 apply한 뒤 <code>kubectl exec</code>로 들어가 결과를 읽으세요. 여기엔 두 가지 교훈이 숨어 있습니다: 설정보다 <i>먼저</i> 파드를 apply하면 <code>CreateContainerConfigError</code>가 나고(참조가 생기면 스스로 회복), Secret은 <b>base64 인코딩</b>일 뿐이라 컨테이너 안에서는 평문입니다.',
    },
    docs: [
      { label: 'ConfigMaps', url: 'https://kubernetes.io/docs/concepts/configuration/configmap/' },
      { label: 'Secrets', url: 'https://kubernetes.io/docs/concepts/configuration/secret/' },
    ],
    starterFiles: { 'app-pod.yaml': APP_POD_YAML },
    setup() { /* an empty cluster is the point: you build the config */ },
    missions: [
      {
        id: 'cfg-cm',
        desc: { en: '🗺 <code>kubectl create configmap app-config --from-literal=APP_COLOR=blue</code>', ko: '🗺 <code>kubectl create configmap app-config --from-literal=APP_COLOR=blue</code>' },
        check: (e) => { const cm = e.get('ConfigMap', 'default', 'app-config'); return !!(cm && cm.data && cm.data.APP_COLOR); },
      },
      {
        id: 'cfg-secret',
        desc: { en: '🔑 <code>kubectl create secret generic db-secret --from-literal=password=…</code> — then peek: <code>kubectl get secret db-secret -o yaml</code> (base64!)', ko: '🔑 <code>kubectl create secret generic db-secret --from-literal=password=…</code> — 그리고 <code>kubectl get secret db-secret -o yaml</code>로 들여다보세요 (base64!)' },
        check: (e) => { const s = e.get('Secret', 'default', 'db-secret'); return !!(s && s.data && s.data.password); },
      },
      {
        id: 'cfg-pod',
        desc: { en: '🚀 <code>kubectl apply -f app-pod.yaml</code> — pod <code>app</code> Running &amp; Ready (apply it first and watch <code>CreateContainerConfigError</code> resolve itself)', ko: '🚀 <code>kubectl apply -f app-pod.yaml</code> — 파드 <code>app</code>이 Running &amp; Ready (먼저 apply해서 <code>CreateContainerConfigError</code>가 저절로 풀리는 것도 구경해 보세요)' },
        check: (e) => { const p = e.get('Pod', 'default', 'app'); return !!(p && p.status.ready); },
      },
      {
        id: 'cfg-exec',
        desc: { en: '🔍 Prove it from inside: <code>kubectl exec app -- env</code> (find APP_COLOR) and <code>kubectl exec app -- cat /etc/creds/password</code> (plain text!)', ko: '🔍 안에서 증명하세요: <code>kubectl exec app -- env</code>(APP_COLOR 찾기) 그리고 <code>kubectl exec app -- cat /etc/creds/password</code> (평문!)' },
        check: (e, flags) => !!(flags && flags.has('cfg-env') && flags.has('cfg-cat')),
      },
    ],
    solve(sim, run, settle) {
      run('kubectl create configmap app-config --from-literal=APP_COLOR=blue');
      run('kubectl create secret generic db-secret --from-literal=password=hunter2');
      run('kubectl apply -f app-pod.yaml');
      settle(10);
      run('kubectl exec app -- env');
      run('kubectl exec app -- cat /etc/creds/password');
    },
  },
];

export const CKAD_MISSION_TOTAL = CKAD_LABS.reduce((s, l) => s + l.missions.length, 0);
