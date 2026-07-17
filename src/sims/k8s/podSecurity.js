/**
 * Pod Security Admission over the engine's store — same deny-by-default shape
 * as rbac.js/netpol.js. A Namespace's `pod-security.kubernetes.io/enforce`
 * label ('privileged' | 'baseline' | 'restricted', default 'privileged' — the
 * real API's default when the label is absent) decides which container
 * `securityContext` fields are required, exactly like the real admission
 * controller. Only direct Pod creation (`kubectl run`, `apply -f pod.yaml`) is
 * gated — Deployment-owned pods are out of scope for this sim.
 */

const LEVELS = ['privileged', 'baseline', 'restricted'];
export const PSA_LEVELS = LEVELS;

function levelOf(engine, ns) {
  const nsObj = engine.get('Namespace', null, ns);
  const label = nsObj && nsObj.metadata.labels && nsObj.metadata.labels['pod-security.kubernetes.io/enforce'];
  return LEVELS.includes(label) ? label : 'privileged';
}

const BASELINE_DISALLOWED_CAPS = ['SYS_ADMIN', 'NET_ADMIN', 'SYS_PTRACE', 'SYS_MODULE'];

/** Baseline: no privileged containers, no dangerous added capabilities. */
function violatesBaseline(sc) {
  if (!sc) return null;
  if (sc.privileged) return 'privileged=true is disallowed';
  const added = (sc.capabilities && sc.capabilities.add) || [];
  const bad = added.find((c) => BASELINE_DISALLOWED_CAPS.includes(c));
  if (bad) return `capability ${bad} is disallowed`;
  return null;
}

/** Restricted: baseline, plus must run as non-root, drop escalation, drop ALL capabilities. */
function violatesRestricted(sc) {
  const baseline = violatesBaseline(sc);
  if (baseline) return baseline;
  if (!sc) return 'must set securityContext.runAsNonRoot=true, allowPrivilegeEscalation=false, capabilities.drop=[ALL]';
  if (sc.runAsNonRoot !== true) return 'securityContext.runAsNonRoot must be true';
  if (sc.allowPrivilegeEscalation !== false) return 'securityContext.allowPrivilegeEscalation must be false';
  const dropped = (sc.capabilities && sc.capabilities.drop) || [];
  if (!dropped.includes('ALL')) return "securityContext.capabilities.drop must include 'ALL'";
  return null;
}

/** Would `containers` pass the namespace's enforced PSA level? → { allowed, level, reason } */
export function admitPod(engine, containers, ns) {
  const level = levelOf(engine, ns);
  if (level === 'privileged') return { allowed: true, level, reason: null };
  const violates = level === 'restricted' ? violatesRestricted : violatesBaseline;
  for (const c of containers) {
    const reason = violates(c.securityContext);
    if (reason) return { allowed: false, level, reason: `container "${c.name}": ${reason}` };
  }
  return { allowed: true, level, reason: null };
}
