/**
 * Packaging & GitOps side-CLI (improvement-plan step 16) — `helm`, `kustomize`,
 * and `gitops` as one thin dispatcher wired into kubectl's exec() exactly like
 * hostops.js's `ssh`/`kubeadm`/etc, but combined into one file since the three
 * command words share no runtime precondition (unlike hostops's "must be
 * ssh'd onto a node") — they only share this one wiring seam and the pure
 * logic modules underneath (helmTemplate.js, kustomize.js, diff.js, gitops.js).
 * Thin by design: parse args, call a pure function, print — no algorithm lives
 * in this file.
 */
import { load } from 'js-yaml';
import { esc, pad } from '../util.js';
import { toYaml } from './yaml.js';
import { renderChart } from './helmTemplate.js';
import { buildKustomization } from './kustomize.js';
import { deepMerge, diffManifestSets, pathToString } from './diff.js';
import { manualSync, gitopsTick as gitopsTickFn } from './gitops.js';

const HANDLED = new Set(['helm', 'kustomize', 'gitops']);
const stripSlash = (s) => String(s || '').replace(/\/+$/, '');

function parseFlags(tokens) {
  const flags = {};
  const args = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '-f' || t === '--values') { flags.f = tokens[++i]; continue; }
    if (t === '--set') { flags.set = (flags.set || []).concat(tokens[++i]); continue; }
    if (t === '-n' || t === '--namespace') { flags.namespace = tokens[++i]; continue; }
    if (t.startsWith('--')) {
      const eq = t.indexOf('=');
      if (eq > 0) flags[t.slice(2, eq)] = t.slice(eq + 1);
      else flags[t.slice(2)] = true;
    } else args.push(t);
  }
  return { args, flags };
}

