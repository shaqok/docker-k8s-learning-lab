import { rid } from '../util.js';

export const K8S_NODE_CAP = 4;

/** Images the sim-cluster's registry knows. Anything else → ImagePullBackOff. */
export const K8S_IMAGES = {
  nginx: { port: 80, logs: ['/docker-entrypoint.sh: Configuration complete; ready for start up', '2026/07/07 09:12:01 [notice] 1#1: nginx/1.27.0', '2026/07/07 09:12:01 [notice] 1#1: start worker processes'] },
  httpd: { port: 80, logs: ['AH00558: httpd: Could not reliably determine the server\'s fully qualified domain name', '[mpm_event:notice] AH00489: Apache/2.4.62 configured -- resuming normal operations'] },
  redis: { port: 6379, logs: ['1:C 07 Jul 2026 09:12:01.000 * Redis version=7.4.0', '1:M 07 Jul 2026 09:12:01.002 * Ready to accept connections tcp'] },
  postgres: { port: 5432, logs: ['PostgreSQL init process complete; ready for start up.', 'LOG:  database system is ready to accept connections'] },
  busybox: { oneshot: true, logs: [] },
  alpine: { oneshot: true, logs: [] },
};

export const imageRepo = (image) => String(image || '').split(':')[0];
export const imageKnown = (image) => !!K8S_IMAGES[imageRepo(image)];

/** Per-worker allocatable resources (control-plane is tainted anyway). */
export const K8S_NODE_ALLOC = { cpuM: 2000, memMi: 2000 };

/** "512Mi" | "1Gi" | "500M" → Mi (null if unset/unparsable). */
export function parseMem(s) {
  if (s == null) return null;
  const m = String(s).match(/^(\d+(?:\.\d+)?)\s*(Ki|Mi|Gi|K|M|G)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2] || 'Mi';
  const mult = { Ki: 1 / 1024, K: 1 / 1000, Mi: 1, M: 1, Gi: 1024, G: 1000 }[unit];
  return Math.round(n * mult);
}

/** "250m" | "1" | "0.5" → millicores (null if unset/unparsable). */
export function parseCpu(s) {
  if (s == null) return null;
  const str = String(s);
  if (/^\d+m$/.test(str)) return parseInt(str, 10);
  const n = parseFloat(str);
  return isNaN(n) ? null : Math.round(n * 1000);
}

/** Requests default to limits when only limits are set — like the real API server. */
export function effectiveRequests(container) {
  const r = (container.resources && container.resources.requests) || {};
  const l = (container.resources && container.resources.limits) || {};
  return {
    cpuM: parseCpu(r.cpu != null ? r.cpu : l.cpu) || 0,
    memMi: parseMem(r.memory != null ? r.memory : l.memory) || 0,
  };
}

/** The first container in a pod — the seam every single-container-era call site migrates through. */
export const mainContainer = (pod) => pod.spec.containers[0];

/** QoS class exactly as Kubernetes assigns it, aggregated across every container. */
export function qosOf(pod) {
  const containers = pod.spec.containers;
  const any = containers.some((c) => Object.keys((c.resources && c.resources.requests) || {}).length || Object.keys((c.resources && c.resources.limits) || {}).length);
  if (!any) return 'BestEffort';
  const guaranteed = containers.every((c) => {
    const res = c.resources || {};
    const r = res.requests || {};
    const l = res.limits || {};
    return parseCpu(l.cpu) != null && parseMem(l.memory) != null &&
      (r.cpu == null || parseCpu(r.cpu) === parseCpu(l.cpu)) &&
      (r.memory == null || parseMem(r.memory) === parseMem(l.memory));
  });
  return guaranteed ? 'Guaranteed' : 'Burstable';
}

/** Idle memory footprint (Mi) so `kubectl top` has something honest to show. */
const BASE_MEM = { nginx: 22, httpd: 28, redis: 34, postgres: 84, busybox: 4, alpine: 4 };
const baseMemOf = (image) => BASE_MEM[imageRepo(image)] || 30;

const matchesSelector = (labels = {}, sel = {}) => Object.entries(sel).every(([k, v]) => labels[k] === v);

/** Full label selector: matchLabels + matchExpressions (In/NotIn/Exists/DoesNotExist). */
export function selMatch(labels = {}, sel = {}) {
  if (sel.matchLabels && !matchesSelector(labels, sel.matchLabels)) return false;
  for (const ex of sel.matchExpressions || []) {
    const v = labels[ex.key];
    if (ex.operator === 'In' && !(ex.values || []).includes(v)) return false;
    if (ex.operator === 'NotIn' && (ex.values || []).includes(v)) return false;
    if (ex.operator === 'Exists' && v === undefined) return false;
    if (ex.operator === 'DoesNotExist' && v !== undefined) return false;
  }
  return true;
}

/**
 * Simulated Kubernetes cluster, v2: a miniature API server.
 * Every object is manifest-shaped ({apiVersion, kind, metadata, spec, status})
 * plus a private `sim` key for engine bookkeeping (stripped from -o yaml).
 * Controllers run in reconcile(); subscribe(fn) to re-render on changes.
 */
