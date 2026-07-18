/**
 * The pedagogy fold — pure functions over progress state, so track ordering,
 * prerequisite checks and "what should I do next?" are unit-testable the same
 * way readiness.js makes the dashboard math testable.
 *
 * `moduleStats()` is the per-module completion signal. It used to live inline
 * in Sidebar.jsx as the `pills` object, where it could only ever be rendered;
 * as a pure function it also feeds prerequisite checks and the next-step bar.
 *
 * Gating here is advisory. `locked` means "you skipped something" — the UI
 * marks it and explains why, but never blocks navigation.
 */

import { content } from '../content/index.js';
import { MODULES, moduleById } from './modules.js';
import { TRACKS, HUB_MODULE } from './tracks.js';
import { ROADMAP_EN } from './roadmap.js';
import { SCENARIOS } from './scenarios.js';
import { CKAD_MISSION_TOTAL } from './ckadLabs.js';
import { CKA_MISSION_TOTAL } from './ckaLabs.js';
import { NET_MISSION_TOTAL } from './netLabs.js';
import { OPS_MISSION_TOTAL } from './opsLabs.js';
import { DOCKER_MISSION_TOTAL } from './dockerLabs.js';
import { POD_MISSION_TOTAL } from './podLabs.js';
import { STORAGE_MISSION_TOTAL } from './storageLabs.js';
import { PACKAGING_MISSION_TOTAL } from './packagingLabs.js';
import { SECURITY_MISSION_TOTAL } from './securityLabs.js';
import { OBS_MISSION_TOTAL } from './obsLabs.js';

const RM_TOTAL = ROADMAP_EN.reduce((s, st) => s + st.items.length, 0);
const DOCKER_TOTAL = content.en.m2.missions.length;
const K8S_TOTAL = content.en.m4.missions.length;

const sum = (byLab) => Object.values(byLab || {}).reduce((s, ids) => s + ids.length, 0);

/** { done, total } for every pill, straight from progress state. */
function pillCounts(p) {
  return {
    road: { done: Object.values(p.roadmap || {}).filter(Boolean).length, total: RM_TOTAL },
    docker: { done: (p.dockerDone || []).length, total: DOCKER_TOTAL },
    dockerdrill: { done: sum(p.dockerDrillDone), total: DOCKER_MISSION_TOTAL },
    k8s: { done: (p.k8sDone || []).length, total: K8S_TOTAL },
    scen: { done: (p.scenariosDone || []).length, total: SCENARIOS.length },
    ckad: { done: sum(p.ckadDone), total: CKAD_MISSION_TOTAL },
    cka: { done: sum(p.ckaDone), total: CKA_MISSION_TOTAL },
    net: { done: sum(p.netDone), total: NET_MISSION_TOTAL },
    ops: { done: sum(p.opsDone), total: OPS_MISSION_TOTAL },
    pod: { done: sum(p.podDone), total: POD_MISSION_TOTAL },
    storage: { done: sum(p.storageDone), total: STORAGE_MISSION_TOTAL },
    pkg: { done: sum(p.packagingDone), total: PACKAGING_MISSION_TOTAL },
    sec: { done: sum(p.securityDone), total: SECURITY_MISSION_TOTAL },
    obs: { done: sum(p.obsDone), total: OBS_MISSION_TOTAL },
  };
}

/**
 * Per-module completion, keyed by module id:
 *   { kind: 'missions', done, total, text, complete }  — measurable modules
 *   { kind: 'exam',     text, complete }               — the Exam Room
 *   { kind: 'visit',    complete }                     — reading modules
 * `text` is the sidebar pill label, or null when the module has no pill.
 */
export function moduleStats(progress) {
  const p = progress || {};
  const counts = pillCounts(p);
  const visited = new Set(p.visited || []);
  const examResults = p.examResults || [];
  const out = {};

  for (const m of MODULES) {
    if (m.pill === 'exam') {
      const best = examResults.reduce((b, r) => Math.max(b, r.score), 0);
      out[m.id] = {
        kind: 'exam',
        text: examResults.length ? best + '%' : '—',
        complete: examResults.some((r) => r.pass),
      };
    } else if (m.pill === 'road') {
      const { done, total } = counts.road;
      const pct = total ? Math.round((done / total) * 100) : 0;
      out[m.id] = { kind: 'missions', done, total, text: pct + '%', complete: pct === 100 };
    } else if (m.pill) {
      const { done, total } = counts[m.pill];
      out[m.id] = { kind: 'missions', done, total, text: done + '/' + total, complete: done === total };
    } else {
      // reading module — no missions to count, so opening it is the signal
      out[m.id] = { kind: 'visit', text: null, complete: visited.has(m.id) };
    }
  }
  return out;
}

/**
 * One track's state: every module in order with its lock status, plus the
 * single module the learner should do next.
 *
 * `locked` = at least one prerequisite is incomplete. `missing` lists only the
 * unmet ones, so the UI can say *which* module to go back to.
 * `nextId` is the first unlocked, incomplete module; if everything left is
 * locked we still point at the first incomplete one, because a next step the
 * learner can act on beats no next step at all.
 *
 * Prerequisites outside the track are ignored. `requires` is a global teaching
 * order, but a track is a self-contained path: CKAD includes Observability
 * without Troubleshooting, so honouring the global requirement would show
 * "do first: Troubleshooting" pointing at a module that is not on the path and
 * can never be ticked off. A lock must always name something the learner can
 * actually go and do.
 */
export function trackState(trackId, progress) {
  const track = TRACKS[trackId];
  if (!track) return null;
  const stats = moduleStats(progress);
  const isComplete = (id) => !!(stats[id] && stats[id].complete);
  const inTrack = new Set(track.modules);

  const modules = track.modules.map((id) => {
    const m = moduleById(id);
    const missing = ((m && m.requires) || []).filter((r) => inTrack.has(r) && !isComplete(r));
    return { id, complete: isComplete(id), locked: missing.length > 0, missing };
  });

  const ready = modules.find((m) => !m.complete && !m.locked);
  const anyIncomplete = modules.find((m) => !m.complete);
  const done = modules.filter((m) => m.complete).length;

  return {
    trackId,
    modules,
    nextId: (ready || anyIncomplete || {}).id || null,
    done,
    total: modules.length,
    pct: modules.length ? Math.round((done / modules.length) * 100) : 0,
  };
}

/**
 * The module ids a track shows, hub first. With no track chosen the learner
 * sees the full registry — the picker is an opt-in narrowing, not a paywall.
 */
export function visibleModules(trackId) {
  const track = TRACKS[trackId];
  if (!track) return MODULES.map((m) => m.id);
  return [HUB_MODULE, ...track.modules];
}