function coerceValue(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function setPathDotted(obj, dottedPath, value) {
  const parts = dottedPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] === null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

/** Merge a `-f values.yaml` file (if given) with any `--set a.b=c` overrides, in that order. */
function valuesFromFlags(flags, files) {
  let override = {};
  if (flags.f) {
    const text = files.read(flags.f);
    if (text == null) return { error: `values file not found: ${flags.f}` };
    let parsed;
    try { parsed = load(text) || {}; } catch (e) { return { error: `${flags.f}: ${e.message}` }; }
    override = deepMerge(override, parsed);
  }
  for (const s of [].concat(flags.set || [])) {
    const eq = s.indexOf('=');
    if (eq < 0) continue;
    setPathDotted(override, s.slice(0, eq), coerceValue(s.slice(eq + 1)));
  }
  return { override };
}

export function createPackagingOps(engine, { files, onMission = () => {}, applyDoc, deleteObj }) {
  /* ----- helm ----- */

  function pruneDropped(prevDocs, nextDocs, ns) {
    for (const d of diffManifestSets(prevDocs, nextDocs)) {
      if (d.status !== 'removed') continue;
      const obj = engine.get(d.kind, d.namespace || ns, d.name);
      if (obj) deleteObj(() => {}, obj);
    }
  }

  function cmdHelmInstallUpgrade(print, verb, args, flags) {
    const name = args[1];
    const chartDir = stripSlash(args[2]);
    if (!name || !chartDir) return print(`usage: helm ${verb} RELEASE CHART_DIR [-f values.yaml] [--set k=v]`, 'err');
    const ns = flags.namespace || 'default';
    const release = engine.get('HelmRelease', ns, name);
    if (verb === 'install' && release) return print(`Error: cannot re-use a name that is still in use: ${esc(name)}`, 'err');
    if (verb === 'upgrade' && !release) return print(`Error: "${esc(name)}" has no deployed releases`, 'err');

    const { override, error: valErr } = valuesFromFlags(flags, files);
    if (valErr) return print('Error: ' + esc(valErr), 'err');
    const { docs, error } = renderChart(files, chartDir, { releaseName: name, namespace: ns, valuesOverride: override });
    if (error) return print(`Error: ${esc(error)}`, 'err'); // atomic: nothing is touched on a render error

    if (release) pruneDropped(release.sim.history[release.sim.history.length - 1].docs, docs, ns);
    for (const doc of docs) applyDoc(() => {}, doc, doc.metadata.namespace || ns);

    const rev = release ? release.status.revision + 1 : 1;
    const historyEntry = { rev, values: override, docs, at: Date.now() };
    if (release) {
      release.spec.chart = chartDir;
      release.spec.values = override;
      release.status.revision = rev;
      release.sim.history.push(historyEntry);
    } else {
      engine.put({
        apiVersion: 'helm.sim/v1', kind: 'HelmRelease',
        metadata: { name, namespace: ns, creationTimestamp: Date.now() },
        spec: { chart: chartDir, values: override },
        status: { revision: rev, status: 'deployed' },
        sim: { history: [historyEntry] },
      });
    }
    onMission(verb === 'install' ? 'helm-install' : 'helm-upgrade');
    print(`Release "${esc(name)}" has been ${verb === 'install' ? 'installed' : 'upgraded'}. Happy Helming!\nNAME: ${esc(name)}\nREVISION: ${rev}`, 'ok');
  }

  function cmdHelmRollback(print, args, flags) {
    const name = args[1];
    const ns = flags.namespace || 'default';
    const release = engine.get('HelmRelease', ns, name || '');
    if (!release) return print(`Error: "${esc(name || '')}" has no deployed releases`, 'err');
    const toRev = args[2] != null ? Number(args[2]) : release.sim.history[release.sim.history.length - 2] && release.sim.history[release.sim.history.length - 2].rev;
    const target = release.sim.history.find((h) => h.rev === toRev);
    if (!target) return print(`Error: release ${esc(name)} has no ${args[2] ? 'revision ' + esc(args[2]) : 'previous revision'} to roll back to`, 'err');

    pruneDropped(release.sim.history[release.sim.history.length - 1].docs, target.docs, ns);
    for (const doc of target.docs) applyDoc(() => {}, doc, doc.metadata.namespace || ns);

    const rev = release.status.revision + 1;
    release.spec.values = target.values;
    release.status.revision = rev;
    release.sim.history.push({ rev, values: target.values, docs: target.docs, at: Date.now() });
    onMission('helm-rollback');
    print(`Rollback was a success! Happy Helming!\nREVISION: ${rev}`, 'ok');
  }

  function cmdHelmHistory(print, args, flags) {
    const release = engine.get('HelmRelease', flags.namespace || 'default', args[1] || '');
    if (!release) return print(`Error: "${esc(args[1] || '')}" has no deployed releases`, 'err');
    print(pad('REVISION', 10) + pad('STATUS', 12) + 'DESCRIPTION\n' +
      release.sim.history.map((h) => pad(h.rev, 10) + pad(h.rev === release.status.revision ? 'deployed' : 'superseded', 12) + (h.rev === 1 ? 'Install complete' : 'Upgrade complete')).join('\n'));
  }

  function cmdHelmList(print, flags) {
    const releases = engine.list('HelmRelease', { ns: flags.namespace || 'default' });
    if (!releases.length) return print(`No releases found in ${flags.namespace || 'default'} namespace.`);
    print(pad('NAME', 20) + pad('NAMESPACE', 14) + pad('REVISION', 10) + 'STATUS\n' +
      releases.map((r) => pad(r.metadata.name, 20) + pad(r.metadata.namespace, 14) + pad(r.status.revision, 10) + r.status.status).join('\n'));
  }

  function cmdHelmStatus(print, args, flags) {
    const release = engine.get('HelmRelease', flags.namespace || 'default', args[1] || '');
    if (!release) return print(`Error: "${esc(args[1] || '')}" has no deployed releases`, 'err');
    print(`NAME: ${release.metadata.name}\nNAMESPACE: ${release.metadata.namespace}\nSTATUS: ${release.status.status}\nREVISION: ${release.status.revision}\nCHART: ${release.spec.chart}`);
  }

  function cmdHelm(print, tokens) {
    const { args, flags } = parseFlags(tokens.slice(1));
    const verb = args[0];
    if (verb === 'install' || verb === 'upgrade') return cmdHelmInstallUpgrade(print, verb, args, flags);
    if (verb === 'rollback') return cmdHelmRollback(print, args, flags);
    if (verb === 'history') return cmdHelmHistory(print, args, flags);
    if (verb === 'list') return cmdHelmList(print, flags);
    if (verb === 'status') return cmdHelmStatus(print, args, flags);
    print(`Error: unknown command "${esc(verb || '')}" for "helm"`, 'err');
  }

  /* ----- kustomize ----- */

  function cmdKustomize(print, tokens) {
    const { args } = parseFlags(tokens.slice(1));
    const verb = args[0];
    if (verb === 'build') {
      const dir = stripSlash(args[1]);
      if (!dir) return print('usage: kustomize build DIR', 'err');
      const { docs, error } = buildKustomization(files, dir);
      if (error) return print(`Error: ${esc(error)}`, 'err');
      onMission('kustomize-build');
      return print(esc(docs.map((d) => toYaml(d)).join('\n---\n')));
    }
    if (verb === 'diff') {
      const dirA = stripSlash(args[1]);
      const dirB = stripSlash(args[2]);
      if (!dirA || !dirB) return print('usage: kustomize diff DIR_A DIR_B', 'err');
      const a = buildKustomization(files, dirA);
      if (a.error) return print(`Error: ${esc(a.error)}`, 'err');
      const b = buildKustomization(files, dirB);
      if (b.error) return print(`Error: ${esc(b.error)}`, 'err');
      const lines = diffManifestSets(a.docs, b.docs).map((r) => {
        if (r.status === 'added') return `+ ${r.kind}/${r.name}`;
        if (r.status === 'removed') return `- ${r.kind}/${r.name}`;
        if (r.status === 'same') return `  ${r.kind}/${r.name} (unchanged)`;
        return `~ ${r.kind}/${r.name}\n` + r.changes.map((c) => `    ${pathToString(c.path)}: ${JSON.stringify(c.from)} -> ${JSON.stringify(c.to)}`).join('\n');
      });
      onMission('kustomize-diff');
      return print(esc(lines.join('\n')));
    }
    print(`Error: unknown command "${esc(verb || '')}" for "kustomize"`, 'err');
  }

  /* ----- gitops ----- */

  function cmdGitops(print, tokens) {
    const { args, flags } = parseFlags(tokens.slice(1));
    const ns = flags.namespace || 'default';
    const verb = args[0];
    if (verb === 'sync') {
      const name = args[1];
      if (!name) return print('usage: gitops sync APP', 'err');
      const app = engine.get('GitOpsApp', ns, name);
      if (!app) return print(`Error: gitopsapps.gitops.sim "${esc(name)}" not found`, 'err');
      const result = manualSync(engine, files, app, applyDoc);
      if (result.error) return print(`Error: ${esc(result.error)}`, 'err');
      onMission('gitops-sync');
      return print(`app "${esc(name)}" synced (${result.drift.length} object(s) reconciled)`, 'ok');
    }
    print(`Error: unknown command "${esc(verb || '')}" for "gitops"`, 'err');
  }

  /* ----- dispatcher ----- */

  function exec(rawCmd, print) {
    const t = rawCmd.trim().split(/\s+/).filter(Boolean);
    const w = t[0];
    if (w === 'helm') return cmdHelm(print, t);
    if (w === 'kustomize') return cmdKustomize(print, t);
    if (w === 'gitops') return cmdGitops(print, t);
    print(`bash: ${esc(w)}: command not found`, 'err');
  }

  return { exec, handles: (word) => HANDLED.has(word), gitopsTick: () => gitopsTickFn(engine, files, applyDoc, onMission) };
}
