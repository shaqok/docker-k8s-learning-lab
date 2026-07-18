import { describe, it, expect } from 'vitest';
import { gradeAttempt, attemptScore } from '../data/quizScoring.js';
import { questionId } from '../data/leitner.js';

/** A question tagged with the given domains; correct answer is always index 0. */
const q = (en, d = ['net']) => ({
  q: { en, ko: en }, a: { en: ['right', 'wrong'], ko: ['right', 'wrong'] }, c: 0, d,
  why: { en: '', ko: '' },
});

const totals = (delta) =>
  Object.values(delta).reduce((a, x) => ({ r: a.r + x.r, w: a.w + x.w }), { r: 0, w: 0 });

describe('gradeAttempt', () => {
  const bank = [q('one'), q('two'), q('three')];

  it('scores a right answer to r and a wrong one to w', () => {
    const { delta, cards } = gradeAttempt(bank, { 0: 0, 1: 1 }, new Set());
    expect(delta.net).toEqual({ r: 1, w: 1 });
    expect(cards).toEqual([
      { id: questionId(bank[0]), correct: true },
      { id: questionId(bank[1]), correct: false },
    ]);
  });

  it('credits every domain a question is tagged with', () => {
    const { delta } = gradeAttempt([q('multi', ['net', 'observe'])], { 0: 0 }, new Set());
    expect(delta).toEqual({ net: { r: 1, w: 0 }, observe: { r: 1, w: 0 } });
  });

  // regression: an empty "Grade me" used to record a wrong answer per domain tag
  it('ignores unanswered questions rather than scoring them wrong', () => {
    const { delta, cards, scored } = gradeAttempt(bank, {}, new Set());
    expect(delta).toEqual({});
    expect(cards).toEqual([]);
    expect(scored).toEqual([]);
  });

  it('scores only the answered subset', () => {
    const { delta, scored } = gradeAttempt(bank, { 1: 0 }, new Set());
    expect(totals(delta)).toEqual({ r: 1, w: 0 });
    expect(scored).toEqual([questionId(bank[1])]);
  });

  // regression: retry re-graded the same set, inflating quizStats and walking
  // a Leitner card up a box on every click
  it('skips questions already scored this session', () => {
    const seen = new Set([questionId(bank[0])]);
    const { delta, cards } = gradeAttempt(bank, { 0: 0, 1: 0 }, seen);
    expect(totals(delta)).toEqual({ r: 1, w: 0 }); // only 'two'
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe(questionId(bank[1]));
  });

  it('records nothing when the whole set was already scored', () => {
    const seen = new Set(bank.map(questionId));
    const { delta, cards, scored } = gradeAttempt(bank, { 0: 0, 1: 0, 2: 0 }, seen);
    expect(delta).toEqual({});
    expect(cards).toEqual([]);
    expect(scored).toEqual([]);
  });

  it('lets a later attempt score questions the first one skipped', () => {
    const first = gradeAttempt(bank, { 0: 0 }, new Set());
    const seen = new Set(first.scored);
    const second = gradeAttempt(bank, { 0: 0, 1: 0, 2: 1 }, seen);
    expect(second.scored).toEqual([questionId(bank[1]), questionId(bank[2])]);
    expect(totals(second.delta)).toEqual({ r: 1, w: 1 });
  });

  it('does not mutate the set it is given', () => {
    const seen = new Set();
    gradeAttempt(bank, { 0: 0 }, seen);
    expect(seen.size).toBe(0); // the caller folds `scored` back in
  });

  it('tolerates a missing session set', () => {
    expect(() => gradeAttempt(bank, { 0: 0 }, undefined)).not.toThrow();
    expect(gradeAttempt(bank, { 0: 0 }, undefined).cards).toHaveLength(1);
  });
});

describe('attemptScore', () => {
  const bank = [q('one'), q('two'), q('three')];

  it('counts right answers only', () => {
    expect(attemptScore(bank, { 0: 0, 1: 1, 2: 0 })).toBe(2);
    expect(attemptScore(bank, {})).toBe(0);
  });

  it('counts a re-answered question once, unlike the recorded fold', () => {
    // the on-screen score reflects the current attempt, session history aside
    expect(attemptScore(bank, { 0: 0, 1: 0, 2: 0 })).toBe(3);
  });
});
