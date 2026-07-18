import { describe, it, expect } from 'vitest';
import { MODULES, SECTIONS, moduleById, moduleLabel } from '../data/modules.js';
import { TRACKS, TRACK_IDS, HUB_MODULE } from '../data/tracks.js';
import { moduleStats, trackState, visibleModules } from '../data/pedagogy.js';
import { MODULE_SLUGS } from '../router.js';
import { COMPONENTS } from '../App.jsx';

/** Progress state with nothing done — the shape ProgressContext hands out. */
const emptyProgress = () => ({
  roadmap: {},
  dockerDone: [], k8sDone: [], scenariosDone: [],
  ckadDone: {}, ckaDone: {}, netDone: {}, opsDone: {}, dockerDrillDone: {},
  podDone: {}, storageDone: {}, packagingDone: {}, securityDone: {}, obsDone: {},
  examResults: [], visited: [],
});

/** Fill every counter to its total so every module reads complete. */
const fullProgress = () => {
  const p = emptyProgress();
  const stats = moduleStats(p);
  const fill = (n) => Array.from({ length: n }, (_, i) => 'x' + i);
  // reading modules: complete once visited
  p.visited = MODULES.filter((m) => !m.pill).map((m) => m.id);
  p.roadmap = Object.fromEntries(fill(stats.m0.total).map((k) => [k, true]));
  p.dockerDone = fill(stats.m2.total);
  p.k8sDone = fill(stats.m4.total);
  p.scenariosDone = fill(stats.m10.total);
  p.dockerDrillDone = { l: fill(stats.m16.total) };
  p.ckadDone = { l: fill(stats.m11.total) };
  p.ckaDone = { l: fill(stats.m12.total) };
  p.netDone = { l: fill(stats.m13.total) };
  p.opsDone = { l: fill(stats.m14.total) };
  p.podDone = { l: fill(stats.m17.total) };
  p.storageDone = { l: fill(stats.m18.total) };
  p.packagingDone = { l: fill(stats.m19.total) };
  p.securityDone = { l: fill(stats.m20.total) };
  p.obsDone = { l: fill(stats.m21.total) };
  p.examResults = [{ exam: 'cka', score: 80, pass: true, domains: {} }];
  return p;
};

describe('module registry', () => {
  it('has unique ids and slugs, and bilingual titles', () => {
    const ids = new Set();
    const slugs = new Set();
    for (const m of MODULES) {
      expect(ids.has(m.id), `duplicate id ${m.id}`).toBe(false);
      expect(slugs.has(m.slug), `duplicate slug ${m.slug}`).toBe(false);
      ids.add(m.id);
      slugs.add(m.slug);
      expect(m.title.en).toBeTruthy();
      expect(m.title.ko).toBeTruthy();
      expect(m.section === null || SECTIONS[m.section], `unknown section on ${m.id}`).toBeTruthy();
    }
  });

  it('is the source router slugs are derived from', () => {
    expect(Object.keys(MODULE_SLUGS).sort()).toEqual(MODULES.map((m) => m.id).sort());
    for (const m of MODULES) expect(MODULE_SLUGS[m.id]).toBe(m.slug);
  });

  it('has a component for every module, and no orphan components', () => {
    // App.jsx renders <C/> per registry entry; a missing one crashes the app
    expect(Object.keys(COMPONENTS).sort()).toEqual(MODULES.map((m) => m.id).sort());
    for (const id of Object.keys(COMPONENTS)) expect(COMPONENTS[id]).toBeTruthy();
  });

  it('only requires modules that exist, and never itself', () => {
    for (const m of MODULES) {
      for (const r of m.requires) {
        expect(moduleById(r), `${m.id} requires unknown ${r}`).toBeTruthy();
        expect(r).not.toBe(m.id);
      }
    }
  });

  it('has no prerequisite cycles', () => {
    const seen = {};
    const walk = (id, stack) => {
      if (stack.includes(id)) throw new Error(`cycle: ${[...stack, id].join(' → ')}`);
      if (seen[id]) return;
      seen[id] = true;
      for (const r of moduleById(id).requires) walk(r, [...stack, id]);
    };
    expect(() => MODULES.forEach((m) => walk(m.id, []))).not.toThrow();
  });

  it('labels a module with its icon and localised title', () => {
    expect(moduleLabel('m11', 'en')).toBe('🎯 CKAD Drills');
    expect(moduleLabel('m1', 'en')).toBe('Containers 101'); // no icon → no leading space
    expect(moduleLabel('m11', 'ko')).toBe('🎯 CKAD 드릴');
  });
});

