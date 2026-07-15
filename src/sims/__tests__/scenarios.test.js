import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createK8sSim } from '../k8sSim.js';
import { SCENARIOS } from '../../data/scenarios.js';
import { makeRunner } from './helpers.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function boot(scenario) {
  const sim = createK8sSim({ starterFiles: {} });
  scenario.setup(sim.engine, sim.files);
  const runner = makeRunner(sim);
  const settle = (cycles = 30) => {
    for (let i = 0; i < cycles; i++) {
      sim.reconcile();
      vi.advanceTimersByTime(2000);
    }
  };
  return { sim, runner, settle };
}

const results = (scenario, sim) => scenario.checks.map((c) => c.test(sim.engine));

describe.each(SCENARIOS.map((s) => [s.id, s]))('scenario %s', (id, scenario) => {
  it('starts broken (at least one check fails), and stays broken if you do nothing', () => {
    const { sim, settle } = boot(scenario);
    settle(5);
    expect(results(scenario, sim)).toContain(false);
    settle(20); // no self-healing away the lesson
    expect(results(scenario, sim)).toContain(false);
  });

  it('is solvable by the reference solution', () => {
    const { sim, runner, settle } = boot(scenario);
    settle(5);
    scenario.solve(sim, (cmd) => runner.run(cmd));
    settle(40);
    const res = results(scenario, sim);
    expect(res, scenario.checks.map((c, i) => `${res[i] ? '✓' : '✗'} ${c.desc.en}`).join(' | ')).not.toContain(false);
  });

  it('has complete bilingual content', () => {
    for (const field of [scenario.title, scenario.brief, scenario.solution]) {
      expect(field.en).toBeTruthy();
      expect(field.ko).toBeTruthy();
    }
    expect(scenario.hints.length).toBeGreaterThanOrEqual(2);
    for (const h of scenario.hints) { expect(h.en).toBeTruthy(); expect(h.ko).toBeTruthy(); }
    for (const c of scenario.checks) { expect(c.desc.en).toBeTruthy(); expect(c.desc.ko).toBeTruthy(); }
  });
});
