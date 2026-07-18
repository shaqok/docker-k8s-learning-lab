import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createK8sSim } from '../k8sSim.js';
import { EXAM_SETS, gradeTask, gradeExam } from '../../data/examTasks.js';
import { EXAMS, DOMAIN_LABELS } from '../../data/examDomains.js';
import { QUIZ_BANK } from '../../data/quiz.js';
import { examReadiness } from '../../data/readiness.js';
import { makeRunner } from './helpers.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function boot(task) {
  const createSim = task.createSim || createK8sSim;
  const sim = createSim({ starterFiles: {} });
  task.setup(sim.engine, sim.files);
  const runner = makeRunner(sim);
  const settle = (cycles = 30) => {
    for (let i = 0; i < cycles; i++) {
      sim.reconcile();
      vi.advanceTimersByTime(2000);
    }
  };
  return { sim, runner, settle };
}

for (const [exam, set] of Object.entries(EXAM_SETS)) {
  const validDomains = new Set(EXAMS[exam].domains.map((d) => d.id));

  describe(`${exam} mock exam set`, () => {
    it('has valid domains, unique ids, positive weights, bilingual text', () => {
      const ids = new Set();
      for (const task of set.tasks) {
        expect(validDomains.has(task.domain), `${task.id} domain ${task.domain}`).toBe(true);
        expect(ids.has(task.id), `duplicate id ${task.id}`).toBe(false);
        ids.add(task.id);
        expect(task.weight).toBeGreaterThan(0);
        for (const field of [task.brief, task.solution]) {
          expect(field.en).toBeTruthy();
          expect(field.ko).toBeTruthy();
        }
        for (const c of task.checks) {
          expect(c.desc.en).toBeTruthy();
          expect(c.desc.ko).toBeTruthy();
        }
      }
      expect(set.tasks.length).toBeGreaterThanOrEqual(12);
    });
  });

  describe.each(set.tasks.map((t) => [exam + '/' + t.id, t]))('exam task %s', (name, task) => {
    it('starts unsolved (at least one check fails)', () => {
      const { sim, settle } = boot(task);
      settle(8);
      const { results } = gradeTask(task, sim.engine, sim);
      expect(results).toContain(false);
    });

    it('is solvable by the reference solution', () => {
      const { sim, runner, settle } = boot(task);
      settle(4);
      task.solve(sim, (cmd) => runner.run(cmd), settle);
      settle(30);
      const { results } = gradeTask(task, sim.engine, sim);
      expect(results, task.checks.map((c, i) => `${results[i] ? '✓' : '✗'} ${c.desc.en}`).join(' | ')).not.toContain(false);
    });
  });
}

describe('gradeExam', () => {
  it('computes weighted score, pass line and per-domain breakdown', () => {
    const set = EXAM_SETS.cka;
    // simulate: every check of every task passes
    const full = gradeExam('cka', (task) => ({ results: task.checks.map(() => true), earned: task.weight }));
    expect(full.score).toBe(100);
    expect(full.pass).toBe(true);
    const domainTotal = Object.values(full.domains).reduce((s, d) => s + d.total, 0);
    expect(domainTotal).toBe(set.tasks.reduce((s, t) => s + t.weight, 0));

    // nothing passes → 0, fail
    const zero = gradeExam('cka', (task) => ({ results: task.checks.map(() => false), earned: 0 }));
    expect(zero.score).toBe(0);
    expect(zero.pass).toBe(false);

    // partial credit counts fractionally
    const half = gradeExam('cka', (task) => ({ results: task.checks.map((_, i) => i === 0), earned: (1 / task.checks.length) * task.weight }));
    expect(half.score).toBeGreaterThan(0);
    expect(half.score).toBeLessThan(100);
  });
});

describe('quiz v2 bank', () => {
  it('every question is bilingual, tagged with known domains, answerable', () => {
    const seen = new Set();
    for (const q of QUIZ_BANK) {
      expect(q.d.length).toBeGreaterThan(0);
      for (const id of q.d) expect(DOMAIN_LABELS[id], `unknown domain ${id} on "${q.q.en}"`).toBeTruthy();
      expect(q.q.en).toBeTruthy();
      expect(q.q.ko).toBeTruthy();
      expect(q.a.en.length).toBeGreaterThanOrEqual(2);
      expect(q.a.ko.length).toBe(q.a.en.length);
      expect(q.c).toBeGreaterThanOrEqual(0);
      expect(q.c).toBeLessThan(q.a.en.length);
      expect(q.why.en).toBeTruthy();
      expect(q.why.ko).toBeTruthy();
      expect(seen.has(q.q.en), `duplicate question "${q.q.en}"`).toBe(false);
      seen.add(q.q.en);
    }
    expect(QUIZ_BANK.length).toBeGreaterThanOrEqual(60);
  });

  it('covers every domain of both exams', () => {
    for (const exam of Object.values(EXAMS)) {
      for (const d of exam.domains) {
        const n = QUIZ_BANK.filter((q) => q.d.includes(d.id)).length;
        expect(n, `domain ${d.id} needs questions`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('readiness', () => {
  const emptyProgress = {
    scenariosDone: [], ckadDone: {}, ckaDone: {}, netDone: {}, opsDone: {}, podDone: {}, storageDone: {}, packagingDone: {}, securityDone: {}, obsDone: {},
    quizStats: {}, examResults: [],
  };

  it('is all-zero with no signals', () => {
    for (const exam of ['cka', 'ckad', 'cks']) {
      const r = examReadiness(exam, emptyProgress);
      expect(r.overall).toBe(0);
      expect(r.domains.reduce((s, d) => s + d.weight, 0)).toBe(100);
      for (const d of r.domains) expect(d.readiness).toBe(0);
    }
  });

  it('folds practice, quiz and mock signals per domain', () => {
    const progress = {
      ...emptyProgress,
      scenariosDone: ['image-typo', 'crashloop'], // practice → cka troubleshooting
      quizStats: { troubleshooting: { r: 9, w: 1 } }, // 90%
      examResults: [{ exam: 'cka', at: 1, score: 50, pass: false, domains: { troubleshooting: { earned: 15, total: 30 } } }],
    };
    const r = examReadiness('cka', progress);
    const t = r.domains.find((d) => d.id === 'troubleshooting');
    expect(t.quiz).toBe(90);
    expect(t.mock).toBe(50);
    expect(t.practice).toBeGreaterThan(0);
    expect(t.readiness).toBe(Math.round((t.practice + 90 + 50) / 3));
    expect(r.overall).toBeGreaterThan(0);
  });

  it('storage folds its lab-mission practice signal together with quiz accuracy', () => {
    const r = examReadiness('cka', { ...emptyProgress, quizStats: { storage: { r: 4, w: 0 } } });
    const s = r.domains.find((d) => d.id === 'storage');
    expect(s.practice).toBe(0); // no storage lab missions completed yet
    expect(s.quiz).toBe(100);
    expect(s.readiness).toBe(Math.round((0 + 100) / 2));
  });
});
