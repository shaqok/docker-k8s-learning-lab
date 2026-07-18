import { rid } from '../sims/util.js';
import { sloOf } from '../sims/k8s/slo.js';

/**
 * Observability drill labs (improvement-plan step 18): logs, events and
 * metrics/SLO. Same `{id, setup, missions[], solve}` shape as the other drill
 * sets, run by the shared LabRunner, graded live against engine state.
 *
 * These labs deliberately never say which pod is broken — the whole point is
 * that you find it with `kubectl logs` / `get events` / `top` instead.
 */

const K8S_D = 'https://kubernetes.io/docs';
const SLO_TARGET = 90;

/** Seed pods for a deployment as already-scheduled, so a fault can be injected per pod. */
function seedPods(engine, dep, n, override = null) {
  const c = dep.spec.template.spec.containers[0];
  const out = [];
  for (let i = 0; i < n; i++) {
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

const podsOf = (engine, name, ns = 'default') =>
  engine.list('Pod', { ns }).filter((p) => p.sim.owner === ns + '/' + name && p.status.state !== 'Terminating');

/**
 * Make one replica serve 503s: readiness failing, with the log line and the
 * event that say so. Exported because the Metrics lab's panel button injects
 * exactly the same fault the reference solution does.
 */
export function makeSick(engine, pod) {
  pod.sim.app = '503';
  pod.sim.appBadSince = Date.now() - 60000;
  pod.sim.unreadyByApp = true;
  pod.status.ready = false;
  const cs0 = pod.status.containerStatuses[0];
  if (cs0) cs0.ready = false;
  const c = pod.spec.containers[0];
  engine.podLog(pod, c.name, 'ERROR upstream payments-api: connection refused');
  engine.podLog(pod, c.name, 'WARN readiness probe failing — returning HTTP 503');
  engine.addEvent({
    ns: pod.metadata.namespace, type: 'Warning', reason: 'Unhealthy',
    object: 'Pod/' + pod.metadata.name,
    message: 'Readiness probe failed: HTTP probe failed with statuscode: 503',
  });
  engine.notify();
}

/* ---------------- 1 · Logs ---------------- */

const logsLab = {
  id: 'logs',
  tab: { en: '📜 Logs', ko: '📜 로그' },
  title: { en: 'Logs — the only place the app speaks for itself', ko: '로그 — 앱이 스스로 말하는 유일한 곳' },
  brief: {
    en: 'Two workloads are unhappy and <code>kubectl get pods</code> barely hints at it. <b>One <code>checkout</code> replica serves 503s</b> — the pod is Running, so only its log names the cause. <b><code>payments</code> is CrashLoopBackOff</b> — its current container has nothing to say, because the instance that <i>died</i> is the one holding the error: that is what <code>--previous</code> is for. Logs accumulate as the cluster runs, so <code>--tail</code>, <code>--since</code> and <code>--timestamps</code> are how you cut them down to the minute that matters.',
    ko: '두 워크로드가 아픈데 <code>kubectl get pods</code>는 거의 알려주지 않습니다. <b><code>checkout</code> 레플리카 하나가 503을 반환</b>합니다 — 파드는 Running이라 원인은 로그에만 있습니다. <b><code>payments</code>는 CrashLoopBackOff</b>입니다 — 지금 컨테이너는 할 말이 없습니다. 에러를 쥐고 있는 건 <i>죽은</i> 인스턴스이기 때문입니다. 그게 <code>--previous</code>의 존재 이유입니다. 로그는 클러스터가 도는 동안 쌓이므로, <code>--tail</code>·<code>--since</code>·<code>--timestamps</code>로 필요한 순간만 잘라내세요.',
  },
  docs: [
    { label: 'kubectl logs', url: K8S_D + '/reference/kubectl/generated/kubectl_logs/' },
    { label: 'Logging architecture', url: K8S_D + '/concepts/cluster-administration/logging/' },
    { label: 'Debug running pods', url: K8S_D + '/tasks/debug/debug-application/debug-running-pod/' },
  ],
  setup(engine) {
    const checkout = engine.makeDeployment({
      name: 'checkout', replicas: 3, image: 'nginx:1.27', containerPort: 80,
      readinessProbe: { httpGet: { path: '/healthz', port: 80 }, periodSeconds: 2, failureThreshold: 3 },
    });
    const pods = seedPods(engine, checkout, 3);
    makeSick(engine, pods[1]);
    engine.makeService({ name: 'checkout', selector: { app: 'checkout' }, port: 80 });

    // seeded already-crashing, like the Troubleshooting scenarios do: the pod has
    // restarted four times, and the instance holding the error is the dead one
    const payments = engine.makeDeployment({
      name: 'payments', replicas: 1, image: 'busybox', command: ['sh', '-c', 'exit 1'],
    });
    seedPods(engine, payments, 1, (p) => {
      const cs = p.status.containerStatuses[0];
      p.status.state = 'CrashLoopBackOff';
      p.status.ready = false;
      p.status.restarts = 4;
      cs.state = 'CrashLoopBackOff';
      cs.ready = false;
      cs.restartCount = 4;
      p.sim.crash = true;
      p.sim.crashLog = ['starting payments worker', 'FATAL: DATABASE_URL is not set — refusing to start'];
      for (const line of p.sim.crashLog) engine.podLog(p, cs.name, line);
      engine.rotateLog(p, cs.name);
    });
  },
  missions: [
    { id: 'read', desc: { en: '📜 Read a pod log: <code>kubectl logs POD</code>', ko: '📜 파드 로그 읽기: <code>kubectl logs POD</code>' },
      check: (e, f) => f.has('logs') },
    { id: 'tail', desc: { en: '✂️ Cut it down: <code>kubectl logs POD --tail=5</code>', ko: '✂️ 줄여 보기: <code>kubectl logs POD --tail=5</code>' },
      check: (e, f) => f.has('logs-tail') },
    { id: 'timestamps', desc: { en: '🕒 Add wall-clock time: <code>kubectl logs POD --timestamps</code>', ko: '🕒 실제 시각 붙이기: <code>kubectl logs POD --timestamps</code>' },
      check: (e, f) => f.has('logs-timestamps') },
    { id: 'previous', desc: { en: "💀 Read the dead instance of the <code>payments</code> pod: <code>kubectl logs POD --previous</code> — it names the missing env var", ko: '💀 <code>payments</code> 파드의 죽은 인스턴스 읽기: <code>kubectl logs POD --previous</code> — 빠진 환경 변수가 적혀 있습니다' },
      check: (e, f) => f.has('logs-previous') },
    { id: 'evict', desc: { en: '🩹 Find the <code>checkout</code> replica whose log shows 503s and delete it — the ReplicaSet replaces it and all 3 go Ready', ko: '🩹 로그에 503이 찍히는 <code>checkout</code> 레플리카를 찾아 삭제하세요 — ReplicaSet이 교체하고 3개 모두 Ready가 됩니다' },
      check: (e) => {
        const pods = podsOf(e, 'checkout');
        return pods.length === 3 && pods.every((p) => p.status.ready);
      } },
  ],
  solve(sim, run, settle) {
    const e = sim.engine;
    const checkout = podsOf(e, 'checkout');
    const sick = checkout.find((p) => p.sim.app === '503') || checkout[0];
    const pay = podsOf(e, 'payments')[0];
    run(`kubectl logs ${sick.metadata.name}`);
    run(`kubectl logs ${sick.metadata.name} --tail=5`);
    run(`kubectl logs ${sick.metadata.name} --timestamps`);
    settle(6); // let the payments container die at least once so it has a previous log
    run(`kubectl logs ${pay.metadata.name} --previous`);
    run(`kubectl delete pod ${sick.metadata.name}`);
    settle(8);
  },
};

/* ---------------- 2 · Events ---------------- */

const eventsLab = {
  id: 'events',
  tab: { en: '📅 Events', ko: '📅 이벤트' },
  title: { en: 'Events — the cluster narrating itself, with counts', ko: '이벤트 — 클러스터의 자기 서술, 그리고 횟수' },
  brief: {
    en: "Events are what the control plane says about your objects, and the column everyone forgets is <b>COUNT</b>: a repeat doesn't get a new row, it bumps an existing one. So a pod that has failed 40 times looks like one line — until you sort by count. <code>cart</code> can't pull its image and <code>worker</code> keeps dying; both are shouting. Sort and filter the noise down, then fix <code>cart</code>'s image tag.",
    ko: "이벤트는 컨트롤 플레인이 오브젝트에 대해 남기는 말이고, 다들 잊는 열이 <b>COUNT</b>입니다: 반복은 새 줄이 아니라 기존 줄의 횟수를 올립니다. 그래서 40번 실패한 파드도 한 줄로 보입니다 — count로 정렬하기 전까지는. <code>cart</code>는 이미지를 못 받고 <code>worker</code>는 계속 죽습니다. 정렬과 필터로 소음을 줄이고 <code>cart</code>의 이미지 태그를 고치세요.",
  },
  docs: [
    { label: 'kubectl get events', url: K8S_D + '/reference/kubectl/generated/kubectl_get/' },
    { label: 'Application introspection', url: K8S_D + '/tasks/debug/debug-application/debug-running-pod/' },
  ],
  setup(engine) {
    engine.makeDeployment({ name: 'cart', replicas: 2, image: 'ngnix:1.27' }); // transposed name → no such image
    // left to the controller on purpose: its pod runs the real crash cycle, and
    // every loop re-fires the SAME BackOff message — which is what makes COUNT climb
    engine.makeDeployment({ name: 'worker', replicas: 1, image: 'busybox', command: ['sh', '-c', 'exit 1'] });
  },
  missions: [
    { id: 'list', desc: { en: '📅 <code>kubectl get events</code> — note the COUNT column', ko: '📅 <code>kubectl get events</code> — COUNT 열을 보세요' },
      check: (e, f) => f.has('events') },
    { id: 'storm', desc: { en: '🌩 Let it run: one event repeats until its COUNT reaches 3 (repeats aggregate, they do not stack up as new rows)', ko: '🌩 잠시 두세요: 한 이벤트의 COUNT가 3에 도달합니다 (반복은 새 줄이 아니라 합산됩니다)' },
      check: (e) => e.events.some((ev) => (ev.count || 1) >= 3) },
    { id: 'sort', desc: { en: '🔢 Rank the noise: <code>kubectl get events --sort-by=.count</code>', ko: '🔢 소음 순위: <code>kubectl get events --sort-by=.count</code>' },
      check: (e, f) => f.has('events-sorted:count') },
    { id: 'filter', desc: { en: '🔎 Warnings only: <code>kubectl get events --field-selector type=Warning</code>', ko: '🔎 경고만: <code>kubectl get events --field-selector type=Warning</code>' },
      check: (e, f) => f.has('events-filtered') },
    { id: 'fix-cart', desc: { en: '🩹 The events name the image that will not pull — fix the tag so both <code>cart</code> replicas run', ko: '🩹 이벤트에 받지 못한 이미지가 적혀 있습니다 — 태그를 고쳐 <code>cart</code> 레플리카 2개를 모두 실행하세요' },
      check: (e) => {
        const pods = podsOf(e, 'cart');
        return pods.length === 2 && pods.every((p) => p.status.ready);
      } },
  ],
  solve(sim, run, settle) {
    settle(8); // let the crash loop and the pull failures repeat, so COUNT climbs
    run('kubectl get events');
    run('kubectl get events --sort-by=.count');
    run('kubectl get events --field-selector type=Warning');
    run('kubectl set image deployment/cart ngnix=nginx:1.27');
    settle(12);
  },
};

/* ---------------- 3 · Metrics & SLO ---------------- */

const metricsLab = {
  id: 'metrics',
  tab: { en: '📈 Metrics & SLO', ko: '📈 메트릭과 SLO' },
  title: { en: 'Metrics & SLO — is it actually broken, or just loud?', ko: '메트릭과 SLO — 진짜 고장인가, 그냥 시끄러운가?' },
  brief: {
    en: `<code>kubectl top</code> answers "what is it using"; an <b>SLO</b> answers "does the user care". The panel tracks availability over the last samples of every <code>api</code> replica against a <b>${SLO_TARGET}% target</b> — the error budget is the ${100 - SLO_TARGET}% left over, and burning past 1.0 is what should page you. Use the panel buttons to <b>spike CPU</b> on one replica and to <b>break</b> another, then tell the two apart: a CPU spike is loud in <code>top</code> but serves fine and burns nothing; the broken one is invisible in <code>top</code> and eats the whole budget. Only one of them is worth waking up for.`,
    ko: `<code>kubectl top</code>은 "무엇을 쓰는가"에 답하고, <b>SLO</b>는 "사용자가 신경 쓰는가"에 답합니다. 패널은 모든 <code>api</code> 레플리카의 최근 샘플로 가용성을 <b>${SLO_TARGET}% 목표</b>와 비교합니다 — 에러 버짓은 남은 ${100 - SLO_TARGET}%이고, 1.0을 넘기면 호출을 받아야 합니다. 패널 버튼으로 한 레플리카의 <b>CPU를 튀기고</b> 다른 하나를 <b>고장</b> 낸 뒤 둘을 구분하세요: CPU 스파이크는 <code>top</code>에서 시끄럽지만 서빙은 정상이고 버짓을 쓰지 않습니다. 고장 난 쪽은 <code>top</code>에서 안 보이지만 버짓을 다 씁니다. 새벽에 깨어날 가치가 있는 건 하나뿐입니다.`,
  },
  docs: [
    { label: 'kubectl top', url: K8S_D + '/reference/kubectl/generated/kubectl_top/' },
    { label: 'Resource metrics pipeline', url: K8S_D + '/tasks/debug/debug-cluster/resource-metrics-pipeline/' },
    { label: 'SRE workbook — implementing SLOs', url: 'https://sre.google/workbook/implementing-slos/' },
  ],
  setup(engine) {
    const api = engine.makeDeployment({
      name: 'api', replicas: 3, image: 'nginx:1.27', containerPort: 80,
      readinessProbe: { httpGet: { path: '/healthz', port: 80 }, periodSeconds: 2, failureThreshold: 3 },
      resources: { requests: { cpu: '100m', memory: '64Mi' } },
    });
    seedPods(engine, api, 3); // starts healthy — the panel buttons inject the faults
    engine.makeService({ name: 'api', selector: { app: 'api' }, port: 80 });
  },
  missions: [
    { id: 'top', desc: { en: '📈 <code>kubectl top pods</code> — live CPU and memory per pod', ko: '📈 <code>kubectl top pods</code> — 파드별 실시간 CPU와 메모리' },
      check: (e, f) => f.has('top') },
    { id: 'spike', desc: { en: '🔥 Spike a replica with the panel button, then find it: <code>kubectl top pods --sort-by=cpu</code>', ko: '🔥 패널 버튼으로 한 레플리카의 CPU를 튀긴 뒤 찾으세요: <code>kubectl top pods --sort-by=cpu</code>' },
      check: (e, f) => f.has('top-sorted:cpu') && podsOf(e, 'api').some((p) => (p.sim.load || 1) > 1) },
    { id: 'breach', desc: { en: `🚨 Break a replica with the panel button and watch the SLO fall under ${SLO_TARGET}% — budget burn goes over 1.0, while <code>top</code> shows nothing unusual`, ko: `🚨 패널 버튼으로 한 레플리카를 고장 내고 SLO가 ${SLO_TARGET}% 아래로 떨어지는 걸 보세요 — 버짓 소모가 1.0을 넘지만 <code>top</code>에는 이상이 없습니다` },
      check: (e) => {
        const s = sloOf(e, { selector: { app: 'api' }, target: SLO_TARGET });
        return s.samples > 0 && s.budgetBurn != null && s.budgetBurn > 1;
      } },
    { id: 'restore', desc: { en: `✅ The CPU hog is serving fine — leave it. Delete the replica that is NOT Ready and bring availability back over ${SLO_TARGET}%`, ko: `✅ CPU를 태우는 파드는 정상 서빙 중이니 두세요. Ready가 아닌 레플리카를 삭제해 가용성을 ${SLO_TARGET}% 위로 되돌리세요` },
      check: (e) => {
        const pods = podsOf(e, 'api');
        if (pods.length !== 3 || !pods.every((p) => p.status.ready)) return false;
        // "recovered" only counts if something was ever wrong — a lab that was
        // never broken has not taught the recovery
        if (!e.events.some((ev) => ev.reason === 'Unhealthy')) return false;
        return sloOf(e, { selector: { app: 'api' }, target: SLO_TARGET }).meeting;
      } },
  ],
  solve(sim, run, settle) {
    const e = sim.engine;
    settle(4); // take enough samples for the SLO window to be meaningful
    const pods = podsOf(e, 'api');
    e.setLoad(pods[2], 8);        // the loud one
    makeSick(e, pods[0]);          // the broken one
    settle(10);
    run('kubectl top pods');
    run('kubectl top pods --sort-by=cpu');
    const sick = podsOf(e, 'api').find((p) => !p.status.ready);
    if (sick) run(`kubectl delete pod ${sick.metadata.name}`);
    settle(20); // the replacement fills its window with Ready samples
  },
};

export const OBS_LABS = [logsLab, eventsLab, metricsLab];
export const OBS_MISSION_TOTAL = OBS_LABS.reduce((s, l) => s + l.missions.length, 0);
export { SLO_TARGET };
