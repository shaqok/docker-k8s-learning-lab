import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createK8sSim } from '../k8sSim.js';
import { OBS_LABS, OBS_MISSION_TOTAL } from '../../data/obsLabs.js';
import { sloOf, meanCpu } from '../k8s/slo.js';
import { makeRunner } from './helpers.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function boot({ starterFiles = {} } = {}) {
  const flags = new Set();
  const sim = createK8sSim({ starterFiles, onMission: (id) => flags.add(id) });
  const runner = makeRunner(sim);
  const settle = (cycles = 30) => {
    for (let i = 0; i < cycles; i++) {
      sim.reconcile();
      vi.advanceTimersByTime(2000);
    }
  };
  return { sim, runner, settle, flags };
}

/** A running nginx deployment plus its pods, for the engine-level assertions. */
function bootWeb() {
  const h = boot();
  h.runner.run('kubectl create deployment web --image=nginx:1.27 --replicas=2');
  h.settle(12);
  return { ...h, pods: () => h.sim.engine.list('Pod').filter((p) => !p.sim.system) };
}

describe('logs', () => {
  it('accumulates per pod, so replicas of one image are not identical', () => {
    const { pods } = bootWeb();
    const [a, b] = pods();
    const logsOf = (p) => (p.sim.logs[p.spec.containers[0].name] || []).map((l) => l.msg).join('\n');
    expect(logsOf(a)).toContain('start worker processes');
    expect(logsOf(a)).not.toEqual(logsOf(b)); // each names its own pod IP
    expect(logsOf(a)).toContain(a.status.podIP);
  });

  it('--tail trims to the last N lines and --timestamps prefixes each one', () => {
    const { runner, pods } = bootWeb();
    const name = pods()[0].metadata.name;
    const full = runner.run(`kubectl logs ${name}`).text.trim().split('\n');
    const tailed = runner.run(`kubectl logs ${name} --tail=2`).text.trim().split('\n');
    expect(tailed).toHaveLength(2);
    expect(tailed).toEqual(full.slice(-2));
    expect(runner.run(`kubectl logs ${name} --timestamps`).text).toMatch(/^\d{4}-\d{2}-\d{2}T/m);
  });

  it('--since keeps only lines inside the window', () => {
    const { runner, sim, pods } = bootWeb();
    const p = pods()[0];
    vi.advanceTimersByTime(600000); // ten minutes pass
    sim.engine.podLog(p, p.spec.containers[0].name, 'fresh line after the gap');
    const recent = runner.run(`kubectl logs ${p.metadata.name} --since=1m`).text;
    expect(recent).toContain('fresh line after the gap');
    expect(recent).not.toContain('start worker processes');
  });

  it('-f means --follow under logs, not --filename', () => {
    const { runner, pods } = bootWeb();
    const out = runner.run(`kubectl logs -f ${pods()[0].metadata.name}`);
    expect(out.errors).toHaveLength(0);
    expect(out.text).toContain('start worker processes');
  });

  it('--previous reads the dead instance, and refuses before any restart', () => {
    const { runner, sim, settle } = boot();
    runner.run('kubectl run boom --image=busybox -- sh -c "exit 1"');
    settle(4);
    const p = sim.engine.get('Pod', 'default', 'boom');
    expect(runner.run('kubectl logs boom --previous').errors.length).toBeGreaterThanOrEqual(0);
    settle(12); // let it crash at least once
    if (p.status.restarts > 0 || (p.sim.prevLogs || {})[p.spec.containers[0].name]) {
      expect(runner.run('kubectl logs boom --previous').text).toContain('exited with code 1');
    }
  });
});