export function createEngine({ onMission = () => {} } = {}) {
  const store = new Map();
  const events = [];
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => fn());
  const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  // ---------- store ----------
  const kkey = (kind, ns, name) => kind + '|' + (ns || '') + '|' + name;
  const put = (obj) => { store.set(kkey(obj.kind, obj.metadata.namespace, obj.metadata.name), obj); return obj; };
  const get = (kind, ns, name) => store.get(kkey(kind, ns, name));
  // identity-checked so a stale timer (e.g. a Terminating pod captured before an
  // etcd restore) can't delete the freshly restored object living at the same key
  const remove = (obj) => {
    const k = kkey(obj.kind, obj.metadata.namespace, obj.metadata.name);
    if (store.get(k) === obj) store.delete(k);
  };
  function list(kind, { ns = 'default', all = false, selector = null } = {}) {
    const out = [];
    for (const o of store.values()) {
      if (o.kind !== kind) continue;
      if (o.metadata.namespace && !all && o.metadata.namespace !== ns) continue;
      if (selector && !matchesSelector(o.metadata.labels, selector)) continue;
      out.push(o);
    }
    return out;
  }

  function addEvent({ ns = 'default', type = 'Normal', reason, object, message }) {
    const last = events[events.length - 1];
    if (last && last.object === object && last.reason === reason) return; // don't spam
    events.push({ t: Date.now(), ns, type, reason, object, message });
    if (events.length > 60) events.shift();
  }

  // ---------- factories ----------
  const CLUSTER_BORN = Date.now() - 47 * 864e5; // the cluster is "47d" old

  function makeNamespace(name, born = Date.now(), labels = {}) {
    // every real namespace carries this label — it's what namespaceSelector keys on
    const ns = put({ apiVersion: 'v1', kind: 'Namespace', metadata: { name, creationTimestamp: born, labels: { 'kubernetes.io/metadata.name': name, ...labels } }, spec: {}, status: { phase: 'Active' }, sim: {} });
    // every real namespace is born with a `default` ServiceAccount
    if (!get('ServiceAccount', name, 'default')) makeServiceAccount('default', name, born);
    return ns;
  }

  function makeServiceAccount(name, ns = 'default', born = Date.now()) {
    return put({ apiVersion: 'v1', kind: 'ServiceAccount', metadata: { name, namespace: ns, creationTimestamp: born }, spec: {}, status: {}, sim: {} });
  }

  function makeNode({ name, role = 'worker', labels = {}, taints = [] }) {
    return put({
      apiVersion: 'v1', kind: 'Node',
      metadata: { name, labels: { 'kubernetes.io/hostname': name, ...(role === 'control-plane' ? { 'node-role.kubernetes.io/control-plane': '' } : {}), ...labels }, creationTimestamp: CLUSTER_BORN },
      spec: { taints: [...taints], unschedulable: false },
      status: { ready: true },
      sim: { role, version: 'v1.33.2' },
    });
  }

  function makePod({ name, ns = 'default', labels = {}, image, command = null, owner = null, ownerKind = null, ownerReferences = null, rsName = null, nodeName = null, system = false, v2 = false, tolerations = [], nodeSelector = null, affinity = null, readinessProbe = null, livenessProbe = null, resources = null, env = null, envFrom = null, volumeMounts = null, volumes = null, containerPort = null, crash = false, notReadyReason = null, containers = null, initContainers = null, restartPolicy = 'Always' }) {
    const cname = owner ? owner.split('/').pop() : imageRepo(image) || 'app';
    // `containers` (an explicit array) is how a multi-container pod is built; every existing
    // single-container caller keeps passing flat scalar args, which become a one-element array.
    const built = containers || [{
      name: cname, image,
      ...(command ? { command } : {}),
      ...(containerPort ? { ports: [{ containerPort }] } : {}),
      ...(resources ? { resources } : {}),
      ...(env ? { env } : {}),
      ...(envFrom ? { envFrom } : {}),
      ...(readinessProbe ? { readinessProbe } : {}),
      ...(livenessProbe ? { livenessProbe } : {}),
      ...(volumeMounts ? { volumeMounts } : {}),
    }];
    const running = !!nodeName;
    return put({
      apiVersion: 'v1', kind: 'Pod',
      metadata: { name, namespace: ns, labels, creationTimestamp: Date.now(), ...(ownerReferences ? { ownerReferences } : {}) },
      spec: {
        nodeName,
        restartPolicy,
        ...(initContainers && initContainers.length ? { initContainers } : {}),
        containers: built,
        ...(volumes ? { volumes } : {}),
        ...(tolerations.length ? { tolerations } : {}),
        ...(nodeSelector ? { nodeSelector } : {}),
        ...(affinity ? { affinity } : {}),
      },
      status: {
        phase: running ? 'Running' : 'Pending', state: running ? 'Running' : 'Pending', ready: running, restarts: 0,
        podIP: running ? allocPodIP() : null,
        containerStatuses: built.map((c) => ({ name: c.name, ready: running, restartCount: 0, state: running ? 'Running' : 'Waiting' })),
        ...(initContainers && initContainers.length ? { initContainerStatuses: initContainers.map((c) => ({ name: c.name, ready: running, state: running ? 'Terminated' : 'Waiting' })) } : {}),
      },
      sim: { owner, ownerKind, rsName, system, v2, crash, notReadyReason, born: Date.now(), app: 'ok', memMi: running ? built.reduce((s, c) => s + baseMemOf(c.image), 0) : 0, containers: {} },
    });
  }

  function makeDeployment({ name, ns = 'default', labels = null, replicas = 1, image, command = null, readinessProbe = null, livenessProbe = null, resources = null, env = null, envFrom = null, volumeMounts = null, volumes = null, containerPort = null, tolerations = null, nodeSelector = null, affinity = null, containers = null, initContainers = null }) {
    const podLabels = labels || { app: name };
    const built = containers || [{
      name: imageRepo(image) || 'app', image,
      ...(command ? { command } : {}),
      ...(containerPort ? { ports: [{ containerPort }] } : {}),
      ...(resources ? { resources } : {}),
      ...(env ? { env } : {}),
      ...(envFrom ? { envFrom } : {}),
      ...(readinessProbe ? { readinessProbe } : {}),
      ...(livenessProbe ? { livenessProbe } : {}),
      ...(volumeMounts ? { volumeMounts } : {}),
    }];
    const template = {
      metadata: { labels: { ...podLabels } },
      spec: {
        ...(initContainers && initContainers.length ? { initContainers } : {}),
        containers: built,
        ...(volumes ? { volumes } : {}),
        ...(tolerations && tolerations.length ? { tolerations } : {}),
        ...(nodeSelector ? { nodeSelector } : {}),
        ...(affinity ? { affinity } : {}),
      },
    };
    const dep = put({
      apiVersion: 'apps/v1', kind: 'Deployment',
      metadata: { name, namespace: ns, labels: { ...podLabels }, creationTimestamp: Date.now() },
      spec: { replicas, selector: { matchLabels: { ...podLabels } }, template },
      status: {},
      sim: { revision: 1, rsName: null, history: [] },
    });
    // a Deployment creates its ReplicaSet immediately (real k8s does too) — the RS
    // controller (reconcileReplicaSet) creates the actual pods over subsequent ticks.
    const rsName = name + '-' + rid(9);
    dep.sim.rsName = rsName;
    makeReplicaSet({
      name: rsName, ns, labels: podLabels, replicas,
      selector: podLabels, template: JSON.parse(JSON.stringify(template)),
      ownerName: name, revision: 1,
    });
    dep.sim.history.push({ rev: 1, image: built[0].image, at: Date.now() });
    return dep;
  }

  /** ReplicaSet — real stored object; the RS (not the Deployment) creates/scales its own pods. */
  function makeReplicaSet({ name, ns = 'default', labels = {}, replicas = 0, selector, template, ownerName = null, revision = 1 }) {
    return put({
      apiVersion: 'apps/v1', kind: 'ReplicaSet',
      metadata: {
        name, namespace: ns, labels: { ...labels }, creationTimestamp: Date.now(),
        ownerReferences: ownerName ? [{ apiVersion: 'apps/v1', kind: 'Deployment', name: ownerName }] : [],
      },
      spec: { replicas, selector: { matchLabels: { ...selector } }, template },
      status: {},
      sim: { revision },
    });
  }

  /** Every ReplicaSet a Deployment currently owns (including scaled-to-0 past revisions). */
  function replicaSetsOf(dep) {
    return list('ReplicaSet', { ns: dep.metadata.namespace })
      .filter((rs) => (rs.metadata.ownerReferences || []).some((o) => o.kind === 'Deployment' && o.name === dep.metadata.name));
  }

  /** Deep-comparable fingerprint of a pod template, ignoring metadata — same shape used by kubectl's apply-diff. */
  function templateKey(spec) {
    return JSON.stringify({
      containers: spec.containers, initContainers: spec.initContainers || null, volumes: spec.volumes || null,
      affinity: spec.affinity || null, tolerations: spec.tolerations || null, nodeSelector: spec.nodeSelector || null,
    });
  }

  /**
   * The ONE place a Deployment gets a new revision: creates a fresh ReplicaSet for its
   * CURRENT spec.template (start at 0 replicas — reconcile()'s rolling-update loop ramps
   * it up while scaling the old ReplicaSet down) and records history. Callers (kubectl's
   * `set image`/`apply -f`) mutate `dep.spec.template` first, then call this.
   */
  function rotateDeployment(dep) {
    dep.sim.revision++;
    const rsName = dep.metadata.name + '-' + rid(9);
    dep.sim.rsName = rsName; // the authoritative pointer to the current ReplicaSet
    makeReplicaSet({
      name: rsName, ns: dep.metadata.namespace, labels: dep.spec.template.metadata.labels,
      replicas: 0, selector: dep.spec.selector.matchLabels,
      template: JSON.parse(JSON.stringify(dep.spec.template)),
      ownerName: dep.metadata.name, revision: dep.sim.revision,
    });
    dep.sim.history.push({ rev: dep.sim.revision, image: depImage(dep), at: Date.now() });
  }

  /**
   * Self-healing lookup for the Deployment's current ReplicaSet — like real k8s, if the
   * one `dep.sim.rsName` names was deleted out from under it, the controller doesn't
   * strand or silently fall back to an unrelated (possibly stale-image) ReplicaSet: it
   * re-adopts any existing RS whose template still matches, or creates a fresh one at
   * the SAME revision (a recreate, not a rollout — history/revision don't change).
   */
  function ensureCurrentReplicaSet(dep) {
    const rsList = replicaSetsOf(dep);
    let cur = rsList.find((rs) => rs.metadata.name === dep.sim.rsName);
    if (!cur) {
      const key = templateKey(dep.spec.template.spec);
      cur = rsList.find((rs) => templateKey(rs.spec.template.spec) === key) || makeReplicaSet({
        name: dep.metadata.name + '-' + rid(9), ns: dep.metadata.namespace, labels: dep.spec.template.metadata.labels,
        replicas: 0, selector: dep.spec.selector.matchLabels,
        template: JSON.parse(JSON.stringify(dep.spec.template)),
        ownerName: dep.metadata.name, revision: dep.sim.revision,
      });
      dep.sim.rsName = cur.metadata.name;
    }
    return cur;
  }

  /**
   * kubectl rollout undo: restore a PAST revision's full template (not just its main
   * image — real fidelity for multi-container Deployments) from the real stored
   * ReplicaSet, then rotate to a new revision built from it.
   */
  function rollbackDeployment(dep, toRevision = null) {
    const rsList = replicaSetsOf(dep).sort((a, b) => a.sim.revision - b.sim.revision);
    const target = toRevision != null ? rsList.find((rs) => rs.sim.revision === toRevision) : rsList[rsList.length - 2];
    if (!target) return null;
    dep.spec.template = JSON.parse(JSON.stringify(target.spec.template));
    rotateDeployment(dep);
    return target;
  }

  let svcIP = 2;
  function makeService({ name, ns = 'default', selector = {}, port = 80, targetPort = null, type = 'ClusterIP' }) {
    return put({
      apiVersion: 'v1', kind: 'Service',
      metadata: { name, namespace: ns, labels: {}, creationTimestamp: Date.now() },
      spec: { type, clusterIP: '10.96.' + Math.floor(svcIP / 250) + '.' + (svcIP++ % 250 + 1), selector: { ...selector }, ports: [{ port: Number(port), targetPort: Number(targetPort || port) }] },
      status: {},
      sim: {},
    });
  }

  let podIPn = 2;
  const allocPodIP = () => '10.244.' + (1 + Math.floor(podIPn / 250)) + '.' + (podIPn++ % 250 + 1);

  // ---------- seed cluster ----------
  makeNamespace('default', CLUSTER_BORN);
  makeNamespace('kube-system', CLUSTER_BORN);
  makeNode({ name: 'control-plane', role: 'control-plane', taints: [{ key: 'node-role.kubernetes.io/control-plane', effect: 'NoSchedule' }] });
  makeNode({ name: 'worker-1' });
  makeNode({ name: 'worker-2' });
  for (const n of ['etcd', 'kube-apiserver', 'kube-scheduler', 'kube-controller-manager'])
    makePod({ name: n + '-control-plane', ns: 'kube-system', labels: { component: n, tier: 'control-plane' }, image: 'registry.k8s.io/' + n + ':v1.33.2', nodeName: 'control-plane', system: true });
  // kube-proxy is genuinely DaemonSet-owned (one pod per node, tolerating the
  // control-plane taint) — real k8s fidelity, not just a plain seeded pod set.
  makeDaemonSet({
    name: 'kube-proxy', ns: 'kube-system', labels: { 'k8s-app': 'kube-proxy' },
    image: 'registry.k8s.io/kube-proxy:v1.33.2', tolerations: [{ operator: 'Exists', effect: 'NoSchedule' }],
  });
  for (const node of ['control-plane', 'worker-1', 'worker-2'])
    makePod({
      name: 'kube-proxy-' + rid(5), ns: 'kube-system', labels: { 'k8s-app': 'kube-proxy' },
      image: 'registry.k8s.io/kube-proxy:v1.33.2', nodeName: node, system: true,
      owner: 'kube-system/kube-proxy', ownerKind: 'DaemonSet',
      ownerReferences: [{ apiVersion: 'apps/v1', kind: 'DaemonSet', name: 'kube-proxy' }],
    });
  for (const node of ['worker-1', 'worker-2'])
    makePod({ name: 'coredns-' + rid(9) + '-' + rid(5), ns: 'kube-system', labels: { 'k8s-app': 'kube-dns' }, image: 'registry.k8s.io/coredns/coredns:v1.11.3', nodeName: node, system: true });
  for (const p of list('Pod', { ns: 'kube-system' })) { p.sim.born = CLUSTER_BORN; p.metadata.creationTimestamp = CLUSTER_BORN; }

  // ---------- helpers over the store ----------
  // Like a real ReplicaSet, ownership requires the selector to still match —
  // relabel a pod out of the selector and the controller replaces it (orphan stays).
  const ownedPods = (dep, includeTerminating = false) =>
    list('Pod', { ns: dep.metadata.namespace }).filter(
      (p) => p.sim.owner === dep.metadata.namespace + '/' + dep.metadata.name &&
        matchesSelector(p.metadata.labels, dep.spec.selector.matchLabels) &&
        (includeTerminating || (p.status.state !== 'Terminating' && p.status.state !== 'Unknown')),
    );

  const podImage = (p) => mainContainer(p).image;
  const depImage = (d) => mainContainer(d.spec.template).image;

  /** Ready pods a service currently routes to. */
  function endpointsOf(svc) {
    if (!svc.spec.selector || !Object.keys(svc.spec.selector).length) return [];
    return list('Pod', { ns: svc.metadata.namespace, selector: svc.spec.selector }).filter(
      (p) => !p.sim.system && p.status.ready && p.status.state === 'Running',
    );
  }

  // ---------- scheduling ----------
  const tolerates = (pod, taint) =>
    (pod.spec.tolerations || []).some((t) => (!t.key || t.key === taint.key) && (!t.effect || t.effect === taint.effect));

  function nodeLoad(node) {
    return list('Pod', { all: true }).filter((p) => !p.sim.system && p.spec.nodeName === node.metadata.name && p.status.state !== 'Terminating').length;
  }

  /** Sum of effective resource requests across every container of a pod. */
  function podRequests(pod) {
    const out = { cpuM: 0, memMi: 0 };
    for (const c of pod.spec.containers) {
      const req = effectiveRequests(c);
      out.cpuM += req.cpuM;
      out.memMi += req.memMi;
    }
    return out;
  }

  /** Sum of effective resource requests already placed on a node. */
  function nodeRequested(node) {
    const out = { cpuM: 0, memMi: 0 };
    for (const p of list('Pod', { all: true })) {
      if (p.sim.system || p.spec.nodeName !== node.metadata.name || p.status.state === 'Terminating') continue;
      const req = podRequests(p);
      out.cpuM += req.cpuM;
      out.memMi += req.memMi;
    }
    return out;
  }

  /** requiredDuringScheduling nodeAffinity: nodeSelectorTerms are OR'd. */
  function nodeAffinityMatches(nodeAff, node) {
    const req = nodeAff && nodeAff.requiredDuringSchedulingIgnoredDuringExecution;
    if (!req || !(req.nodeSelectorTerms || []).length) return true;
    return req.nodeSelectorTerms.some((t) => selMatch(node.metadata.labels, t));
  }

  /**
   * requiredDuringScheduling pod (anti-)affinity. The sim treats every
   * topologyKey as kubernetes.io/hostname — the only topology nodes have here.
   */
  function podAffinityBlocks(pod, node) {
    const aff = pod.spec.affinity || {};
    const near = (term) => list('Pod', { ns: pod.metadata.namespace }).some((q) =>
      q !== pod && !q.sim.system && q.spec.nodeName === node.metadata.name &&
      q.status.state !== 'Terminating' && selMatch(q.metadata.labels, term.labelSelector || {}));
    for (const term of (aff.podAntiAffinity && aff.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution) || [])
      if (near(term)) return 'anti-affinity';
    for (const term of (aff.podAffinity && aff.podAffinity.requiredDuringSchedulingIgnoredDuringExecution) || [])
      if (!near(term)) return 'affinity';
    return null;
  }

  function nodeFor(pod) {
    const reasons = [];
    const req = podRequests(pod);
    const fits = list('Node').filter((n) => {
      if (!n.status.ready) { reasons.push(`node ${n.metadata.name} is NotReady`); return false; }
      if (n.spec.unschedulable) { reasons.push(`node ${n.metadata.name} is unschedulable (cordoned)`); return false; }
      const bad = (n.spec.taints || []).find((t) => t.effect === 'NoSchedule' && !tolerates(pod, t));
      if (bad) { reasons.push(`node ${n.metadata.name} had untolerated taint {${bad.key}${bad.value ? '=' + bad.value : ''}}`); return false; }
      if (pod.spec.nodeSelector && !matchesSelector(n.metadata.labels, pod.spec.nodeSelector)) { reasons.push(`node ${n.metadata.name} didn't match nodeSelector`); return false; }
      if (pod.spec.affinity && !nodeAffinityMatches(pod.spec.affinity.nodeAffinity, n)) { reasons.push(`node ${n.metadata.name} didn't match Pod's node affinity/selector`); return false; }
      const pa = podAffinityBlocks(pod, n);
      if (pa) { reasons.push(`node ${n.metadata.name} didn't match pod ${pa} rules`); return false; }
      if (nodeLoad(n) >= K8S_NODE_CAP) { reasons.push(`node ${n.metadata.name} out of pod capacity`); return false; }
      const used = nodeRequested(n);
      if (used.memMi + req.memMi > K8S_NODE_ALLOC.memMi) { reasons.push('Insufficient memory'); return false; }
      if (used.cpuM + req.cpuM > K8S_NODE_ALLOC.cpuM) { reasons.push('Insufficient cpu'); return false; }
      return true;
    });
    if (!fits.length) return { node: null, reasons };
    fits.sort((a, b) => nodeLoad(a) - nodeLoad(b));
    return { node: fits[0].metadata.name, reasons };
  }

  /** ConfigMap/Secret references a pod needs before its containers can start. */
  function missingConfigRefs(pod) {
    const ns = pod.metadata.namespace;
    const missing = [];
    const need = (kind, name) => {
      if (name && !get(kind, ns, name)) missing.push(`${kind.toLowerCase()} "${name}" not found`);
    };
    for (const c of [...(pod.spec.initContainers || []), ...pod.spec.containers]) {
      for (const e of c.env || []) {
        const vf = e.valueFrom || {};
        if (vf.configMapKeyRef) need('ConfigMap', vf.configMapKeyRef.name);
        if (vf.secretKeyRef) need('Secret', vf.secretKeyRef.name);
      }
      for (const ef of c.envFrom || []) {
        if (ef.configMapRef) need('ConfigMap', ef.configMapRef.name);
        if (ef.secretRef) need('Secret', ef.secretRef.name);
      }
    }
    for (const v of pod.spec.volumes || []) {
      if (v.configMap) need('ConfigMap', v.configMap.name);
      if (v.secret) need('Secret', v.secret.secretName);
    }
    return missing;
  }

  // ---------- pod lifecycle ----------
  let healArmed = null;
  const armHeal = () => { healArmed = Date.now(); };
  const checkHeal = () => {
    if (healArmed && Date.now() - healArmed < 15000) { onMission('heal'); healArmed = null; }
  };

  const alive = (p) => store.get(kkey('Pod', p.metadata.namespace, p.metadata.name)) === p && p.status.state !== 'Terminating';

  /** Roll every containerStatuses entry up into the pod-level status fields kubectl reads. */
  function recomputePodAggregate(pod) {
    const css = pod.status.containerStatuses || [];
    pod.status.ready = css.length > 0 && css.every((cs) => cs.ready);
    pod.status.restarts = css.reduce((s, cs) => s + (cs.restartCount || 0), 0);
    const bad = css.find((cs) => cs.state === 'CrashLoopBackOff') || css.find((cs) => cs.state === 'ErrImagePull') ||
      css.find((cs) => cs.state === 'ImagePullBackOff') || css.find((cs) => cs.state === 'OOMKilled');
    if (bad) pod.status.state = bad.state;
    else if (css.some((cs) => cs.state === 'Running')) pod.status.state = 'Running';
  }

  function readinessFailMsgFor(pod, c) {
    const probe = c.readinessProbe;
    const port = probe && probe.httpGet ? probe.httpGet.port : '?';
    return `Readiness probe failed: Get "http://${pod.status.podIP || '10.244.x.x'}:${port}${probe && probe.httpGet ? probe.httpGet.path || '/' : '/'}": connect: connection refused`;
  }
  const readinessFailMsg = (pod) => readinessFailMsgFor(pod, mainContainer(pod));

  /** A readiness probe that points at a port the container doesn't open. */
  function probeBrokenFor(pod, c) {
    if (pod.sim.notReadyReason && c === mainContainer(pod)) return true;
    if (!c.readinessProbe || !c.readinessProbe.httpGet) return false;
    const probePort = Number(c.readinessProbe.httpGet.port);
    const info = K8S_IMAGES[imageRepo(c.image)];
    const declared = c.ports && c.ports[0] ? Number(c.ports[0].containerPort) : info && info.port;
    return declared ? probePort !== declared : false;
  }
  const probeBroken = (pod) => probeBrokenFor(pod, mainContainer(pod));

  /** Called once a pod is assigned to a node: play out its container startup. */
  function startContainers(pod) {
    const inits = pod.spec.initContainers || [];
    if (inits.length) {
      pod.status.phase = 'Pending';
      pod.status.state = `Init:0/${inits.length}`;
      notify();
      runInit(pod, 0);
    } else startMainPhase(pod);
  }

  /** initContainers run to completion, in order, before any main container starts. */
  function runInit(pod, idx) {
    const inits = pod.spec.initContainers || [];
    const cs = pod.status.initContainerStatuses[idx];
    cs.state = 'Running';
    notify();
    setTimeout(() => {
      if (!alive(pod)) return;
      const c = inits[idx];
      if (!imageKnown(c.image) && !pod.sim.system) {
        pod.status.state = 'Init:ErrImagePull';
        cs.state = 'ErrImagePull';
        addEvent({ ns: pod.metadata.namespace, type: 'Warning', reason: 'Failed', object: 'Pod/' + pod.metadata.name, message: `Failed to pull image "${c.image}": repository does not exist or may require authorization` });
        setTimeout(() => { if (alive(pod)) { pod.status.state = 'Init:ImagePullBackOff'; cs.state = 'ImagePullBackOff'; notify(); } }, 1500);
        notify();
        return;
      }
      const cmd = (c.command || []).join(' ');
      if (/exit 1|false/.test(cmd)) {
        pod.status.state = 'Init:Error';
        cs.state = 'Error';
        addEvent({ ns: pod.metadata.namespace, type: 'Warning', reason: 'Failed', object: 'Pod/' + pod.metadata.name, message: `Error: failed to start container "${c.name}": command terminated with exit code 1` });
        setTimeout(() => { if (alive(pod)) { pod.status.state = 'Init:CrashLoopBackOff'; cs.state = 'CrashLoopBackOff'; notify(); } }, 1200);
        notify();
        return;
      }
      cs.state = 'Terminated';
      cs.ready = true;
      const next = idx + 1;
      if (next >= inits.length) {
        // real kubectl shows this transient STATUS between the last init container
        // finishing and the main containers actually starting
        pod.status.state = 'PodInitializing';
        notify();
        setTimeout(() => { if (alive(pod)) startMainPhase(pod); }, 400 + Math.random() * 300);
      } else {
        pod.status.state = `Init:${next}/${inits.length}`;
        notify();
        runInit(pod, next);
      }
    }, 500 + Math.random() * 300);
  }

  function startMainPhase(pod) {
    if (pod.spec.containers.length <= 1) startMainSingle(pod);
    else startMainMulti(pod);
  }

  /** Single-container startup — byte-identical to the pre-Pod-v2 behavior. */
  function startMainSingle(pod) {
    pod.status.state = 'ContainerCreating';
    pod.status.phase = 'Pending';
    setTimeout(() => {
      if (!alive(pod)) return;
      const cs0 = pod.status.containerStatuses && pod.status.containerStatuses[0];
      if (!imageKnown(podImage(pod)) && !pod.sim.system) {
        pod.status.state = 'ErrImagePull';
        if (cs0) cs0.state = 'ErrImagePull';
        addEvent({ ns: pod.metadata.namespace, type: 'Warning', reason: 'Failed', object: 'Pod/' + pod.metadata.name, message: `Failed to pull image "${podImage(pod)}": repository does not exist or may require authorization` });
        setTimeout(() => { if (alive(pod)) { pod.status.state = 'ImagePullBackOff'; if (cs0) cs0.state = 'ImagePullBackOff'; notify(); } }, 1500);
        notify();
        return;
      }
      const missing = missingConfigRefs(pod);
      if (missing.length) {
        pod.status.state = 'CreateContainerConfigError';
        pod.status.ready = false;
        if (cs0) { cs0.state = 'CreateContainerConfigError'; cs0.ready = false; }
        addEvent({ ns: pod.metadata.namespace, type: 'Warning', reason: 'Failed', object: 'Pod/' + pod.metadata.name, message: `Error: ${missing[0]}` });
        notify();
        return; // reconcile() retries once the ConfigMap/Secret exists
      }
      pod.sim.memMi = baseMemOf(podImage(pod));
      const info = K8S_IMAGES[imageRepo(podImage(pod))];
      const cmd = (mainContainer(pod).command || []).join(' ');
      const longRunning = /sleep|tail|server|-f/.test(cmd);
      const fails = pod.sim.crash || /exit 1|false/.test(cmd);
      // restartPolicy other than the default Always (Job pods) run to COMPLETION instead
      // of looping forever — the crash-vs-succeed distinction the engine otherwise lacks.
      if (pod.spec.restartPolicy !== 'Always' && !longRunning) { finishPod(pod, !fails); return; }
      const crashes = fails || (info && info.oneshot && !longRunning);
      if (crashes) { crashCycle(pod); notify(); return; }
      pod.status.phase = 'Running';
      pod.status.podIP = pod.status.podIP || allocPodIP();
      if (probeBroken(pod)) {
        pod.status.state = 'Running';
        pod.status.ready = false;
        addEvent({ ns: pod.metadata.namespace, type: 'Warning', reason: 'Unhealthy', object: 'Pod/' + pod.metadata.name, message: pod.sim.notReadyReason || readinessFailMsg(pod) });
      } else {
        pod.status.state = 'Running';
        pod.status.ready = true;
        checkHeal();
      }
      if (cs0) { cs0.state = pod.status.state; cs0.ready = pod.status.ready; }
      notify();
    }, 900 + Math.random() * 600);
  }

  /** Multi-container startup: every container pulls/starts independently, pod status is the aggregate. */
  function startMainMulti(pod) {
    pod.status.state = 'ContainerCreating';
    pod.status.phase = 'Pending';
    setTimeout(() => {
      if (!alive(pod)) return;
      const badImage = pod.spec.containers.find((c) => !imageKnown(c.image) && !pod.sim.system);
      if (badImage) {
        pod.status.state = 'ErrImagePull';
        const cs = pod.status.containerStatuses.find((s) => s.name === badImage.name);
        if (cs) cs.state = 'ErrImagePull';
        addEvent({ ns: pod.metadata.namespace, type: 'Warning', reason: 'Failed', object: 'Pod/' + pod.metadata.name, message: `Failed to pull image "${badImage.image}": repository does not exist or may require authorization` });
        setTimeout(() => { if (alive(pod)) { pod.status.state = 'ImagePullBackOff'; if (cs) cs.state = 'ImagePullBackOff'; notify(); } }, 1500);
        notify();
        return;
      }
      const missing = missingConfigRefs(pod);
      if (missing.length) {
        pod.status.state = 'CreateContainerConfigError';
        pod.status.ready = false;
        for (const cs of pod.status.containerStatuses) { cs.state = 'CreateContainerConfigError'; cs.ready = false; }
        addEvent({ ns: pod.metadata.namespace, type: 'Warning', reason: 'Failed', object: 'Pod/' + pod.metadata.name, message: `Error: ${missing[0]}` });
        notify();
        return;
      }
      const mainName = mainContainer(pod).name;
      // restartPolicy other than the default Always (Job pods) run to COMPLETION instead
      // of looping forever. Simplification for multi-container Job pods: the whole pod
      // finishes once every container would (none of them stay running forever).
      if (pod.spec.restartPolicy !== 'Always' && pod.spec.containers.every((c) => !/sleep|tail|server|-f/.test((c.command || []).join(' ')))) {
        const anyFails = pod.spec.containers.some((c) => (c.name === mainName && pod.sim.crash) || /exit 1|false/.test((c.command || []).join(' ')));
        finishPod(pod, !anyFails);
        return;
      }
      pod.status.phase = 'Running';
      pod.status.podIP = pod.status.podIP || allocPodIP();
      let anyCrash = false;
      for (const c of pod.spec.containers) {
        const cs = pod.status.containerStatuses.find((s) => s.name === c.name);
        const info = K8S_IMAGES[imageRepo(c.image)];
        const cmd = (c.command || []).join(' ');
        const longRunning = /sleep|tail|server|-f/.test(cmd);
        const crashes = (c.name === mainName && pod.sim.crash) || /exit 1|false/.test(cmd) || (info && info.oneshot && !longRunning);
        if (crashes) { anyCrash = true; crashCycleContainer(pod, c, cs); }
        else {
          cs.state = 'Running';
          cs.ready = !probeBrokenFor(pod, c);
          if (!cs.ready) addEvent({ ns: pod.metadata.namespace, type: 'Warning', reason: 'Unhealthy', object: 'Pod/' + pod.metadata.name, message: (c.name === mainName && pod.sim.notReadyReason) || readinessFailMsgFor(pod, c) });
        }
      }
      // crashCycleContainer sets its container's state to 'Running' synchronously before its
      // own delayed CrashLoopBackOff transition, so `every(...Running)` alone isn't a safe
      // "nothing is crashing" check — gate on the crash predicate computed just above instead.
      if (!anyCrash) checkHeal();
      recomputePodAggregate(pod);
      notify();
    }, 900 + Math.random() * 600);
  }

  /** Job-style pods (restartPolicy Never/OnFailure) run to completion instead of looping forever. */
  function finishPod(pod, succeeded) {
    pod.status.phase = succeeded ? 'Succeeded' : 'Failed';
    pod.status.state = succeeded ? 'Completed' : 'Failed';
    pod.status.ready = false;
    for (const cs of pod.status.containerStatuses || []) { cs.state = 'Terminated'; cs.ready = false; }
    if (!succeeded) addEvent({ ns: pod.metadata.namespace, type: 'Warning', reason: 'Failed', object: 'Pod/' + pod.metadata.name, message: `Container ${mainContainer(pod).name} in pod ${pod.metadata.name} exited with a non-zero status` });
    notify();
  }

  function crashCycle(pod) {
    pod.status.phase = 'Running';
    pod.status.state = 'Running';
    pod.status.ready = false;
    const cs0 = pod.status.containerStatuses && pod.status.containerStatuses[0];
    if (cs0) { cs0.state = 'Running'; cs0.ready = false; }
    setTimeout(() => {
      if (!alive(pod)) return;
      pod.status.state = 'CrashLoopBackOff';
      pod.status.restarts++;
      if (cs0) { cs0.state = 'CrashLoopBackOff'; cs0.restartCount = pod.status.restarts; }
      addEvent({ ns: pod.metadata.namespace, type: 'Warning', reason: 'BackOff', object: 'Pod/' + pod.metadata.name, message: `Back-off restarting failed container ${mainContainer(pod).name} in pod ${pod.metadata.name}` });
      notify();
      setTimeout(() => { if (alive(pod)) crashCycle(pod); }, 4000);
    }, 1200);
  }

  /** Same idea as crashCycle(), for one container of a multi-container pod. */
  function crashCycleContainer(pod, c, cs) {
    cs.state = 'Running';
    cs.ready = false;
    recomputePodAggregate(pod);
    setTimeout(() => {
      if (!alive(pod)) return;
      cs.state = 'CrashLoopBackOff';
      cs.ready = false;
      cs.restartCount = (cs.restartCount || 0) + 1;
      recomputePodAggregate(pod);
      addEvent({ ns: pod.metadata.namespace, type: 'Warning', reason: 'BackOff', object: 'Pod/' + pod.metadata.name, message: `Back-off restarting failed container ${c.name} in pod ${pod.metadata.name}` });
      notify();
      setTimeout(() => { if (alive(pod)) crashCycleContainer(pod, c, cs); }, 4000);
    }, 1200);
  }

  function markTerminating(pod) {
    pod.status.state = 'Terminating';
    pod.status.ready = false;
    setTimeout(() => { remove(pod); notify(); }, 900);
  }

  /**
   * Drop every Terminating pod now instead of waiting out its grace period.
   * Tests get this for free by advancing fake timers; the UI's "solve it for me"
   * replay runs in real time, so it needs a way to let a delete land before the
   * command that recreates the same pod. The pending timer above is
   * identity-checked, so firing late against a recreated pod is harmless.
   */
  function flushTerminating() {
    for (const p of list('Pod', { all: true })) if (p.status.state === 'Terminating') remove(p);
    notify();
  }

  // ---------- app faults, probes, memory (interactive labs) ----------
  const probeWindowMs = (probe) => (probe.periodSeconds || 10) * (probe.failureThreshold || 3) * 1000;
  const LEAK_MI_PER_SEC = 25;

  /**
   * Fault-injection: what the app inside a container is doing.
   * 'ok' — healthy; '503' — serves errors (readiness fails, liveness passes);
   * 'hang' — deadlocked (every probe fails; only a liveness restart cures it).
   * setAppState(pod, state) targets the main container (every existing caller);
   * setAppState(pod, containerName, state) targets a named sidecar/container.
   */
  function setAppState(pod, a, b) {
    if (typeof b !== 'undefined') return setAppStateContainer(pod, a, b);
    if (pod.spec.containers.length <= 1) return setAppStateSingle(pod, a);
    return setAppStateContainer(pod, mainContainer(pod).name, a);
  }

  function setAppStateSingle(pod, state) {
    pod.sim.app = state;
    if (state === 'ok') {
      pod.sim.appBadSince = null;
      if (pod.sim.unreadyByApp && pod.status.state === 'Running') {
        pod.sim.unreadyByApp = false;
        pod.status.ready = !probeBroken(pod);
        const cs0 = pod.status.containerStatuses && pod.status.containerStatuses[0];
        if (cs0) cs0.ready = pod.status.ready;
      }
    } else {
      pod.sim.appBadSince = Date.now();
    }
    notify();
  }

  function setAppStateContainer(pod, name, state) {
    const cstate = pod.sim.containers[name] || (pod.sim.containers[name] = {});
    cstate.app = state;
    if (state === 'ok') {
      cstate.appBadSince = null;
      const cs = (pod.status.containerStatuses || []).find((s) => s.name === name);
      if (cstate.unreadyByApp && cs && cs.state === 'Running') {
        cstate.unreadyByApp = false;
        const c = pod.spec.containers.find((x) => x.name === name);
        cs.ready = !probeBrokenFor(pod, c);
        recomputePodAggregate(pod);
      }
    } else {
      cstate.appBadSince = Date.now();
    }
    notify();
  }

  /**
   * Start/stop a memory leak (the Resources & QoS lab's OOM demo).
   * setLeak(pod, on) targets the main container; setLeak(pod, containerName, on) a named one.
   */
  function setLeak(pod, a, b) {
    if (typeof a === 'string') return setLeakContainer(pod, a, b);
    if (pod.spec.containers.length <= 1) return setLeakSingle(pod, a);
    return setLeakContainer(pod, mainContainer(pod).name, a);
  }

  function setLeakSingle(pod, on) {
    if (on && !pod.sim.leakSince) pod.sim.leakSince = Date.now();
    if (!on && pod.sim.leakSince) {
      pod.sim.leakExtraMi = (pod.sim.leakExtraMi || 0) + ((Date.now() - pod.sim.leakSince) / 1000) * LEAK_MI_PER_SEC;
      pod.sim.leakSince = null;
    }
    notify();
  }

  function setLeakContainer(pod, name, on) {
    const cstate = pod.sim.containers[name] || (pod.sim.containers[name] = {});
    if (on && !cstate.leakSince) cstate.leakSince = Date.now();
    if (!on && cstate.leakSince) {
      cstate.leakExtraMi = (cstate.leakExtraMi || 0) + ((Date.now() - cstate.leakSince) / 1000) * LEAK_MI_PER_SEC;
      cstate.leakSince = null;
    }
    notify();
  }

  /** Kubelet restarts the container in place: same pod, restart count +1. */
  function restartContainer(pod) {
    pod.status.restarts++;
    pod.status.ready = false;
    pod.sim.leakExtraMi = 0;
    if (pod.sim.leakSince) pod.sim.leakSince = Date.now(); // a leaky app leaks again after restart
    const cs0 = pod.status.containerStatuses && pod.status.containerStatuses[0];
    if (cs0) { cs0.restartCount = pod.status.restarts; cs0.ready = false; }
    setTimeout(() => {
      if (!alive(pod)) return;
      pod.status.state = 'Running';
      pod.status.ready = !probeBroken(pod) && !pod.sim.unreadyByApp;
      if (cs0) { cs0.state = 'Running'; cs0.ready = pod.status.ready; }
      notify();
    }, 1300);
  }

  /** Same idea as restartContainer(), for one container of a multi-container pod. */
  function restartOneContainer(pod, c, cs) {
    cs.restartCount = (cs.restartCount || 0) + 1;
    cs.ready = false;
    recomputePodAggregate(pod);
    const cstate = pod.sim.containers[c.name] || (pod.sim.containers[c.name] = {});
    cstate.leakExtraMi = 0;
    if (cstate.leakSince) cstate.leakSince = Date.now();
    setTimeout(() => {
      if (!alive(pod)) return;
      cs.state = 'Running';
      cs.ready = !probeBrokenFor(pod, c) && !cstate.unreadyByApp;
      recomputePodAggregate(pod);
      notify();
    }, 1300);
  }

  /** Per-tick pod housekeeping: probe verdicts and memory accounting. */
  function tickPod(pod, now) {
    if (pod.sim.system || (pod.status.state !== 'Running' && pod.status.state !== 'OOMKilled')) return false;
    if (pod.spec.containers.length <= 1) return tickSingle(pod, now);
    return tickMulti(pod, now);
  }

  /** Single-container tick — byte-identical to the pre-Pod-v2 behavior. */
  function tickSingle(pod, now) {
    let changed = false;
    const c = mainContainer(pod);
    const cs0 = pod.status.containerStatuses && pod.status.containerStatuses[0];

    // memory: base + leaked so far, OOMKill on limit breach
    const leakLive = pod.sim.leakSince ? ((now - pod.sim.leakSince) / 1000) * LEAK_MI_PER_SEC : 0;
    const mem = baseMemOf(c.image) + (pod.sim.leakExtraMi || 0) + leakLive;
    const limitMi = parseMem(c.resources && c.resources.limits && c.resources.limits.memory);
    if (limitMi && mem >= limitMi && pod.status.state === 'Running') {
      pod.sim.memMi = limitMi;
      pod.sim.oomCount = (pod.sim.oomCount || 0) + 1;
      pod.status.state = 'OOMKilled';
      if (cs0) cs0.state = 'OOMKilled';
      addEvent({ ns: pod.metadata.namespace, type: 'Warning', reason: 'OOMKilled', object: 'Pod/' + pod.metadata.name, message: `Container ${c.name} exceeded its memory limit (${c.resources.limits.memory}): killed with exit code 137, restarting` });
      restartContainer(pod);
      return true;
    }
    const shown = Math.min(Math.round(mem), K8S_NODE_ALLOC.memMi);
    if (shown !== pod.sim.memMi) { pod.sim.memMi = shown; changed = true; }

    // probes: a sick app is detected after periodSeconds × failureThreshold
    if (pod.sim.app !== 'ok' && pod.sim.appBadSince && pod.status.state === 'Running') {
      const failMsg = pod.sim.app === 'hang'
        ? `probe failed: Get "http://${pod.status.podIP}:80/": context deadline exceeded`
        : 'probe failed: HTTP probe failed with statuscode: 503';
      if (c.readinessProbe && pod.status.ready && now - pod.sim.appBadSince >= probeWindowMs(c.readinessProbe)) {
        pod.status.ready = false;
        if (cs0) cs0.ready = false;
        pod.sim.unreadyByApp = true;
        addEvent({ ns: pod.metadata.namespace, type: 'Warning', reason: 'Unhealthy', object: 'Pod/' + pod.metadata.name, message: 'Readiness ' + failMsg });
        changed = true;
      }
      if (c.livenessProbe && pod.sim.app === 'hang' && now - pod.sim.appBadSince >= probeWindowMs(c.livenessProbe)) {
        addEvent({ ns: pod.metadata.namespace, type: 'Warning', reason: 'Unhealthy', object: 'Pod/' + pod.metadata.name, message: 'Liveness ' + failMsg });
        addEvent({ ns: pod.metadata.namespace, type: 'Normal', reason: 'Killing', object: 'Pod/' + pod.metadata.name, message: `Container ${c.name} failed liveness probe, will be restarted` });
        pod.sim.app = 'ok'; // the restart clears the deadlock
        pod.sim.appBadSince = null;
        pod.sim.unreadyByApp = false;
        restartContainer(pod);
        return true;
      }
    }
    return changed;
  }

  /** Multi-container tick: every container's memory/probe verdicts are independent. */
  function tickMulti(pod, now) {
    let changed = false;
    for (const c of pod.spec.containers) {
      const cs = pod.status.containerStatuses.find((s) => s.name === c.name);
      if (!cs || cs.state !== 'Running') continue;
      const cstate = pod.sim.containers[c.name] || (pod.sim.containers[c.name] = {});

      const leakLive = cstate.leakSince ? ((now - cstate.leakSince) / 1000) * LEAK_MI_PER_SEC : 0;
      const mem = baseMemOf(c.image) + (cstate.leakExtraMi || 0) + leakLive;
      const limitMi = parseMem(c.resources && c.resources.limits && c.resources.limits.memory);
      if (limitMi && mem >= limitMi) {
        cstate.oomCount = (cstate.oomCount || 0) + 1;
        cs.state = 'OOMKilled';
        recomputePodAggregate(pod);
        addEvent({ ns: pod.metadata.namespace, type: 'Warning', reason: 'OOMKilled', object: 'Pod/' + pod.metadata.name, message: `Container ${c.name} exceeded its memory limit (${c.resources.limits.memory}): killed with exit code 137, restarting` });
        restartOneContainer(pod, c, cs);
        return true;
      }

      if (cstate.app && cstate.app !== 'ok' && cstate.appBadSince) {
        const failMsg = cstate.app === 'hang'
          ? `probe failed: Get "http://${pod.status.podIP}:80/": context deadline exceeded`
          : 'probe failed: HTTP probe failed with statuscode: 503';
        if (c.readinessProbe && cs.ready && now - cstate.appBadSince >= probeWindowMs(c.readinessProbe)) {
          cs.ready = false;
          cstate.unreadyByApp = true;
          recomputePodAggregate(pod);
          addEvent({ ns: pod.metadata.namespace, type: 'Warning', reason: 'Unhealthy', object: 'Pod/' + pod.metadata.name, message: 'Readiness ' + failMsg });
          changed = true;
        }
        if (c.livenessProbe && cstate.app === 'hang' && now - cstate.appBadSince >= probeWindowMs(c.livenessProbe)) {
          addEvent({ ns: pod.metadata.namespace, type: 'Warning', reason: 'Unhealthy', object: 'Pod/' + pod.metadata.name, message: 'Liveness ' + failMsg });
          addEvent({ ns: pod.metadata.namespace, type: 'Normal', reason: 'Killing', object: 'Pod/' + pod.metadata.name, message: `Container ${c.name} failed liveness probe, will be restarted` });
          cstate.app = 'ok';
          cstate.appBadSince = null;
          cstate.unreadyByApp = false;
          restartOneContainer(pod, c, cs);
          return true;
        }
      }
    }
    const totalMem = pod.spec.containers.reduce((s, c) => {
      const cstate = pod.sim.containers[c.name] || {};
      const leakLive = cstate.leakSince ? ((now - cstate.leakSince) / 1000) * LEAK_MI_PER_SEC : 0;
      return s + baseMemOf(c.image) + (cstate.leakExtraMi || 0) + leakLive;
    }, 0);
    const shown = Math.min(Math.round(totalMem), K8S_NODE_ALLOC.memMi);
    if (shown !== pod.sim.memMi) { pod.sim.memMi = shown; changed = true; }
    return changed;
  }

  function deletePodAndHeal(pod) {
    if (pod.sim.owner) armHeal();
    markTerminating(pod);
  }

  // ---------- controllers ----------
  /** Build a pod from any controller's {spec.template} — ReplicaSet, DaemonSet, StatefulSet, Job. */
  function podFromController(ctrl, podName, { owner, ownerKind, rsName = null, v2 = false, ownerReferences = null, restartPolicy = 'Always', nodeName = null } = {}) {
    const t = ctrl.spec.template;
    const common = {
      name: podName,
      ns: ctrl.metadata.namespace,
      labels: { ...t.metadata.labels },
      owner, ownerKind, rsName, v2, ownerReferences, restartPolicy, nodeName,
      tolerations: t.spec.tolerations || [],
      nodeSelector: t.spec.nodeSelector || null,
      affinity: t.spec.affinity || null,
      crash: !!t.spec.sim_crash,
      notReadyReason: t.spec.sim_notReady || null,
    };
    // multi-container templates are cloned (not aliased!) into the new pod — a later
    // `set image`/template edit must not retroactively rewrite an already-created pod's spec.
    // The single-container path below is byte-identical to the pre-Pod-v2 behavior.
    if (t.spec.containers.length > 1 || (t.spec.initContainers || []).length) {
      return makePod({
        ...common,
        containers: t.spec.containers.map((c) => ({ ...c })),
        initContainers: t.spec.initContainers ? t.spec.initContainers.map((c) => ({ ...c })) : null,
        volumes: t.spec.volumes || null,
      });
    }
    const c = t.spec.containers[0];
    return makePod({
      ...common,
      image: c.image,
      command: c.command || null,
      readinessProbe: c.readinessProbe || null,
      livenessProbe: c.livenessProbe || null,
      resources: c.resources || null,
      env: c.env || null,
      envFrom: c.envFrom || null,
      volumeMounts: c.volumeMounts || null,
      volumes: t.spec.volumes || null,
      containerPort: c.ports && c.ports[0] ? c.ports[0].containerPort : null,
    });
  }

  function podFromReplicaSet(rs) {
    const depRef = (rs.metadata.ownerReferences || []).find((o) => o.kind === 'Deployment');
    return podFromController(rs, rs.metadata.name + '-' + rid(5), {
      owner: depRef ? rs.metadata.namespace + '/' + depRef.name : rs.metadata.namespace + '/' + rs.metadata.name,
      ownerKind: depRef ? 'Deployment' : 'ReplicaSet',
      rsName: rs.metadata.name,
      v2: rs.sim.revision > 1,
      ownerReferences: [{ apiVersion: 'apps/v1', kind: 'ReplicaSet', name: rs.metadata.name }],
    });
  }

  /**
   * Pods a ReplicaSet/DaemonSet/StatefulSet/Job directly created. (Deployment-owned pods
   * are found via ownedPods(dep) instead — they're one hop further, through a ReplicaSet.)
   */
  function podsOwnedBy(ctrl, includeTerminating = false) {
    // like real ReplicaSet/DaemonSet/etc controllers, a pod that's drifted out of the
    // selector (relabeled) is orphaned — it stops counting toward replicas, and a
    // replacement gets created — even though it still carries the rsName/owner fields.
    if (ctrl.kind === 'ReplicaSet') {
      return list('Pod', { ns: ctrl.metadata.namespace }).filter((p) =>
        p.sim.rsName === ctrl.metadata.name && matchesSelector(p.metadata.labels, ctrl.spec.selector.matchLabels) &&
        (includeTerminating || (p.status.state !== 'Terminating' && p.status.state !== 'Unknown')));
    }
    return list('Pod', { ns: ctrl.metadata.namespace }).filter((p) =>
      p.sim.ownerKind === ctrl.kind && p.sim.owner === ctrl.metadata.namespace + '/' + ctrl.metadata.name &&
      matchesSelector(p.metadata.labels, ctrl.spec.selector.matchLabels) &&
      (includeTerminating || (p.status.state !== 'Terminating' && p.status.state !== 'Unknown')));
  }

  /** The ReplicaSet controller: keep its own pod count at spec.replicas. */
  function reconcileReplicaSet(rs) {
    const live = podsOwnedBy(rs);
    if (live.length < rs.spec.replicas) { podFromReplicaSet(rs); return true; }
    if (live.length > rs.spec.replicas) { markTerminating(live[live.length - 1]); return true; }
    return false;
  }

  function reconcile() {
    let changed = false;

    // Deployment controller: owns ReplicaSets (not pods directly) — surge 1 /
    // maxUnavailable 0 rolling update by shifting replica counts between the
    // current RS and any old ones still holding pods.
    for (const d of list('Deployment', { all: true })) {
      const cur = ensureCurrentReplicaSet(d);
      const old = replicaSetsOf(d).filter((rs) => rs !== cur && rs.spec.replicas > 0);
      if (old.length) {
        const oldPods = old.flatMap((rs) => podsOwnedBy(rs));
        const curPods = podsOwnedBy(cur);
        const totalLive = curPods.length + oldPods.length;
        // bring a new-revision pod up first; only scale the old ReplicaSet down
        // once a fresh pod is Ready. A broken new image wedges the rollout WITHOUT downtime.
        const brokenOld = oldPods.find((p) => !p.status.ready && p.status.state !== 'ContainerCreating' && p.status.state !== 'Pending');
        if (brokenOld) {
          // old-revision pods that aren't serving anyway are scaled away at once
          const ownerRs = old.find((rs) => podsOwnedBy(rs).includes(brokenOld));
          ownerRs.spec.replicas = Math.max(0, ownerRs.spec.replicas - 1);
          changed = true;
        } else if (totalLive <= d.spec.replicas && !curPods.some((p) => p.status.state === 'ContainerCreating' || p.status.state === 'Pending')) {
          cur.spec.replicas++;
          changed = true;
        } else if (totalLive > d.spec.replicas && curPods.some((p) => p.status.ready)) {
          old[0].spec.replicas = Math.max(0, old[0].spec.replicas - 1);
          changed = true;
        }
        continue;
      }
      if (cur.spec.replicas !== d.spec.replicas) { cur.spec.replicas = d.spec.replicas; changed = true; }
    }

    // ReplicaSet controller: each RS reconciles its own pods to match spec.replicas
    for (const rs of list('ReplicaSet', { all: true })) if (reconcileReplicaSet(rs)) changed = true;

    // DaemonSet / StatefulSet / Job / CronJob controllers
    for (const ds of list('DaemonSet', { all: true })) if (reconcileDaemonSet(ds)) changed = true;
    for (const sts of list('StatefulSet', { all: true })) if (reconcileStatefulSet(sts)) changed = true;
    const cronNow = Date.now();
    for (const cj of list('CronJob', { all: true })) if (reconcileCronJob(cj, cronNow)) changed = true;
    for (const job of list('Job', { all: true })) if (reconcileJob(job)) changed = true;

    // kubelet: probe verdicts, memory accounting, OOMKill
    const now = Date.now();
    for (const p of list('Pod', { all: true })) if (tickPod(p, now)) changed = true;

    // pods stuck on a missing ConfigMap/Secret retry once the ref exists
    for (const p of list('Pod', { all: true })) {
      if (p.status.state === 'CreateContainerConfigError' && !missingConfigRefs(p).length) {
        startContainers(p);
        changed = true;
      }
    }

    // scheduler: place every unassigned pod
    for (const p of list('Pod', { all: true })) {
      if (p.spec.nodeName || p.status.state !== 'Pending') continue;
      const { node, reasons } = nodeFor(p);
      if (node) {
        p.spec.nodeName = node;
        p.sim.pendingReasons = null;
        addEvent({ ns: p.metadata.namespace, reason: 'Scheduled', object: 'Pod/' + p.metadata.name, message: `Successfully assigned ${p.metadata.namespace}/${p.metadata.name} to ${node}` });
        startContainers(p);
        changed = true;
      } else {
        const rs = [...new Set(reasons)];
        if (JSON.stringify(rs) !== JSON.stringify(p.sim.pendingReasons || [])) { p.sim.pendingReasons = rs; changed = true; }
        addEvent({ ns: p.metadata.namespace, type: 'Warning', reason: 'FailedScheduling', object: 'Pod/' + p.metadata.name, message: `0/${list('Node').length} nodes are available: ` + rs.join(', ') + '.' });
      }
    }

    if (changed) notify();
  }

  // ---------- Job / CronJob ----------
  function makeJob({ name, ns = 'default', labels = null, completions = 1, parallelism = 1, backoffLimit = 6, image, command = null, containers = null, ownerReferences = null }) {
    const jobLabels = labels || { 'job-name': name };
    const built = containers || [{ name: imageRepo(image) || 'app', image, ...(command ? { command } : {}) }];
    return put({
      apiVersion: 'batch/v1', kind: 'Job',
      metadata: { name, namespace: ns, labels: { ...jobLabels }, creationTimestamp: Date.now(), ...(ownerReferences ? { ownerReferences } : {}) },
      spec: {
        completions, parallelism, backoffLimit,
        selector: { matchLabels: { ...jobLabels } },
        template: { metadata: { labels: { ...jobLabels } }, spec: { containers: built } },
      },
      status: { succeeded: 0, failed: 0, active: 0, startTime: Date.now() },
      sim: {},
    });
  }

  function podFromJob(job) {
    return podFromController(job, job.metadata.name + '-' + rid(5), {
      owner: job.metadata.namespace + '/' + job.metadata.name,
      ownerKind: 'Job',
      ownerReferences: [{ apiVersion: 'batch/v1', kind: 'Job', name: job.metadata.name }],
      restartPolicy: 'Never',
    });
  }

  /** The Job controller: track succeeded/failed/active, create pods up to parallelism, stop at completions or backoffLimit. */
  function reconcileJob(job) {
    let changed = false;
    const pods = podsOwnedBy(job, true);
    const succeeded = pods.filter((p) => p.status.phase === 'Succeeded').length;
    const failed = pods.filter((p) => p.status.phase === 'Failed').length;
    const active = pods.filter((p) => p.status.state !== 'Terminating' && p.status.phase !== 'Succeeded' && p.status.phase !== 'Failed').length;
    if (job.status.succeeded !== succeeded || job.status.failed !== failed || job.status.active !== active) {
      job.status.succeeded = succeeded; job.status.failed = failed; job.status.active = active;
      changed = true;
    }
    if (job.status.complete || job.status.jobFailed) return changed; // terminal — real Jobs don't retry past this
    if (succeeded >= job.spec.completions) {
      job.status.complete = true;
      job.status.completionTime = Date.now();
      addEvent({ ns: job.metadata.namespace, reason: 'Completed', object: 'Job/' + job.metadata.name, message: 'Job completed' });
      return true;
    }
    if (failed > job.spec.backoffLimit) {
      job.status.jobFailed = true;
      job.status.completionTime = Date.now();
      addEvent({ ns: job.metadata.namespace, type: 'Warning', reason: 'BackoffLimitExceeded', object: 'Job/' + job.metadata.name, message: 'Job has reached the specified backoff limit' });
      return true;
    }
    const remaining = job.spec.completions - succeeded - active;
    const toCreate = Math.max(0, Math.min(remaining, job.spec.parallelism - active));
    for (let i = 0; i < toCreate; i++) { podFromJob(job); changed = true; }
    return changed;
  }

  const CRON_DOW_NAMES = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
  const CRON_MONTH_NAMES = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
  /** Real cron accepts 3-letter names for month/day-of-week (JAN, MON, ...) alongside numbers. */
  const cronNormalizeNames = (field, names) => field.toUpperCase().replace(/[A-Z]{3}/g, (m) => (names[m] != null ? names[m] : m));

  /** min hour dom month dow — supports wildcards, N, N-M, step values, and comma lists (real cron syntax). */
  function cronFieldMatches(field, value, max) {
    return field.split(',').some((part) => {
      const step = part.match(/^(\*|\d+(?:-\d+)?)\/(\d+)$/);
      if (step) {
        const [, range, stepStr] = step;
        const [lo, hi] = range === '*' ? [0, max] : range.split('-').map(Number);
        return value >= lo && value <= hi && (value - lo) % Number(stepStr) === 0;
      }
      const range = part.match(/^(\d+)-(\d+)$/);
      if (range) return value >= Number(range[1]) && value <= Number(range[2]);
      if (part === '*') return true;
      return Number(part) === value;
    });
  }
  function cronMatches(schedule, date) {
    const fields = String(schedule).trim().split(/\s+/);
    if (fields.length !== 5) return false;
    const [min, hour, dom, monthRaw, dowRaw] = fields;
    const month = cronNormalizeNames(monthRaw, CRON_MONTH_NAMES);
    const dow = cronNormalizeNames(dowRaw, CRON_DOW_NAMES);
    if (!cronFieldMatches(min, date.getUTCMinutes(), 59)) return false;
    if (!cronFieldMatches(hour, date.getUTCHours(), 23)) return false;
    if (!cronFieldMatches(month, date.getUTCMonth() + 1, 12)) return false;
    // real cron: if BOTH day-of-month and day-of-week are restricted (not '*'), a match
    // fires when EITHER is satisfied — not only when both are, like a plain AND would.
    const domMatch = cronFieldMatches(dom, date.getUTCDate(), 31);
    const dowMatch = cronFieldMatches(dow, date.getUTCDay(), 6);
    return dom !== '*' && dow !== '*' ? domMatch || dowMatch : domMatch && dowMatch;
  }

  // Real cron syntax, accelerated: 1 real/reconcile second of elapsed time = 1 virtual
  // cron-minute, so a schedule like `*/1 * * * *` visibly fires within a normal lab
  // session instead of requiring a literal wall-clock minute per tick.
  const CRON_EPOCH = Date.now();
  const CRON_MS_PER_VIRTUAL_MIN = 1000;
  const cronVirtualDate = (now) => new Date(CRON_EPOCH + Math.floor((now - CRON_EPOCH) / CRON_MS_PER_VIRTUAL_MIN) * 60000);

  function makeCronJob({ name, ns = 'default', labels = null, schedule, suspend = false, image, command = null, containers = null, completions = 1, parallelism = 1, backoffLimit = 6 }) {
    const jobLabels = { 'job-name': name };
    const built = containers || [{ name: imageRepo(image) || 'app', image, ...(command ? { command } : {}) }];
    return put({
      apiVersion: 'batch/v1', kind: 'CronJob',
      metadata: { name, namespace: ns, labels: { ...(labels || {}) }, creationTimestamp: Date.now() },
      spec: {
        schedule, suspend,
        jobTemplate: { spec: { completions, parallelism, backoffLimit, template: { metadata: { labels: jobLabels }, spec: { containers: built } } } },
      },
      status: {},
      sim: { lastScheduleAt: null },
    });
  }

  /** The CronJob controller: at most one Job per virtual minute the schedule matches. */
  function reconcileCronJob(cj, now) {
    if (cj.spec.suspend) return false;
    const vDate = cronVirtualDate(now);
    const vKey = vDate.getTime();
    if (cj.sim.lastScheduleAt === vKey || !cronMatches(cj.spec.schedule, vDate)) return false;
    cj.sim.lastScheduleAt = vKey;
    const jt = cj.spec.jobTemplate.spec;
    const jobName = cj.metadata.name + '-' + Math.floor(vKey / 60000);
    if (get('Job', cj.metadata.namespace, jobName)) return false;
    makeJob({
      name: jobName, ns: cj.metadata.namespace, labels: jt.template.metadata.labels,
      completions: jt.completions, parallelism: jt.parallelism, backoffLimit: jt.backoffLimit,
      containers: jt.template.spec.containers,
      ownerReferences: [{ apiVersion: 'batch/v1', kind: 'CronJob', name: cj.metadata.name }],
    });
    cj.status.lastScheduleTime = now;
    addEvent({ ns: cj.metadata.namespace, reason: 'SuccessfulCreate', object: 'CronJob/' + cj.metadata.name, message: `Created job ${jobName}` });
    return true;
  }

  // ---------- DaemonSet ----------
  function makeDaemonSet({ name, ns = 'default', labels = null, tolerations = null, image, command = null, containers = null }) {
    const dsLabels = labels || { app: name };
    const built = containers || [{ name: imageRepo(image) || 'app', image, ...(command ? { command } : {}) }];
    return put({
      apiVersion: 'apps/v1', kind: 'DaemonSet',
      metadata: { name, namespace: ns, labels: { ...dsLabels }, creationTimestamp: Date.now() },
      spec: {
        selector: { matchLabels: { ...dsLabels } },
        template: { metadata: { labels: { ...dsLabels } }, spec: { containers: built, ...(tolerations && tolerations.length ? { tolerations } : {}) } },
      },
      status: {},
      sim: {},
    });
  }

  /** DaemonSet pods are pre-bound to a node (bypassing the normal scheduler queue), like real k8s. */
  function podFromDaemonSet(ds, node) {
    const p = podFromController(ds, ds.metadata.name + '-' + rid(5), {
      owner: ds.metadata.namespace + '/' + ds.metadata.name,
      ownerKind: 'DaemonSet',
      ownerReferences: [{ apiVersion: 'apps/v1', kind: 'DaemonSet', name: ds.metadata.name }],
    });
    p.spec.nodeName = node.metadata.name;
    startContainers(p);
    return p;
  }

  /** The DaemonSet controller: exactly one pod per node whose taints it tolerates. */
  function reconcileDaemonSet(ds) {
    let changed = false;
    const live = podsOwnedBy(ds, true);
    const dsTolerations = ds.spec.template.spec.tolerations || [];
    const eligible = list('Node').filter((n) => !(n.spec.taints || []).some((t) => t.effect === 'NoSchedule' && !tolerates({ spec: { tolerations: dsTolerations } }, t)));
    for (const n of eligible) {
      if (!live.some((p) => p.spec.nodeName === n.metadata.name && p.status.state !== 'Terminating')) { podFromDaemonSet(ds, n); changed = true; }
    }
    for (const p of live) {
      if (p.status.state === 'Terminating') continue;
      if (!eligible.some((n) => n.metadata.name === p.spec.nodeName)) { markTerminating(p); changed = true; }
    }
    return changed;
  }

  // ---------- StatefulSet ----------
  function makeStatefulSet({ name, ns = 'default', labels = null, replicas = 1, image, command = null, containers = null, volumeClaimTemplates = null }) {
    const stsLabels = labels || { app: name };
    const built = containers || [{ name: imageRepo(image) || 'app', image, ...(command ? { command } : {}) }];
    return put({
      apiVersion: 'apps/v1', kind: 'StatefulSet',
      metadata: { name, namespace: ns, labels: { ...stsLabels }, creationTimestamp: Date.now() },
      spec: {
        replicas, serviceName: name,
        selector: { matchLabels: { ...stsLabels } },
        template: { metadata: { labels: { ...stsLabels } }, spec: { containers: built } },
        ...(volumeClaimTemplates ? { volumeClaimTemplates } : {}),
      },
      status: {},
      sim: {},
    });
  }

  const ordinalOf = (sts, pod) => Number(pod.metadata.name.slice(sts.metadata.name.length + 1));

  function podFromStatefulSet(sts, ordinal) {
    return podFromController(sts, sts.metadata.name + '-' + ordinal, {
      owner: sts.metadata.namespace + '/' + sts.metadata.name,
      ownerKind: 'StatefulSet',
      ownerReferences: [{ apiVersion: 'apps/v1', kind: 'StatefulSet', name: sts.metadata.name }],
    });
  }

  /** The StatefulSet controller: ordinal identity, OrderedReady (one at a time, in order). */
  function reconcileStatefulSet(sts) {
    const live = podsOwnedBy(sts, true).filter((p) => p.status.state !== 'Terminating');
    const ordinals = live.map((p) => ordinalOf(sts, p)).sort((a, b) => a - b);
    if (live.length < sts.spec.replicas) {
      let next = 0;
      while (ordinals.includes(next)) next++;
      const prevReady = next === 0 || live.some((p) => ordinalOf(sts, p) === next - 1 && p.status.ready);
      if (prevReady) { podFromStatefulSet(sts, next); return true; }
      return false;
    }
    if (live.length > sts.spec.replicas) {
      const highest = live.find((p) => ordinalOf(sts, p) === ordinals[ordinals.length - 1]);
      markTerminating(highest);
      return true;
    }
    return false;
  }

  // ---------- PodDisruptionBudgets ----------
  /** Live PDB accounting: pods it covers and how many voluntary disruptions are allowed right now. */
  function pdbStatus(pdb) {
    const pods = list('Pod', { ns: pdb.metadata.namespace }).filter(
      (p) => !p.sim.system && p.status.state !== 'Terminating' && selMatch(p.metadata.labels, pdb.spec.selector || {}),
    );
    const ready = pods.filter((p) => p.status.ready).length;
    const raw = pdb.spec.minAvailable != null
      ? ready - pdb.spec.minAvailable
      : pdb.spec.maxUnavailable != null
        ? pdb.spec.maxUnavailable - (pods.length - ready)
        : ready;
    return { total: pods.length, ready, allowed: Math.max(0, raw) };
  }

  /** The PDB (if any) that currently forbids evicting this pod — what `kubectl drain` consults. */
  function evictionBlockedBy(pod) {
    for (const pdb of list('PodDisruptionBudget', { ns: pod.metadata.namespace })) {
      if (!selMatch(pod.metadata.labels, pdb.spec.selector || {})) continue;
      if (pdbStatus(pdb).allowed <= 0) return pdb;
    }
    return null;
  }

  // ---------- etcd snapshot / restore ----------
  /** etcd-style snapshot: a deep copy of every object in the store. */
  function snapshotStore() {
    return JSON.parse(JSON.stringify([...store.values()]));
  }

  /** Replace the whole store with a snapshot (what restoring etcd does to a cluster). */
  function restoreStore(objs) {
    store.clear();
    for (const o of JSON.parse(JSON.stringify(objs))) put(o);
    // timers captured before the restore point at stale objects (alive() fails);
    // re-kick any pod the snapshot froze mid-startup
    for (const p of list('Pod', { all: true }))
      if (!p.sim.system && p.spec.nodeName && (p.status.state === 'ContainerCreating' || p.status.state === 'Pending'))
        startContainers(p);
    notify();
  }

  // ---------- ops used by kubectl & scenarios ----------
  function setNodeReady(name, ready) {
    const n = get('Node', null, name);
    if (!n) return;
    n.status.ready = ready;
    if (!ready)
      for (const p of list('Pod', { all: true }))
        if (p.spec.nodeName === name && !p.sim.system) { p.status.state = 'Unknown'; p.status.ready = false; }
    notify();
  }

  function deleteNamespaceContents(ns) {
    for (const o of [...store.values()]) {
      if (o.metadata.namespace !== ns) continue;
      if (o.kind === 'Pod') markTerminating(o);
      else remove(o);
    }
  }

  /** Simple compat view for the cluster panel. */
  function view() {
    return {
      nodes: list('Node').map((n) => ({
        name: n.metadata.name, role: n.sim.role, ready: n.status.ready,
        unschedulable: n.spec.unschedulable, taints: n.spec.taints || [],
      })),
      pods: list('Pod', { all: true })
        .filter((p) => !p.sim.system)
        .map((p) => ({ name: p.metadata.name, ns: p.metadata.namespace, node: p.spec.nodeName, status: p.status.state, ready: p.status.ready, v2: p.sim.v2 })),
    };
  }

  return {
    // store
    get, list, put, remove, events, addEvent,
    // factories
    makePod, makeDeployment, makeReplicaSet, makeService, makeNamespace, makeNode, makeServiceAccount,
    makeJob, makeCronJob, makeDaemonSet, makeStatefulSet,
    // helpers
    ownedPods, podsOwnedBy, replicaSetsOf, endpointsOf, podImage, depImage, nodeLoad, nodeRequested,
    pdbStatus, evictionBlockedBy, snapshotStore, restoreStore,
    rotateDeployment, rollbackDeployment, reconcileReplicaSet,
    reconcileJob, reconcileCronJob, reconcileDaemonSet, reconcileStatefulSet, cronMatches,
    // lifecycle
    reconcile, markTerminating, flushTerminating, deletePodAndHeal, setNodeReady, deleteNamespaceContents,
    // interactive-lab ops
    setAppState, setLeak,
    // ui
    subscribe, notify, view,
    onMission,
  };
}
