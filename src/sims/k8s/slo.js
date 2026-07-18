/**
 * Service-level objectives over the engine's per-pod metrics rings.
 *
 * The SLI is replica readiness: of the last N samples taken from every pod
 * matching the selector, what share were Ready? An SLO names a target for it
 * (99%), and the error budget is what's left over (1%) — so a 98% reading has
 * burned 200% of its budget and the pager is justified.
 *
 * Pure functions over engine state, like rbac.js / netpol.js, so the panel,
 * the mission checks and the tests all read the same numbers.
 */

/**
 * The last `samples` metric samples of every pod matching the selector.
 *
 * Only Running pods are sampled by the kubelet tick, so a pod that is Pending
 * or CrashLoopBackOff would contribute nothing at all — and a total outage
 * would read as "no data" rather than 0% available. Those pods therefore count
 * as one not-ready sample each: an unschedulable workload is not an unknown
 * SLI, it is a down one.
 */
function recentSamples(engine, { ns = 'default', selector = null, samples = 10 }) {
  const pods = engine.list('Pod', { ns, ...(selector ? { selector } : {}) })
    .filter((p) => !p.sim.system && p.status.state !== 'Terminating');
  return pods.flatMap((p) => {
    const ring = (p.sim.metrics || []).slice(-samples);
    return ring.length ? ring : [{ t: Date.now(), cpuM: 0, memMi: 0, ready: false }];
  });
}

/**
 * Availability + error-budget burn for a selector.
 * Returns `availability: null` when nothing has been sampled yet — an unknown
 * SLI is not a met one, and the panel says so rather than printing a fake 100%.
 */
export function sloOf(engine, { ns = 'default', selector = null, samples = 10, target = 99 } = {}) {
  const window = recentSamples(engine, { ns, selector, samples });
  const total = window.length;
  const good = window.filter((s) => s.ready).length;
  const availability = total ? (good / total) * 100 : null;
  const budget = 100 - target;
  return {
    target,
    samples: total,
    availability,
    // share of the error budget consumed: 1.0 = exactly spent, >1 = overspent
    budgetBurn: availability == null || budget <= 0 ? null : (100 - availability) / budget,
    meeting: availability != null && availability >= target,
  };
}

/** Mean CPU (millicores) across the same window — what `top` shows, averaged. */
export function meanCpu(engine, opts = {}) {
  const window = recentSamples(engine, { samples: 10, ...opts });
  if (!window.length) return null;
  return Math.round(window.reduce((s, x) => s + x.cpuM, 0) / window.length);
}
