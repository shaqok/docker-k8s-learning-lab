import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createK8sSim } from '../k8sSim.js';
import { PACKAGING_LABS, PACKAGING_MISSION_TOTAL } from '../../data/packagingLabs.js';
import { makeRunner } from './helpers.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function boot(lab) {
  const flags = new Set();
  const sim = createK8sSim({ starterFiles: { ...lab.starterFiles }, onMission: (id) => flags.add(id) });
  lab.setup?.(sim.engine, sim.files);
  const runner = makeRunner(sim);
  const settle = (cycles = 10) => {
    for (let i = 0; i < cycles; i++) {
      sim.reconcile();
      vi.advanceTimersByTime(1000);
    }
  };
  settle(3);
  return { sim, runner, settle, flags };
}

describe('packaging & gitops drill labs', () => {
  it('exposes a stable mission total for the sidebar pill', () => {
    expect(PACKAGING_MISSION_TOTAL).toBe(PACKAGING_LABS.reduce((s, l) => s + l.missions.length, 0));
    expect(PACKAGING_LABS.length).toBe(3);
  });

  for (const lab of PACKAGING_LABS) {
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

  it('the GitOps lab starts already Synced (setup seeds state matching its own rendered source)', () => {
    const gitopsLab = PACKAGING_LABS.find((l) => l.id === 'gitops');
    const { sim, settle } = boot(gitopsLab);
    settle(3);
    const app = sim.engine.get('GitOpsApp', 'default', 'prod-app');
    expect(app.status.syncStatus).toBe('Synced');
  });
});
