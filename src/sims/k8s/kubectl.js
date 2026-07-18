import { loadAll } from 'js-yaml';
import { esc, pad } from '../util.js';
import { toYaml } from './yaml.js';
import { K8S_NODE_CAP, K8S_NODE_ALLOC, K8S_IMAGES, imageRepo, imageKnown, qosOf } from './engine.js';
import { canI, parseAsSubject, normResource } from './rbac.js';
import { canConnect } from './netpol.js';
import { admitPod } from './podSecurity.js';
import { checkImagePolicy } from './imagePolicy.js';
import { resolveHttp } from './routing.js';
import { buildKustomization } from './kustomize.js';

/* ---------- CLI parsing ---------- */

const ALIAS = { '-n': 'namespace', '--namespace': 'namespace', '-l': 'selector', '--selector': 'selector', '-o': 'output', '--output': 'output', '-f': 'filename', '--filename': 'filename', '-k': 'kustomize', '--kustomize': 'kustomize', '-A': 'all-namespaces', '--all-namespaces': 'all-namespaces', '-c': 'container', '--container': 'container' };
const VALUE_FLAGS = new Set(['-n', '--namespace', '-l', '--selector', '-o', '--output', '-f', '--filename', '-k', '--kustomize', '--image', '--replicas', '--port', '--target-port', '--name', '--labels', '--to-revision', '--from-literal', '--grace-period', '--verb', '--resource', '--role', '--clusterrole', '--serviceaccount', '--user', '--group', '--as', '--rule', '--class', '--min-available', '--max-unavailable', '-H', '-c', '--container', '--schedule', '--completions', '--parallelism', '--from', '--tail', '--since', '--sort-by', '--field-selector']);

/** "30s" | "5m" | "2h" → ms (null when unset/unparsable). */
export function parseDuration(s) {
  if (s == null || s === true) return null;
  const m = String(s).match(/^(\d+(?:\.\d+)?)(s|m|h)$/);
  if (!m) return null;
  return parseFloat(m[1]) * { s: 1e3, m: 60e3, h: 3600e3 }[m[2]];
}

/**
 * Quote-aware split so a quoted cron schedule survives as one token — embedded
 * quotes (mid-token, after `=`) need real char-by-char scanning, not just
 * splitting on standalone `"..."` args.
 */
function splitQuoted(s) {
  const out = [];
  let cur = '';
  let inSingle = false;
  let inDouble = false;
  let started = false;
  for (const c of s) {
    if (inSingle) { if (c === "'") inSingle = false; else cur += c; continue; }
    if (inDouble) { if (c === '"') inDouble = false; else cur += c; continue; }
    if (c === "'") { inSingle = true; started = true; continue; }
    if (c === '"') { inDouble = true; started = true; continue; }
    if (/\s/.test(c)) { if (started) { out.push(cur); cur = ''; started = false; } continue; }
    cur += c;
    started = true;
  }
  if (started) out.push(cur);
  return out;
}

/**
 * `-f` is `--filename` everywhere except `kubectl logs`, where it's the boolean
 * `--follow` — so the verb decides whether it swallows the next token.
 */
function parseTokens(tokens) {
  const args = [];
  const flags = {};
  const isLogs = tokens[0] === 'logs';
  let rest = null;
  for (let i = 0; i < tokens.length; i++) {
    const a = tokens[i];
    if (a === '--') { rest = tokens.slice(i + 1); break; }
    if (isLogs && (a === '-f' || a === '--follow')) { flags.follow = true; continue; }
    if (a.startsWith('-') && a !== '-') {
      let k = a, v = true;
      const eq = a.indexOf('=');
      if (eq > 0) { k = a.slice(0, eq); v = a.slice(eq + 1); }
      else if (VALUE_FLAGS.has(a)) v = tokens[++i];
      const name = ALIAS[k] || k.replace(/^--?/, '');
      flags[name] = flags[name] === undefined ? v : [].concat(flags[name], v);
    } else args.push(a);
  }
  return { args, flags, rest };
}

const KIND_ALIASES = {
  pod: 'Pod', pods: 'Pod', po: 'Pod',
  deployment: 'Deployment', deployments: 'Deployment', deploy: 'Deployment',
  replicaset: 'ReplicaSet', replicasets: 'ReplicaSet', rs: 'ReplicaSet',
  service: 'Service', services: 'Service', svc: 'Service',
  node: 'Node', nodes: 'Node', no: 'Node',
  namespace: 'Namespace', namespaces: 'Namespace', ns: 'Namespace',
  configmap: 'ConfigMap', configmaps: 'ConfigMap', cm: 'ConfigMap',
  secret: 'Secret', secrets: 'Secret',
  endpoints: 'Endpoints', ep: 'Endpoints',
  event: 'Event', events: 'Event', ev: 'Event',
  serviceaccount: 'ServiceAccount', serviceaccounts: 'ServiceAccount', sa: 'ServiceAccount',
  role: 'Role', roles: 'Role',
  clusterrole: 'ClusterRole', clusterroles: 'ClusterRole',
  rolebinding: 'RoleBinding', rolebindings: 'RoleBinding',
  clusterrolebinding: 'ClusterRoleBinding', clusterrolebindings: 'ClusterRoleBinding',
  networkpolicy: 'NetworkPolicy', networkpolicies: 'NetworkPolicy', netpol: 'NetworkPolicy',
  ingress: 'Ingress', ingresses: 'Ingress', ing: 'Ingress',
  gateway: 'Gateway', gateways: 'Gateway', gtw: 'Gateway',
  gatewayclass: 'GatewayClass', gatewayclasses: 'GatewayClass', gc: 'GatewayClass',
  httproute: 'HTTPRoute', httproutes: 'HTTPRoute',
  poddisruptionbudget: 'PodDisruptionBudget', poddisruptionbudgets: 'PodDisruptionBudget', pdb: 'PodDisruptionBudget',
  persistentvolume: 'PersistentVolume', persistentvolumes: 'PersistentVolume', pv: 'PersistentVolume',
  persistentvolumeclaim: 'PersistentVolumeClaim', persistentvolumeclaims: 'PersistentVolumeClaim', pvc: 'PersistentVolumeClaim',
  storageclass: 'StorageClass', storageclasses: 'StorageClass', sc: 'StorageClass',
  all: 'All',
};
const PLURAL = { Pod: 'pods', Deployment: 'deployments.apps', ReplicaSet: 'replicasets.apps', Service: 'services', Node: 'nodes', Namespace: 'namespaces', ConfigMap: 'configmaps', Secret: 'secrets', ServiceAccount: 'serviceaccounts', Role: 'roles.rbac.authorization.k8s.io', RoleBinding: 'rolebindings.rbac.authorization.k8s.io', ClusterRole: 'clusterroles.rbac.authorization.k8s.io', ClusterRoleBinding: 'clusterrolebindings.rbac.authorization.k8s.io', NetworkPolicy: 'networkpolicies.networking.k8s.io', Ingress: 'ingresses.networking.k8s.io', Gateway: 'gateways.gateway.networking.k8s.io', GatewayClass: 'gatewayclasses.gateway.networking.k8s.io', HTTPRoute: 'httproutes.gateway.networking.k8s.io', PodDisruptionBudget: 'poddisruptionbudgets.policy', PersistentVolume: 'persistentvolumes', PersistentVolumeClaim: 'persistentvolumeclaims', StorageClass: 'storageclasses.storage.k8s.io' };
const CLUSTER_SCOPED = new Set(['Node', 'Namespace', 'ClusterRole', 'ClusterRoleBinding', 'GatewayClass', 'PersistentVolume', 'StorageClass']);

const parseSelector = (s) => {
  if (!s) return null;
  const sel = {};
  for (const part of String(s).split(',')) { const [k, v] = part.split('='); if (k) sel[k.trim()] = (v || '').trim(); }
  return sel;
};

const fmtDuration = (ms) => {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 90) return s + 's';
  const m = Math.round(s / 60);
  if (m < 90) return m + 'm';
  const h = Math.round(m / 60);
  return h < 48 ? h + 'h' : Math.round(h / 24) + 'd';
};
const fmtAge = (born) => fmtDuration(Date.now() - born);

const b64 = (s) => (typeof btoa !== 'undefined' ? btoa(s) : Buffer.from(s).toString('base64'));
const unb64 = (s) => { try { return typeof atob !== 'undefined' ? atob(s) : Buffer.from(s, 'base64').toString(); } catch { return s; } };
const labelStr = (labels) => { const e = Object.entries(labels || {}); return e.length ? e.map(([k, v]) => k + '=' + v).join(',') : '&lt;none&gt;'; };

/** describe pod's "Controlled By:" line — real for Job/DaemonSet/StatefulSet, ReplicaSet for Deployment-managed (and legacy pods with no ownerKind, back-compat). */
const controlledByOf = (pod) => {
  if (!pod.sim.owner) return '&lt;none&gt; (bare pod — nothing recreates it)';
  const k = pod.sim.ownerKind;
  if (!k || k === 'Deployment') return 'ReplicaSet/' + esc(pod.sim.rsName || '?');
  if (k === 'ReplicaSet') return 'ReplicaSet/' + esc(pod.sim.owner.split('/').pop());
  return esc(k) + '/' + esc(pod.sim.owner.split('/').pop());
};

/** Short form of a {matchLabels, matchExpressions} selector for table output. */
const selShort = (sel) => {
  const parts = Object.entries((sel && sel.matchLabels) || {}).map(([k, v]) => k + '=' + v);
  for (const ex of (sel && sel.matchExpressions) || []) parts.push(ex.key + ' ' + ex.operator + ' (' + (ex.values || []).join(',') + ')');
  return parts.length ? esc(parts.join(',')) : '&lt;none&gt; (all)';
};

/**
 * Registry for the four workload kinds added in step 14 (Job/CronJob/DaemonSet/
 * StatefulSet) — avoids paying the "kubectl tax" (aliases/plural/get/describe/
 * apply, each currently a separate edit per kind) four more times. Pod/
 * Deployment/ReplicaSet/Service/... keep their existing bespoke code above;
 * only these new kinds route through this table.
 */
const WORKLOAD_KINDS = {
  Job: {
    aliases: ['job', 'jobs'],
    plural: 'jobs.batch',
    getHeader: () => pad('NAME', 24) + pad('COMPLETIONS', 14) + pad('DURATION', 10) + 'AGE',
    getRow: (engine, o) => pad(o.metadata.name, 24) + pad(`${o.status.succeeded || 0}/${o.spec.completions}`, 14) + pad(fmtDuration((o.status.completionTime || Date.now()) - o.status.startTime), 10) + fmtAge(o.metadata.creationTimestamp),
    describe: (engine, o) => {
      const c = o.spec.template.spec.containers;
      return `Name:             ${o.metadata.name}\nNamespace:        ${o.metadata.namespace}\nCompletions:      ${o.spec.completions}\nParallelism:      ${o.spec.parallelism}\nBackoff Limit:    ${o.spec.backoffLimit}\nStart Time:       ${new Date(o.status.startTime).toISOString()}${o.status.completionTime ? '\nCompleted At:     ' + new Date(o.status.completionTime).toISOString() + ` (${fmtDuration(o.status.completionTime - o.status.startTime)})` : ''}\nPods Statuses:    ${o.status.active || 0} Active / ${o.status.succeeded || 0} Succeeded / ${o.status.failed || 0} Failed\nPod Template:\n  Containers:\n` +
        c.map((x) => `   ${x.name}:\n    Image:  ${esc(x.image)}${x.command ? '\n    Command:  ' + esc(x.command.join(' ')) : ''}`).join('\n');
    },
    applyDoc: (engine, doc, dns, print) => {
      const spec = doc.spec || {};
      const c = (spec.template && spec.template.spec && spec.template.spec.containers) || [];
      if (!c.length || !c[0].image) return print('error: spec.template.spec.containers[0].image is required', 'err');
      if (engine.get('Job', dns, doc.metadata.name)) return print(`Error from server (Conflict): jobs.batch "${esc(doc.metadata.name)}" already exists — Jobs are immutable; delete it first`, 'err');
      engine.makeJob({
        name: doc.metadata.name, ns: dns, labels: doc.metadata.labels || null,
        completions: spec.completions != null ? spec.completions : 1,
        parallelism: spec.parallelism != null ? spec.parallelism : 1,
        backoffLimit: spec.backoffLimit != null ? spec.backoffLimit : 6,
        containers: c,
      });
      print(`job.batch/${esc(doc.metadata.name)} created`, 'ok');
    },
  },
  CronJob: {
    aliases: ['cronjob', 'cronjobs', 'cj'],
    plural: 'cronjobs.batch',
    getHeader: () => pad('NAME', 20) + pad('SCHEDULE', 16) + pad('SUSPEND', 9) + pad('ACTIVE', 8) + 'AGE',
    getRow: (engine, o) => {
      const active = engine.list('Job', { ns: o.metadata.namespace }).filter((j) =>
        (j.metadata.ownerReferences || []).some((r) => r.kind === 'CronJob' && r.name === o.metadata.name) && !j.status.complete && !j.status.jobFailed).length;
      return pad(o.metadata.name, 20) + pad(o.spec.schedule, 16) + pad(o.spec.suspend ? 'True' : 'False', 9) + pad(active, 8) + fmtAge(o.metadata.creationTimestamp);
    },
    describe: (engine, o) => {
      const c = o.spec.jobTemplate.spec.template.spec.containers;
      const jobs = engine.list('Job', { ns: o.metadata.namespace }).filter((j) => (j.metadata.ownerReferences || []).some((r) => r.kind === 'CronJob' && r.name === o.metadata.name));
      return `Name:                          ${o.metadata.name}\nNamespace:                     ${o.metadata.namespace}\nSchedule:                      ${esc(o.spec.schedule)}\nSuspend:                       ${o.spec.suspend ? 'True' : 'False'}\nLast Schedule Time:            ${o.status.lastScheduleTime ? new Date(o.status.lastScheduleTime).toISOString() : '&lt;none&gt;'}\nJob Template:\n  Containers:\n` +
        c.map((x) => `   ${x.name}:\n    Image:  ${esc(x.image)}`).join('\n') +
        `\nActive Jobs:  ${jobs.filter((j) => !j.status.complete && !j.status.jobFailed).length}`;
    },
    applyDoc: (engine, doc, dns, print) => {
      const spec = doc.spec || {};
      const jt = (spec.jobTemplate && spec.jobTemplate.spec) || {};
      const c = (jt.template && jt.template.spec && jt.template.spec.containers) || [];
      if (!spec.schedule) return print('error: spec.schedule is required', 'err');
      if (!c.length || !c[0].image) return print('error: spec.jobTemplate.spec.template.spec.containers[0].image is required', 'err');
      const existed = engine.get('CronJob', dns, doc.metadata.name);
      if (existed) {
        existed.spec.schedule = spec.schedule;
        existed.spec.suspend = !!spec.suspend;
        existed.spec.jobTemplate.spec.template.spec.containers = c;
        return print(`cronjob.batch/${esc(doc.metadata.name)} configured`, 'ok');
      }
      engine.makeCronJob({
        name: doc.metadata.name, ns: dns, labels: doc.metadata.labels || null,
        schedule: spec.schedule, suspend: !!spec.suspend,
        completions: jt.completions != null ? jt.completions : 1,
        parallelism: jt.parallelism != null ? jt.parallelism : 1,
        backoffLimit: jt.backoffLimit != null ? jt.backoffLimit : 6,
        containers: c,
      });
      print(`cronjob.batch/${esc(doc.metadata.name)} created`, 'ok');
    },
  },
  DaemonSet: {
    aliases: ['daemonset', 'daemonsets', 'ds'],
    plural: 'daemonsets.apps',
    getHeader: () => pad('NAME', 20) + pad('DESIRED', 9) + pad('CURRENT', 9) + pad('READY', 7) + 'AGE',
    getRow: (engine, o) => {
      const pods = engine.podsOwnedBy(o);
      return pad(o.metadata.name, 20) + pad(pods.length, 9) + pad(pods.length, 9) + pad(pods.filter((p) => p.status.ready).length, 7) + fmtAge(o.metadata.creationTimestamp);
    },
    describe: (engine, o) => {
      const pods = engine.podsOwnedBy(o);
      const c = o.spec.template.spec.containers;
      return `Name:               ${o.metadata.name}\nNamespace:          ${o.metadata.namespace}\nSelector:           ${labelStr(o.spec.selector.matchLabels)}\nDesired Number of Nodes Scheduled: ${pods.length}\nCurrent Number of Nodes Scheduled: ${pods.length}\nNumber Ready:       ${pods.filter((p) => p.status.ready).length}\nPod Template:\n  Containers:\n` +
        c.map((x) => `   ${x.name}:\n    Image:  ${esc(x.image)}`).join('\n');
    },
    applyDoc: (engine, doc, dns, print) => {
      const spec = doc.spec || {};
      const c = (spec.template && spec.template.spec && spec.template.spec.containers) || [];
      if (!c.length || !c[0].image) return print('error: spec.template.spec.containers[0].image is required', 'err');
      const existed = engine.get('DaemonSet', dns, doc.metadata.name);
      if (existed) {
        existed.spec.template.spec.containers = c;
        return print(`daemonset.apps/${esc(doc.metadata.name)} configured`, 'ok');
      }
      engine.makeDaemonSet({
        name: doc.metadata.name, ns: dns, labels: doc.metadata.labels || null,
        containers: c, tolerations: spec.template.spec.tolerations || null,
      });
      print(`daemonset.apps/${esc(doc.metadata.name)} created`, 'ok');
    },
  },
  /**
   * GitOpsApp (step 16) — an Argo CD/Flux-flavored pointer at a Kustomize-rendered
   * source path. Registered here (not a bespoke branch) purely for the free
   * get/describe/apply CLI surface; the actual drift-detection/sync logic lives in
   * sims/k8s/gitops.js and runs from the facade's reconcile composition, not from
   * anything in this table.
   */
  GitOpsApp: {
    aliases: ['gitopsapp', 'gitopsapps'],
    plural: 'gitopsapps.gitops.sim',
    getHeader: () => pad('NAME', 20) + pad('SOURCE', 24) + pad('SYNC', 12) + pad('AUTOSYNC', 10) + 'AGE',
    getRow: (engine, o) => pad(o.metadata.name, 20) + pad(o.spec.sourcePath, 24) + pad(o.status.syncStatus || 'Unknown', 12) + pad(o.spec.autoSync ? 'True' : 'False', 10) + fmtAge(o.metadata.creationTimestamp),
    describe: (engine, o) => {
      const drift = o.status.lastDrift || [];
      return `Name:            ${o.metadata.name}\nNamespace:       ${o.metadata.namespace}\nSource Path:     ${esc(o.spec.sourcePath)}\nAuto Sync:       ${o.spec.autoSync ? 'True' : 'False'}\nSync Status:     ${o.status.syncStatus || 'Unknown'}\nLast Synced:     ${o.status.lastSyncedAt ? new Date(o.status.lastSyncedAt).toISOString() : '&lt;none&gt;'}\n` +
        (drift.length ? 'Drifted Resources:\n' + drift.map((d) => `  ${d.type === 'missing' ? 'missing ' : 'modified'}  ${esc(d.kind)}/${esc(d.name)}`).join('\n') : 'Drifted Resources:  &lt;none&gt;');
    },
    applyDoc: (engine, doc, dns, print) => {
      const spec = doc.spec || {};
      if (!spec.sourcePath) return print('error: spec.sourcePath is required', 'err');
      const existed = engine.get('GitOpsApp', dns, doc.metadata.name);
      if (existed) {
        existed.spec.sourcePath = spec.sourcePath;
        existed.spec.autoSync = !!spec.autoSync;
        return print(`gitopsapp.gitops.sim/${esc(doc.metadata.name)} configured`, 'ok');
      }
      engine.makeGitOpsApp({ name: doc.metadata.name, ns: dns, labels: doc.metadata.labels || null, sourcePath: spec.sourcePath, autoSync: !!spec.autoSync });
      print(`gitopsapp.gitops.sim/${esc(doc.metadata.name)} created`, 'ok');
    },
  },
  StatefulSet: {
    aliases: ['statefulset', 'statefulsets', 'sts'],
    plural: 'statefulsets.apps',
    getHeader: () => pad('NAME', 20) + pad('READY', 9) + 'AGE',
    getRow: (engine, o) => {
      const pods = engine.podsOwnedBy(o);
      return pad(o.metadata.name, 20) + pad(`${pods.filter((p) => p.status.ready).length}/${o.spec.replicas}`, 9) + fmtAge(o.metadata.creationTimestamp);
    },
    describe: (engine, o) => {
      const pods = engine.podsOwnedBy(o);
      const c = o.spec.template.spec.containers;
      return `Name:               ${o.metadata.name}\nNamespace:          ${o.metadata.namespace}\nSelector:           ${labelStr(o.spec.selector.matchLabels)}\nService Name:       ${o.spec.serviceName}\nReplicas:           ${o.spec.replicas} desired | ${pods.length} total\nPod Template:\n  Containers:\n` +
        c.map((x) => `   ${x.name}:\n    Image:  ${esc(x.image)}`).join('\n');
    },
    applyDoc: (engine, doc, dns, print) => {
      const spec = doc.spec || {};
      const c = (spec.template && spec.template.spec && spec.template.spec.containers) || [];
      if (!c.length || !c[0].image) return print('error: spec.template.spec.containers[0].image is required', 'err');
      const existed = engine.get('StatefulSet', dns, doc.metadata.name);
      if (existed) {
        existed.spec.replicas = spec.replicas != null ? spec.replicas : existed.spec.replicas;
        existed.spec.template.spec.containers = c;
        return print(`statefulset.apps/${esc(doc.metadata.name)} configured`, 'ok');
      }
      engine.makeStatefulSet({
        name: doc.metadata.name, ns: dns, labels: doc.metadata.labels || null,
        replicas: spec.replicas != null ? spec.replicas : 1, containers: c,
        volumeClaimTemplates: spec.volumeClaimTemplates || null,
      });
      print(`statefulset.apps/${esc(doc.metadata.name)} created`, 'ok');
    },
  },
};
for (const [kind, def] of Object.entries(WORKLOAD_KINDS)) {
  for (const a of def.aliases) KIND_ALIASES[a] = kind;
  PLURAL[kind] = def.plural;
}

