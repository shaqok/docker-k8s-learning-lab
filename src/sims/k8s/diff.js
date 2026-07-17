/**
 * Structural diff/patch utilities (improvement-plan step 16) — one path-based
 * "what changed" primitive shared by the Kustomize base/overlay diff viewer
 * and the GitOps drift detector, instead of two ad hoc implementations.
 * Pure: no engine/file-store coupling anywhere in this file.
 */

/** Deep-merge `patch` onto `base`. Arrays and non-plain-object values REPLACE
 * wholesale (no per-index/mergeKey merging) — the same simplification Helm
 * values-merging and Kustomize's whole-object strategic-merge patches share. */
export function deepMerge(base, patch) {
  if (Array.isArray(patch)) return patch.slice();
  if (patch === null || typeof patch !== 'object') return patch;
  const out = { ...(base && typeof base === 'object' && !Array.isArray(base) ? base : {}) };
  for (const k of Object.keys(patch)) out[k] = deepMerge(out[k], patch[k]);
  return out;
}

/** Set a value at a `path` (array of string/number keys), creating containers as needed. */
export function setPath(obj, path, value) {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    if (cur[k] === null || typeof cur[k] !== 'object') cur[k] = typeof path[i + 1] === 'number' ? [] : {};
    cur = cur[k];
  }
  cur[path[path.length - 1]] = value;
}

/** Display form of a diff path: ['spec','replicas'] -> "spec.replicas", ['spec','containers',0,'image'] -> "spec.containers[0].image". */
export function pathToString(path) {
  return path.map((k, i) => (typeof k === 'number' ? `[${k}]` : i === 0 ? String(k) : `.${k}`)).join('');
}

/** Recursive structural diff of two plain values. Returns a flat [{path, from, to}] list; [] means equal. */
export function diffObjects(a, b, path = []) {
  if (a === b) return [];
  const aIsObj = a !== null && typeof a === 'object';
  const bIsObj = b !== null && typeof b === 'object';
  if (!aIsObj || !bIsObj || Array.isArray(a) !== Array.isArray(b)) return [{ path, from: a, to: b }];
  const changes = [];
  if (Array.isArray(a)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) changes.push(...diffObjects(a[i], b[i], [...path, i]));
    return changes;
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) changes.push(...diffObjects(a[k], b[k], [...path, k]));
  return changes;
}

/** Prune `live` down to only the keys `desired` declares — suppresses false "drift"
 * from engine-only bookkeeping fields (status, defaulted clusterIP, etc.) that a
 * one-directional GitOps-style comparison shouldn't flag. */
export function projectKeys(live, desired) {
  if (desired === null || typeof desired !== 'object') return live;
  if (Array.isArray(desired)) return Array.isArray(live) ? desired.map((d, i) => projectKeys(live[i], d)) : live;
  if (live === null || typeof live !== 'object' || Array.isArray(live)) return live;
  const out = {};
  for (const k of Object.keys(desired)) out[k] = projectKeys(live[k], desired[k]);
  return out;
}

/** 'Kind/namespace/name' identity used to match objects across two manifest sets. */
export const manifestKey = (o) => `${o.kind}/${(o.metadata && o.metadata.namespace) || 'default'}/${o.metadata.name}`;

/**
 * Diff two arrays of k8s-shaped objects (manifests or live objects), matched by
 * `manifestKey`. Each entry: { key, kind, name, namespace, status: 'added'|'removed'|'changed'|'same', changes }.
 * `changes` is a `diffObjects` result over each pair's `.spec`.
 */
export function diffManifestSets(before, after) {
  const beforeMap = new Map(before.map((o) => [manifestKey(o), o]));
  const afterMap = new Map(after.map((o) => [manifestKey(o), o]));
  const results = [];
  for (const [key, o] of afterMap) {
    const prior = beforeMap.get(key);
    const base = { key, kind: o.kind, name: o.metadata.name, namespace: o.metadata.namespace || 'default' };
    if (!prior) { results.push({ ...base, status: 'added', changes: [] }); continue; }
    const changes = diffObjects(prior.spec || {}, o.spec || {});
    results.push({ ...base, status: changes.length ? 'changed' : 'same', changes });
  }
  for (const [key, o] of beforeMap) {
    if (!afterMap.has(key)) results.push({ key, kind: o.kind, name: o.metadata.name, namespace: o.metadata.namespace || 'default', status: 'removed', changes: [] });
  }
  return results;
}
