/**
 * Kustomize base/overlay builder (improvement-plan step 16) — pure, dependency-free:
 * resolves `resources:` (recursing into any referenced directory that itself has a
 * kustomization.yaml, the real base<-overlay composition mechanism), then applies
 * transformers in a fixed order (namePrefix -> namespace -> commonLabels -> images
 * -> replicas), then whole-object strategic-merge patches (`patches:`/
 * `patchesStrategicMerge:`), then RFC-6902 JSON patches (`patchesJson6902:`) as an
 * independent second patch engine layered on top. No engine/kubectl coupling — this
 * file only knows about the flat file store and plain JS manifest objects.
 *
 * Simplifications (documented, not bugs): namePrefix only rewrites `metadata.name`
 * (no reference-rewriting elsewhere); `replicas:`/strategic-merge `target`s match
 * against the CURRENT name at that point in the pipeline (i.e. already prefixed,
 * since namePrefix runs first) — real Kustomize matches original names, but for a
 * teaching sim a single, consistent match-by-current-name rule is easier to reason
 * about than tracking original-name aliases.
 */
import { load, loadAll } from 'js-yaml';
import { setPath, deepMerge } from './diff.js';

function joinPath(base, rel) {
  if (rel.startsWith('/')) return rel.slice(1);
  const parts = base.split('/').filter(Boolean);
  for (const seg of rel.split('/').filter(Boolean)) {
    if (seg === '.') continue;
    else if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

function eachContainerList(o, fn) {
  const specs = [];
  if (o.spec && o.spec.containers) specs.push(o.spec);
  if (o.spec && o.spec.template && o.spec.template.spec) specs.push(o.spec.template.spec);
  for (const s of specs) {
    for (const c of s.containers || []) fn(c);
    for (const c of s.initContainers || []) fn(c);
  }
}

function rewriteImage(image, rule) {
  const repo = image.split(':')[0];
  if (repo !== rule.name) return image;
  const newRepo = rule.newName || repo;
  const newTag = rule.newTag || image.split(':')[1] || 'latest';
  return `${newRepo}:${newTag}`;
}

/** Parse just the kustomization.yaml at `dir` (no resource resolution). Returns {doc}|{error}. */
export function parseKustomization(files, dir) {
  const text = files.read(`${dir}/kustomization.yaml`);
  if (text == null) return { error: `kustomization.yaml not found at ${dir}/kustomization.yaml` };
  try {
    return { doc: load(text) || {} };
  } catch (e) {
    return { error: `${dir}/kustomization.yaml: ${e.message}` };
  }
}

function resolvePatchDoc(entry, dir, files) {
  if (typeof entry === 'string') entry = { path: entry };
  if (entry.path) {
    const text = files.read(joinPath(dir, entry.path));
    if (text == null) return { error: `patch file not found: ${entry.path}` };
    try { return { doc: load(text), target: entry.target || null }; } catch (e) { return { error: `${entry.path}: ${e.message}` }; }
  }
  if (entry.patch) {
    try { return { doc: load(entry.patch), target: entry.target || null }; } catch (e) { return { error: 'inline patch: ' + e.message }; }
  }
  return { error: 'a patches/patchesStrategicMerge entry needs path or patch' };
}

function applyStrategicPatches(objects, patchList, dir, files) {
  for (const entry of patchList) {
    const { doc, target, error } = resolvePatchDoc(entry, dir, files);
    if (error) return { error };
    const matchKind = (target && target.kind) || doc.kind;
    const matchName = (target && target.name) || (doc.metadata && doc.metadata.name);
    const idx = objects.findIndex((o) => o.kind === matchKind && o.metadata.name === matchName);
    if (idx === -1) return { error: `strategic-merge patch target not found: ${matchKind}/${matchName}` };
    objects[idx] = deepMerge(objects[idx], doc);
  }
  return { objects };
}

function parsePointer(ptr) {
  return ptr.split('/').slice(1).map((seg) => {
    const un = seg.replace(/~1/g, '/').replace(/~0/g, '~');
    return /^\d+$/.test(un) ? Number(un) : un;
  });
}

/** RFC 6902 JSON Patch — add/replace/remove only (copy/move/test are out of scope). */
export function applyJsonPatch(obj, ops) {
  const result = JSON.parse(JSON.stringify(obj));
  const errors = [];
  for (const op of ops || []) {
    const path = parsePointer(op.path);
    if (op.op === 'add' || op.op === 'replace') {
      setPath(result, path, op.value);
    } else if (op.op === 'remove') {
      let cur = result;
      for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
      const last = path[path.length - 1];
      if (Array.isArray(cur)) cur.splice(last, 1);
      else delete cur[last];
    } else {
      errors.push(`unsupported json6902 op: ${op.op}`);
    }
  }
  return { result, errors };
}

function resolveJsonPatchOps(entry, dir, files) {
  if (entry.path) {
    const text = files.read(joinPath(dir, entry.path));
    if (text == null) return { error: `patch file not found: ${entry.path}` };
    try { return { ops: load(text) }; } catch (e) { return { error: `${entry.path}: ${e.message}` }; }
  }
  if (entry.patch) {
    try { return { ops: typeof entry.patch === 'string' ? load(entry.patch) : entry.patch }; } catch (e) { return { error: 'inline patchesJson6902: ' + e.message }; }
  }
  return { error: 'a patchesJson6902 entry needs path or patch' };
}

function applyJson6902Patches(objects, patchList, dir, files) {
  for (const entry of patchList) {
    if (!entry.target) return { error: 'a patchesJson6902 entry needs a target {kind, name}' };
    const { ops, error } = resolveJsonPatchOps(entry, dir, files);
    if (error) return { error };
    const idx = objects.findIndex((o) => o.kind === entry.target.kind && o.metadata.name === entry.target.name);
    if (idx === -1) return { error: `json6902 patch target not found: ${entry.target.kind}/${entry.target.name}` };
    const { result, errors } = applyJsonPatch(objects[idx], ops);
    if (errors.length) return { error: errors.join('; ') };
    objects[idx] = result;
  }
  return { objects };
}

/**
 * Build the manifest set for a kustomization directory, recursing into any
 * `resources:` entry that names a directory with its own kustomization.yaml
 * (base<-overlay composition), otherwise loading it as a plain multi-doc
 * manifest file. Returns {docs} or {error} (a single error aborts the whole
 * build, matching how a real `kubectl apply -k`/`kustomize build` failure works).
 */
export function buildKustomization(files, dir, ancestors = new Set()) {
  if (ancestors.has(dir)) return { error: `cycle detected in resources: ${[...ancestors, dir].join(' -> ')}` };
  ancestors = new Set(ancestors).add(dir);

  const { doc, error: kErr } = parseKustomization(files, dir);
  if (kErr) return { error: kErr };

  let docs = [];
  for (const r of doc.resources || []) {
    const resolved = joinPath(dir, r);
    if (files.read(`${resolved}/kustomization.yaml`) != null) {
      const sub = buildKustomization(files, resolved, ancestors);
      if (sub.error) return sub;
      docs.push(...sub.docs);
      continue;
    }
    const text = files.read(resolved);
    if (text == null) return { error: `resource not found: ${resolved} (referenced from ${dir}/kustomization.yaml)` };
    let parsed;
    try { parsed = loadAll(text); } catch (e) { return { error: `${resolved}: ${e.message}` }; }
    for (const d of parsed) if (d) docs.push(d);
  }

  if (doc.namePrefix) docs = docs.map((o) => ({ ...o, metadata: { ...o.metadata, name: doc.namePrefix + o.metadata.name } }));
  if (doc.namespace) docs = docs.map((o) => ({ ...o, metadata: { ...o.metadata, namespace: doc.namespace } }));
  if (doc.commonLabels) {
    docs = docs.map((o) => {
      const out = { ...o, metadata: { ...o.metadata, labels: { ...(o.metadata.labels || {}), ...doc.commonLabels } } };
      if (out.spec && out.spec.selector && out.spec.selector.matchLabels) out.spec = { ...out.spec, selector: { ...out.spec.selector, matchLabels: { ...out.spec.selector.matchLabels, ...doc.commonLabels } } };
      if (out.spec && out.spec.template && out.spec.template.metadata) out.spec = { ...out.spec, template: { ...out.spec.template, metadata: { ...out.spec.template.metadata, labels: { ...(out.spec.template.metadata.labels || {}), ...doc.commonLabels } } } };
      return out;
    });
  }
  if (doc.images) for (const o of docs) eachContainerList(o, (c) => { for (const rule of doc.images) c.image = rewriteImage(c.image, rule); });
  if (doc.replicas) for (const o of docs) { const r = doc.replicas.find((x) => x.name === o.metadata.name); if (r && o.spec && 'replicas' in o.spec) o.spec.replicas = r.count; }

  const patchList = doc.patches || doc.patchesStrategicMerge || [];
  if (patchList.length) {
    const r = applyStrategicPatches(docs, patchList, dir, files);
    if (r.error) return r;
    docs = r.objects;
  }
  if (doc.patchesJson6902 && doc.patchesJson6902.length) {
    const r = applyJson6902Patches(docs, doc.patchesJson6902, dir, files);
    if (r.error) return r;
    docs = r.objects;
  }

  return { docs };
}