/* ---------- kubectl ---------- */

export function createKubectl(engine, { files = null, onEdit = null, host = null, packaging = null } = {}) {
  const onMission = engine.onMission;
  let troubleshootHintShown = false;

  const age = (o) => fmtAge(o.sim && o.sim.born ? o.sim.born : o.metadata.creationTimestamp);
  const notFound = (kind, name) => `Error from server (NotFound): ${PLURAL[kind] || kind.toLowerCase() + 's'} "${esc(name)}" not found`;

  /** Clean manifest for -o yaml / edit (drops the private sim key). */
  function manifest(o) {
    const meta = { name: o.metadata.name };
    if (o.metadata.namespace) meta.namespace = o.metadata.namespace;
    if (o.metadata.labels && Object.keys(o.metadata.labels).length) meta.labels = o.metadata.labels;
    if (o.metadata.ownerReferences && o.metadata.ownerReferences.length) meta.ownerReferences = o.metadata.ownerReferences;
    meta.creationTimestamp = new Date(o.metadata.creationTimestamp).toISOString();
    const m = { apiVersion: o.apiVersion, kind: o.kind, metadata: meta };
    if (o.data) m.data = o.data;
    if (o.rules) m.rules = o.rules;
    if (o.roleRef) { m.roleRef = o.roleRef; m.subjects = o.subjects || []; }
    if (o.kind === 'Secret') m.type = 'Opaque';
    if (o.spec && Object.keys(o.spec).length) m.spec = o.spec;
    if (o.kind === 'Pod')
      m.status = {
        phase: o.status.phase,
        ...(o.status.podIP ? { podIP: o.status.podIP } : {}),
        ...(o.status.initContainerStatuses ? { initContainerStatuses: o.status.initContainerStatuses.map((cs, i) => ({ name: cs.name, image: o.spec.initContainers[i].image, ready: cs.ready, state: cs.state })) } : {}),
        containerStatuses: o.status.containerStatuses.map((cs, i) => ({ name: cs.name, image: o.spec.containers[i].image, ready: cs.ready, restartCount: cs.restartCount, state: cs.state })),
      };
    if (o.kind === 'Deployment') {
      const pods = engine.ownedPods(o);
      m.status = { replicas: pods.length, readyReplicas: pods.filter((p) => p.status.ready).length, observedGeneration: o.sim.revision };
    }
    if (o.kind === 'ReplicaSet') {
      const pods = engine.podsOwnedBy(o);
      m.status = { replicas: pods.length, readyReplicas: pods.filter((p) => p.status.ready).length };
    }
    if (o.kind === 'Node') m.status = { conditions: [{ type: 'Ready', status: o.status.ready ? 'True' : 'False' }] };
    if (o.kind === 'StorageClass') { m.provisioner = o.provisioner; m.reclaimPolicy = o.reclaimPolicy; m.volumeBindingMode = o.volumeBindingMode; }
    if (o.kind === 'PersistentVolume' || o.kind === 'PersistentVolumeClaim') m.status = { ...o.status };
    return m;
  }

  const printYaml = (print, objs) => print(esc(objs.map((o) => toYaml(manifest(o))).join('\n---\n')));

  /* ----- get ----- */

  /**
   * engine.list + the single-object filter for `kubectl get KIND NAME`.
   * Without this the row renderers would print every object in the namespace
   * and silently ignore the name the user asked for.
   */
  const listFor = (kind, opts) => {
    const objs = engine.list(kind, opts);
    return opts.only ? objs.filter((o) => o.metadata.name === opts.only) : objs;
  };

  function podRow(p, { all, wide, showLabels }) {
    const total = p.spec.containers.length;
    const ready = (p.status.containerStatuses || []).filter((cs) => cs.ready).length;
    return (
      (all ? pad(p.metadata.namespace, 14) : '') +
      pad(p.metadata.name, 34) + pad(`${ready}/${total}`, 8) + pad(p.status.state, 20) +
      pad(p.status.restarts, 10) + pad(age(p), 6) +
      (wide ? pad(p.status.podIP || '&lt;none&gt;', 14) + pad(p.spec.nodeName || '&lt;none&gt;', 15) : '') +
      (showLabels ? labelStr(p.metadata.labels) : '')
    );
  }

  function getPods(print, opts, one = null) {
    const pods = one ? [one] : engine.list('Pod', opts).sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
    if (!pods.length) return print(`No resources found in ${opts.ns} namespace.`);
    const head =
      (opts.all ? pad('NAMESPACE', 14) : '') + pad('NAME', 34) + pad('READY', 8) + pad('STATUS', 20) + pad('RESTARTS', 10) + pad('AGE', 6) +
      (opts.wide ? pad('IP', 14) + pad('NODE', 15) : '') + (opts.showLabels ? 'LABELS' : '');
    print(head + '\n' + pods.map((p) => podRow(p, opts)).join('\n'));
    const broken = pods.filter((p) => /ImagePull|CrashLoop|Err/.test(p.status.state));
    if (broken.length && !troubleshootHintShown) {
      troubleshootHintShown = true;
      print("<span class='info'>Troubleshooting flow: kubectl describe pod NAME (read Events) → kubectl logs NAME. ImagePullBackOff = bad image name/tag; CrashLoopBackOff = the process inside keeps dying.</span>");
    }
  }

  function getDeploys(print, opts) {
    const ds = listFor('Deployment', opts);
    if (!ds.length) return print(`No resources found in ${opts.ns} namespace.`);
    print(
      (opts.all ? pad('NAMESPACE', 14) : '') + pad('NAME', 12) + pad('READY', 8) + pad('UP-TO-DATE', 12) + pad('AVAILABLE', 11) + pad('AGE', 6) + (opts.wide ? pad('CONTAINERS', 12) + 'IMAGES' : '') + '\n' +
      ds.map((d) => {
        const pods = engine.ownedPods(d);
        const ready = pods.filter((p) => p.status.ready).length;
        const upToDate = pods.filter((p) => engine.podImage(p) === engine.depImage(d)).length;
        return (opts.all ? pad(d.metadata.namespace, 14) : '') + pad(d.metadata.name, 12) + pad(ready + '/' + d.spec.replicas, 8) + pad(upToDate, 12) + pad(ready, 11) + pad(age(d), 6) +
          (opts.wide ? pad(d.spec.template.spec.containers.map((c) => c.name).join(','), 12) + d.spec.template.spec.containers.map((c) => c.image).join(',') : '');
      }).join('\n'),
    );
  }

  function getReplicaSets(print, opts) {
    const rsList = listFor('ReplicaSet', opts);
    if (!rsList.length) return print(`No resources found in ${opts.ns} namespace.`);
    print(
      pad('NAME', 24) + pad('DESIRED', 9) + pad('CURRENT', 9) + pad('READY', 7) + 'AGE\n' +
      rsList.map((rs) => {
        const pods = engine.podsOwnedBy(rs, true);
        return pad(rs.metadata.name, 24) + pad(rs.spec.replicas, 9) + pad(pods.filter((p) => p.status.state !== 'Terminating').length, 9) + pad(pods.filter((p) => p.status.ready).length, 7) + age(rs);
      }).join('\n'),
    );
  }

  function getServices(print, opts) {
    const svcs = listFor('Service', opts);
    const rows = [];
    if ((opts.ns === 'default' || opts.all) && (!opts.only || opts.only === 'kubernetes'))
      rows.push((opts.all ? pad('default', 14) : '') + pad('kubernetes', 14) + pad('ClusterIP', 12) + pad('10.96.0.1', 16) + pad('443/TCP', 10) + '47d');
    for (const s of svcs)
      rows.push((opts.all ? pad(s.metadata.namespace, 14) : '') + pad(s.metadata.name, 14) + pad(s.spec.type, 12) + pad(s.spec.clusterIP, 16) + pad(s.spec.ports[0].port + '/TCP', 10) + age(s));
    if (!rows.length) return print(`No resources found in ${opts.ns} namespace.`);
    print((opts.all ? pad('NAMESPACE', 14) : '') + pad('NAME', 14) + pad('TYPE', 12) + pad('CLUSTER-IP', 16) + pad('PORT(S)', 10) + 'AGE\n' + rows.join('\n'));
  }

  function getEndpoints(print, opts) {
    const svcs = listFor('Service', opts);
    if (!svcs.length) return print(`No resources found in ${opts.ns} namespace.`);
    print(
      pad('NAME', 14) + pad('ENDPOINTS', 40) + 'AGE\n' +
      svcs.map((s) => {
        const eps = engine.endpointsOf(s).map((p) => p.status.podIP + ':' + s.spec.ports[0].targetPort);
        return pad(s.metadata.name, 14) + pad(eps.length ? eps.slice(0, 3).join(',') + (eps.length > 3 ? ' + ' + (eps.length - 3) + ' more...' : '') : '&lt;none&gt;', 40) + age(s);
      }).join('\n'),
    );
  }

  function getNodes(print, opts) {
    const nodes = listFor('Node', opts);
    if (!nodes.length) return print('No resources found');
    print(
      pad('NAME', 16) + pad('STATUS', 28) + pad('ROLES', 16) + pad('AGE', 6) + 'VERSION\n' +
      nodes.map((n) => {
        const status = (n.status.ready ? 'Ready' : 'NotReady') + (n.spec.unschedulable ? ',SchedulingDisabled' : '');
        return pad(n.metadata.name, 16) + pad(status, 28) + pad(n.sim.role, 16) + pad(age(n), 6) + (n.sim.version || 'v1.33.2') + (opts.wide ? '   pods: ' + engine.nodeLoad(n) + '/' + K8S_NODE_CAP : '');
      }).join('\n'),
    );
    onMission('nodes');
  }

  function getPdbs(print, opts) {
    const pdbs = listFor('PodDisruptionBudget', opts);
    if (!pdbs.length) return print(`No resources found in ${opts.ns} namespace.`);
    print(
      pad('NAME', 14) + pad('MIN AVAILABLE', 15) + pad('MAX UNAVAILABLE', 17) + pad('ALLOWED DISRUPTIONS', 21) + 'AGE\n' +
      pdbs.map((o) => {
        const st = engine.pdbStatus(o);
        return pad(o.metadata.name, 14) + pad(o.spec.minAvailable != null ? o.spec.minAvailable : 'N/A', 15) + pad(o.spec.maxUnavailable != null ? o.spec.maxUnavailable : 'N/A', 17) + pad(st.allowed, 21) + age(o);
      }).join('\n'),
    );
    onMission('pdb');
  }

  /**
   * `kubectl get events` with the two things that make an event storm readable:
   * a COUNT column (repeats aggregate into one row) and --sort-by, because the
   * default order is emphatically not chronological in real clusters either.
   */
  function getEvents(print, opts, flags = {}) {
    let evs = engine.events.filter((e) => opts.all || e.ns === opts.ns);
    const fieldSel = flags['field-selector'];
    if (typeof fieldSel === 'string') {
      for (const term of fieldSel.split(',')) {
        const [k, v] = term.split('=');
        if (k === 'type') evs = evs.filter((e) => e.type === v);
        if (k === 'reason') evs = evs.filter((e) => e.reason === v);
        if (k === 'involvedObject.name') evs = evs.filter((e) => e.object.split('/').pop() === v);
      }
      onMission('events-filtered');
    }
    // The 15-row cap is ours (real kubectl prints everything), so it must not
    // decide what a sort ranks: with --sort-by we order the FULL list and keep
    // the top of it, otherwise the count ranking would only ever rank the
    // newest screenful and hide the very storm it was asked for.
    // `engine.events` is kept ordered by lastTimestamp — a repeat moves to the
    // end — so the default view's newest screenful is simply the tail.
    const sortBy = flags['sort-by'];
    if (typeof sortBy === 'string') {
      const key = sortBy.replace(/^\.?(metadata\.)?/, '');
      const byCount = /count/.test(key);
      if (byCount) evs = [...evs].sort((a, b) => b.count - a.count).slice(0, 15);
      else if (/firstTimestamp|creationTimestamp/.test(key)) evs = [...evs].sort((a, b) => a.firstTimestamp - b.firstTimestamp).slice(-15);
      else evs = [...evs].sort((a, b) => a.lastTimestamp - b.lastTimestamp).slice(-15);
      onMission('events-sorted:' + (byCount ? 'count' : 'time'));
    } else {
      evs = evs.slice(-15);
    }
    if (!evs.length) return print(`No events found in ${opts.ns} namespace.`);
    print(pad('LAST SEEN', 11) + pad('TYPE', 9) + pad('REASON', 18) + pad('OBJECT', 30) + pad('COUNT', 7) + 'MESSAGE\n' +
      evs.map((e) => pad(fmtAge(e.lastTimestamp || e.t), 11) + pad(e.type, 9) + pad(e.reason, 18) + pad(esc(e.object), 30) + pad(e.count || 1, 7) + esc(e.message)).join('\n'));
    onMission('events');
  }

  function getGeneric(kind, print, opts, flags = {}) {
    const objs = listFor(kind, opts);
    if (!objs.length) return print(kind === 'Namespace' ? '' : `No resources found in ${opts.ns} namespace.`);
    if (kind === 'Namespace') return print(pad('NAME', 16) + pad('STATUS', 9) + 'AGE\n' + objs.map((o) => pad(o.metadata.name, 16) + pad('Active', 9) + age(o)).join('\n'));
    if (kind === 'ConfigMap' || kind === 'Secret')
      return print(pad('NAME', 18) + (kind === 'Secret' ? pad('TYPE', 8) : '') + pad('DATA', 6) + 'AGE\n' +
        objs.map((o) => pad(o.metadata.name, 18) + (kind === 'Secret' ? pad('Opaque', 8) : '') + pad(Object.keys(o.data || {}).length, 6) + age(o)).join('\n'));
    if (kind === 'ServiceAccount')
      return print(pad('NAME', 18) + pad('SECRETS', 9) + 'AGE\n' + objs.map((o) => pad(o.metadata.name, 18) + pad('0', 9) + age(o)).join('\n'));
    if (kind === 'Role' || kind === 'ClusterRole')
      return print(pad('NAME', 22) + 'CREATED AT\n' + objs.map((o) => pad(o.metadata.name, 22) + new Date(o.metadata.creationTimestamp).toISOString()).join('\n'));
    if (kind === 'RoleBinding' || kind === 'ClusterRoleBinding')
      return print(pad('NAME', 22) + pad('ROLE', 28) + 'AGE\n' + objs.map((o) => pad(o.metadata.name, 22) + pad(o.roleRef.kind + '/' + o.roleRef.name, 28) + age(o)).join('\n'));
    if (kind === 'NetworkPolicy')
      return print(pad('NAME', 24) + pad('POD-SELECTOR', 24) + 'AGE\n' +
        objs.map((o) => pad(o.metadata.name, 24) + pad(selShort(o.spec.podSelector), 24) + age(o)).join('\n'));
    if (kind === 'Ingress')
      return print(pad('NAME', 14) + pad('CLASS', 10) + pad('HOSTS', 30) + pad('ADDRESS', 16) + pad('PORTS', 7) + 'AGE\n' +
        objs.map((o) => pad(o.metadata.name, 14) + pad(o.spec.ingressClassName || '&lt;none&gt;', 10) + pad((o.spec.rules || []).map((r) => r.host || '*').join(',') || '*', 30) + pad('203.0.113.10', 16) + pad('80', 7) + age(o)).join('\n'));
    if (kind === 'GatewayClass')
      return print(pad('NAME', 14) + pad('CONTROLLER', 26) + pad('ACCEPTED', 10) + 'AGE\n' +
        objs.map((o) => pad(o.metadata.name, 14) + pad(o.spec.controllerName || 'sim.io/gateway-controller', 26) + pad('True', 10) + age(o)).join('\n'));
    if (kind === 'Gateway')
      return print(pad('NAME', 14) + pad('CLASS', 10) + pad('ADDRESS', 16) + pad('PROGRAMMED', 12) + 'AGE\n' +
        objs.map((o) => {
          const ok = !!engine.get('GatewayClass', null, o.spec.gatewayClassName || '');
          return pad(o.metadata.name, 14) + pad(o.spec.gatewayClassName || '&lt;none&gt;', 10) + pad(ok ? '203.0.113.20' : '&lt;none&gt;', 16) + pad(ok ? 'True' : 'False', 12) + age(o);
        }).join('\n'));
    if (kind === 'HTTPRoute')
      return print(pad('NAME', 14) + pad('HOSTNAMES', 32) + 'AGE\n' +
        objs.map((o) => pad(o.metadata.name, 14) + pad('[' + (o.spec.hostnames || []).map(esc).join(',') + ']', 32) + age(o)).join('\n'));
    if (kind === 'StorageClass')
      return print(pad('NAME', 18) + pad('PROVISIONER', 24) + pad('RECLAIMPOLICY', 15) + pad('VOLUMEBINDINGMODE', 19) + 'AGE\n' +
        objs.map((o) => pad(o.metadata.name, 18) + pad(esc(o.provisioner), 24) + pad(o.reclaimPolicy, 15) + pad(o.volumeBindingMode, 19) + age(o)).join('\n'));
    if (kind === 'PersistentVolume')
      return print(pad('NAME', 22) + pad('CAPACITY', 10) + pad('ACCESS MODES', 14) + pad('RECLAIM POLICY', 16) + pad('STATUS', 10) + pad('CLAIM', 24) + pad('STORAGECLASS', 14) + 'AGE\n' +
        objs.map((o) => pad(o.metadata.name, 22) + pad(o.spec.capacity.storage, 10) + pad(o.spec.accessModes.join(','), 14) + pad(o.spec.persistentVolumeReclaimPolicy, 16) + pad(o.status.phase, 10) + pad(o.spec.claimRef ? `${o.spec.claimRef.namespace}/${o.spec.claimRef.name}` : '&lt;none&gt;', 24) + pad(o.spec.storageClassName || '&lt;none&gt;', 14) + age(o)).join('\n'));
    if (kind === 'PersistentVolumeClaim')
      return print(pad('NAME', 16) + pad('STATUS', 10) + pad('VOLUME', 22) + pad('CAPACITY', 10) + pad('ACCESS MODES', 14) + pad('STORAGECLASS', 14) + 'AGE\n' +
        objs.map((o) => pad(o.metadata.name, 16) + pad(o.status.phase, 10) + pad(o.spec.volumeName || '&lt;none&gt;', 22) + pad((o.status.capacity && o.status.capacity.storage) || '', 10) + pad((o.status.accessModes || []).join(','), 14) + pad(o.spec.storageClassName || '&lt;none&gt;', 14) + age(o)).join('\n'));
  }

  function cmdGet(print, args, flags) {
    const opts = {
      ns: flags.namespace || 'default',
      all: !!flags['all-namespaces'],
      wide: flags.output === 'wide',
      showLabels: !!flags['show-labels'],
      selector: parseSelector(flags.selector),
    };
    let kindArg = args[1] || '';
    let name = args[2];
    if (kindArg.includes('/')) [kindArg, name] = kindArg.split('/');
    const kind = KIND_ALIASES[kindArg.toLowerCase()];
    if (!kind) return print(`error: the server doesn't have a resource type "${esc(kindArg)}"`, 'err');

    if (name && kind !== 'Event') {
      const obj = CLUSTER_SCOPED.has(kind) ? engine.get(kind, null, name) : engine.get(kind, opts.ns, name);
      if (!obj) return print(notFound(kind, name), 'err');
      if (flags.output === 'yaml') return printYaml(print, [obj]);
      if (kind === 'Pod') return getPods(print, opts, obj);
      opts.only = name; // the row renderers below print just this object
    }
    if (flags.output === 'yaml') {
      const objs = engine.list(kind, opts);
      if (!objs.length) return print(`No resources found in ${opts.ns} namespace.`);
      return printYaml(print, objs);
    }
    if (kind === 'All') {
      getPods(print, opts);
      getDeploys(print, opts);
      getServices(print, opts);
      return;
    }
    if (kind === 'Pod') return getPods(print, opts);
    if (kind === 'Deployment') return getDeploys(print, opts);
    if (kind === 'ReplicaSet') return getReplicaSets(print, opts);
    if (kind === 'Service') return getServices(print, opts);
    if (kind === 'Endpoints') return getEndpoints(print, opts);
    if (kind === 'Node') return getNodes(print, opts);
    if (kind === 'Event') return getEvents(print, opts, flags);
    if (kind === 'PodDisruptionBudget') return getPdbs(print, opts);
    if (WORKLOAD_KINDS[kind]) {
      const def = WORKLOAD_KINDS[kind];
      const objs = listFor(kind, opts);
      if (!objs.length) return print(`No resources found in ${opts.ns} namespace.`);
      return print(def.getHeader() + '\n' + objs.map((o) => def.getRow(engine, o)).join('\n'));
    }
    return getGeneric(kind, print, opts, flags);
  }

  /* ----- describe ----- */

  function eventsBlock(objRef) {
    const evs = engine.events.filter((e) => e.object === objRef).slice(-6);
    if (!evs.length) return 'Events:          <none>';
    return 'Events:\n  ' + pad('Type', 9) + pad('Reason', 18) + pad('Age', 18) + 'Message\n  ' + pad('----', 9) + pad('------', 18) + pad('---', 18) + '-------\n' +
      evs.map((e) => '  ' + pad(e.type, 9) + pad(e.reason, 18) +
        // real describe collapses repeats as "2m (x47 over 6m)" — the (xN) is the
        // single most useful number on a flapping pod
        pad((e.count || 1) > 1 ? `${fmtAge(e.lastTimestamp)} (x${e.count} over ${fmtAge(e.firstTimestamp)})` : fmtAge(e.t), 18) +
        esc(e.message)).join('\n');
  }

  function cmdDescribe(print, args, flags) {
    const ns = flags.namespace || 'default';
    let [, kindArg, name] = args;
    if (kindArg && kindArg.includes('/')) [kindArg, name] = kindArg.split('/');
    const kind = KIND_ALIASES[(kindArg || '').toLowerCase()];
    if (!kind) return print(`error: the server doesn't have a resource type "${esc(kindArg || '')}"`, 'err');
    const obj = CLUSTER_SCOPED.has(kind) ? engine.get(kind, null, name) : engine.get(kind, ns, name);
    if (!obj) return print(notFound(kind, name || ''), 'err');

    if (kind === 'Pod') {
      const probeLine = (label, pr) => pr && pr.httpGet
        ? `\n    ${pad(label + ':', 16)}http-get http://:${pr.httpGet.port}${pr.httpGet.path || '/'} period=${pr.periodSeconds || 10}s #failure=${pr.failureThreshold || 3}`
        : '';
      const resBlock = (label, r) => r && Object.keys(r).length
        ? `\n    ${label}:\n` + Object.entries(r).map(([k, v]) => '      ' + pad(k + ':', 10) + v).join('\n')
        : '';
      const envBlockFor = (c) => {
        const envLines = [];
        for (const e of c.env || []) {
          const vf = e.valueFrom || {};
          if (vf.configMapKeyRef) envLines.push(`${e.name}:  &lt;set to the key '${esc(vf.configMapKeyRef.key)}' of config map '${esc(vf.configMapKeyRef.name)}'&gt;`);
          else if (vf.secretKeyRef) envLines.push(`${e.name}:  &lt;set to the key '${esc(vf.secretKeyRef.key)}' in secret '${esc(vf.secretKeyRef.name)}'&gt;`);
          else envLines.push(`${e.name}:  ${esc(e.value || '')}`);
        }
        for (const ef of c.envFrom || []) {
          if (ef.configMapRef) envLines.push(`(all keys of ConfigMap ${esc(ef.configMapRef.name)})`);
          if (ef.secretRef) envLines.push(`(all keys of Secret ${esc(ef.secretRef.name)})`);
        }
        return envLines.length ? '\n    Environment:\n' + envLines.map((l) => '      ' + l).join('\n') : '';
      };
      // oomCount is a running counter (not transient state), so "Last State" survives the auto-restart
      const oomCountOf = (name) => obj.spec.containers.length <= 1
        ? (obj.sim.oomCount || 0)
        : ((obj.sim.containers && obj.sim.containers[name] && obj.sim.containers[name].oomCount) || 0);
      // shared renderer for both Containers: and Init Containers: entries
      const containerBlock = (c, cs, { init = false } = {}) => {
        const res = c.resources || {};
        const mounts = (c.volumeMounts || []).map((m) => `      ${m.mountPath} from ${m.name}`).join('\n');
        const mountBlock = mounts ? '\n    Mounts:\n' + mounts : '';
        const lastState = !init && oomCountOf(c.name)
          ? '\n    Last State:     Terminated\n      Reason:       OOMKilled\n      Exit Code:    137'
          : '';
        return `  ${c.name}:\n    Image:          ${esc(c.image)}\n    ${c.ports ? 'Port:           ' + c.ports[0].containerPort + '/TCP\n    ' : ''}State:          ${cs ? cs.state : '?'}${lastState}\n    Ready:          ${cs ? cs.ready : false}` +
          (init ? '' : `\n    Restart Count:  ${cs ? cs.restartCount || 0 : 0}`) +
          resBlock('Limits', res.limits) + resBlock('Requests', res.requests) +
          (init ? '' : probeLine('Liveness', c.livenessProbe) + probeLine('Readiness', c.readinessProbe)) +
          envBlockFor(c) + mountBlock +
          (c.command ? '\n    Command:        ' + esc(c.command.join(' ')) : '');
      };
      const initBlock = (obj.spec.initContainers || []).length
        ? '\nInit Containers:\n' + obj.spec.initContainers.map((c, i) => containerBlock(c, (obj.status.initContainerStatuses || [])[i], { init: true })).join('\n')
        : '';
      const containersBlock = obj.spec.containers.map((c, i) => containerBlock(c, (obj.status.containerStatuses || [])[i])).join('\n');
      print(
        `Name:             ${obj.metadata.name}\nNamespace:        ${obj.metadata.namespace}\nNode:             ${obj.spec.nodeName || '&lt;none&gt;'}\nLabels:           ${labelStr(obj.metadata.labels)}\nStatus:           ${obj.status.phase}\nIP:               ${obj.status.podIP || '&lt;none&gt;'}\nControlled By:    ${controlledByOf(obj)}` +
        initBlock +
        `\nContainers:\n${containersBlock}\n` +
        `QoS Class:        ${qosOf(obj)}\nNode-Selectors:   ${obj.spec.nodeSelector ? Object.entries(obj.spec.nodeSelector).map(([k, v]) => k + '=' + v).join(',') : '&lt;none&gt;'}\nTolerations:      ${(obj.spec.tolerations || []).map((t) => (t.key || '(all)') + (t.value ? '=' + t.value : '') + (t.effect ? ':' + t.effect : '')).join(', ') || '&lt;none&gt;'}\n` + eventsBlock('Pod/' + obj.metadata.name),
      );
      return;
    }
    if (kind === 'Deployment') {
      const pods = engine.ownedPods(obj);
      const ready = pods.filter((p) => p.status.ready).length;
      const containersBlock = obj.spec.template.spec.containers.map((c) => `   ${c.name}:\n    Image:  ${esc(c.image)}`).join('\n');
      print(
        `Name:                   ${obj.metadata.name}\nNamespace:              ${obj.metadata.namespace}\nSelector:               ${labelStr(obj.spec.selector.matchLabels)}\nReplicas:               ${obj.spec.replicas} desired | ${pods.length} total | ${ready} available\nStrategyType:           RollingUpdate\nPod Template:\n  Labels:  ${labelStr(obj.spec.template.metadata.labels)}\n  Containers:\n${containersBlock}\nNewReplicaSet:          ${obj.sim.rsName} (${pods.filter((p) => p.sim.rsName === obj.sim.rsName).length} replicas created)\nRevision:               ${obj.sim.revision}\n` + eventsBlock('Deployment/' + obj.metadata.name),
      );
      return;
    }
    if (kind === 'Service') {
      const eps = engine.endpointsOf(obj).map((p) => p.status.podIP + ':' + obj.spec.ports[0].targetPort);
      print(
        `Name:              ${obj.metadata.name}\nNamespace:         ${obj.metadata.namespace}\nSelector:          ${labelStr(obj.spec.selector)}\nType:              ${obj.spec.type}\nIP:                ${obj.spec.clusterIP}\nPort:              ${obj.spec.ports[0].port}/TCP\nTargetPort:        ${obj.spec.ports[0].targetPort}/TCP\nEndpoints:         ${eps.length ? eps.join(',') : '&lt;none&gt;'}` +
        (eps.length ? '' : "\n<span class='info'>Endpoints is empty — no ready pod matches this selector. Check: kubectl get pods --show-labels (labels vs selector), and pod readiness.</span>"),
      );
      return;
    }
    if (kind === 'Node') {
      const pods = engine.list('Pod', { all: true }).filter((p) => p.spec.nodeName === obj.metadata.name && p.status.state !== 'Terminating');
      print(
        `Name:               ${obj.metadata.name}\nRoles:              ${obj.sim.role}\nLabels:             ${labelStr(obj.metadata.labels)}\nTaints:             ${(obj.spec.taints || []).map((t) => t.key + (t.value ? '=' + t.value : '') + ':' + t.effect).join(', ') || '&lt;none&gt;'}\nUnschedulable:      ${obj.spec.unschedulable}\nConditions:\n  Ready             ${obj.status.ready ? 'True' : 'False'}\nNon-terminated Pods: (${pods.length} in total)\n` +
        pods.map((p) => '  ' + pad(p.metadata.namespace, 14) + p.metadata.name).join('\n'),
      );
      return;
    }
    if (kind === 'ConfigMap' || kind === 'Secret') {
      print(`Name:         ${obj.metadata.name}\nNamespace:    ${obj.metadata.namespace}\nType:         ${kind === 'Secret' ? 'Opaque' : 'ConfigMap'}\n\nData\n====\n` +
        Object.entries(obj.data || {}).map(([k, v]) => k + ':  ' + (kind === 'Secret' ? v.length + ' bytes (base64 — try -o yaml)' : esc(v))).join('\n'));
      return;
    }
    if (kind === 'Role' || kind === 'ClusterRole') {
      print(
        `Name:         ${obj.metadata.name}${obj.metadata.namespace ? '\nNamespace:    ' + obj.metadata.namespace : ''}\nPolicyRule:\n  ` +
        pad('Resources', 22) + pad('Non-Resource URLs', 19) + pad('Resource Names', 16) + 'Verbs\n  ' +
        pad('---------', 22) + pad('-----------------', 19) + pad('--------------', 16) + '-----\n' +
        (obj.rules || []).map((r) => '  ' + pad((r.resources || []).join(','), 22) + pad('[]', 19) + pad('[]', 16) + '[' + (r.verbs || []).join(' ') + ']').join('\n'),
      );
      return;
    }
    if (kind === 'RoleBinding' || kind === 'ClusterRoleBinding') {
      print(
        `Name:         ${obj.metadata.name}${obj.metadata.namespace ? '\nNamespace:    ' + obj.metadata.namespace : ''}\nRole:\n  Kind:  ${obj.roleRef.kind}\n  Name:  ${obj.roleRef.name}\nSubjects:\n  ` +
        pad('Kind', 16) + pad('Name', 18) + 'Namespace\n  ' + pad('----', 16) + pad('----', 18) + '---------\n' +
        (obj.subjects || []).map((s) => '  ' + pad(s.kind, 16) + pad(s.name, 18) + (s.namespace || '')).join('\n'),
      );
      return;
    }
    if (kind === 'ServiceAccount') {
      print(`Name:                ${obj.metadata.name}\nNamespace:           ${obj.metadata.namespace}\nMountable secrets:   &lt;none&gt;\nTokens:              &lt;none&gt;`);
      return;
    }
    if (kind === 'PodDisruptionBudget') {
      const st = engine.pdbStatus(obj);
      print(
        `Name:           ${obj.metadata.name}\nNamespace:      ${obj.metadata.namespace}\n` +
        (obj.spec.minAvailable != null ? `Min available:  ${obj.spec.minAvailable}\n` : `Max unavailable: ${obj.spec.maxUnavailable}\n`) +
        `Selector:       ${selShort(obj.spec.selector)}\nStatus:\n    Allowed disruptions:  ${st.allowed}\n    Current:              ${st.ready}\n    Total:                ${st.total}\n` +
        (st.allowed === 0 ? "<span class='info'>Allowed disruptions is 0 — every eviction (kubectl drain) that hits a covered pod will be refused until more matching pods are Ready (scale up) or the budget is loosened.</span>" : ''),
      );
      return;
    }
    if (kind === 'NetworkPolicy') {
      const ruleBlock = (rules, dirWord, peerKey) => {
        if (!rules || !rules.length) return `  Allowing ${dirWord} traffic:\n    &lt;none&gt; (Selected pods are isolated for ${dirWord})`;
        return rules.map((r) => {
          const ports = (r.ports || []).map((p) => `    To Port: ${p.port}/${p.protocol || 'TCP'}`).join('\n') || '    To Port: &lt;any&gt; (traffic allowed to all ports)';
          const peers = (r[peerKey] || []).map((f) => '      ' + [
            f.podSelector ? 'PodSelector: ' + selShort(f.podSelector) : '',
            f.namespaceSelector ? 'NamespaceSelector: ' + selShort(f.namespaceSelector) : '',
          ].filter(Boolean).join(' AND ')).join('\n') || '      &lt;any&gt; (traffic not restricted by source)';
          return `${ports}\n    ${peerKey === 'from' ? 'From' : 'To'}:\n${peers}`;
        }).join('\n    ----------\n');
      };
      const types = (obj.spec.policyTypes && obj.spec.policyTypes.length ? obj.spec.policyTypes : ['Ingress']).join(', ');
      print(
        `Name:         ${obj.metadata.name}\nNamespace:    ${obj.metadata.namespace}\nSpec:\n  PodSelector:     ${selShort(obj.spec.podSelector)}\n` +
        (types.includes('Ingress') ? ruleBlock(obj.spec.ingress, 'ingress', 'from') + '\n' : '') +
        (types.includes('Egress') ? ruleBlock(obj.spec.egress, 'egress', 'to') + '\n' : '') +
        `  Policy Types: ${types}`,
      );
      return;
    }
    if (kind === 'Ingress') {
      const rows = [];
      for (const r of obj.spec.rules || [])
        for (const p of (r.http && r.http.paths) || []) {
          const svcRef = (p.backend && p.backend.service) || {};
          const svc = engine.get('Service', obj.metadata.namespace, svcRef.name || '');
          const portN = svcRef.port && svcRef.port.number != null ? svcRef.port.number : svcRef.port;
          const eps = svc ? engine.endpointsOf(svc).map((q) => q.status.podIP + ':' + svc.spec.ports[0].targetPort) : [];
          rows.push('  ' + pad(r.host || '*', 26) + pad(p.path || '/', 10) + `${esc(svcRef.name || '?')}:${portN} (${svc ? (eps.join(',') || '&lt;none&gt;') : '&lt;error: service not found&gt;'})`);
        }
      print(
        `Name:             ${obj.metadata.name}\nNamespace:        ${obj.metadata.namespace}\nAddress:          203.0.113.10\nIngress Class:    ${obj.spec.ingressClassName || '&lt;none&gt;'}\nRules:\n  ` +
        pad('Host', 26) + pad('Path', 10) + 'Backends\n  ' + pad('----', 26) + pad('----', 10) + '--------\n' + (rows.join('\n') || '  *  /  &lt;none&gt;'),
      );
      return;
    }
    if (kind === 'Gateway') {
      const ok = !!engine.get('GatewayClass', null, obj.spec.gatewayClassName || '');
      print(
        `Name:          ${obj.metadata.name}\nNamespace:     ${obj.metadata.namespace}\nGateway Class: ${esc(obj.spec.gatewayClassName || '&lt;none&gt;')}${ok ? '' : '  (no such GatewayClass — nothing implements this Gateway!)'}\nListeners:\n` +
        (obj.spec.listeners || []).map((l) => `  Name: ${esc(l.name || 'http')}\n    Port:     ${l.port}\n    Protocol: ${esc(l.protocol || 'HTTP')}\n    Hostname: ${esc(l.hostname || '*')}`).join('\n') +
        `\nStatus:\n  Programmed: ${ok ? 'True' : 'False'}`,
      );
      return;
    }
    if (kind === 'HTTPRoute') {
      const parents = (obj.spec.parentRefs || []).map((r) => r.name).join(', ');
      print(
        `Name:        ${obj.metadata.name}\nNamespace:   ${obj.metadata.namespace}\nParent Refs: ${esc(parents || '&lt;none&gt; — attach it to a Gateway via spec.parentRefs')}\nHostnames:   ${(obj.spec.hostnames || []).map(esc).join(', ') || '*'}\nRules:\n` +
        (obj.spec.rules || []).map((r, i) => {
          const m = (r.matches || []).map((x) => (x.path && x.path.value) || '/').join(', ') || '/';
          const be = (r.backendRefs || []).map((b) => `${esc(b.name)}:${b.port}${b.weight != null ? ' (weight ' + b.weight + ')' : ''}`).join(', ') || '&lt;none&gt;';
          return `  [${i}] Match: path ${esc(m)}\n      BackendRefs: ${be}`;
        }).join('\n'),
      );
      return;
    }
    if (kind === 'StorageClass') {
      print(`Name:            ${obj.metadata.name}\nProvisioner:     ${esc(obj.provisioner)}\nReclaimPolicy:   ${obj.reclaimPolicy}\nVolumeBindingMode: ${obj.volumeBindingMode}`);
      return;
    }
    if (kind === 'PersistentVolume') {
      print(
        `Name:            ${obj.metadata.name}\nStorageClass:    ${obj.spec.storageClassName || '&lt;none&gt;'}\nStatus:          ${obj.status.phase}\nClaim:           ${obj.spec.claimRef ? obj.spec.claimRef.namespace + '/' + obj.spec.claimRef.name : '&lt;none&gt;'}\nReclaim Policy:  ${obj.spec.persistentVolumeReclaimPolicy}\nAccess Modes:    ${obj.spec.accessModes.join(',')}\nCapacity:        ${obj.spec.capacity.storage}` +
        (obj.sim.dynamic ? "\n<span class='info'>Dynamically provisioned by its StorageClass — nothing you created by hand.</span>" : ''),
      );
      return;
    }
    if (kind === 'PersistentVolumeClaim') {
      const reasons = obj.sim.pendingReasons || [];
      print(
        `Name:            ${obj.metadata.name}\nNamespace:       ${obj.metadata.namespace}\nStorageClass:    ${obj.spec.storageClassName || '&lt;none&gt;'}\nStatus:          ${obj.status.phase}\nVolume:          ${obj.spec.volumeName || '&lt;none&gt;'}\nCapacity:        ${(obj.status.capacity && obj.status.capacity.storage) || '&lt;none&gt;'}\nAccess Modes:    ${(obj.status.accessModes || []).join(',')}` +
        (reasons.length ? `\n<span class='info'>Pending: ${esc(reasons.join('; '))}</span>` : ''),
      );
      return;
    }
    if (WORKLOAD_KINDS[kind]) return print(WORKLOAD_KINDS[kind].describe(engine, obj) + eventsBlock(kind + '/' + obj.metadata.name));
    print(`Name:  ${obj.metadata.name}\nStatus:  Active`);
  }

  /* ----- create / run / apply ----- */

  function cmdCreate(print, args, flags, rest) {
    const ns = flags.namespace || 'default';
    const what = (args[1] || '').toLowerCase();
    if (flags.filename) return cmdApply(print, args, flags, true);

    if (what === 'job') {
      const name = args[2];
      if (!name) return print('error: usage: kubectl create job NAME --image=IMAGE [-- COMMAND] | --from=cronjob/NAME', 'err');
      if (engine.get('Job', ns, name)) return print(`Error from server (AlreadyExists): jobs.batch "${esc(name)}" already exists`, 'err');
      if (flags.from) {
        const [fromKind, fromName] = String(flags.from).split('/');
        if (fromKind !== 'cronjob' && fromKind !== 'cronjobs') return print('error: --from must be cronjob/NAME', 'err');
        const cj = engine.get('CronJob', ns, fromName || '');
        if (!cj) return print(notFound('CronJob', fromName || ''), 'err');
        const jt = cj.spec.jobTemplate.spec;
        engine.makeJob({ name, ns, completions: jt.completions, parallelism: jt.parallelism, backoffLimit: jt.backoffLimit, containers: jt.template.spec.containers });
        print(`job.batch/${esc(name)} created`, 'ok');
        print("<span class='info'>A one-off run of the CronJob's template — same as if the schedule had just fired.</span>");
        return;
      }
      if (!flags.image) return print('error: usage: kubectl create job NAME --image=IMAGE [-- COMMAND] | --from=cronjob/NAME', 'err');
      engine.makeJob({ name, ns, image: flags.image, command: rest || null });
      print(`job.batch/${esc(name)} created`, 'ok');
      print("<span class='info'>Unlike a Deployment, a Job's pod runs to completion — Succeeded, not Running forever.</span>");
      return;
    }
    if (what === 'cronjob' || what === 'cj') {
      const name = args[2];
      if (!name || !flags.image || !flags.schedule) return print('error: usage: kubectl create cronjob NAME --image=IMAGE --schedule="* * * * *" [-- COMMAND]', 'err');
      if (engine.get('CronJob', ns, name)) return print(`Error from server (AlreadyExists): cronjobs.batch "${esc(name)}" already exists`, 'err');
      engine.makeCronJob({ name, ns, image: flags.image, command: rest || null, schedule: flags.schedule });
      print(`cronjob.batch/${esc(name)} created`, 'ok');
      print("<span class='info'>The schedule is real cron syntax — this sim just runs its clock fast so you can watch it fire.</span>");
      return;
    }

    if (what === 'deployment' || what === 'deploy') {
      const name = args[2];
      const image = flags.image;
      const replicas = parseInt(flags.replicas || '1', 10);
      if (!name || !image) return print('error: usage: kubectl create deployment NAME --image=IMAGE [--replicas=N]', 'err');
      if (engine.get('Deployment', ns, name)) return print(`Error from server (AlreadyExists): deployments.apps "${esc(name)}" already exists`, 'err');
      if (!engine.get('Namespace', null, ns)) return print(`Error from server (NotFound): namespaces "${esc(ns)}" not found`, 'err');
      if (flags['dry-run']) {
        const d = { apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name, namespace: ns, labels: { app: name } }, spec: { replicas, selector: { matchLabels: { app: name } }, template: { metadata: { labels: { app: name } }, spec: { containers: [{ name: imageRepo(image), image }] } } } };
        return print(esc(toYaml(d)));
      }
      engine.makeDeployment({ name, ns, replicas, image });
      print(`deployment.apps/${esc(name)} created`, 'ok');
      print(`<span class='info'>→ Deployment written to etcd. ReplicaSet controller creates ${replicas} pod(s); scheduler assigns nodes; kubelets start containers. Watch the cluster view →</span>`);
      if (!imageKnown(image)) print(`<span class='info'>Heads up: the registry doesn't know "${esc(image)}" — the Deployment is accepted anyway (the API server doesn't check images). The kubelet will fail to pull it. Watch for ImagePullBackOff.</span>`);
      if (replicas >= 2) onMission('create');
      return;
    }
    if (what === 'namespace' || what === 'ns') {
      const name = args[2];
      if (!name) return print('error: exactly one NAME is required', 'err');
      if (engine.get('Namespace', null, name)) return print(`Error from server (AlreadyExists): namespaces "${esc(name)}" already exists`, 'err');
      engine.makeNamespace(name);
      return print(`namespace/${esc(name)} created`, 'ok');
    }
    if (what === 'configmap' || what === 'cm' || what === 'secret') {
      const isSecret = what === 'secret';
      const name = isSecret ? args[3] : args[2]; // kubectl create secret generic NAME
      if (isSecret && (args[2] || '') !== 'generic') return print('error: only "kubectl create secret generic" is supported here', 'err');
      if (!name) return print('error: NAME is required', 'err');
      const data = {};
      for (const lit of [].concat(flags['from-literal'] || [])) {
        const eq = String(lit).indexOf('=');
        if (eq < 1) return print(`error: invalid literal "${esc(lit)}" — use key=value`, 'err');
        const k = lit.slice(0, eq), v = lit.slice(eq + 1);
        data[k] = isSecret ? b64(v) : v;
      }
      const kind = isSecret ? 'Secret' : 'ConfigMap';
      if (engine.get(kind, ns, name)) return print(`Error from server (AlreadyExists): ${PLURAL[kind]} "${esc(name)}" already exists`, 'err');
      engine.put({ apiVersion: 'v1', kind, metadata: { name, namespace: ns, creationTimestamp: Date.now() }, data, spec: {}, status: {}, sim: {} });
      print(`${kind.toLowerCase()}/${esc(name)} created`, 'ok');
      if (isSecret) print("<span class='info'>Secrets are only base64-encoded, not encrypted — see for yourself: kubectl get secret " + esc(name) + ' -o yaml</span>');
      return;
    }
    if (what === 'serviceaccount' || what === 'sa') {
      const name = args[2];
      if (!name) return print('error: exactly one NAME is required', 'err');
      if (engine.get('ServiceAccount', ns, name)) return print(`Error from server (AlreadyExists): serviceaccounts "${esc(name)}" already exists`, 'err');
      if (!engine.get('Namespace', null, ns)) return print(`Error from server (NotFound): namespaces "${esc(ns)}" not found`, 'err');
      engine.makeServiceAccount(name, ns);
      return print(`serviceaccount/${esc(name)} created`, 'ok');
    }
    if (what === 'role' || what === 'clusterrole') {
      const isCluster = what === 'clusterrole';
      const name = args[2];
      const verbs = [].concat(flags.verb || []).flatMap((v) => String(v).split(',')).filter(Boolean);
      const resources = [].concat(flags.resource || []).flatMap((r) => String(r).split(',')).filter(Boolean).map(normResource);
      if (!name || !verbs.length || !resources.length)
        return print(`error: usage: kubectl create ${what} NAME --verb=get,list --resource=pods`, 'err');
      const kind = isCluster ? 'ClusterRole' : 'Role';
      const rns = isCluster ? null : ns;
      const obj = {
        apiVersion: 'rbac.authorization.k8s.io/v1', kind,
        metadata: { name, ...(isCluster ? {} : { namespace: ns }), creationTimestamp: Date.now() },
        rules: [{ apiGroups: [''], resources, verbs }],
        spec: {}, status: {}, sim: {},
      };
      if (flags['dry-run']) return print(esc(toYaml(manifest(obj))));
      if (engine.get(kind, rns, name)) return print(`Error from server (AlreadyExists): ${PLURAL[kind]} "${esc(name)}" already exists`, 'err');
      engine.put(obj);
      engine.notify();
      print(`${what}/${esc(name)} created`, 'ok');
      print(`<span class='info'>${isCluster
        ? 'A ClusterRole is namespace-less. Bind it with a ClusterRoleBinding for cluster-wide power, or with a RoleBinding to grant it inside just one namespace.'
        : 'A Role is only a list of allowed verb × resource pairs in ONE namespace. Nothing changes until a RoleBinding attaches it to a subject.'}</span>`);
      return;
    }
    if (what === 'rolebinding' || what === 'clusterrolebinding') {
      const isCluster = what === 'clusterrolebinding';
      const name = args[2];
      if (!name) return print('error: exactly one NAME is required', 'err');
      if (isCluster && flags.role) return print('error: a clusterrolebinding can only reference a ClusterRole (--clusterrole=NAME)', 'err');
      if (flags.role && flags.clusterrole) return print('error: use exactly one of --role or --clusterrole', 'err');
      const roleName = flags.clusterrole || flags.role;
      if (!roleName) return print(`error: usage: kubectl create ${what} NAME --role=R|--clusterrole=CR --serviceaccount=NS:NAME|--user=USER`, 'err');
      const subjects = [];
      for (const sa of [].concat(flags.serviceaccount || [])) {
        const [sns, sname] = String(sa).split(':');
        if (!sname) return print(`error: serviceaccount must be NAMESPACE:NAME, got "${esc(sa)}"`, 'err');
        subjects.push({ kind: 'ServiceAccount', name: sname, namespace: sns });
      }
      for (const u of [].concat(flags.user || [])) subjects.push({ kind: 'User', name: String(u), apiGroup: 'rbac.authorization.k8s.io' });
      for (const g of [].concat(flags.group || [])) subjects.push({ kind: 'Group', name: String(g), apiGroup: 'rbac.authorization.k8s.io' });
      if (!subjects.length) return print('error: at least one subject is required (--serviceaccount=NS:NAME, --user=USER)', 'err');
      const kind = isCluster ? 'ClusterRoleBinding' : 'RoleBinding';
      const bns = isCluster ? null : ns;
      const obj = {
        apiVersion: 'rbac.authorization.k8s.io/v1', kind,
        metadata: { name, ...(isCluster ? {} : { namespace: ns }), creationTimestamp: Date.now() },
        roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: flags.clusterrole ? 'ClusterRole' : 'Role', name: roleName },
        subjects, spec: {}, status: {}, sim: {},
      };
      if (flags['dry-run']) return print(esc(toYaml(manifest(obj))));
      if (engine.get(kind, bns, name)) return print(`Error from server (AlreadyExists): ${PLURAL[kind]} "${esc(name)}" already exists`, 'err');
      engine.put(obj);
      engine.notify();
      print(`${what}.rbac.authorization.k8s.io/${esc(name)} created`, 'ok');
      print("<span class='info'>RBAC wiring complete: subject (who) ↔ role (which verbs on which resources). Verify it with: kubectl auth can-i VERB RESOURCE --as=system:serviceaccount:NS:NAME -n NS</span>");
      return;
    }
    if (what === 'poddisruptionbudget' || what === 'pdb') {
      const name = args[2];
      const selector = parseSelector(flags.selector);
      const minA = flags['min-available'] != null ? parseInt(flags['min-available'], 10) : null;
      const maxU = flags['max-unavailable'] != null ? parseInt(flags['max-unavailable'], 10) : null;
      if (!name || !selector || (minA == null && maxU == null))
        return print('error: usage: kubectl create poddisruptionbudget NAME --selector=app=web --min-available=2 (or --max-unavailable=1)', 'err');
      const obj = {
        apiVersion: 'policy/v1', kind: 'PodDisruptionBudget',
        metadata: { name, namespace: ns, creationTimestamp: Date.now() },
        spec: { ...(minA != null ? { minAvailable: minA } : { maxUnavailable: maxU }), selector: { matchLabels: selector } },
        status: {}, sim: {},
      };
      if (flags['dry-run']) return print(esc(toYaml(manifest(obj))));
      if (engine.get('PodDisruptionBudget', ns, name)) return print(`Error from server (AlreadyExists): ${PLURAL.PodDisruptionBudget} "${esc(name)}" already exists`, 'err');
      engine.put(obj);
      engine.notify();
      print(`poddisruptionbudget.policy/${esc(name)} created`, 'ok');
      print("<span class='info'>A PDB doesn't create or protect pods by itself — it only makes the eviction API (kubectl drain) refuse to go below the budget. Watch it: kubectl get pdb (ALLOWED DISRUPTIONS is computed live).</span>");
      return;
    }
    if (what === 'ingress' || what === 'ing') {
      const name = args[2];
      const rules = [].concat(flags.rule || []);
      if (!name || !rules.length)
        return print('error: usage: kubectl create ingress NAME --rule=host/path=service:port [--rule=…] [--class=NAME]', 'err');
      const byHost = new Map();
      for (const raw of rules) {
        const m = String(raw).replace(/^"|"$/g, '').match(/^([^/=]*)(\/[^=]*)=([\w.-]+):(\d+)$/);
        if (!m) return print(`error: invalid --rule "${esc(raw)}" — expected host/path=service:port (e.g. shop.example.com/api=api:8080)`, 'err');
        const [, host, path, svc, port] = m;
        if (!byHost.has(host)) byHost.set(host, []);
        byHost.get(host).push({ path: path || '/', pathType: 'Prefix', backend: { service: { name: svc, port: { number: Number(port) } } } });
      }
      const obj = {
        apiVersion: 'networking.k8s.io/v1', kind: 'Ingress',
        metadata: { name, namespace: ns, creationTimestamp: Date.now() },
        spec: {
          ...(flags.class ? { ingressClassName: String(flags.class) } : {}),
          rules: [...byHost.entries()].map(([host, paths]) => ({ ...(host ? { host } : {}), http: { paths } })),
        },
        status: {}, sim: {},
      };
      if (flags['dry-run']) return print(esc(toYaml(manifest(obj))));
      if (engine.get('Ingress', ns, name)) return print(`Error from server (AlreadyExists): ${PLURAL.Ingress} "${esc(name)}" already exists`, 'err');
      engine.put(obj);
      engine.notify();
      print(`ingress.networking.k8s.io/${esc(name)} created`, 'ok');
      print("<span class='info'>An Ingress is only routing RULES — an ingress-controller pod does the actual proxying (the sim plays that part). Test it like an external client: curl http://HOST/PATH</span>");
      return;
    }
    print(`error: unknown create target "${esc(what)}" (supported: deployment, job, cronjob, namespace, configmap, secret generic, serviceaccount, role, clusterrole, rolebinding, clusterrolebinding, ingress, poddisruptionbudget, -f FILE)`, 'err');
  }

  /**
   * PSA + image-policy admission for a to-be-created Pod: on rejection, logs a
   * FailedCreate event and prints the Forbidden error; returns whether it was
   * admitted. Shared by `kubectl run` and `apply -f pod.yaml` — the sim's only
   * two direct-Pod-creation paths.
   */
  function admitOrReject(print, containers, ns, name) {
    const reject = (reason) => {
      const message = `pods "${name}" is forbidden: ${reason}`;
      engine.addEvent({ ns, type: 'Warning', reason: 'FailedCreate', object: 'Pod/' + name, message });
      print(`Error from server (Forbidden): ${esc(message)}`, 'err');
      return false;
    };
    const psa = admitPod(engine, containers, ns);
    if (!psa.allowed) return reject(`violates PodSecurity "${psa.level}:latest": ${psa.reason}`);
    for (const c of containers) {
      const imgCheck = checkImagePolicy(engine, c.image, ns);
      if (!imgCheck.allowed) return reject(imgCheck.reason);
    }
    return true;
  }

  function cmdRun(print, args, flags, rest) {
    const ns = flags.namespace || 'default';
    const name = args[1];
    if (!name || !flags.image) return print('error: usage: kubectl run NAME --image=IMAGE [-- COMMAND]', 'err');
    if (engine.get('Pod', ns, name)) return print(`Error from server (AlreadyExists): pods "${esc(name)}" already exists`, 'err');
    if (flags['dry-run']) {
      const p = { apiVersion: 'v1', kind: 'Pod', metadata: { name, namespace: ns, labels: parseSelector(flags.labels) || { run: name } }, spec: { containers: [{ name, image: flags.image, ...(rest ? { command: rest } : {}) }] } };
      return print(esc(toYaml(p)));
    }
    if (!admitOrReject(print, [{ name, image: flags.image }], ns, name)) return;
    engine.makePod({ name, ns, labels: parseSelector(flags.labels) || { run: name }, image: flags.image, command: rest || null });
    print(`pod/${esc(name)} created`, 'ok');
    print("<span class='info'>This is a bare pod — no controller owns it. If it dies or you delete it, nothing brings it back. Deployments exist for a reason.</span>");
  }

  function applyDoc(print, doc, ns) {
    if (!doc || typeof doc !== 'object') return;
    const kind = doc.kind;
    const meta = doc.metadata || {};
    const name = meta.name;
    if (!kind || !name) return print('error: error validating data: every manifest needs kind and metadata.name', 'err');
    const dns = meta.namespace || ns;
    if (kind !== 'Namespace' && kind !== 'Node' && !engine.get('Namespace', null, dns))
      return print(`Error from server (NotFound): namespaces "${esc(dns)}" not found`, 'err');

    if (WORKLOAD_KINDS[kind]) { WORKLOAD_KINDS[kind].applyDoc(engine, doc, dns, print); onMission('apply'); return; }

    if (kind === 'Namespace') {
      const existingNs = engine.get('Namespace', null, name);
      if (existingNs) {
        if (meta.labels) Object.assign(existingNs.metadata.labels, meta.labels);
        return print(`namespace/${name} configured`, 'ok');
      }
      engine.makeNamespace(name, undefined, meta.labels || {});
      return print(`namespace/${name} created`, 'ok');
    }
    if (kind === 'Pod') {
      if (engine.get('Pod', dns, name)) return print(`Error from server (Conflict): pods "${esc(name)}" already exists — most pod fields are immutable; delete it first`, 'err');
      const containers = (doc.spec && doc.spec.containers) || [];
      if (!containers.length || !containers[0].image) return print('error: spec.containers[0].image is required', 'err');
      if (!admitOrReject(print, containers, dns, name)) return;
      const common = {
        name, ns: dns, labels: meta.labels || {},
        volumes: (doc.spec && doc.spec.volumes) || null,
        tolerations: (doc.spec && doc.spec.tolerations) || [],
        nodeSelector: (doc.spec && doc.spec.nodeSelector) || null,
        affinity: (doc.spec && doc.spec.affinity) || null,
      };
      if (containers.length > 1 || (doc.spec.initContainers || []).length) {
        engine.makePod({ ...common, containers, initContainers: doc.spec.initContainers || null });
      } else {
        const c = containers[0];
        engine.makePod({
          ...common, image: c.image, command: c.command || null,
          readinessProbe: c.readinessProbe || null,
          livenessProbe: c.livenessProbe || null,
          resources: c.resources || null,
          env: c.env || null,
          envFrom: c.envFrom || null,
          volumeMounts: c.volumeMounts || null,
          containerPort: c.ports && c.ports[0] ? c.ports[0].containerPort : null,
          securityContext: c.securityContext || null,
        });
      }
      onMission('apply');
      return print(`pod/${name} created`, 'ok');
    }
    if (kind === 'Deployment') {
      const spec = doc.spec || {};
      const tmpl = spec.template || {};
      const containers = (tmpl.spec && tmpl.spec.containers) || [];
      if (!containers.length || !containers[0].image) return print('error: spec.template.spec.containers[0].image is required', 'err');
      const existing = engine.get('Deployment', dns, name);
      if (existing) {
        // apply replaces the container spec wholesale (like server-side apply
        // with a single manager) — removing a field in YAML removes it live
        const oldContainers = existing.spec.template.spec.containers;
        const oldInit = existing.spec.template.spec.initContainers || null;
        const newInit = tmpl.spec.initContainers || null;
        const podFields = (s) => JSON.stringify({
          v: s.volumes || null, a: s.affinity || null, t: s.tolerations || null, n: s.nodeSelector || null,
        });
        const templateChanged = JSON.stringify(oldContainers) !== JSON.stringify(containers) ||
          JSON.stringify(oldInit) !== JSON.stringify(newInit) ||
          podFields(existing.spec.template.spec) !== podFields(tmpl.spec || {});
        existing.spec.replicas = spec.replicas != null ? spec.replicas : existing.spec.replicas;
        if (tmpl.metadata && tmpl.metadata.labels) existing.spec.template.metadata.labels = tmpl.metadata.labels;
        if (spec.selector && spec.selector.matchLabels) existing.spec.selector.matchLabels = spec.selector.matchLabels;
        if (templateChanged) {
          existing.spec.template.spec.containers = containers;
          if (newInit && newInit.length) existing.spec.template.spec.initContainers = newInit;
          else delete existing.spec.template.spec.initContainers;
          for (const [field, val] of [['volumes', tmpl.spec && tmpl.spec.volumes], ['affinity', tmpl.spec && tmpl.spec.affinity], ['tolerations', tmpl.spec && tmpl.spec.tolerations], ['nodeSelector', tmpl.spec && tmpl.spec.nodeSelector]]) {
            if (val) existing.spec.template.spec[field] = val;
            else delete existing.spec.template.spec[field];
          }
          engine.rotateDeployment(existing); // any template change rolls the pods
        }
        return print(`deployment.apps/${name} configured`, 'ok');
      }
      // the pod template's labels — NOT necessarily the same as the selector, which is
      // allowed to be a narrower subset — must be right from the start: makeDeployment()
      // clones the template into a real ReplicaSet immediately, so patching labels
      // afterward (like the pre-RS code did) would leave the RS with a stale copy.
      const labels = (tmpl.metadata && tmpl.metadata.labels) || (spec.selector && spec.selector.matchLabels) || { app: name };
      const common = {
        name, ns: dns, labels, replicas: spec.replicas != null ? spec.replicas : 1,
        tolerations: (tmpl.spec && tmpl.spec.tolerations) || null,
        nodeSelector: (tmpl.spec && tmpl.spec.nodeSelector) || null,
        affinity: (tmpl.spec && tmpl.spec.affinity) || null,
      };
      let d;
      if (containers.length > 1 || (tmpl.spec.initContainers || []).length) {
        d = engine.makeDeployment({ ...common, containers, initContainers: tmpl.spec.initContainers || null, volumes: (tmpl.spec && tmpl.spec.volumes) || null });
      } else {
        const c = containers[0];
        d = engine.makeDeployment({
          ...common, image: c.image, command: c.command || null,
          readinessProbe: c.readinessProbe || null, livenessProbe: c.livenessProbe || null,
          resources: c.resources || null, env: c.env || null, envFrom: c.envFrom || null,
          volumeMounts: c.volumeMounts || null, volumes: (tmpl.spec && tmpl.spec.volumes) || null,
          containerPort: c.ports && c.ports[0] ? c.ports[0].containerPort : null,
        });
      }
      if (spec.selector && spec.selector.matchLabels) d.spec.selector.matchLabels = spec.selector.matchLabels;
      onMission('apply');
      return print(`deployment.apps/${name} created`, 'ok');
    }
    if (kind === 'Service') {
      const spec = doc.spec || {};
      const port = spec.ports && spec.ports[0] ? spec.ports[0].port : 80;
      const targetPort = spec.ports && spec.ports[0] ? spec.ports[0].targetPort || port : port;
      const existing = engine.get('Service', dns, name);
      if (existing) {
        existing.spec.selector = spec.selector || existing.spec.selector;
        existing.spec.ports = [{ port: Number(port), targetPort: Number(targetPort) }];
        return print(`service/${name} configured`, 'ok');
      }
      engine.makeService({ name, ns: dns, selector: spec.selector || {}, port, targetPort });
      return print(`service/${name} created`, 'ok');
    }
    if (kind === 'ConfigMap' || kind === 'Secret') {
      engine.put({ apiVersion: 'v1', kind, metadata: { name, namespace: dns, creationTimestamp: Date.now() }, data: doc.data || {}, spec: {}, status: {}, sim: {} });
      return print(`${kind.toLowerCase()}/${name} created`, 'ok');
    }
    if (kind === 'ServiceAccount') {
      if (engine.get('ServiceAccount', dns, name)) return print(`serviceaccount/${name} unchanged`);
      engine.makeServiceAccount(name, dns);
      return print(`serviceaccount/${name} created`, 'ok');
    }
    if (kind === 'Role' || kind === 'ClusterRole') {
      const cluster = kind === 'ClusterRole';
      const existed = engine.get(kind, cluster ? null : dns, name);
      engine.put({
        apiVersion: 'rbac.authorization.k8s.io/v1', kind,
        metadata: { name, ...(cluster ? {} : { namespace: dns }), creationTimestamp: existed ? existed.metadata.creationTimestamp : Date.now() },
        rules: doc.rules || [], spec: {}, status: {}, sim: {},
      });
      engine.notify();
      return print(`${kind.toLowerCase()}.rbac.authorization.k8s.io/${name} ${existed ? 'configured' : 'created'}`, 'ok');
    }
    if (kind === 'RoleBinding' || kind === 'ClusterRoleBinding') {
      if (!doc.roleRef || !doc.roleRef.name) return print('error: roleRef is required', 'err');
      const cluster = kind === 'ClusterRoleBinding';
      const existed = engine.get(kind, cluster ? null : dns, name);
      engine.put({
        apiVersion: 'rbac.authorization.k8s.io/v1', kind,
        metadata: { name, ...(cluster ? {} : { namespace: dns }), creationTimestamp: existed ? existed.metadata.creationTimestamp : Date.now() },
        roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: doc.roleRef.kind || 'Role', name: doc.roleRef.name },
        subjects: doc.subjects || [], spec: {}, status: {}, sim: {},
      });
      engine.notify();
      return print(`${kind.toLowerCase()}.rbac.authorization.k8s.io/${name} ${existed ? 'configured' : 'created'}`, 'ok');
    }
    if (kind === 'PodDisruptionBudget') {
      const spec = doc.spec || {};
      if (!spec.selector) return print('error: error validating data: spec.selector is required', 'err');
      if (spec.minAvailable == null && spec.maxUnavailable == null) return print('error: error validating data: one of spec.minAvailable / spec.maxUnavailable is required', 'err');
      const existed = engine.get('PodDisruptionBudget', dns, name);
      engine.put({
        apiVersion: 'policy/v1', kind,
        metadata: { name, namespace: dns, creationTimestamp: existed ? existed.metadata.creationTimestamp : Date.now() },
        spec, status: {}, sim: {},
      });
      engine.notify();
      return print(`poddisruptionbudget.policy/${name} ${existed ? 'configured' : 'created'}`, 'ok');
    }
    if (kind === 'NetworkPolicy') {
      const spec = doc.spec || {};
      if (!spec.podSelector) return print('error: error validating data: spec.podSelector is required (use {} to select every pod in the namespace)', 'err');
      const existed = engine.get('NetworkPolicy', dns, name);
      engine.put({
        apiVersion: 'networking.k8s.io/v1', kind,
        metadata: { name, namespace: dns, creationTimestamp: existed ? existed.metadata.creationTimestamp : Date.now() },
        spec, status: {}, sim: {},
      });
      engine.notify();
      print(`networkpolicy.networking.k8s.io/${name} ${existed ? 'configured' : 'created'}`, 'ok');
      if (!existed) print("<span class='info'>NetworkPolicies select PODS (podSelector), not Services, and they are allow-lists: the moment any policy selects a pod, all traffic in that direction not explicitly allowed is dropped. Test it: kubectl exec POD -- wget -qO- SVC:PORT</span>");
      return;
    }
    if (kind === 'Ingress') {
      const spec = doc.spec || {};
      if (!(spec.rules || []).length) return print('error: error validating data: spec.rules is required', 'err');
      const existed = engine.get('Ingress', dns, name);
      engine.put({
        apiVersion: 'networking.k8s.io/v1', kind,
        metadata: { name, namespace: dns, creationTimestamp: existed ? existed.metadata.creationTimestamp : Date.now() },
        spec, status: {}, sim: {},
      });
      engine.notify();
      print(`ingress.networking.k8s.io/${name} ${existed ? 'configured' : 'created'}`, 'ok');
      if (!existed) print("<span class='info'>An Ingress is only routing RULES — an ingress-controller pod does the actual proxying (the sim plays that part). Test it like an external client: curl http://HOST/PATH</span>");
      return;
    }
    if (kind === 'GatewayClass') {
      const existed = engine.get('GatewayClass', null, name);
      engine.put({ apiVersion: 'gateway.networking.k8s.io/v1', kind, metadata: { name, creationTimestamp: existed ? existed.metadata.creationTimestamp : Date.now() }, spec: doc.spec || {}, status: {}, sim: {} });
      engine.notify();
      return print(`gatewayclass.gateway.networking.k8s.io/${name} ${existed ? 'configured' : 'created'}`, 'ok');
    }
    if (kind === 'Gateway') {
      const spec = doc.spec || {};
      if (!spec.gatewayClassName) return print('error: error validating data: spec.gatewayClassName is required', 'err');
      if (!(spec.listeners || []).length) return print('error: error validating data: spec.listeners is required', 'err');
      const existed = engine.get('Gateway', dns, name);
      engine.put({
        apiVersion: 'gateway.networking.k8s.io/v1', kind,
        metadata: { name, namespace: dns, creationTimestamp: existed ? existed.metadata.creationTimestamp : Date.now() },
        spec, status: {}, sim: {},
      });
      engine.notify();
      print(`gateway.gateway.networking.k8s.io/${name} ${existed ? 'configured' : 'created'}`, 'ok');
      if (!engine.get('GatewayClass', null, spec.gatewayClassName))
        print(`<span class='info'>Heads up: no GatewayClass named "${esc(spec.gatewayClassName)}" exists — the Gateway stays un-Programmed (kubectl get gatewayclass).</span>`);
      else if (!existed)
        print("<span class='info'>Gateway = the listener half of routing (class, port, hostname). Routes attach to it separately: an HTTPRoute names this Gateway in spec.parentRefs — role separation Ingress never had.</span>");
      return;
    }
    if (kind === 'HTTPRoute') {
      const spec = doc.spec || {};
      if (!(spec.parentRefs || []).length) return print('error: error validating data: spec.parentRefs is required (which Gateway does this route attach to?)', 'err');
      const existed = engine.get('HTTPRoute', dns, name);
      engine.put({
        apiVersion: 'gateway.networking.k8s.io/v1', kind,
        metadata: { name, namespace: dns, creationTimestamp: existed ? existed.metadata.creationTimestamp : Date.now() },
        spec, status: {}, sim: {},
      });
      engine.notify();
      print(`httproute.gateway.networking.k8s.io/${name} ${existed ? 'configured' : 'created'}`, 'ok');
      const refs = ((spec.rules || [])[0] || {}).backendRefs || [];
      if (refs.length > 1 && refs.some((b) => b.weight != null))
        print("<span class='info'>Weighted backendRefs split traffic — a built-in canary. curl the route a few times and count who answers.</span>");
      return;
    }
    if (kind === 'StorageClass') {
      if (!doc.provisioner) return print('error: error validating data: provisioner is required', 'err');
      if (engine.get('StorageClass', null, name)) return print(`storageclass.storage.k8s.io/${name} unchanged`);
      engine.makeStorageClass({ name, provisioner: doc.provisioner, reclaimPolicy: doc.reclaimPolicy || 'Delete', volumeBindingMode: doc.volumeBindingMode || 'Immediate' });
      return print(`storageclass.storage.k8s.io/${name} created`, 'ok');
    }
    if (kind === 'PersistentVolume') {
      const spec = doc.spec || {};
      if (!spec.capacity || !spec.capacity.storage) return print('error: error validating data: spec.capacity.storage is required', 'err');
      if (!(spec.accessModes || []).length) return print('error: error validating data: spec.accessModes is required', 'err');
      if (engine.get('PersistentVolume', null, name)) return print(`persistentvolume/${name} unchanged`);
      engine.makePV({ name, capacity: spec.capacity.storage, accessModes: spec.accessModes, reclaimPolicy: spec.persistentVolumeReclaimPolicy || 'Retain', storageClassName: spec.storageClassName || null });
      print(`persistentvolume/${name} created`, 'ok');
      print("<span class='info'>A static PV — it sits Available until a PVC's capacity/accessModes/storageClassName matches it. Watch: kubectl get pv</span>");
      return;
    }
    if (kind === 'PersistentVolumeClaim') {
      const spec = doc.spec || {};
      if (!(spec.accessModes || []).length) return print('error: error validating data: spec.accessModes is required', 'err');
      const reqStorage = spec.resources && spec.resources.requests && spec.resources.requests.storage;
      if (!reqStorage) return print('error: error validating data: spec.resources.requests.storage is required', 'err');
      if (engine.get('PersistentVolumeClaim', dns, name)) return print(`persistentvolumeclaim/${name} unchanged`);
      engine.makePVC({ name, ns: dns, accessModes: spec.accessModes, requestStorage: reqStorage, storageClassName: spec.storageClassName || null });
      print(`persistentvolumeclaim/${name} created`, 'ok');
      print("<span class='info'>A PVC only REQUESTS storage — it stays Pending until a matching PersistentVolume binds (statically, or dynamically via its StorageClass). Watch: kubectl get pvc</span>");
      return;
    }
    print(`error: the simulator can't apply kind "${esc(kind)}" yet (supported: Pod, Deployment, Job, CronJob, DaemonSet, StatefulSet, Service, ConfigMap, Secret, Namespace, ServiceAccount, Role, ClusterRole, RoleBinding, ClusterRoleBinding, NetworkPolicy, Ingress, GatewayClass, Gateway, HTTPRoute, PodDisruptionBudget, StorageClass, PersistentVolume, PersistentVolumeClaim)`, 'err');
  }

  function cmdApply(print, args, flags) {
    if (flags.kustomize) {
      if (!files) return print('error: no manifest files available in this lab', 'err');
      const { docs, error } = buildKustomization(files, String(flags.kustomize).replace(/\/+$/, ''));
      if (error) return print(`error: ${esc(error)}`, 'err');
      for (const doc of docs) applyDoc(print, doc, flags.namespace || 'default');
      return;
    }
    if (!flags.filename) return print('error: must specify -f FILE or -k DIR', 'err');
    if (!files) return print('error: no manifest files available in this lab', 'err');
    const text = files.read(flags.filename);
    if (text == null) return print(`error: the path "${esc(flags.filename)}" does not exist — create it in the Manifests editor →`, 'err');
    let docs;
    try { docs = loadAll(text).filter(Boolean); } catch (e) {
      return print(`error: error parsing ${esc(flags.filename)}: ${esc(String(e.message).split('\n')[0])}`, 'err');
    }
    if (!docs.length) return print(`error: no objects found in ${esc(flags.filename)}`, 'err');
    for (const doc of docs) applyDoc(print, doc, flags.namespace || 'default');
  }

  /* ----- mutate ----- */

  function cmdScale(print, args, flags) {
    const ns = flags.namespace || 'default';
    let name = args[2];
    if (args[1] && args[1].includes('/')) name = args[1].split('/')[1];
    const d = engine.get('Deployment', ns, name || '');
    if (!d) return print(notFound('Deployment', name || ''), 'err');
    const n = parseInt(flags.replicas, 10);
    if (isNaN(n) || n < 0) return print('error: --replicas=N is required', 'err');
    const old = d.spec.replicas;
    d.spec.replicas = n;
    print(`deployment.apps/${d.metadata.name} scaled`, 'ok');
    if (n > old) onMission('scale');
    if (n > K8S_NODE_CAP * 2)
      print("<span class='info'>Heads up: workers fit " + K8S_NODE_CAP + ' pods each — extras will sit Pending. This is exactly what happens in real clusters when capacity runs out (then autoscalers add nodes).</span>');
  }

  function cmdDelete(print, args, flags) {
    const ns = flags.namespace || 'default';
    if (flags.filename) {
      if (!files) return print('error: no manifest files available', 'err');
      const text = files.read(flags.filename);
      if (text == null) return print(`error: the path "${esc(flags.filename)}" does not exist`, 'err');
      let docs;
      try { docs = loadAll(text).filter(Boolean); } catch { return print('error: cannot parse ' + esc(flags.filename), 'err'); }
      for (const doc of docs) {
        const kind = doc.kind, name = doc.metadata && doc.metadata.name;
        const obj = kind && name && engine.get(kind, kind === 'Namespace' ? null : (doc.metadata.namespace || ns), name);
        if (!obj) { print(notFound(kind || '?', name || '?'), 'err'); continue; }
        deleteObj(print, obj);
      }
      return;
    }
    const kindArg = (args[1] || '').toLowerCase();
    const kind = KIND_ALIASES[kindArg];
    if (!kind) return print(`error: the server doesn't have a resource type "${esc(args[1] || '')}"`, 'err');
    let targets = [];
    if (flags.selector) {
      targets = engine.list(kind, { ns, selector: parseSelector(flags.selector) });
      if (!targets.length) return print(`No resources found in ${ns} namespace.`);
    } else {
      const names = args.slice(2);
      if (!names.length) return print('error: resource name or -l selector is required', 'err');
      for (const name of names) {
        const obj = CLUSTER_SCOPED.has(kind) ? engine.get(kind, null, name) : engine.get(kind, ns, name);
        if (!obj) return print(notFound(kind, name), 'err');
        targets.push(obj);
      }
    }
    for (const obj of targets) deleteObj(print, obj);
  }

  function deleteObj(print, obj) {
    onMission('deleted:' + obj.kind + '/' + obj.metadata.name);
    if (obj.kind === 'Pod') {
      print(`pod "${obj.metadata.name}" deleted`, 'ok');
      const owned = !!obj.sim.owner;
      engine.deletePodAndHeal(obj);
      if (owned) print("<span class='info'>Now watch the cluster view: desired ≠ actual, so a replacement pod appears in ~1s with a NEW name. Pods are cattle, not pets.</span>");
      else print("<span class='info'>Bare pod: nothing owned it, so nothing will recreate it. Gone is gone.</span>");
      return;
    }
    if (obj.kind === 'Deployment') {
      for (const p of engine.ownedPods(obj, true)) engine.markTerminating(p);
      for (const rs of engine.replicaSetsOf(obj)) engine.remove(rs);
      engine.remove(obj);
      return print(`deployment.apps "${obj.metadata.name}" deleted`, 'ok');
    }
    if (obj.kind === 'ReplicaSet') {
      for (const p of engine.podsOwnedBy(obj, true)) engine.markTerminating(p);
      engine.remove(obj);
      return print(`replicaset.apps "${obj.metadata.name}" deleted`, 'ok');
    }
    if (obj.kind === 'DaemonSet' || obj.kind === 'StatefulSet') {
      for (const p of engine.podsOwnedBy(obj, true)) engine.markTerminating(p);
      engine.remove(obj);
      return print(`${obj.kind.toLowerCase()}.apps "${obj.metadata.name}" deleted`, 'ok');
    }
    if (obj.kind === 'Job') {
      for (const p of engine.podsOwnedBy(obj, true)) engine.markTerminating(p);
      engine.remove(obj);
      return print(`job.batch "${obj.metadata.name}" deleted`, 'ok');
    }
    if (obj.kind === 'CronJob') {
      for (const j of engine.list('Job', { ns: obj.metadata.namespace })) {
        if (!(j.metadata.ownerReferences || []).some((r) => r.kind === 'CronJob' && r.name === obj.metadata.name)) continue;
        for (const p of engine.podsOwnedBy(j, true)) engine.markTerminating(p);
        engine.remove(j);
      }
      engine.remove(obj);
      return print(`cronjob.batch "${obj.metadata.name}" deleted`, 'ok');
    }
    if (obj.kind === 'PersistentVolumeClaim') {
      const pv = obj.spec.volumeName ? engine.get('PersistentVolume', null, obj.spec.volumeName) : null;
      engine.remove(obj);
      print(`persistentvolumeclaim "${obj.metadata.name}" deleted`, 'ok');
      if (pv) {
        if (pv.spec.persistentVolumeReclaimPolicy === 'Delete') {
          engine.remove(pv);
          print("<span class='info'>Reclaim policy Delete: the bound PersistentVolume (and its data) was deleted too.</span>");
        } else {
          pv.status.phase = 'Released';
          pv.spec.claimRef = null;
          engine.notify();
          print("<span class='info'>Reclaim policy Retain: the PersistentVolume is now Released, not Available — data is kept, but it won't auto-bind to a new PVC without manual cleanup.</span>");
        }
      }
      return;
    }
    if (obj.kind === 'Namespace') {
      if (obj.metadata.name === 'default' || obj.metadata.name === 'kube-system')
        return print(`Error from server (Forbidden): namespace "${obj.metadata.name}" is protected`, 'err');
      engine.deleteNamespaceContents(obj.metadata.name);
      engine.remove(obj);
      return print(`namespace "${obj.metadata.name}" deleted`, 'ok');
    }
    engine.remove(obj);
    print(`${obj.kind.toLowerCase()} "${obj.metadata.name}" deleted`, 'ok');
  }

  function cmdExpose(print, args, flags) {
    const ns = flags.namespace || 'default';
    let name = args[2];
    if (args[1] && args[1].includes('/')) name = args[1].split('/')[1];
    const d = engine.get('Deployment', ns, name || '');
    if (!d) return print(notFound('Deployment', name || ''), 'err');
    const svcName = flags.name || d.metadata.name;
    if (engine.get('Service', ns, svcName)) return print(`Error from server (AlreadyExists): services "${esc(svcName)}" already exists`, 'err');
    engine.makeService({ name: svcName, ns, selector: { ...d.spec.selector.matchLabels }, port: flags.port || 80, targetPort: flags['target-port'] || flags.port || 80 });
    print(`service/${esc(svcName)} exposed`, 'ok');
    print("<span class='info'>The Service gets a stable virtual IP + DNS name (" + esc(svcName) + '.' + ns + '.svc.cluster.local). Pods come and go; the Service always routes to whichever are alive.</span>');
    onMission('expose');
  }

  function cmdSet(print, args, flags) {
    if ((args[1] || '') !== 'image') return print(`error: unknown "set ${esc(args[1] || '')}" (only: set image)`, 'err');
    const ns = flags.namespace || 'default';
    const target = (args[2] || '').split('/');
    const d = engine.get('Deployment', ns, target[1] || '');
    if (!d) return print(notFound('Deployment', target[1] || ''), 'err');
    const spec = args[3] || '';
    const [cname, newImg] = spec.split('=');
    if (!newImg) return print('error: usage: kubectl set image deployment/NAME container=IMAGE', 'err');
    const containers = d.spec.template.spec.containers;
    if (cname !== '*' && !containers.some((c) => c.name === cname))
      return print(`error: unable to find container named "${esc(cname)}" (this deployment's containers are: ${containers.map((c) => c.name).join(', ')})`, 'err');
    if (cname === '*') for (const c of containers) c.image = newImg;
    else containers.find((c) => c.name === cname).image = newImg;
    engine.rotateDeployment(d);
    print(`deployment.apps/${d.metadata.name} image updated`, 'ok');
    print("<span class='info'>Rolling update begins: new-image pods (purple glow) are created one at a time while old ones terminate — zero downtime. Watch →</span>");
    onMission('rollout');
  }

  function cmdRollout(print, args, flags) {
    const ns = flags.namespace || 'default';
    const sub = args[1];
    const target = (args[2] || '').split('/');
    const d = engine.get('Deployment', ns, target[1] || '');
    if (!d) return print(notFound('Deployment', target[1] || ''), 'err');
    if (sub === 'status') {
      const cur = engine.get('ReplicaSet', ns, d.sim.rsName);
      const ready = cur ? engine.podsOwnedBy(cur).filter((p) => p.status.ready).length : 0;
      return print(ready >= d.spec.replicas ? `deployment "${d.metadata.name}" successfully rolled out` : `Waiting for deployment "${d.metadata.name}" rollout to finish: ${ready} of ${d.spec.replicas} updated replicas are available...`);
    }
    if (sub === 'history') {
      return print('deployment.apps/' + d.metadata.name + '\n' + pad('REVISION', 10) + 'IMAGE\n' + d.sim.history.map((h) => pad(h.rev, 10) + esc(h.image)).join('\n'));
    }
    if (sub === 'undo') {
      const toRev = flags['to-revision'] ? Number(flags['to-revision']) : null;
      const target = engine.rollbackDeployment(d, toRev);
      if (!target) return print(toRev ? `error: unable to find specified revision ${toRev} in history` : 'error: no rollout history to undo', 'err');
      print(`deployment.apps/${d.metadata.name} rolled back`, 'ok');
      print("<span class='info'>Undo is just another rolling update — to the previous template. Check kubectl rollout history: the old image comes back as a NEW revision.</span>");
      onMission('undo');
      return;
    }
    print('error: usage: kubectl rollout status|history|undo deployment/NAME [--to-revision=N]', 'err');
  }

  function cmdLogs(print, args, flags) {
    const ns = flags.namespace || 'default';
    const p = engine.get('Pod', ns, args[1] || '');
    if (!p) return print(notFound('Pod', args[1] || ''), 'err');
    const containers = p.spec.containers;
    let c = containers[0];
    if (flags.container) {
      c = containers.find((x) => x.name === flags.container);
      if (!c) return print(`error: container ${esc(flags.container)} not found in pod ${p.metadata.name}`, 'err');
    } else if (containers.length > 1) {
      return print(`error: a container name must be specified for pod ${p.metadata.name}, choose one of: [${containers.map((x) => x.name).join(' ')}]`, 'err');
    }
    const cs = (p.status.containerStatuses || []).find((s) => s.name === c.name);
    if (flags.previous) {
      const prev = (p.sim.prevLogs || {})[c.name];
      if (!cs || !cs.restartCount || !prev || !prev.length)
        return print(`Error from server (BadRequest): previous terminated container "${c.name}" in pod "${p.metadata.name}" not found`, 'err');
      printLogLines(print, prev, flags);
      print("<span class='info'>That is the PREVIOUS instance's log — the one before the restart that bumped RESTARTS. Its last lines are why it died.</span>");
      onMission('logs-previous');
      return;
    }
    if (cs && (cs.state === 'ImagePullBackOff' || cs.state === 'ErrImagePull'))
      return print(`Error from server (BadRequest): container "${c.name}" in pod "${p.metadata.name}" is waiting to start: trying and failing to pull image`, 'err');
    if (p.status.state === 'Pending' || p.status.state === 'ContainerCreating' || (p.status.state || '').startsWith('Init:'))
      return print(`Error from server (BadRequest): container "${c.name}" in pod "${p.metadata.name}" is waiting to start: ContainerCreating`, 'err');
    // fire the "you ran it" flags on any successful read, before the empty-buffer
    // shortcuts below can return early
    if (flags.container && containers.length > 1) onMission('logs-c');
    onMission('logs');
    const lines = (p.sim.logs || {})[c.name] || [];
    if (!lines.length) {
      // a crashing container may not have written its buffer yet
      if ((cs && cs.state === 'CrashLoopBackOff') || (containers.length <= 1 && p.sim.crash))
        return print(esc((p.sim.crashLog || ['exec: process exited with code 1']).join('\n')));
      return print(esc('(no logs)'));
    }
    printLogLines(print, lines, flags);
    if (flags.follow) print("<span class='info'>-f streams until you Ctrl-C. In this sim the stream is a snapshot — run it again to see new lines.</span>");
  }

  /** Shared by `logs` and `logs --previous`: applies --since, --tail, --timestamps. */
  function printLogLines(print, lines, flags) {
    let out = lines;
    const since = parseDuration(flags.since);
    if (since != null) {
      const cutoff = Date.now() - since;
      out = out.filter((l) => l.t >= cutoff);
      onMission('logs-since');
    }
    const tail = flags.tail != null ? Number(flags.tail) : null;
    if (tail != null && tail >= 0) {
      out = out.slice(-tail);
      onMission('logs-tail');
    }
    if (!out.length) return print(esc('(no logs matched)'));
    if (flags.timestamps) onMission('logs-timestamps');
    print(esc(out.map((l) => (flags.timestamps ? new Date(l.t).toISOString() + ' ' : '') + l.msg).join('\n')));
  }

  function cmdExec(print, args, flags, rest) {
    const ns = flags.namespace || 'default';
    const podName = args.filter((a) => a !== 'exec' && a !== '-it' && a !== '-i' && a !== '-t')[0];
    const p = engine.get('Pod', ns, podName || '');
    if (!p) return print(notFound('Pod', podName || ''), 'err');
    if (p.status.state !== 'Running') return print(`error: cannot exec into a container in a ${p.status.state} pod`, 'err');
    let target = p.spec.containers[0];
    if (flags.container) {
      target = p.spec.containers.find((c) => c.name === flags.container);
      if (!target) return print(`error: container ${esc(flags.container)} not found in pod ${p.metadata.name}`, 'err');
    } else if (p.spec.containers.length > 1) {
      return print(`error: a container name must be specified for pod ${p.metadata.name}, choose one of: [${p.spec.containers.map((c) => c.name).join(' ')}]`, 'err');
    }
    const cmd = (rest || []).join(' ');
    if (!cmd) return print('error: you must specify a command: kubectl exec POD -- COMMAND', 'err');
    // in-cluster networking probe: wget/curl SERVICE[:PORT]
    const net = cmd.match(/(?:wget|curl)[^ ]* +(?:-qO- +|-s +)?(?:https?:\/\/)?([a-z0-9.-]+)(?::(\d+))?/);
    if (net) {
      const host = net[1].split('.')[0];
      const hostNs = net[1].split('.')[1] || ns;
      const port = net[2] ? Number(net[2]) : 80;
      const svc = engine.get('Service', hostNs, host);
      if (!svc) return print(`wget: bad address '${esc(net[1])}'\n<span class='info'>DNS: no Service named "${esc(host)}" in namespace "${esc(hostNs)}". Service DNS = name.namespace.svc.cluster.local.</span>`, 'err');
      if (svc.spec.ports[0].port !== port) return print(`wget: can't connect to remote host ${svc.spec.clusterIP}: Connection refused\n<span class='info'>The Service exists but listens on port ${svc.spec.ports[0].port}, not ${port}.</span>`, 'err');
      const eps = engine.endpointsOf(svc);
      if (!eps.length) return print(`wget: can't connect to remote host ${svc.spec.clusterIP}: Connection refused\n<span class='info'>The Service has NO endpoints — its selector matches no ready pod. Debug: kubectl describe svc ${esc(host)} ; kubectl get pods --show-labels</span>`, 'err');
      const backend = eps[0];
      // the container that actually serves the targetPort (falls back to the first container)
      const bc = backend.spec.containers.find((x) => x.ports && x.ports.some((pt) => Number(pt.containerPort) === Number(svc.spec.ports[0].targetPort))) || backend.spec.containers[0];
      const serving = bc.ports && bc.ports[0] ? Number(bc.ports[0].containerPort) : (K8S_IMAGES[imageRepo(bc.image)] || {}).port;
      if (serving && Number(svc.spec.ports[0].targetPort) !== serving)
        return print(`wget: can't connect to remote host ${backend.status.podIP}: Connection refused\n<span class='info'>The Service HAS endpoints, but its targetPort (${svc.spec.ports[0].targetPort}) isn't the port the container actually serves on (${serving}). port = where the Service listens; targetPort = where the pod listens.</span>`, 'err');
      onMission('net-test');
      const verdict = canConnect(engine, { from: p, to: backend, port: Number(svc.spec.ports[0].targetPort) });
      if (!verdict.allowed) {
        onMission('net-blocked');
        return print(`wget: download timed out\n<span class='info'>Blocked by NetworkPolicy "${esc(verdict.policy)}" (${verdict.direction}). DNS resolved and the endpoints are fine — the CNI is silently dropping the packets, which is why policy problems look like timeouts, not refusals. Allow-list rule: once any policy selects a pod, only explicitly allowed traffic gets through.</span>`, 'err');
      }
      return print(`&lt;!DOCTYPE html&gt;\n&lt;h1&gt;Welcome to ${esc(imageRepo(engine.podImage(eps[0])))}!&lt;/h1&gt;\n<span class='ok'>← answered by ${eps[0].metadata.name} (${eps[0].status.podIP})</span>`);
    }
    const writeMatch = cmd.match(/^(?:sh -c )?['"]?echo\s+(.+?)\s*>\s*(\S+?)['"]?$/);
    if (writeMatch) {
      const text = writeMatch[1].replace(/^['"]|['"]$/g, '');
      const path = writeMatch[2];
      for (const m of target.volumeMounts || []) {
        if (!path.startsWith(m.mountPath + '/')) continue;
        const key = path.slice(m.mountPath.length + 1);
        const vol = (p.spec.volumes || []).find((v) => v.name === m.name);
        if (vol && (vol.configMap || vol.secret)) return print(`sh: can't create ${esc(path)}: Read-only file system`, 'err');
        if (vol && (vol.persistentVolumeClaim || vol.emptyDir || vol.hostPath)) {
          const store = engine.resolveVolumeStore(p, m.name);
          if (!store) return print(`sh: can't create ${esc(path)}: No such file or directory\n<span class='info'>${vol.persistentVolumeClaim ? 'This PVC is not Bound yet — kubectl get pvc' : 'volume not ready'}</span>`, 'err');
          store.set(key, text);
          onMission('vol-write:' + (vol.persistentVolumeClaim ? 'pvc' : vol.emptyDir ? 'emptydir' : 'hostpath'));
          return print('');
        }
      }
      return print(`sh: can't create ${esc(path)}: No such file or directory`, 'err');
    }
    if (cmd.startsWith('ls')) return print("bin  dev  etc  home  proc  root  sys  tmp  usr  var\n<span class='info'>That's the container's OWN filesystem (its image layers) — not your laptop's.</span>");
    if (cmd === 'hostname') return print(p.metadata.name);
    if (cmd.startsWith('env')) {
      const c = target;
      const lines = [];
      let fromConfig = false;
      for (const ef of c.envFrom || []) {
        const src = ef.configMapRef ? engine.get('ConfigMap', ns, ef.configMapRef.name) : ef.secretRef ? engine.get('Secret', ns, ef.secretRef.name) : null;
        for (const [k, v] of Object.entries((src && src.data) || {})) { lines.push(`${esc(k)}=${esc(ef.secretRef ? unb64(v) : v)}`); fromConfig = true; }
      }
      for (const e of c.env || []) {
        const vf = e.valueFrom || {};
        let v = e.value;
        if (vf.configMapKeyRef) { const cm = engine.get('ConfigMap', ns, vf.configMapKeyRef.name); v = cm && cm.data ? cm.data[vf.configMapKeyRef.key] : undefined; fromConfig = true; }
        if (vf.secretKeyRef) { const s = engine.get('Secret', ns, vf.secretKeyRef.name); v = s && s.data ? unb64(s.data[vf.secretKeyRef.key]) : undefined; fromConfig = true; }
        if (v !== undefined) lines.push(`${esc(e.name)}=${esc(v)}`);
      }
      print((lines.length ? lines.join('\n') + '\n' : '') + `HOSTNAME=${p.metadata.name}\nKUBERNETES_SERVICE_HOST=10.96.0.1\nKUBERNETES_SERVICE_PORT=443\nPATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin`);
      if (fromConfig) {
        print("<span class='info'>The values above were injected at container START from the ConfigMap/Secret. Note: secret values arrive as plain text inside the container — base64 is transport encoding, not encryption.</span>");
        onMission('cfg-env');
      }
      return;
    }
    if (cmd.startsWith('cat ')) {
      const path = cmd.slice(4).trim();
      const c = target;
      for (const m of c.volumeMounts || []) {
        if (!path.startsWith(m.mountPath + '/')) continue;
        const key = path.slice(m.mountPath.length + 1);
        const vol = (p.spec.volumes || []).find((v) => v.name === m.name);
        if (vol && (vol.persistentVolumeClaim || vol.emptyDir || vol.hostPath)) {
          const store = engine.resolveVolumeStore(p, m.name);
          if (!store || !store.has(key)) return print(`cat: can't open '${esc(path)}': No such file or directory`, 'err');
          return print(esc(store.get(key)));
        }
        const src = vol && vol.configMap ? engine.get('ConfigMap', ns, vol.configMap.name) : vol && vol.secret ? engine.get('Secret', ns, vol.secret.secretName) : null;
        const data = (src && src.data) || {};
        if (!(key in data)) return print(`cat: can't open '${esc(path)}': No such file or directory\n<span class='info'>This mount serves the keys of ${vol && vol.secret ? 'Secret ' + esc(vol.secret.secretName) : 'ConfigMap ' + esc(vol && vol.configMap ? vol.configMap.name : '?')} as files: ${Object.keys(data).map(esc).join(', ') || '(none)'}</span>`, 'err');
        print(esc(vol.secret ? unb64(data[key]) : data[key]));
        if (vol.secret) {
          print("<span class='info'>Decoded! A mounted Secret appears as a plain-text file in the container. Anyone who can exec into the pod (or read etcd) can read it — that's why RBAC and encryption-at-rest matter.</span>");
          onMission('cfg-cat');
        }
        return;
      }
      return print(`cat: can't open '${esc(path)}': No such file or directory`, 'err');
    }
    if (cmd.includes('ps')) return print("PID   USER   COMMAND\n1     root   " + esc((target.command || [imageRepo(target.image)]).join(' ')) + "\n<span class='info'>PID 1 inside! The PID namespace hides all other host processes.</span>");
    print("(simulated) executed '" + esc(cmd) + "' inside " + esc(p.metadata.name));
  }

  /** Latest metrics sample, falling back to a live reading for a just-started pod. */
  const latestCpuM = (p) => {
    const ring = p.sim.metrics || [];
    return ring.length ? ring[ring.length - 1].cpuM : engine.cpuOf(p);
  };

  function cmdTop(print, args, flags) {
    const what = (args[1] || '').toLowerCase();
    const opts = { ns: flags.namespace || 'default', all: !!flags['all-namespaces'] };
    if (what === 'node' || what === 'nodes' || what === 'no') {
      print(pad('NAME', 16) + pad('CPU(cores)', 12) + pad('CPU%', 7) + pad('MEMORY(bytes)', 15) + 'MEMORY%\n' +
        engine.list('Node').map((n) => {
          const sys = n.sim.role === 'control-plane' ? { cpuM: 250, memMi: 700 } : { cpuM: 60, memMi: 300 };
          let cpuM = sys.cpuM, memMi = sys.memMi;
          for (const p of engine.list('Pod', { all: true }))
            if (p.spec.nodeName === n.metadata.name && !p.sim.system && p.status.state !== 'Terminating') { cpuM += latestCpuM(p); memMi += p.sim.memMi || 0; }
          return pad(n.metadata.name, 16) + pad(cpuM + 'm', 12) + pad(Math.round((cpuM / K8S_NODE_ALLOC.cpuM) * 100) + '%', 7) + pad(Math.round(memMi) + 'Mi', 15) + Math.round((memMi / K8S_NODE_ALLOC.memMi) * 100) + '%';
        }).join('\n'));
      return;
    }
    if (what === 'pod' || what === 'pods' || what === 'po') {
      const pods = engine.list('Pod', opts).filter((p) => !p.sim.system && (p.status.state === 'Running' || p.status.state === 'OOMKilled'));
      if (!pods.length) return print(`No resources found in ${opts.ns} namespace.`);
      // real `top` sorts by name; --sort-by=cpu|memory puts the hog on top,
      // which is how you find it during an incident
      const sortBy = String(flags['sort-by'] || '').replace(/^\./, '');
      const sorted = [...pods].sort((a, b) => {
        if (sortBy === 'cpu') return latestCpuM(b) - latestCpuM(a);
        if (sortBy === 'memory') return (b.sim.memMi || 0) - (a.sim.memMi || 0);
        return a.metadata.name.localeCompare(b.metadata.name);
      });
      if (sortBy === 'cpu' || sortBy === 'memory') onMission('top-sorted:' + sortBy);
      print(pad('NAME', 34) + pad('CPU(cores)', 12) + 'MEMORY(bytes)\n' +
        sorted.map((p) => pad(p.metadata.name, 34) + pad(latestCpuM(p) + 'm', 12) + Math.round(p.sim.memMi || 0) + 'Mi').join('\n'));
      onMission('top');
      return;
    }
    print('error: usage: kubectl top pods|nodes [-n NS]', 'err');
  }

  function cmdLabel(print, args, flags) {
    const ns = flags.namespace || 'default';
    const kind = KIND_ALIASES[(args[1] || '').toLowerCase()];
    if (!kind) return print(`error: the server doesn't have a resource type "${esc(args[1] || '')}"`, 'err');
    const obj = CLUSTER_SCOPED.has(kind) ? engine.get(kind, null, args[2] || '') : engine.get(kind, ns, args[2] || '');
    if (!obj) return print(notFound(kind, args[2] || ''), 'err');
    const changes = args.slice(3);
    if (!changes.length) return print('error: at least one label update is required (key=value or key-)', 'err');
    obj.metadata.labels = obj.metadata.labels || {};
    for (const ch of changes) {
      if (ch.endsWith('-')) { delete obj.metadata.labels[ch.slice(0, -1)]; continue; }
      const [k, v] = ch.split('=');
      if (v === undefined) return print(`error: invalid label "${esc(ch)}" — use key=value or key-`, 'err');
      if (obj.metadata.labels[k] !== undefined && obj.metadata.labels[k] !== v && !flags.overwrite)
        return print(`error: '${esc(k)}' already has a value (${esc(obj.metadata.labels[k])}), and --overwrite is false`, 'err');
      obj.metadata.labels[k] = v;
    }
    print(`${obj.kind.toLowerCase()}/${obj.metadata.name} labeled`, 'ok');
    if (kind === 'Pod')
      print("<span class='info'>Labels changed. Anything selecting on labels reacts instantly: Services route (or stop routing) to this pod, and if it no longer matches its ReplicaSet's selector the controller replaces it.</span>");
    engine.notify();
  }

  function cmdNodeOps(print, verb, args, flags) {
    if (verb === 'taint') {
      const name = args[2];
      const n = engine.get('Node', null, name || '');
      if (!n) return print(notFound('Node', name || ''), 'err');
      const spec = args[3] || '';
      if (spec.endsWith('-')) {
        const key = spec.slice(0, -1).split(/[=:]/)[0];
        n.spec.taints = (n.spec.taints || []).filter((t) => t.key !== key);
        print(`node/${n.metadata.name} untainted`, 'ok');
      } else {
        const m = spec.match(/^([^=:]+)(?:=([^:]*))?:(NoSchedule|NoExecute|PreferNoSchedule)$/);
        if (!m) return print('error: usage: kubectl taint nodes NAME key[=value]:NoSchedule (append - to remove)', 'err');
        n.spec.taints = [...(n.spec.taints || []).filter((t) => t.key !== m[1]), { key: m[1], ...(m[2] ? { value: m[2] } : {}), effect: m[3] }];
        print(`node/${n.metadata.name} tainted`, 'ok');
        print("<span class='info'>New pods that don't tolerate this taint won't schedule here. (NoSchedule doesn't evict pods already running — NoExecute would.)</span>");
      }
      engine.notify();
      return;
    }
    const name = args[1];
    const n = engine.get('Node', null, name || '');
    if (!n) return print(notFound('Node', name || ''), 'err');
    if (verb === 'cordon' || verb === 'uncordon') {
      n.spec.unschedulable = verb === 'cordon';
      print(`node/${n.metadata.name} ${verb === 'cordon' ? 'cordoned' : 'uncordoned'}`, 'ok');
      engine.notify();
      return;
    }
    if (verb === 'drain') {
      n.spec.unschedulable = true;
      const victims = engine.list('Pod', { all: true }).filter((p) => p.spec.nodeName === n.metadata.name && !p.sim.system && p.status.state !== 'Terminating');
      print(`node/${n.metadata.name} cordoned`, 'ok');
      const blocked = [];
      for (const p of victims) {
        // drain uses the EVICTION API, which honours PodDisruptionBudgets
        const pdb = engine.evictionBlockedBy(p);
        if (pdb) { blocked.push({ p, pdb }); continue; }
        print(`evicting pod ${p.metadata.namespace}/${p.metadata.name}`);
        engine.markTerminating(p);
      }
      for (const { p } of blocked)
        print(`error when evicting pods/"${p.metadata.name}" -n "${p.metadata.namespace}" (will retry after 5s): Cannot evict pod as it would violate the pod's disruption budget.`, 'err');
      if (blocked.length) {
        const { pdb } = blocked[0];
        const st = engine.pdbStatus(pdb);
        onMission('drain-blocked');
        print(`<span class='info'>PDB "${esc(pdb.metadata.name)}" ${pdb.spec.minAvailable != null ? 'requires ' + pdb.spec.minAvailable + ' available' : 'allows ' + pdb.spec.maxUnavailable + ' unavailable'} and only ${st.ready} matching pod(s) are Ready — allowed disruptions is ${st.allowed}. Real drain retries forever; the sim gives up. Make room (scale the workload up, wait for Ready) and drain again — the node STAYS cordoned meanwhile.</span>`);
      } else {
        print(`node/${n.metadata.name} drained`, 'ok');
        print("<span class='info'>Drain = cordon + evict. Deployment-owned pods get recreated on other nodes; bare pods are just gone. This is how you prep a node for maintenance or upgrade.</span>");
        onMission('drained:' + n.metadata.name);
      }
      engine.notify();
    }
  }

  /* ----- auth ----- */

  function cmdAuth(print, args, flags) {
    if ((args[1] || '') !== 'can-i' || !args[2] || !args[3])
      return print('error: usage: kubectl auth can-i VERB RESOURCE [--as=system:serviceaccount:NS:NAME | --as=USER] [-n NS]', 'err');
    const ns = flags.namespace || 'default';
    const verb = args[2];
    const resource = args[3];
    if (!flags.as) {
      print('yes', 'ok');
      print("<span class='info'>You are cluster-admin in this sim, so the answer is always yes. Impersonate a subject to test RBAC: --as=system:serviceaccount:NS:NAME (or --as=USER).</span>");
      return;
    }
    const subject = parseAsSubject(flags.as);
    const ok = canI(engine, { verb, resource, subject, ns });
    onMission('can-i');
    engine.addEvent({ ns, type: ok ? 'Normal' : 'Warning', reason: ok ? 'RBACAllowed' : 'RBACDenied', object: subject.kind + '/' + subject.name, message: `${subject.kind}:${subject.name} ${ok ? 'is allowed' : 'is forbidden'} to ${verb} ${resource} in ${ns}` });
    print(ok ? 'yes' : 'no', ok ? 'ok' : 'err');
    if (!ok) {
      print("<span class='info'>RBAC is deny-by-default: no Role/ClusterRole bound to this subject allows that verb on that resource (in this namespace). Grant it with a Role + RoleBinding.</span>");
      if (subject.kind === 'ServiceAccount' && !engine.get('ServiceAccount', subject.namespace, subject.name))
        print(`<span class='info'>(Also: ServiceAccount ${esc(subject.namespace)}:${esc(subject.name)} doesn't exist — impersonation still evaluates, but pods can't run as it.)</span>`);
    }
  }

  /* ----- curl (external client → Ingress / Gateway) ----- */

  function cmdCurl(print, tokens) {
    const url = tokens.slice(1).find((t) => !t.startsWith('-'));
    if (!url) return print('error: usage: curl http://HOST/PATH   (you are an EXTERNAL client hitting the cluster edge)', 'err');
    const m = String(url).replace(/^https?:\/\//, '').match(/^([^/:]+)(?::\d+)?(\/.*)?$/);
    if (!m) return print(`curl: (3) URL rejected: ${esc(url)}`, 'err');
    const host = m[1];
    const path = m[2] || '/';
    const res = resolveHttp(engine, { host, path });
    if (res.status === 404) {
      onMission('curl-404');
      return print(`HTTP/1.1 404 Not Found\n<span class='info'>${esc(res.reason)} — the edge only answers for hosts/paths a rule claims. Check: kubectl get ingress ; kubectl get httproute</span>`, 'err');
    }
    if (res.status === 503) {
      onMission('curl-503');
      const via = res.matched ? `${res.matched.kind.toLowerCase()}/${res.matched.via.metadata.name}` : '?';
      return print(`HTTP/1.1 503 Service Unavailable\n<span class='info'>${via} matched, but ${esc(res.reason)}. Routing rule ✓ — now debug the Service/pods behind it.</span>`, 'err');
    }
    // 200 — pick a backend by weight among services that have ready endpoints
    const live = res.backends.filter((b) => b.endpoints.length);
    const total = live.reduce((s, b) => s + b.weight, 0);
    let roll = Math.random() * (total || 1);
    let picked = live[0];
    for (const b of live) { roll -= b.weight; if (roll <= 0) { picked = b; break; } }
    const pod = picked.endpoints[Math.floor(Math.random() * picked.endpoints.length)];
    const via = res.matched.kind === 'Ingress'
      ? `Ingress/${res.matched.via.metadata.name} (path ${res.matched.prefix})`
      : `Gateway/${res.matched.gateway.metadata.name} → HTTPRoute/${res.matched.via.metadata.name}${res.backends.length > 1 ? ` (weight ${picked.weight}/${total})` : ` (path ${res.matched.prefix})`}`;
    onMission('curl-ok:' + host + path);
    print(`HTTP/1.1 200 OK\n&lt;h1&gt;Welcome to ${esc(imageRepo(engine.podImage(pod)))}!&lt;/h1&gt;\n<span class='ok'>← ${esc(host + path)} matched ${via} → Service/${picked.svc.metadata.name} → ${pod.metadata.name}</span>`);
  }

  /* ----- help ----- */

  const HELP =
    'kubectl get pods|deploy|svc|nodes|ns|rs|endpoints|events|cm|secrets|all  [-o wide|yaml] [-n NS] [-A] [-l k=v] [--show-labels]\n' +
    'kubectl run NAME --image=IMG [-- CMD]        kubectl create deployment NAME --image=IMG [--replicas=N]\n' +
    'kubectl create namespace|configmap|secret …  kubectl apply -f FILE.yaml   (files live in the Manifests editor)\n' +
    'kubectl scale deployment NAME --replicas=N   kubectl delete pod|deploy|svc|ns NAME [-l k=v] [-f FILE]\n' +
    'kubectl describe pod|deploy|svc|node NAME    kubectl exec POD -- CMD\n' +
    'kubectl logs POD [-c C] [--previous] [--tail=N] [--since=5m] [--timestamps] [-f]\n' +
    'kubectl get events [--sort-by=.lastTimestamp|.count] [--field-selector type=Warning]   (COUNT aggregates repeats)\n' +
    'kubectl top pods|nodes [--sort-by=cpu|memory]  (usage vs requests/limits — watch a leak head for its OOMKill)\n' +
    'kubectl expose deployment NAME --port=N      kubectl set image deployment/NAME C=IMG\n' +
    'kubectl rollout status|history|undo deployment/NAME [--to-revision=N]\n' +
    'kubectl label pod NAME k=v|k- [--overwrite]  kubectl cordon|uncordon|drain NODE   kubectl taint nodes NODE k=v:NoSchedule\n' +
    'kubectl label node NAME k=v                  (nodeSelector / affinity target labels)\n' +
    'kubectl create serviceaccount NAME           kubectl create role|clusterrole NAME --verb=get,list --resource=pods\n' +
    'kubectl create rolebinding|clusterrolebinding NAME --role=R|--clusterrole=CR --serviceaccount=NS:NAME|--user=U\n' +
    'kubectl auth can-i VERB RESOURCE [--as=system:serviceaccount:NS:NAME] [-n NS]   (RBAC is deny-by-default)\n' +
    'kubectl get netpol|ingress|gatewayclass|gateway|httproute    kubectl create ingress NAME --rule=host/path=svc:port\n' +
    'curl http://HOST/PATH                        (act as an EXTERNAL client — routed by your Ingress/Gateway rules)\n' +
    'kubectl get pdb / create poddisruptionbudget NAME --selector=k=v --min-available=N   (drain honours PDBs)\n' +
    'ssh NODE … exit                              (be ON a node: kubeadm upgrade plan|apply vX.Y.Z|node, apt-get install\n' +
    '                                              -y kubeadm=X.Y.Z-1.1, systemctl restart kubelet, kubeadm certs check-expiration)\n' +
    'etcdctl snapshot save FILE --endpoints=… --cacert=… --cert=… --key=…    etcdutl snapshot restore FILE --data-dir DIR\n' +
    "Add --dry-run=client -o yaml to create/run to print YAML instead of creating; append '> file.yaml' to save it.\n" +
    "Alias: k = kubectl. Try breaking things — that's what the Troubleshooting module grades you on.";

  /* ----- dispatcher ----- */

  function exec(rawCmd, print) {
    // output redirection: `... > file.yaml` writes what would be printed
    let cmd = rawCmd;
    let redirect = null;
    const rm = rawCmd.match(/^(.*?)\s*>\s*([\w./-]+)\s*$/);
    if (rm) { cmd = rm[1]; redirect = rm[2]; }
    let captured = '';
    const out = !redirect
      ? print
      : (html, cls = 'out') => {
          if (cls === 'out' || cls === 'ok') captured += String(html).replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') + '\n';
          else print(html, cls);
        };

    const t = splitQuoted(cmd.trim());
    if (!t.length) return;
    if (t[0] === 'help') return print(HELP, 'info');
    if (t[0] === 'docker')
      return print("This is the Kubernetes lab — here you speak kubectl, not docker. K8s tells each node's container runtime what to run; you never docker-run manually.", 'err');
    if (t[0] === 'curl') return cmdCurl(out, t);
    if (host && host.handles(t[0])) return host.exec(cmd, out);
    if (packaging && packaging.handles(t[0])) return packaging.exec(cmd, out);
    if (t[0] !== 'kubectl' && t[0] !== 'k') return print(`bash: ${esc(t[0])}: command not found (try 'help')`, 'err');

    const { args, flags, rest } = parseTokens(t.slice(1));
    const verb = args[0];

    if (verb === 'get') cmdGet(out, args, flags);
    else if (verb === 'describe') cmdDescribe(out, args, flags);
    else if (verb === 'create') cmdCreate(out, args, flags, rest);
    else if (verb === 'run') cmdRun(out, args, flags, rest);
    else if (verb === 'apply') cmdApply(out, args, flags);
    else if (verb === 'delete') cmdDelete(out, args, flags);
    else if (verb === 'scale') cmdScale(out, args, flags);
    else if (verb === 'expose') cmdExpose(out, args, flags);
    else if (verb === 'set') cmdSet(out, args, flags);
    else if (verb === 'rollout') cmdRollout(out, args, flags);
    else if (verb === 'logs') cmdLogs(out, args, flags);
    else if (verb === 'top') cmdTop(out, args, flags);
    else if (verb === 'exec') cmdExec(out, args, flags, rest);
    else if (verb === 'label') cmdLabel(out, args, flags);
    else if (verb === 'auth') cmdAuth(out, args, flags);
    else if (verb === 'taint' || verb === 'cordon' || verb === 'uncordon' || verb === 'drain') cmdNodeOps(out, verb, args, flags);
    else if (verb === 'edit') {
      const kind = KIND_ALIASES[(args[1] || '').split('/')[0].toLowerCase()];
      let name = args[2] || (args[1] || '').split('/')[1];
      const ns = flags.namespace || 'default';
      const obj = kind && name && (CLUSTER_SCOPED.has(kind) ? engine.get(kind, null, name) : engine.get(kind, ns, name));
      if (!obj) return print(notFound(kind || '?', name || ''), 'err');
      if (!files) return print('error: no editor available in this lab', 'err');
      const fname = `${name}-${kind.toLowerCase()}.yaml`;
      files.write(fname, toYaml(manifest(obj)));
      if (onEdit) onEdit(fname);
      print(`Opened ${fname} in the Manifests editor → edit it, then: kubectl apply -f ${fname}`, 'info');
    }
    else if (verb === 'api-resources')
      print(pad('NAME', 14) + pad('SHORTNAMES', 12) + pad('NAMESPACED', 12) + 'KIND\n' +
        [['pods', 'po', 'true', 'Pod'], ['deployments', 'deploy', 'true', 'Deployment'], ['replicasets', 'rs', 'true', 'ReplicaSet'], ['services', 'svc', 'true', 'Service'], ['configmaps', 'cm', 'true', 'ConfigMap'], ['secrets', '', 'true', 'Secret'], ['namespaces', 'ns', 'false', 'Namespace'], ['nodes', 'no', 'false', 'Node'], ['events', 'ev', 'true', 'Event'], ['endpoints', 'ep', 'true', 'Endpoints'], ['networkpolicies', 'netpol', 'true', 'NetworkPolicy'], ['ingresses', 'ing', 'true', 'Ingress'], ['gatewayclasses', 'gc', 'false', 'GatewayClass'], ['gateways', 'gtw', 'true', 'Gateway'], ['httproutes', '', 'true', 'HTTPRoute']].map((r) => pad(r[0], 14) + pad(r[1], 12) + pad(r[2], 12) + r[3]).join('\n'));
    else print(`error: unknown command "${esc(verb || '')}" — try 'help'`, 'err');

    if (redirect) {
      if (!files) return print('error: cannot write files in this lab', 'err');
      files.write(redirect, captured.trimEnd() + '\n');
      print(`(wrote ${captured.trimEnd().split('\n').length} lines to ${esc(redirect)} — see the Manifests editor →)`, 'info');
      if (onEdit) onEdit(redirect);
    }
  }

  return { exec, applyDoc, deleteObj };
}
