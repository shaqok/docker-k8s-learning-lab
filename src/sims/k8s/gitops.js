/**
 * GitOps drift detection + sync (improvement-plan step 16). A `GitOpsApp` object
 * (see engine.js's `makeGitOpsApp` / kubectl.js's WORKLOAD_KINDS entry) names a
 * source path rendered by `kustomize.js`; this module computes drift between that
 * rendered desired state and the live engine, and — this is the key design point —
 * REVERTS drift by calling the exact same `kubectl.applyDoc` every other update
 * path already uses (Deployment image/replica changes get the real
 * `rotateDeployment` rollout, not a hand-rolled spec overwrite). "Auto-sync" is
 * not a separate code path from "manual sync": both call the same apply loop,
 * automatically vs. on request.
 */
import { loadAll } from 'js-yaml';
import { buildKustomization } from './kustomize.js';
import { diffObjects, projectKeys } from './diff.js';

/** Render a GitOpsApp's source: a Kustomize overlay if it has a kustomization.yaml,
 * else every *.yaml file directly under the path as plain multi-doc manifests. */
export function renderSource(files, sourcePath) {
  if (files.read(`${sourcePath}/kustomization.yaml`) != null) return buildKustomization(files, sourcePath);
  const names = files.list().filter((n) => n.startsWith(sourcePath + '/') && /\.ya?ml$/.test(n)).sort();
  if (!names.length) return { error: `no kustomization.yaml or manifest files found under ${sourcePath}` };
  const docs = [];
  for (const name of names) {
    let parsed;
    try { parsed = loadAll(files.read(name)); } catch (e) { return { error: `${name}: ${e.message}` }; }
    for (const d of parsed) if (d) docs.push(d);
  }
  return { docs };
}

/** Read-only: classify each desired object as missing/modified/synced against live engine state. */
export function computeDrift(engine, files, app) {
  const { docs, error } = renderSource(files, app.spec.sourcePath);
  if (error) return { status: 'Error', drift: [], error };
  const defaultNs = app.metadata.namespace;
  const drift = [];
  for (const desired of docs) {
    const ns = desired.metadata.namespace || defaultNs;
    const live = engine.get(desired.kind, ns, desired.metadata.name);
    if (!live) { drift.push({ type: 'missing', kind: desired.kind, name: desired.metadata.name, namespace: ns }); continue; }
    const changes = diffObjects(projectKeys(live.spec || {}, desired.spec || {}), desired.spec || {});
    if (changes.length) drift.push({ type: 'modified', kind: desired.kind, name: desired.metadata.name, namespace: ns, changes });
  }
  return { status: drift.length ? 'OutOfSync' : 'Synced', drift, docs };
}

/** Re-apply every desired doc (create if missing, update in place if it exists — same as `kubectl apply -f`) and update app.status. */
function syncNow(engine, app, docs, applyDoc) {
  for (const doc of docs) applyDoc(() => {}, doc, doc.metadata.namespace || app.metadata.namespace);
  app.status.syncStatus = 'Synced';
  app.status.lastDrift = [];
  app.status.lastSyncedAt = Date.now();
  engine.notify();
}

/** `gitops sync APP`: sync regardless of spec.autoSync. Returns the drift computed before syncing. */
export function manualSync(engine, files, app, applyDoc) {
  const result = computeDrift(engine, files, app);
  if (result.error) { app.status.syncStatus = 'Error'; engine.notify(); return result; }
  syncNow(engine, app, result.docs, applyDoc);
  return result;
}

/** One reconcile-tick's worth of work for one app: always refresh status; auto-revert only if spec.autoSync.
 * Fires `onMission('gitops-autosync:' + app.metadata.name)` only on this AUTOMATIC path — never on a
 * manual `gitops sync` — so lab missions can tell "it healed itself" apart from "the student synced it". */
export function reconcileGitOpsApp(engine, files, app, applyDoc, onMission = () => {}) {
  const result = computeDrift(engine, files, app);
  if (result.error) {
    app.status.syncStatus = 'Error';
    app.status.lastDrift = [];
    return;
  }
  if (result.status === 'OutOfSync' && app.spec.autoSync) {
    syncNow(engine, app, result.docs, applyDoc);
    onMission('gitops-autosync:' + app.metadata.name);
    return;
  }
  app.status.syncStatus = result.status;
  app.status.lastDrift = result.drift.map(({ type, kind, name, namespace }) => ({ type, kind, name, namespace }));
  if (result.status === 'OutOfSync' && !app.spec.autoSync) onMission('gitops-outofsync:' + app.metadata.name);
}

/** Called once per reconcile tick (see k8sSim.js) — reconciles every GitOpsApp in the cluster. */
export function gitopsTick(engine, files, applyDoc, onMission) {
  for (const app of engine.list('GitOpsApp', { all: true })) reconcileGitOpsApp(engine, files, app, applyDoc, onMission);
}
