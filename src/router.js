/**
 * Hash-based routes: `#/<module-slug>` or `#/<module-slug>/<sub>`.
 * `sub` is a module-owned path segment (scenario id, lab tab, …).
 * Pure helpers — the React side lives in context/RouteContext.jsx.
 */

export const MODULE_SLUGS = {
  m0: 'roadmap',
  m1: 'containers',
  m2: 'docker-lab',
  m7: 'docker-depth',
  m3: 'k8s-concepts',
  m4: 'k8s-lab',
  m8: 'operator-toolkit',
  m9: 'production',
  m5: 'gpu',
  m10: 'troubleshooting',
  m11: 'ckad-drills',
  m12: 'cka-drills',
  m13: 'net-drills',
  m14: 'ops-drills',
  m16: 'docker-drills',
  m17: 'pod-labs',
  m18: 'storage-labs',
  m19: 'packaging-gitops',
  m15: 'exam-room',
  m6: 'quiz',
};

export const DEFAULT_MODULE = 'm0';

const BY_SLUG = Object.fromEntries(Object.entries(MODULE_SLUGS).map(([id, slug]) => [slug, id]));

/** '#/k8s-lab', '#/m4', '#/troubleshooting/svc-selector' → { id, sub }. Unknown → default module. */
export function parseHash(hash) {
  const path = String(hash || '').replace(/^#\/?/, '');
  const [head, ...rest] = path.split('/');
  const id = BY_SLUG[head] || (MODULE_SLUGS[head] ? head : DEFAULT_MODULE);
  if (!BY_SLUG[head] && !MODULE_SLUGS[head]) return { id, sub: null };
  const sub = rest.length ? decodeURIComponent(rest.join('/')) : null;
  return { id, sub };
}

/** ('m10', 'svc-selector') → '#/troubleshooting/svc-selector' */
export function hashFor(id, sub = null) {
  const slug = MODULE_SLUGS[id] || MODULE_SLUGS[DEFAULT_MODULE];
  return '#/' + slug + (sub ? '/' + encodeURIComponent(sub) : '');
}
