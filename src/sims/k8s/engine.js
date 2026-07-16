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

  function makePod({ name, ns = 'default', labels = {}, image, command = null, owner = null, rsName = null, nodeName = null, system = false, v2 = false, tolerations = [], nodeSelector = null, affinity = null, readinessProbe = null, livenessProbe = null, resources = null, env = null, envFrom = null, volumeMounts = null, volumes = null, containerPort = null, crash = false, notReadyReason = null, containers = null, initContainers = null }) {
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
      metadata: { name, namespace: ns, labels, creationTimestamp: Date.now() },
      spec: {
        nodeName,
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
      sim: { owner, rsName, system, v2, crash, notReadyReason, born: Date.now(), app: 'ok', memMi: running ? built.reduce((s, c) => s + baseMemOf(c.image), 0) : 0, containers: {} },
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
    return put({
      apiVersion: 'apps/v1', kind: 'Deployment',
      metadata: { name, namespace: ns, labels: { ...podLabels }, creationTimestamp: Date.now() },
      spec: {
        replicas,
        selector: { matchLabels: { ...podLabels } },
        template: {
          metadata: { labels: { ...podLabels } },
          spec: {
            ...(initContainers && initContainers.length ? { initContainers } : {}),
            containers: built,
            ...(volumes ? { volumes } : {}),
            ...(tolerations && tolerations.length ? { tolerations } : {}),
            ...(nodeSelector ? { nodeSelector } : {}),
            ...(affinity ? { affinity } : {}),
          },
        },
      },
      status: {},
      sim: { revision: 1, rsName: name + '-' + rid(9), history: [{ rev: 1, image: built[0].image, at: Date.now() }] },
    });
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
  for (const node of ['control-plane', 'worker-1', 'worker-2'])
    makePod({ name: 'kube-proxy-' + rid(5), ns: 'kube-system', labels: { 'k8s-app': 'kube-proxy' }, image: 'registry.k8s.io/kube-proxy:v1.33.2', nodeName: node, system: true });
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
      const crashes = pod.sim.crash || /exit 1|false/.test(cmd) || (info && info.oneshot && !longRunning);
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
      pod.status.phase = 'Running';
      pod.status.podIP = pod.status.podIP || allocPodIP();
      const mainName = mainContainer(pod).name;
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
  function podFromTemplate(dep) {
    const t = dep.spec.template;
    const common = {
      name: dep.sim.rsName + '-' + rid(5),
      ns: dep.metadata.namespace,
      labels: { ...t.metadata.labels },
      owner: dep.metadata.namespace + '/' + dep.metadata.name,
      rsName: dep.sim.rsName,
      v2: dep.sim.revision > 1,
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

  function reconcile() {
    let changed = false;

    for (const d of list('Deployment', { all: true })) {
      const live = ownedPods(d);
      const fresh = live.filter((p) => p.sim.rsName === d.sim.rsName && podImage(p) === depImage(d));
      const outdated = live.filter((p) => !fresh.includes(p));
      if (outdated.length) {
        // rolling update, surge 1 / maxUnavailable 0: bring a new-revision pod
        // up first; only terminate an old pod once a fresh one is Ready.
        // A broken new image therefore wedges the rollout WITHOUT downtime.
        const brokenOutdated = outdated.find((p) => !p.status.ready && p.status.state !== 'ContainerCreating' && p.status.state !== 'Pending');
        if (brokenOutdated) {
          // old-revision pods that aren't serving anyway are removed at once
          markTerminating(brokenOutdated);
          changed = true;
        } else if (live.length <= d.spec.replicas && !live.some((p) => p.status.state === 'ContainerCreating' || p.status.state === 'Pending')) {
          podFromTemplate(d);
          changed = true;
        } else if (live.length > d.spec.replicas && fresh.some((p) => p.status.ready)) {
          markTerminating(outdated[0]);
          changed = true;
        }
        continue;
      }
      if (live.length < d.spec.replicas) { podFromTemplate(d); changed = true; }
      else if (live.length > d.spec.replicas) { markTerminating(live[live.length - 1]); changed = true; }
    }

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
    makePod, makeDeployment, makeService, makeNamespace, makeNode, makeServiceAccount,
    // helpers
    ownedPods, endpointsOf, podImage, depImage, nodeLoad, nodeRequested,
    pdbStatus, evictionBlockedBy, snapshotStore, restoreStore,
    // lifecycle
    reconcile, markTerminating, flushTerminating, deletePodAndHeal, setNodeReady, deleteNamespaceContents,
    // interactive-lab ops
    setAppState, setLeak,
    // ui
    subscribe, notify, view,
    onMission,
  };
}
