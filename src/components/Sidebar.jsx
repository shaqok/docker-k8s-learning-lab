import { useLang } from '../i18n/LanguageContext.jsx';
import { MODULE_SLUGS } from '../router.js';
import { useProgress } from '../context/ProgressContext.jsx';
import { ROADMAP_EN } from '../data/roadmap.js';
import { content } from '../content/index.js';
import { SCENARIOS } from '../data/scenarios.js';
import { CKAD_MISSION_TOTAL } from '../data/ckadLabs.js';
import { CKA_MISSION_TOTAL } from '../data/ckaLabs.js';
import { NET_MISSION_TOTAL } from '../data/netLabs.js';
import { OPS_MISSION_TOTAL } from '../data/opsLabs.js';
import { DOCKER_MISSION_TOTAL } from '../data/dockerLabs.js';
import { POD_MISSION_TOTAL } from '../data/podLabs.js';
import { STORAGE_MISSION_TOTAL } from '../data/storageLabs.js';
import { PACKAGING_MISSION_TOTAL } from '../data/packagingLabs.js';
import { SECURITY_MISSION_TOTAL } from '../data/securityLabs.js';

const RM_TOTAL = ROADMAP_EN.reduce((s, st) => s + st.items.length, 0);
const DOCKER_TOTAL = content.en.m2.missions.length;
const K8S_TOTAL = content.en.m4.missions.length;
const SCEN_TOTAL = SCENARIOS.length;

const NAV = [
  { id: 'm0', label: { en: '🗺️ Roadmap', ko: '🗺️ 로드맵' }, pill: 'road' },
  { sec: { en: 'Stage 1 · Foundations', ko: '1단계 · 기초' } },
  { id: 'm1', label: { en: 'Containers 101', ko: '컨테이너 101' } },
  { id: 'm2', label: { en: 'Docker Lab', ko: 'Docker 실습' }, pill: 'docker' },
  { sec: { en: 'Stage 2 · Docker Pro', ko: '2단계 · Docker 심화' } },
  { id: 'm7', label: { en: 'Docker in Depth', ko: 'Docker 깊이 보기' } },
  { id: 'm16', label: { en: '🐳 Docker Drills', ko: '🐳 Docker 드릴' }, pill: 'dockerdrill' },
  { sec: { en: 'Stage 3 · K8s Core', ko: '3단계 · K8s 핵심' } },
  { id: 'm3', label: { en: 'K8s Concepts', ko: 'K8s 개념' } },
  { id: 'm4', label: { en: 'K8s Lab', ko: 'K8s 실습' }, pill: 'k8s' },
  { sec: { en: 'Stage 4 · K8s Operator', ko: '4단계 · K8s 운영' } },
  { id: 'm8', label: { en: 'Operator Toolkit', ko: '운영 툴킷' } },
  { sec: { en: 'Stage 5 · Expert', ko: '5단계 · 전문가' } },
  { id: 'm9', label: { en: 'Production & Ecosystem', ko: '프로덕션 & 생태계' } },
  { sec: { en: 'Stage 6 · GPU / ML', ko: '6단계 · GPU / ML' } },
  { id: 'm5', label: { en: 'GPUs in Containers', ko: '컨테이너 속 GPU' } },
  { sec: { en: 'Certify · CKA/CKAD', ko: '자격증 · CKA/CKAD' } },
  { id: 'm10', label: { en: '🔧 Troubleshooting', ko: '🔧 트러블슈팅' }, pill: 'scen' },
  { id: 'm11', label: { en: '🎯 CKAD Drills', ko: '🎯 CKAD 드릴' }, pill: 'ckad' },
  { id: 'm12', label: { en: '🧲 CKA Drills', ko: '🧲 CKA 드릴' }, pill: 'cka' },
  { id: 'm13', label: { en: '🌐 Networking Drills', ko: '🌐 네트워킹 드릴' }, pill: 'net' },
  { id: 'm14', label: { en: '🛠 Cluster Ops Drills', ko: '🛠 클러스터 운영 드릴' }, pill: 'ops' },
  { id: 'm17', label: { en: '🧩 Pod Design', ko: '🧩 파드 설계' }, pill: 'pod' },
  { id: 'm18', label: { en: '💾 Storage Drills', ko: '💾 스토리지 드릴' }, pill: 'storage' },
  { id: 'm19', label: { en: '📦 Packaging & GitOps', ko: '📦 패키징 & GitOps' }, pill: 'pkg' },
  { id: 'm20', label: { en: '🔐 Security Drills', ko: '🔐 보안 드릴' }, pill: 'sec' },
  { sec: { en: 'Check yourself', ko: '최종 점검' } },
  { id: 'm15', label: { en: '🎓 Exam Room', ko: '🎓 시험장' }, pill: 'exam' },
  { id: 'm6', label: { en: 'Quiz', ko: '퀴즈' } },
];

