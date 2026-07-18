import { SCENARIOS } from './scenarios.js';

/**
 * Incident mode — the "3am pager" (improvement-plan step 18).
 *
 * A page fires with a SYMPTOM only, never the diagnosis: the Troubleshooting
 * Gym tells you what is broken, this tells you what the user reported. You
 * work the cluster, declare a root cause (that stops the time-to-diagnose
 * clock), fix it, and the scenario's own graded `checks` close the incident.
 *
 * The fault pool is SCENARIOS: every entry already ships a `setup`, graded
 * `checks` and a test-proven `solve`. What incident mode adds per scenario is
 * the page text and a root-cause label — and because every label is a
 * candidate answer for every other incident, the distractors are always
 * plausible cluster failures rather than invented wrong answers.
 *
 * Pure functions; the React runner lives in modules/ObsLabs.jsx.
 */

/** Per scenario: what the pager said, and the one-line root cause you must name. */
export const INCIDENT_INFO = {
  'image-typo': {
    page: { en: 'Deploy went out 10 minutes ago. <b>web</b> is serving nothing and no pod ever became Ready.', ko: '10분 전 배포가 나갔습니다. <b>web</b>이 아무것도 서빙하지 않고, 어떤 파드도 Ready가 된 적이 없습니다.' },
    cause: { en: 'The image name or tag does not exist in the registry', ko: '레지스트리에 없는 이미지 이름/태그' },
  },
  crashloop: {
    page: { en: 'Restart count on <b>web</b> is climbing every minute. Nothing is serving traffic.', ko: '<b>web</b>의 재시작 횟수가 매분 올라갑니다. 트래픽을 받는 게 없습니다.' },
    cause: { en: 'The container command exits immediately, so the kubelet keeps restarting it', ko: '컨테이너 명령이 즉시 종료되어 kubelet이 계속 재시작함' },
  },
  'svc-selector': {
    page: { en: 'Customers get connection refused through the <b>web</b> Service, but every pod looks healthy.', ko: '<b>web</b> Service로 연결이 거부되는데 파드는 모두 정상으로 보입니다.' },
    cause: { en: "The Service selector does not match the pods' labels, so it has no endpoints", ko: 'Service 셀렉터가 파드 라벨과 맞지 않아 엔드포인트가 비어 있음' },
  },
  'svc-targetport': {
    page: { en: 'The <b>web</b> Service has endpoints and the pods are Ready, but every request times out.', ko: '<b>web</b> Service에 엔드포인트도 있고 파드도 Ready인데 모든 요청이 타임아웃됩니다.' },
    cause: { en: 'The Service targetPort points at a port the container is not listening on', ko: 'Service targetPort가 컨테이너가 듣지 않는 포트를 가리킴' },
  },
  'pending-capacity': {
    page: { en: 'A scale-up is stuck: new <b>web</b> pods have sat in Pending for 20 minutes.', ko: '스케일 업이 멈췄습니다: 새 <b>web</b> 파드가 20분째 Pending입니다.' },
    cause: { en: 'No node has enough allocatable resources for the pod requests', ko: '파드 요청을 감당할 여유 자원을 가진 노드가 없음' },
  },
  'cordoned-node': {
    page: { en: 'Half the replicas will not schedule. The cluster has capacity — we checked.', ko: '레플리카 절반이 스케줄되지 않습니다. 클러스터에 여유는 있습니다 — 확인했습니다.' },
    cause: { en: 'A node was left cordoned (unschedulable) after maintenance', ko: '점검 후 노드가 cordon(스케줄 불가) 상태로 남음' },
  },
  'bare-pod': {
    page: { en: 'The <b>web</b> pod vanished during a node drain and nothing brought it back.', ko: '노드 drain 중에 <b>web</b> 파드가 사라졌고 아무도 되살리지 않았습니다.' },
    cause: { en: 'The pod has no controller, so nothing recreates it when it dies', ko: '파드에 컨트롤러가 없어 죽어도 아무도 재생성하지 않음' },
  },
  'wrong-namespace': {
    page: { en: "The app cannot reach its database. The DBA insists the database is up — they can see it.", ko: '앱이 데이터베이스에 접근하지 못합니다. DBA는 DB가 살아 있다고 합니다 — 실제로 보인다고요.' },
    cause: { en: 'The workload is looking in the wrong namespace', ko: '워크로드가 잘못된 네임스페이스를 보고 있음' },
  },
  'readiness-probe': {
    page: { en: '<b>web</b> pods are Running with zero restarts, yet the Service has no endpoints.', ko: '<b>web</b> 파드는 재시작 0회로 Running인데 Service에 엔드포인트가 없습니다.' },
    cause: { en: 'The readiness probe never passes, so the pods are kept out of endpoints', ko: 'readiness 프로브가 통과하지 못해 파드가 엔드포인트에서 제외됨' },
  },
  'taint-untolerated': {
    page: { en: 'Pods are Pending on a cluster that is mostly idle. Nothing in `top` looks busy.', ko: '거의 유휴 상태인 클러스터에서 파드가 Pending입니다. `top`에는 바쁜 게 없습니다.' },
    cause: { en: 'The only candidate nodes carry a taint the pod does not tolerate', ko: '유일한 후보 노드에 파드가 감내하지 않는 taint가 있음' },
  },
  rollback: {
    page: { en: 'Error rate went vertical right after the 14:02 deploy. Revenue is affected.', ko: '14:02 배포 직후 에러율이 수직 상승했습니다. 매출에 영향이 있습니다.' },
    cause: { en: 'A bad revision was rolled out and needs to be rolled back', ko: '잘못된 리비전이 배포되어 롤백이 필요함' },
  },
};

