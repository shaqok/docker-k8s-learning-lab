import { selMatch } from './engine.js';

/**
 * NetworkPolicy evaluation over the engine's store — shared by the in-cluster
 * `kubectl exec POD -- wget …` probe, the m13 connectivity-matrix panel, and
 * mission checks. Same allow-list model as the real thing: pods start wide
 * open; the moment ANY policy selects a pod (for a direction), everything in
 * that direction not explicitly allowed is dropped.
 */

/** policyTypes, defaulted like the real API: Ingress, plus Egress if egress rules exist. */
const typesOf = (pol) => {
  const t = pol.spec.policyTypes;
  if (t && t.length) return t;
  return ['Ingress', ...(pol.spec.egress ? ['Egress'] : [])];
};

/** Every NetworkPolicy that selects `pod` for `type` ('Ingress' | 'Egress'). */
export function policiesFor(engine, pod, type) {
  return engine
    .list('NetworkPolicy', { ns: pod.metadata.namespace })
    .filter((pol) => typesOf(pol).includes(type) && selMatch(pod.metadata.labels, pol.spec.podSelector || {}));
}

/** Does a from/to peer entry match `pod`? (podSelector / namespaceSelector; no ipBlock.) */
function peerMatches(engine, peer, pod, policyNs) {
  if (peer.namespaceSelector) {
    const nsObj = engine.get('Namespace', null, pod.metadata.namespace);
    if (!selMatch((nsObj && nsObj.metadata.labels) || {}, peer.namespaceSelector)) return false;
    return !peer.podSelector || selMatch(pod.metadata.labels, peer.podSelector);
  }
  // a bare podSelector peer only reaches into the policy's own namespace
  if (peer.podSelector) return pod.metadata.namespace === policyNs && selMatch(pod.metadata.labels, peer.podSelector);
  return false;
}

/** Missing/empty peers or ports = "all" — exactly like the real API. */
const rulePeersMatch = (engine, peers, pod, policyNs) =>
  !peers || !peers.length || peers.some((p) => peerMatches(engine, p, pod, policyNs));

const rulePortsMatch = (ports, port) =>
  !ports || !ports.length || port == null || ports.some((p) => Number(p.port) === Number(port));

/**
 * Can `from` open a connection to `to` on `port`?
 * Returns { allowed, direction, policy } — when blocked, `policy` names one
 * of the policies that selected the pod (deny is the absence of an allow).
 */
export function canConnect(engine, { from, to, port = null }) {
  if (from === to) return { allowed: true, direction: null, policy: null };

  const egress = policiesFor(engine, from, 'Egress');
  if (egress.length) {
    const ok = egress.some((pol) =>
      (pol.spec.egress || []).some(
        (r) => rulePeersMatch(engine, r.to, to, pol.metadata.namespace) && rulePortsMatch(r.ports, port),
      ));
    if (!ok) return { allowed: false, direction: 'egress', policy: egress[0].metadata.name };
  }

  const ingress = policiesFor(engine, to, 'Ingress');
  if (ingress.length) {
    const ok = ingress.some((pol) =>
      (pol.spec.ingress || []).some(
        (r) => rulePeersMatch(engine, r.from, from, pol.metadata.namespace) && rulePortsMatch(r.ports, port),
      ));
    if (!ok) return { allowed: false, direction: 'ingress', policy: ingress[0].metadata.name };
  }

  return { allowed: true, direction: null, policy: null };
}