export default function Sidebar({ active, setActive }) {
  const { lang, toggle } = useLang();
  const { dockerDone, k8sDone, roadmap, scenariosDone, ckadDone, ckaDone, netDone, opsDone, dockerDrillDone, podDone, storageDone, packagingDone, securityDone, examResults } = useProgress();

  const roadPct = Math.round((Object.values(roadmap).filter(Boolean).length / RM_TOTAL) * 100);
  const ckadCount = Object.values(ckadDone).reduce((s, ids) => s + ids.length, 0);
  const ckaCount = Object.values(ckaDone).reduce((s, ids) => s + ids.length, 0);
  const netCount = Object.values(netDone).reduce((s, ids) => s + ids.length, 0);
  const opsCount = Object.values(opsDone).reduce((s, ids) => s + ids.length, 0);
  const dockerDrillCount = Object.values(dockerDrillDone).reduce((s, ids) => s + ids.length, 0);
  const podCount = Object.values(podDone).reduce((s, ids) => s + ids.length, 0);
  const storageCount = Object.values(storageDone).reduce((s, ids) => s + ids.length, 0);
  const packagingCount = Object.values(packagingDone).reduce((s, ids) => s + ids.length, 0);
  const securityCount = Object.values(securityDone).reduce((s, ids) => s + ids.length, 0);
  const pills = {
    road: { text: roadPct + '%', done: roadPct === 100 },
    docker: { text: dockerDone.length + '/' + DOCKER_TOTAL, done: dockerDone.length === DOCKER_TOTAL },
    dockerdrill: { text: dockerDrillCount + '/' + DOCKER_MISSION_TOTAL, done: dockerDrillCount === DOCKER_MISSION_TOTAL },
    k8s: { text: k8sDone.length + '/' + K8S_TOTAL, done: k8sDone.length === K8S_TOTAL },
    scen: { text: scenariosDone.length + '/' + SCEN_TOTAL, done: scenariosDone.length === SCEN_TOTAL },
    ckad: { text: ckadCount + '/' + CKAD_MISSION_TOTAL, done: ckadCount === CKAD_MISSION_TOTAL },
    cka: { text: ckaCount + '/' + CKA_MISSION_TOTAL, done: ckaCount === CKA_MISSION_TOTAL },
    net: { text: netCount + '/' + NET_MISSION_TOTAL, done: netCount === NET_MISSION_TOTAL },
    ops: { text: opsCount + '/' + OPS_MISSION_TOTAL, done: opsCount === OPS_MISSION_TOTAL },
    pod: { text: podCount + '/' + POD_MISSION_TOTAL, done: podCount === POD_MISSION_TOTAL },
    storage: { text: storageCount + '/' + STORAGE_MISSION_TOTAL, done: storageCount === STORAGE_MISSION_TOTAL },
    pkg: { text: packagingCount + '/' + PACKAGING_MISSION_TOTAL, done: packagingCount === PACKAGING_MISSION_TOTAL },
    sec: { text: securityCount + '/' + SECURITY_MISSION_TOTAL, done: securityCount === SECURITY_MISSION_TOTAL },
    exam: (() => {
      const best = examResults.reduce((b, r) => Math.max(b, r.score), 0);
      return { text: examResults.length ? best + '%' : '—', done: examResults.some((r) => r.pass) };
    })(),
  };

  return (
    <nav id="sidebar">
      <h1>
        🐳 Docker &amp; ☸️ K8s <span>{lang === 'ko' ? '랩' : 'Lab'}</span>
      </h1>
      {NAV.map((item, i) =>
        item.sec ? (
          <div key={i} className="navsec">{item.sec[lang]}</div>
        ) : (
          <button
            key={item.id}
            className={'navbtn' + (active === item.id ? ' active' : '')}
            onClick={() => { setActive(item.id); window.scrollTo(0, 0); }}
            title={'#/' + MODULE_SLUGS[item.id]}
          >
            {item.label[lang]}
            {item.pill && (
              <span className={'progress-pill' + (pills[item.pill].done ? ' done' : '')}>{pills[item.pill].text}</span>
            )}
          </button>
        ),
      )}
      <div style={{ padding: '14px 16px' }}>
        <button className="act" style={{ width: '100%' }} onClick={toggle}>
          {lang === 'ko' ? '🇺🇸 View in English' : '🇰🇷 한국어로 보기'}
        </button>
      </div>
    </nav>
  );
}