/** Every scenario that has page + root-cause text is pageable. */
export const INCIDENTS = SCENARIOS.filter((s) => INCIDENT_INFO[s.id]).map((s) => ({
  ...s,
  page: INCIDENT_INFO[s.id].page,
  cause: INCIDENT_INFO[s.id].cause,
}));

/** Pick one incident at random, avoiding the ids in `exclude` until the pool runs dry. */
export function pickIncident(rand = Math.random, exclude = []) {
  const fresh = INCIDENTS.filter((i) => !exclude.includes(i.id));
  const pool = fresh.length ? fresh : INCIDENTS;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}

/**
 * The root-cause choices for one incident: the true cause plus `distractors`
 * real causes borrowed from other incidents, shuffled deterministically.
 */
export function causeChoices(incident, rand = Math.random, distractors = 3) {
  const others = INCIDENTS.filter((i) => i.id !== incident.id);
  const picked = [];
  const pool = [...others];
  while (picked.length < distractors && pool.length) {
    picked.push(...pool.splice(Math.floor(rand() * pool.length), 1));
  }
  const choices = [incident, ...picked].map((i) => ({ id: i.id, label: i.cause }));
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return choices;
}

/** How fast is fast? Bands for the two clocks, in seconds. */
export const MTTR_BANDS = [
  { max: 120, grade: 'A', label: { en: 'On-call ready', ko: '온콜 준비 완료' } },
  { max: 300, grade: 'B', label: { en: 'Solid', ko: '무난' } },
  { max: 600, grade: 'C', label: { en: 'Getting there', ko: '더 연습' } },
  { max: Infinity, grade: 'D', label: { en: 'Keep drilling', ko: '계속 훈련' } },
];

export const bandFor = (secs) => MTTR_BANDS.find((b) => secs <= b.max);

/**
 * Grade one incident.
 * `diagnosedMs` — page → root cause declared (null if never declared)
 * `resolvedMs`  — page → every check passing (null if never resolved)
 * `causeCorrect`— whether the declared root cause was the right one
 */
export function gradeIncident({ incident, engine, sim, diagnosedMs, resolvedMs, causeCorrect }) {
  const results = incident.checks.map((c) => {
    try { return !!c.test(engine, sim); } catch { return false; }
  });
  const fixed = results.every(Boolean);
  const ttd = diagnosedMs == null ? null : Math.round(diagnosedMs / 1000);
  const ttr = resolvedMs == null ? null : Math.round(resolvedMs / 1000);
  return {
    id: incident.id,
    results,
    fixed,
    causeCorrect: !!causeCorrect,
    timeToDiagnose: ttd,
    timeToResolve: ttr,
    // the headline: you only get a band if you both named it and fixed it
    band: fixed && causeCorrect && ttr != null ? bandFor(ttr) : null,
  };
}
