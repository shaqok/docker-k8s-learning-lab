import { EXAMS, DOMAIN_LABELS } from './examDomains.js';
import { SCENARIOS } from './scenarios.js';
import { CKAD_LABS } from './ckadLabs.js';
import { CKA_LABS } from './ckaLabs.js';
import { NET_LABS } from './netLabs.js';
import { OPS_LABS } from './opsLabs.js';
import { POD_LABS } from './podLabs.js';
import { STORAGE_LABS } from './storageLabs.js';
import { PACKAGING_LABS } from './packagingLabs.js';
import { SECURITY_LABS } from './securityLabs.js';
import { OBS_LABS } from './obsLabs.js';

/**
 * Per-exam-domain readiness — pure functions over progress state so the
 * dashboard math is unit-testable. Three signals per domain, each 0–100:
 *   practice — lab missions + troubleshooting scenarios completed
 *   quiz     — cumulative per-domain accuracy from quiz v2
 *   exam     — the latest mock-exam attempt's per-domain score
 * Domain readiness = mean of the signals that exist; overall = weighted sum.
 */

const labMissions = (labs, id) => labs.find((l) => l.id === id).missions.length;

/** What each practice surface trains, per exam. `done(p)` reads progress state. */
export const PRACTICE_SOURCES = [
  { key: 'scenarios', cka: 'troubleshooting', ckad: null, cks: null, total: SCENARIOS.length, done: (p) => p.scenariosDone.length },
  { key: 'ckad/probes', cka: 'workloads', ckad: 'observe', cks: null, total: labMissions(CKAD_LABS, 'probes'), done: (p) => (p.ckadDone.probes || []).length },
  { key: 'ckad/qos', cka: 'workloads', ckad: 'env', cks: null, total: labMissions(CKAD_LABS, 'qos'), done: (p) => (p.ckadDone.qos || []).length },
  { key: 'ckad/config', cka: 'workloads', ckad: 'env', cks: null, total: labMissions(CKAD_LABS, 'config'), done: (p) => (p.ckadDone.config || []).length },
  { key: 'cka/sched', cka: 'workloads', ckad: null, cks: null, total: labMissions(CKA_LABS, 'sched'), done: (p) => (p.ckaDone.sched || []).length },
  { key: 'cka/rbac', cka: 'arch', ckad: 'env', cks: 'clusterHardening', total: labMissions(CKA_LABS, 'rbac'), done: (p) => (p.ckaDone.rbac || []).length },
  { key: 'net/netpol', cka: 'net', ckad: 'net', cks: 'clusterHardening', total: labMissions(NET_LABS, 'netpol'), done: (p) => (p.netDone.netpol || []).length },
  { key: 'net/ingress', cka: 'net', ckad: 'net', cks: null, total: labMissions(NET_LABS, 'ingress'), done: (p) => (p.netDone.ingress || []).length },
  { key: 'net/gateway', cka: 'net', ckad: 'net', cks: null, total: labMissions(NET_LABS, 'gateway'), done: (p) => (p.netDone.gateway || []).length },
  { key: 'ops/pdb', cka: 'arch', ckad: null, cks: null, total: labMissions(OPS_LABS, 'pdb'), done: (p) => (p.opsDone.pdb || []).length },
  { key: 'ops/upgrade', cka: 'arch', ckad: null, cks: null, total: labMissions(OPS_LABS, 'upgrade'), done: (p) => (p.opsDone.upgrade || []).length },
  { key: 'ops/etcd', cka: 'arch', ckad: null, cks: 'clusterSetup', total: labMissions(OPS_LABS, 'etcd'), done: (p) => (p.opsDone.etcd || []).length },
  { key: 'pod/sidecars', cka: null, ckad: 'design', cks: null, total: labMissions(POD_LABS, 'sidecars'), done: (p) => (p.podDone.sidecars || []).length },
  { key: 'storage/pvc', cka: 'storage', ckad: null, cks: null, total: labMissions(STORAGE_LABS, 'pvc'), done: (p) => (p.storageDone.pvc || []).length },
  { key: 'storage/statefulset', cka: 'storage', ckad: null, cks: null, total: labMissions(STORAGE_LABS, 'statefulset'), done: (p) => (p.storageDone.statefulset || []).length },
  { key: 'pkg/helm', cka: null, ckad: 'deploy', cks: null, total: labMissions(PACKAGING_LABS, 'helm'), done: (p) => (p.packagingDone.helm || []).length },
  { key: 'pkg/kustomize', cka: null, ckad: 'deploy', cks: null, total: labMissions(PACKAGING_LABS, 'kustomize'), done: (p) => (p.packagingDone.kustomize || []).length },
  { key: 'pkg/gitops', cka: null, ckad: 'deploy', cks: null, total: labMissions(PACKAGING_LABS, 'gitops'), done: (p) => (p.packagingDone.gitops || []).length },
  { key: 'sec/cluster-setup', cka: null, ckad: null, cks: 'clusterSetup', total: labMissions(SECURITY_LABS, 'cluster-setup'), done: (p) => (p.securityDone['cluster-setup'] || []).length },
  { key: 'sec/cluster-hardening', cka: null, ckad: null, cks: 'clusterHardening', total: labMissions(SECURITY_LABS, 'cluster-hardening'), done: (p) => (p.securityDone['cluster-hardening'] || []).length },
  { key: 'sec/system-hardening', cka: null, ckad: null, cks: 'systemHardening', total: labMissions(SECURITY_LABS, 'system-hardening'), done: (p) => (p.securityDone['system-hardening'] || []).length },
  { key: 'sec/pod-security', cka: null, ckad: null, cks: 'microserviceVuln', total: labMissions(SECURITY_LABS, 'pod-security'), done: (p) => (p.securityDone['pod-security'] || []).length },
  { key: 'sec/supply-chain', cka: null, ckad: null, cks: 'supplyChain', total: labMissions(SECURITY_LABS, 'supply-chain'), done: (p) => (p.securityDone['supply-chain'] || []).length },
  { key: 'sec/audit-log', cka: null, ckad: null, cks: 'monitoring', total: labMissions(SECURITY_LABS, 'audit-log'), done: (p) => (p.securityDone['audit-log'] || []).length },
  { key: 'obs/logs', cka: 'troubleshooting', ckad: 'observe', cks: 'monitoring', total: labMissions(OBS_LABS, 'logs'), done: (p) => (p.obsDone.logs || []).length },
  { key: 'obs/events', cka: 'troubleshooting', ckad: 'observe', cks: 'monitoring', total: labMissions(OBS_LABS, 'events'), done: (p) => (p.obsDone.events || []).length },
  { key: 'obs/metrics', cka: 'troubleshooting', ckad: 'observe', cks: 'monitoring', total: labMissions(OBS_LABS, 'metrics'), done: (p) => (p.obsDone.metrics || []).length },
];

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : null);

