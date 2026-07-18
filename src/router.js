/**
 * Hash-based routes: `#/<module-slug>` or `#/<module-slug>/<sub>`.
 * `sub` is a module-owned path segment (scenario id, lab tab, …).
 * Pure helpers — the React side lives in context/RouteContext.jsx.
 */

import { MODULES } from './data/modules.js';

/** id → slug, derived from the module registry (data/modules.js). */
export const MODULE_SLUGS = Object.fromEntries(MODULES.map((m) => [m.id, m.slug]));

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
