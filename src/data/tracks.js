/**
 * Learning tracks — the goal-picker's answer to "what am I here for?".
 *
 * A track is an *ordered* list of module ids. Order lives here rather than on
 * the module because the same module sits at a different point in different
 * tracks: K8s Lab is the finish line of the CKAD warm-up but an early step on
 * the senior path. modules.js owns identity; tracks.js owns sequence.
 *
 * m0 (Roadmap) is deliberately in no track — it's the hub the picker lives on,
 * and it is always shown.
 */

export const TRACKS = {
  docker: {
    label: { en: 'Just Docker', ko: 'Docker만' },
    blurb: {
      en: 'Containers, images, layers and compose. No Kubernetes.',
      ko: '컨테이너, 이미지, 레이어, compose. 쿠버네티스는 없습니다.',
    },
    modules: ['m1', 'm2', 'm7', 'm16'],
  },
  ckad: {
    label: { en: 'CKAD', ko: 'CKAD' },
    blurb: {
      en: 'The developer exam: pod design, config, deployment, observability.',
      ko: '개발자 시험: 파드 설계, 구성, 배포, 관측성.',
    },
    modules: ['m1', 'm2', 'm3', 'm4', 'm17', 'm11', 'm13', 'm19', 'm21', 'm6', 'm15'],
  },
  cka: {
    label: { en: 'CKA', ko: 'CKA' },
    blurb: {
      en: 'The admin exam: troubleshooting, cluster ops, scheduling, storage.',
      ko: '관리자 시험: 트러블슈팅, 클러스터 운영, 스케줄링, 스토리지.',
    },
    modules: ['m1', 'm2', 'm3', 'm4', 'm10', 'm12', 'm13', 'm14', 'm18', 'm21', 'm6', 'm15'],
  },
  cks: {
    label: { en: 'CKS', ko: 'CKS' },
    blurb: {
      en: 'The security exam. Assumes CKA-level Kubernetes already.',
      ko: '보안 시험. CKA 수준의 쿠버네티스를 이미 안다고 가정합니다.',
    },
    modules: ['m1', 'm2', 'm3', 'm4', 'm12', 'm13', 'm20', 'm21', 'm6', 'm15'],
  },
  senior: {
    label: { en: 'Senior engineer', ko: '시니어 엔지니어' },
    blurb: {
      en: 'Everything — including what the exams never test: GitOps, security, incidents.',
      ko: '전부 — 시험에 안 나오는 것까지: GitOps, 보안, 장애 대응.',
    },
    modules: ['m1', 'm2', 'm7', 'm16', 'm3', 'm4', 'm8', 'm9', 'm5', 'm10', 'm11', 'm12', 'm13', 'm14', 'm17', 'm18', 'm19', 'm20', 'm21', 'm15', 'm6'],
  },
};

export const TRACK_IDS = Object.keys(TRACKS);

/** The hub module, always visible regardless of the chosen track. */
export const HUB_MODULE = 'm0';
