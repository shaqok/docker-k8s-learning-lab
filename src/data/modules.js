/**
 * The single module registry — id, bilingual title, icon, URL slug, which
 * sidebar section it sits in, which progress pill measures it, and which
 * modules should come first.
 *
 * Before this file the same facts lived in four hand-synced places:
 * App.jsx (id → component), Sidebar.jsx (title/icon/order/section/pill),
 * router.js (id → slug) and roadmap.js (MODNAMES, a second title table).
 * Everything except the id → component map (which needs JSX, so it stays in
 * App.jsx) now reads from here.
 *
 * `requires` is a teaching order, not a hard dependency: gating is advisory
 * (see pedagogy.js), so a module with unmet prerequisites is marked, never
 * blocked. Keep it shallow — one or two genuinely-prior modules, not a
 * transitive closure, which the fold computes anyway.
 */

/** Sidebar section headings, in display order. */
export const SECTIONS = {
  foundations: { en: 'Stage 1 · Foundations', ko: '1단계 · 기초' },
  dockerPro: { en: 'Stage 2 · Docker Pro', ko: '2단계 · Docker 심화' },
  k8sCore: { en: 'Stage 3 · K8s Core', ko: '3단계 · K8s 핵심' },
  k8sOps: { en: 'Stage 4 · K8s Operator', ko: '4단계 · K8s 운영' },
  expert: { en: 'Stage 5 · Expert', ko: '5단계 · 전문가' },
  gpu: { en: 'Stage 6 · GPU / ML', ko: '6단계 · GPU / ML' },
  certify: { en: 'Certify · CKA/CKAD/CKS', ko: '자격증 · CKA/CKAD/CKS' },
  check: { en: 'Check yourself', ko: '최종 점검' },
};

/**
 * Registry order == default sidebar order. `pill` names the progress counter
 * in pedagogy.js `moduleStats()`; a module with no pill is a reading module,
 * and counts as done once visited.
 */
export const MODULES = [
  { id: 'm0', slug: 'roadmap', icon: '🗺️', title: { en: 'Roadmap', ko: '로드맵' }, section: null, pill: 'road', requires: [] },

  { id: 'm1', slug: 'containers', icon: '', title: { en: 'Containers 101', ko: '컨테이너 101' }, section: 'foundations', pill: null, requires: [] },
  { id: 'm2', slug: 'docker-lab', icon: '', title: { en: 'Docker Lab', ko: 'Docker 실습' }, section: 'foundations', pill: 'docker', requires: ['m1'] },

  { id: 'm7', slug: 'docker-depth', icon: '', title: { en: 'Docker in Depth', ko: 'Docker 깊이 보기' }, section: 'dockerPro', pill: null, requires: ['m2'] },
  { id: 'm16', slug: 'docker-drills', icon: '🐳', title: { en: 'Docker Drills', ko: 'Docker 드릴' }, section: 'dockerPro', pill: 'dockerdrill', requires: ['m7'] },

  { id: 'm3', slug: 'k8s-concepts', icon: '', title: { en: 'K8s Concepts', ko: 'K8s 개념' }, section: 'k8sCore', pill: null, requires: ['m2'] },
  { id: 'm4', slug: 'k8s-lab', icon: '', title: { en: 'K8s Lab', ko: 'K8s 실습' }, section: 'k8sCore', pill: 'k8s', requires: ['m3'] },

  { id: 'm8', slug: 'operator-toolkit', icon: '', title: { en: 'Operator Toolkit', ko: '운영 툴킷' }, section: 'k8sOps', pill: null, requires: ['m4'] },

  { id: 'm9', slug: 'production', icon: '', title: { en: 'Production & Ecosystem', ko: '프로덕션 & 생태계' }, section: 'expert', pill: null, requires: ['m8'] },

  { id: 'm5', slug: 'gpu', icon: '', title: { en: 'GPUs in Containers', ko: '컨테이너 속 GPU' }, section: 'gpu', pill: null, requires: ['m4'] },

  { id: 'm10', slug: 'troubleshooting', icon: '🔧', title: { en: 'Troubleshooting', ko: '트러블슈팅' }, section: 'certify', pill: 'scen', requires: ['m4'] },
  { id: 'm11', slug: 'ckad-drills', icon: '🎯', title: { en: 'CKAD Drills', ko: 'CKAD 드릴' }, section: 'certify', pill: 'ckad', requires: ['m4'] },
  { id: 'm12', slug: 'cka-drills', icon: '🧲', title: { en: 'CKA Drills', ko: 'CKA 드릴' }, section: 'certify', pill: 'cka', requires: ['m4'] },
  { id: 'm13', slug: 'net-drills', icon: '🌐', title: { en: 'Networking Drills', ko: '네트워킹 드릴' }, section: 'certify', pill: 'net', requires: ['m4'] },
  { id: 'm14', slug: 'ops-drills', icon: '🛠', title: { en: 'Cluster Ops Drills', ko: '클러스터 운영 드릴' }, section: 'certify', pill: 'ops', requires: ['m12'] },
  { id: 'm17', slug: 'pod-labs', icon: '🧩', title: { en: 'Pod Design', ko: '파드 설계' }, section: 'certify', pill: 'pod', requires: ['m4'] },
  { id: 'm18', slug: 'storage-labs', icon: '💾', title: { en: 'Storage Drills', ko: '스토리지 드릴' }, section: 'certify', pill: 'storage', requires: ['m17'] },
  { id: 'm19', slug: 'packaging-gitops', icon: '📦', title: { en: 'Packaging & GitOps', ko: '패키징 & GitOps' }, section: 'certify', pill: 'pkg', requires: ['m4'] },
  { id: 'm20', slug: 'security-drills', icon: '🔐', title: { en: 'Security Drills', ko: '보안 드릴' }, section: 'certify', pill: 'sec', requires: ['m12', 'm13'] },
  { id: 'm21', slug: 'observability', icon: '📟', title: { en: 'Observability & Incidents', ko: '관측성 & 장애 대응' }, section: 'certify', pill: 'obs', requires: ['m10'] },

  { id: 'm15', slug: 'exam-room', icon: '🎓', title: { en: 'Exam Room', ko: '시험장' }, section: 'check', pill: 'exam', requires: ['m10'] },
  { id: 'm6', slug: 'quiz', icon: '', title: { en: 'Quiz', ko: '퀴즈' }, section: 'check', pill: null, requires: [] },
];

const BY_ID = Object.fromEntries(MODULES.map((m) => [m.id, m]));

export const moduleById = (id) => BY_ID[id] || null;

/** Sidebar/roadmap display name: '🎯 CKAD Drills'. */
export const moduleLabel = (id, lang) => {
  const m = BY_ID[id];
  if (!m) return id;
  return (m.icon ? m.icon + ' ' : '') + m.title[lang];
};