/** practice % for one exam domain, or null when nothing trains it. */
export function practiceSignal(exam, domainId, progress) {
  let done = 0;
  let total = 0;
  for (const src of PRACTICE_SOURCES) {
    if (src[exam] !== domainId) continue;
    done += Math.min(src.done(progress), src.total);
    total += src.total;
  }
  return pct(done, total);
}

/** quiz accuracy % for a domain, or null before any tagged question was answered. */
export function quizSignal(domainId, quizStats) {
  const s = quizStats[domainId];
  if (!s) return null;
  return pct(s.r, s.r + s.w);
}

/** per-domain score % from the latest mock-exam attempt, or null. */
export function examSignal(exam, domainId, examResults) {
  const latest = [...examResults].reverse().find((r) => r.exam === exam);
  const d = latest && latest.domains[domainId];
  if (!d || !d.total) return null;
  return Math.round((d.earned / d.total) * 100);
}

/**
 * Full readiness for one exam.
 * progress = { scenariosDone, ckadDone, ckaDone, netDone, opsDone, podDone, quizStats, examResults }
 */
export function examReadiness(exam, progress) {
  const domains = EXAMS[exam].domains.map(({ id, weight }) => {
    const practice = practiceSignal(exam, id, progress);
    const quiz = quizSignal(id, progress.quizStats);
    const mock = examSignal(exam, id, progress.examResults);
    const signals = [practice, quiz, mock].filter((v) => v != null);
    const readiness = signals.length ? Math.round(signals.reduce((a, b) => a + b, 0) / signals.length) : 0;
    return { id, weight, label: DOMAIN_LABELS[id], practice, quiz, mock, readiness };
  });
  const overall = Math.round(domains.reduce((s, d) => s + (d.weight * d.readiness) / 100, 0));
  return { domains, overall };
}
