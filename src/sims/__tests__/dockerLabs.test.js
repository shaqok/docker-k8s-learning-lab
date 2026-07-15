import { describe, it, expect } from 'vitest';
import { createDockerSim } from '../dockerSim.js';
import { DOCKER_LABS, DOCKER_MISSION_TOTAL } from '../../data/dockerLabs.js';

/** Boot a lab the way LabRunner does: fresh sim, its starter files, flag capture. */
function boot(lab) {
  const flags = new Set();
  const sim = createDockerSim({ onMission: (id) => flags.add(id), starterFiles: { ...lab.starterFiles } });
  lab.setup?.(sim.engine, sim.files);
  const run = (cmd) => sim.exec(cmd, () => {});
  return { sim, flags, run };
}

describe('docker drill labs', () => {
  it('exposes a stable mission total for the sidebar pill', () => {
    expect(DOCKER_MISSION_TOTAL).toBe(DOCKER_LABS.reduce((s, l) => s + l.missions.length, 0));
    expect(DOCKER_LABS.length).toBe(5);
  });

  for (const lab of DOCKER_LABS) {
    describe(lab.id, () => {
      it('starts with every mission unsolved', () => {
        const { sim, flags } = boot(lab);
        for (const m of lab.missions) expect(m.check(sim.engine, flags, sim.files), m.id).toBeFalsy();
      });

      it('is fully solved by its reference solve()', () => {
        const { sim, flags, run } = boot(lab);
        lab.solve(sim, run);
        for (const m of lab.missions) expect(m.check(sim.engine, flags, sim.files), lab.id + '/' + m.id).toBeTruthy();
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
