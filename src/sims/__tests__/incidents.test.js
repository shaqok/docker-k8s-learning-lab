import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createK8sSim } from '../k8sSim.js';
import { INCIDENTS, INCIDENT_INFO, pickIncident, causeChoices, gradeIncident, bandFor } from '../../data/incidents.js';
import { SCENARIOS } from '../../data/scenarios.js';
import { makeRunner } from './helpers.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** A deterministic stand-in for Math.random that cycles through fixed values. */
const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('incident pool', () => {
  it('pages every scenario, with bilingual symptom and root-cause text', () => {
    expect(INCIDENTS).toHaveLength(SCENARIOS.length);
    for (const inc of INCIDENTS) {
      expect(inc.page.en).toBeTruthy();
      expect(inc.page.ko).toBeTruthy();
      expect(inc.cause.en).toBeTruthy();
      expect(inc.cause.ko).toBeTruthy();
      expect(inc.checks.length).toBeGreaterThan(0);
    }
    // no orphan entries describing a scenario that no longer exists
    for (const id of Object.keys(INCIDENT_INFO)) {
      expect(SCENARIOS.some((s) => s.id === id), `${id} has no scenario`).toBe(true);
    }
  });

  it('never pages a symptom that gives the diagnosis away', () => {
    // the page is what the user reported; naming the fix would defeat the drill
    for (const inc of INCIDENTS) {
      expect(inc.page.en).not.toMatch(/kubectl/);
    }
  });

  it('avoids recently seen incidents until the pool runs dry', () => {
    const exclude = INCIDENTS.slice(0, INCIDENTS.length - 1).map((i) => i.id);
    expect(pickIncident(seq(0.5), exclude).id).toBe(INCIDENTS[INCIDENTS.length - 1].id);
    // everything excluded → still returns something rather than undefined
    expect(pickIncident(seq(0.5), INCIDENTS.map((i) => i.id))).toBeTruthy();
  });

  it('offers the true cause plus real causes from other incidents as distractors', () => {
    const inc = INCIDENTS[0];
    const choices = causeChoices(inc, seq(0.1, 0.4, 0.7, 0.2, 0.9, 0.3));
    expect(choices).toHaveLength(4);
    expect(choices.map((c) => c.id)).toContain(inc.id);
    expect(new Set(choices.map((c) => c.id)).size).toBe(4); // no duplicate options
    for (const ch of choices) {
      expect(INCIDENTS.some((i) => i.id === ch.id)).toBe(true); // every option is a real failure mode
    }
  });
});

describe('gradeIncident', () => {
  const boot = (incident) => {
    const sim = createK8sSim({ starterFiles: {} });
    incident.setup(sim.engine, sim.files);
    const runner = makeRunner(sim);
    const settle = (n = 30) => { for (let i = 0; i < n; i++) { sim.reconcile(); vi.advanceTimersByTime(2000); } };
    settle(5);
    return { sim, runner, settle };
  };

  it('an unfixed cluster grades as unresolved with no band', () => {
    const inc = INCIDENTS[0];
    const { sim } = boot(inc);
    const res = gradeIncident({ incident: inc, engine: sim.engine, sim, diagnosedMs: 30000, resolvedMs: 60000, causeCorrect: true });
    expect(res.fixed).toBe(false);
    expect(res.band).toBeNull();
    expect(res.timeToDiagnose).toBe(30);
    expect(res.timeToResolve).toBe(60);
  });

  it('a fixed cluster with the right cause earns a band', () => {
    const inc = INCIDENTS.find((i) => i.id === 'image-typo');
    const { sim, runner, settle } = boot(inc);
    inc.solve(sim, (cmd) => runner.run(cmd));
    settle(40);
    const res = gradeIncident({ incident: inc, engine: sim.engine, sim, diagnosedMs: 40000, resolvedMs: 90000, causeCorrect: true });
    expect(res.fixed).toBe(true);
    expect(res.causeCorrect).toBe(true);
    expect(res.band.grade).toBe('A');
  });

  it('withholds the band when the fix landed but the cause was never named', () => {
    const inc = INCIDENTS.find((i) => i.id === 'image-typo');
    const { sim, runner, settle } = boot(inc);
    inc.solve(sim, (cmd) => runner.run(cmd));
    settle(40);
    const res = gradeIncident({ incident: inc, engine: sim.engine, sim, diagnosedMs: null, resolvedMs: 90000, causeCorrect: false });
    expect(res.fixed).toBe(true);
    expect(res.timeToDiagnose).toBeNull();
    expect(res.band).toBeNull(); // fixing by luck is not diagnosing
  });

  it('bands get worse as the clock runs', () => {
    expect(bandFor(60).grade).toBe('A');
    expect(bandFor(200).grade).toBe('B');
    expect(bandFor(500).grade).toBe('C');
    expect(bandFor(9999).grade).toBe('D');
  });
});