describe('tracks', () => {
  it('reference only known modules and never the hub', () => {
    for (const id of TRACK_IDS) {
      const t = TRACKS[id];
      expect(t.label.en && t.label.ko).toBeTruthy();
      expect(t.blurb.en && t.blurb.ko).toBeTruthy();
      expect(t.modules.length).toBeGreaterThan(0);
      expect(new Set(t.modules).size, `${id} lists a module twice`).toBe(t.modules.length);
      for (const m of t.modules) {
        expect(moduleById(m), `track ${id} references unknown ${m}`).toBeTruthy();
        expect(m).not.toBe(HUB_MODULE);
      }
    }
  });

  it('never shows a lock the learner cannot clear from inside the track', () => {
    // a "do first: X" that names a module not on your path can never be
    // satisfied — trackState must ignore prerequisites outside the track
    for (const id of TRACK_IDS) {
      const st = trackState(id, emptyProgress());
      const inTrack = new Set(TRACKS[id].modules);
      for (const m of st.modules) {
        for (const r of m.missing) {
          expect(inTrack.has(r), `${id}: ${m.id} blames ${r}, which is not in the track`).toBe(true);
        }
      }
    }
  });

  it('shows the hub first, then the track; no track shows everything', () => {
    expect(visibleModules('docker')[0]).toBe(HUB_MODULE);
    expect(visibleModules('docker')).toEqual([HUB_MODULE, ...TRACKS.docker.modules]);
    expect(visibleModules(null)).toEqual(MODULES.map((m) => m.id));
    expect(visibleModules('nope')).toEqual(MODULES.map((m) => m.id));
  });
});

describe('moduleStats', () => {
  it('reports nothing complete on fresh progress', () => {
    const stats = moduleStats(emptyProgress());
    for (const m of MODULES) expect(stats[m.id].complete, `${m.id} complete when empty`).toBe(false);
    expect(stats.m2.text).toMatch(/^0\//);
    expect(stats.m0.text).toBe('0%');
    expect(stats.m15.text).toBe('—');
  });

  it('reports everything complete on saturated progress', () => {
    const stats = moduleStats(fullProgress());
    for (const m of MODULES) expect(stats[m.id].complete, `${m.id} incomplete when full`).toBe(true);
    expect(stats.m0.text).toBe('100%');
    expect(stats.m15.text).toBe('80%');
  });

  it('treats a reading module as done once visited', () => {
    const p = emptyProgress();
    expect(moduleStats(p).m1.complete).toBe(false);
    p.visited = ['m1'];
    expect(moduleStats(p).m1.complete).toBe(true);
    expect(moduleStats(p).m1.kind).toBe('visit');
  });

  it('counts missions across every lab in a drill module', () => {
    const p = emptyProgress();
    p.ckadDone = { probes: ['a', 'b'], qos: ['c'] };
    expect(moduleStats(p).m11.done).toBe(3);
  });

  it('survives a progress object missing keys', () => {
    expect(() => moduleStats({})).not.toThrow();
    expect(moduleStats({}).m2.done).toBe(0);
  });
});

describe('trackState', () => {
  it('returns null for an unknown track', () => {
    expect(trackState('nope', emptyProgress())).toBe(null);
  });

  it('ignores prerequisites that are not part of the track', () => {
    // CKAD includes Observability (m21) but not Troubleshooting (m10), which
    // m21 globally requires — so within CKAD it must not be blamed on m10
    const st = trackState('ckad', emptyProgress());
    expect(st.modules.find((m) => m.id === 'm21').missing).not.toContain('m10');
  });

  it('locks a module whose prerequisites are unmet and names them', () => {
    const st = trackState('docker', emptyProgress());
    const m2 = st.modules.find((m) => m.id === 'm2');
    expect(m2.locked).toBe(true);
    expect(m2.missing).toEqual(['m1']); // Containers 101
    // m1 itself has no prerequisites, so it is the one thing you can start
    expect(st.modules.find((m) => m.id === 'm1').locked).toBe(false);
  });

  it('points next at the first unlocked, incomplete module', () => {
    const p = emptyProgress();
    expect(trackState('docker', p).nextId).toBe('m1');
    p.visited = ['m1'];                       // m1 done → m2 unlocks
    expect(trackState('docker', p).nextId).toBe('m2');
  });

  it('skips completed modules when choosing next', () => {
    const p = emptyProgress();
    p.visited = ['m1', 'm7'];
    p.dockerDone = Array.from({ length: moduleStats(p).m2.total }, (_, i) => 'x' + i);
    expect(trackState('docker', p).nextId).toBe('m16');
  });

  it('still offers a next step when everything left is locked', () => {
    // nothing done at all, and every remaining module has an unmet prerequisite
    const st = trackState('cks', emptyProgress());
    expect(st.nextId).toBeTruthy();
    expect(st.modules.find((m) => m.id === st.nextId)).toBeTruthy();
  });

  it('reports null next once the whole track is complete', () => {
    const st = trackState('docker', fullProgress());
    expect(st.nextId).toBe(null);
    expect(st.pct).toBe(100);
    expect(st.done).toBe(st.total);
  });

  it('counts progress over the track, not the whole app', () => {
    const p = emptyProgress();
    p.visited = ['m1'];
    const st = trackState('docker', p);
    expect(st.total).toBe(TRACKS.docker.modules.length);
    expect(st.done).toBe(1);
    expect(st.pct).toBe(Math.round((1 / st.total) * 100));
  });
});