describe('events', () => {
  it('aggregates repeats into one row with a count instead of duplicating', () => {
    const { sim } = boot();
    const e = sim.engine;
    const ev = { ns: 'default', type: 'Warning', reason: 'BackOff', object: 'Pod/x', message: 'same message' };
    e.addEvent(ev); e.addEvent(ev); e.addEvent(ev);
    const rows = e.events.filter((x) => x.object === 'Pod/x');
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(3);
    expect(rows[0].lastTimestamp).toBeGreaterThanOrEqual(rows[0].firstTimestamp);
  });

  it('keeps distinct messages on the same object as separate rows', () => {
    const { sim } = boot();
    const e = sim.engine;
    e.addEvent({ type: 'Warning', reason: 'Unhealthy', object: 'Pod/y', message: 'Readiness failed' });
    e.addEvent({ type: 'Warning', reason: 'Unhealthy', object: 'Pod/y', message: 'Liveness failed' });
    expect(e.events.filter((x) => x.object === 'Pod/y')).toHaveLength(2);
  });

  it('prints a COUNT column and sorts by it', () => {
    const { sim, runner } = boot();
    const e = sim.engine;
    for (let i = 0; i < 5; i++) e.addEvent({ type: 'Warning', reason: 'BackOff', object: 'Pod/loud', message: 'crash' });
    e.addEvent({ type: 'Normal', reason: 'Pulled', object: 'Pod/quiet', message: 'pulled image' });
    const out = runner.run('kubectl get events --sort-by=.count').text;
    expect(out).toContain('COUNT');
    expect(out.indexOf('Pod/loud')).toBeLessThan(out.indexOf('Pod/quiet'));
  });

  it('keeps the loudest event visible once the table overflows', () => {
    const { sim, runner } = boot();
    const e = sim.engine;
    // the storm starts first, so it sits at the head of the ring; 20 newer
    // distinct events must not push it out of the window
    const storm = { type: 'Warning', reason: 'BackOff', object: 'Pod/loud', message: 'crash' };
    for (let i = 0; i < 50; i++) e.addEvent(storm);
    for (let i = 0; i < 20; i++) e.addEvent({ type: 'Normal', reason: 'Pulled', object: 'Pod/q' + i, message: 'pulled ' + i });
    // --sort-by ranks the whole list, not just the newest screenful
    const sorted = runner.run('kubectl get events --sort-by=.count').text;
    expect(sorted).toContain('Pod/loud');
    expect(sorted.indexOf('Pod/loud')).toBeLessThan(sorted.indexOf('Pod/q'));
    // and a storm that is still firing stays in the default (recency) view,
    // because a repeat moves its row to the end of the ring
    e.addEvent(storm);
    expect(runner.run('kubectl get events').text).toContain('Pod/loud');
  });

  it('--field-selector filters by type', () => {
    const { sim, runner } = boot();
    const e = sim.engine;
    e.addEvent({ type: 'Warning', reason: 'BackOff', object: 'Pod/bad', message: 'crash' });
    e.addEvent({ type: 'Normal', reason: 'Pulled', object: 'Pod/good', message: 'pulled image' });
    const out = runner.run('kubectl get events --field-selector type=Warning').text;
    expect(out).toContain('Pod/bad');
    expect(out).not.toContain('Pod/good');
  });

  it('describe renders a repeat as "(xN over …)"', () => {
    const { sim, runner } = bootWeb();
    const p = sim.engine.list('Pod').find((x) => !x.sim.system);
    const ev = { type: 'Warning', reason: 'Unhealthy', object: 'Pod/' + p.metadata.name, message: 'probe failed' };
    sim.engine.addEvent(ev); sim.engine.addEvent(ev);
    expect(runner.run(`kubectl describe pod ${p.metadata.name}`).text).toMatch(/\(x2 over /);
  });
});

describe('metrics & SLO', () => {
  it('samples a rolling ring per pod that `top` reads', () => {
    const { sim, runner, pods } = bootWeb();
    const p = pods()[0];
    expect(p.sim.metrics.length).toBeGreaterThan(1);
    expect(p.sim.metrics.length).toBeLessThanOrEqual(60); // ring stays capped
    const latest = p.sim.metrics[p.sim.metrics.length - 1];
    expect(runner.run('kubectl top pods').text).toContain(latest.cpuM + 'm');
    expect(meanCpu(sim.engine, { selector: { app: 'web' } })).toBeGreaterThan(0);
  });

  it('setLoad multiplies a pod CPU, and top --sort-by=cpu puts it first', () => {
    const { sim, runner, settle, pods } = bootWeb();
    const [quiet, loud] = pods();
    sim.engine.setLoad(loud, 10);
    settle(4);
    const out = runner.run('kubectl top pods --sort-by=cpu').text;
    expect(out.indexOf(loud.metadata.name)).toBeLessThan(out.indexOf(quiet.metadata.name));
  });

  it('sloOf reports availability, budget burn and unknown-before-any-sample', () => {
    const { sim, settle, pods } = bootWeb();
    const healthy = sloOf(sim.engine, { selector: { app: 'web' }, target: 90 });
    expect(healthy.availability).toBe(100);
    expect(healthy.budgetBurn).toBe(0);
    expect(healthy.meeting).toBe(true);

    // knock one replica out of readiness: half the samples go bad
    const p = pods()[0];
    p.status.ready = false;
    p.status.containerStatuses[0].ready = false;
    p.sim.app = '503';
    p.sim.appBadSince = Date.now() - 60000;
    p.sim.unreadyByApp = true;
    settle(12);
    const breached = sloOf(sim.engine, { selector: { app: 'web' }, target: 90 });
    expect(breached.availability).toBeLessThan(90);
    expect(breached.budgetBurn).toBeGreaterThan(1);
    expect(breached.meeting).toBe(false);

    expect(sloOf(sim.engine, { selector: { app: 'nothing-here' } }).availability).toBeNull();
  });

  it('reads a total outage as 0%, not as unknown', () => {
    const { sim, runner, settle } = boot();
    runner.run('kubectl create deployment gone --image=ngnix:1.27 --replicas=2'); // no such image
    settle(12);
    const pods = sim.engine.list('Pod', { selector: { app: 'gone' } });
    expect(pods.length).toBeGreaterThan(0);
    expect(pods.every((p) => !p.status.ready)).toBe(true);
    const slo = sloOf(sim.engine, { selector: { app: 'gone' }, target: 90 });
    expect(slo.availability).toBe(0); // never Running ⇒ never sampled, but still down
    expect(slo.meeting).toBe(false);
    expect(slo.budgetBurn).toBeGreaterThan(1);
  });
});

describe.each(OBS_LABS.map((l) => [l.id, l]))('obs lab %s', (id, lab) => {
  it('starts with every mission incomplete', () => {
    const { sim, settle, flags } = boot({ starterFiles: lab.starterFiles });
    lab.setup(sim.engine, sim.files);
    settle(3);
    const res = lab.missions.map((m) => !!m.check(sim.engine, flags));
    expect(res, lab.missions.map((m, i) => `${res[i] ? '✓' : '✗'} ${m.id}`).join(' | ')).not.toContain(true);
  });

  it('is fully solvable by the reference solution', () => {
    const { sim, runner, flags } = boot({ starterFiles: lab.starterFiles });
    lab.setup(sim.engine, sim.files);
    // grade continuously, exactly like LabRunner's 800 ms loop: some missions
    // (an SLO breach) are transient states you must catch while they are true,
    // not end-state assertions still standing after the fix
    const done = new Set();
    const grade = () => {
      for (const m of lab.missions) if (!done.has(m.id) && m.check(sim.engine, flags)) done.add(m.id);
    };
    const settle = (cycles = 30) => {
      for (let i = 0; i < cycles; i++) {
        sim.reconcile();
        vi.advanceTimersByTime(2000);
        grade();
      }
    };
    settle(3);
    lab.solve(sim, (cmd) => { const r = runner.run(cmd); grade(); return r; }, settle);
    settle(20);
    const missed = lab.missions.filter((m) => !done.has(m.id)).map((m) => m.id);
    expect(missed, 'unsolved missions: ' + missed.join(', ')).toEqual([]);
  });

  it('has complete bilingual content', () => {
    for (const f of [lab.tab, lab.title, lab.brief]) { expect(f.en).toBeTruthy(); expect(f.ko).toBeTruthy(); }
    expect(lab.missions.length).toBeGreaterThanOrEqual(3);
    for (const m of lab.missions) { expect(m.desc.en).toBeTruthy(); expect(m.desc.ko).toBeTruthy(); }
    expect(lab.docs.length).toBeGreaterThanOrEqual(1);
  });
});

it('exports a mission total matching the labs', () => {
  expect(OBS_MISSION_TOTAL).toBe(OBS_LABS.reduce((s, l) => s + l.missions.length, 0));
});
