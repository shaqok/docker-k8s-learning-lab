/**
 * The official CKA / CKAD exam domains (2026 blueprints, K8s v1.35) — the
 * spine of the Certify layer. Quiz questions, mock-exam tasks, and the
 * practice modules all tag themselves with the flat domain ids below;
 * the readiness dashboard folds those signals per exam using these weights.
 */

export const DOMAIN_LABELS = {
  // CKA
  arch: { en: 'Cluster Architecture, Installation & Configuration', ko: '클러스터 아키텍처, 설치 & 구성' },
  workloads: { en: 'Workloads & Scheduling', ko: '워크로드 & 스케줄링' },
  storage: { en: 'Storage', ko: '스토리지' },
  troubleshooting: { en: 'Troubleshooting', ko: '트러블슈팅' },
  // shared (both exams)
  net: { en: 'Services & Networking', ko: '서비스 & 네트워킹' },
  // CKAD
  design: { en: 'Application Design and Build', ko: '애플리케이션 설계와 빌드' },
  deploy: { en: 'Application Deployment', ko: '애플리케이션 배포' },
  observe: { en: 'Application Observability and Maintenance', ko: '애플리케이션 관측과 유지보수' },
  env: { en: 'App Environment, Configuration and Security', ko: '앱 환경, 구성과 보안' },
  // not part of either exam — Docker/GPU foundations questions
  foundations: { en: 'Container Foundations (not on the exams)', ko: '컨테이너 기초 (시험 범위 밖)' },
  // CKS
  clusterSetup: { en: 'Cluster Setup', ko: '클러스터 설정' },
  clusterHardening: { en: 'Cluster Hardening', ko: '클러스터 강화' },
  systemHardening: { en: 'System Hardening', ko: '시스템 강화' },
  microserviceVuln: { en: 'Minimize Microservice Vulnerabilities', ko: '마이크로서비스 취약점 최소화' },
  supplyChain: { en: 'Supply Chain Security', ko: '공급망 보안' },
  monitoring: { en: 'Monitoring, Logging & Runtime Security', ko: '모니터링, 로깅 & 런타임 보안' },
};

/** Per-exam domain lists with the official blueprint weights (sum 100). */
export const EXAMS = {
  cka: {
    label: 'CKA',
    domains: [
      { id: 'troubleshooting', weight: 30 },
      { id: 'arch', weight: 25 },
      { id: 'net', weight: 20 },
      { id: 'workloads', weight: 15 },
      { id: 'storage', weight: 10 },
    ],
  },
  ckad: {
    label: 'CKAD',
    domains: [
      { id: 'env', weight: 25 },
      { id: 'design', weight: 20 },
      { id: 'deploy', weight: 20 },
      { id: 'net', weight: 20 },
      { id: 'observe', weight: 15 },
    ],
  },
  cks: {
    label: 'CKS',
    domains: [
      { id: 'microserviceVuln', weight: 20 },
      { id: 'supplyChain', weight: 20 },
      { id: 'monitoring', weight: 20 },
      { id: 'clusterHardening', weight: 15 },
      { id: 'systemHardening', weight: 15 },
      { id: 'clusterSetup', weight: 10 },
    ],
  },
};

/** Every domain id a quiz question / exam task may carry. */
export const ALL_DOMAIN_IDS = Object.keys(DOMAIN_LABELS);
