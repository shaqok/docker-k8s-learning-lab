import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createK8sSim } from '../k8sSim.js';
import { createSupplyChainSim } from '../supplyChainSim.js';
import { SECURITY_LABS, SECURITY_MISSION_TOTAL } from '../../data/securityLabs.js';
import { makeRunner } from './helpers.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function boot(lab) {
  const flags = new Set();
  const createSim = lab.id === 'supply-chain' ? createSupplyChainSim : createK8sSim;
  const sim = createSim({ starterFiles: { ...lab.starterFiles }, onMission: (id) => flags.add(id) });
  lab.setup?.(sim.engine, sim.files);
  const runner = makeRunner(sim);
  const settle = (cycles = 10) => {
    for (let i = 0; i < cycles; i++) {
      sim.reconcile?.();
      vi.advanceTimersByTime(1000);
    }
  };
  settle(3);
  return { sim, runner, settle, flags };
}

describe('security (CKS) drill labs', () => {
  it('exposes a stable mission total for the sidebar pill', () => {
    expect(SECURITY_MISSION_TOTAL).toBe(SECURITY_LABS.reduce((s, l) => s + l.missions.length, 0));
    expect(SECURITY_LABS.length).toBe(6);
  });

  for (const lab of SECURITY_LABS) {
    describe(lab.id, () => {
      it('starts with every mission unsolved', () => {
        const { sim, flags } = boot(lab);
        for (const m of lab.missions) expect(m.check(sim.engine, flags, sim.files), m.id).toBeFalsy();
      });

      it('is fully solved by its reference solve()', () => {
        const { sim, runner, settle, flags } = boot(lab);
        lab.solve(sim, (cmd) => runner.run(cmd), settle);
        settle(10);
        const res = lab.missions.map((m) => !!m.check(sim.engine, flags, sim.files));
        expect(res, lab.missions.map((m, i) => `${res[i] ? '✓' : '✗'} ${m.id}`).join(' | ')).not.toContain(false);
      });

      it('has bilingual text for tab/title/brief and every mission', () => {
        expect(lab.tab.en && lab.tab.ko).toBeTruthy();
        expect(lab.title.en && lab.title.ko).toBeTruthy();
        expect(lab.brief.en && lab.brief.ko).toBeTruthy();
        for (const m of lab.missions) expect(m.desc.en && m.desc.ko, m.id).toBeTruthy();
        expect(lab.docs.length).toBeGreaterThan(0);
      });
    });
  }
});
