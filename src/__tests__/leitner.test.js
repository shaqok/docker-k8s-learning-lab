import { describe, it, expect } from 'vitest';
import { questionId, review, isDue, dueCards, deckStats, BOX_DAYS, MAX_BOX } from '../data/leitner.js';
import { QUIZ_BANK } from '../data/quiz.js';

const DAY = 86400000;
const T0 = 1_700_000_000_000;
const q = (en) => ({ q: { en, ko: en }, a: { en: [], ko: [] }, c: 0, d: ['net'], why: { en: '', ko: '' } });

describe('questionId', () => {
  it('is stable for the same English text', () => {
    expect(questionId(q('what is a pod?'))).toBe(questionId(q('what is a pod?')));
  });

  it('differs for different text', () => {
    expect(questionId(q('a'))).not.toBe(questionId(q('b')));
  });

  it('is unique across the whole shipped bank', () => {
    // identity is a hash, so a collision would silently merge two cards
    const ids = QUIZ_BANK.map(questionId);
    expect(new Set(ids).size).toBe(QUIZ_BANK.length);
  });

  it('does not throw on a malformed question', () => {
    expect(() => questionId(null)).not.toThrow();
    expect(() => questionId({})).not.toThrow();
  });
});

describe('review', () => {
  it('promotes a new card to box 2, due after one day', () => {
    const card = review(undefined, true, T0);
    expect(card.box).toBe(2);
    expect(card.due).toBe(T0 + 1 * DAY);
    expect(card.seen).toBe(1);
    expect(card.lastAt).toBe(T0);
  });

  it('walks the box intervals on a correct streak', () => {
    let card;
    const gotDays = [];
    for (let i = 0; i < 4; i++) {
      card = review(card, true, T0);
      gotDays.push((card.due - T0) / DAY);
    }
    expect(card.box).toBe(MAX_BOX);
    expect(gotDays).toEqual(BOX_DAYS.slice(1)); // boxes 2..5
  });

  it('sends a wrong answer back to box 1, due immediately', () => {
    const strong = { box: 4, seen: 9 };
    const card = review(strong, false, T0);
    expect(card.box).toBe(1);
    expect(card.due).toBe(T0);
    expect(card.seen).toBe(10); // a lapse is still a repetition
  });

  it('never promotes past the last box', () => {
    expect(review({ box: MAX_BOX, seen: 1 }, true, T0).box).toBe(MAX_BOX);
  });
});

describe('isDue', () => {
  it('treats an unseen card as due', () => {
    expect(isDue(undefined, T0)).toBe(true);
  });

  it('is due exactly at the due date, not before', () => {
    const card = review(undefined, true, T0); // due T0 + 1 day
    expect(isDue(card, T0 + DAY - 1)).toBe(false);
    expect(isDue(card, T0 + DAY)).toBe(true);
  });

  it('never brings back a retired card', () => {
    expect(isDue({ box: MAX_BOX, due: 0 }, T0 + 1000 * DAY)).toBe(false);
  });
});

describe('dueCards', () => {
  const bank = [q('one'), q('two'), q('three')];

  it('returns the whole bank for an empty deck', () => {
    expect(dueCards(bank, {}, T0)).toHaveLength(3);
    expect(dueCards(bank, undefined, T0)).toHaveLength(3);
  });

  it('drops cards whose interval has not elapsed', () => {
    const deck = { [questionId(q('one'))]: review(undefined, true, T0) };
    const due = dueCards(bank, deck, T0);
    expect(due.map((c) => c.q.q.en)).toEqual(['two', 'three']);
  });

  it('puts the weakest cards first', () => {
    const deck = {
      [questionId(q('one'))]: { box: 3, due: 0 },
      [questionId(q('two'))]: { box: 1, due: 0 },
      [questionId(q('three'))]: { box: 2, due: 0 },
    };
    expect(dueCards(bank, deck, T0).map((c) => c.q.q.en)).toEqual(['two', 'three', 'one']);
  });
});

describe('deckStats', () => {
  const bank = [q('one'), q('two'), q('three')];

  it('counts an untouched deck as all unseen', () => {
    const s = deckStats(bank, {}, T0);
    expect(s).toMatchObject({ retired: 0, unseen: 3, due: 3, total: 3 });
    expect(s.boxes).toEqual([0, 0, 0, 0, 0]);
  });

  it('bins cards by box and counts retirees separately', () => {
    const deck = {
      [questionId(q('one'))]: { box: 1, due: 0 },
      [questionId(q('two'))]: { box: MAX_BOX, due: 0 },
    };
    const s = deckStats(bank, deck, T0);
    expect(s.boxes[0]).toBe(1);
    expect(s.retired).toBe(1);
    expect(s.unseen).toBe(1);
    expect(s.due).toBe(2); // box-1 card and the unseen one; the retiree is out
  });

  it('accounts for every question in the real bank', () => {
    const s = deckStats(QUIZ_BANK, {}, T0);
    const binned = s.boxes.reduce((a, b) => a + b, 0) + s.retired + s.unseen;
    expect(binned).toBe(QUIZ_BANK.length);
    expect(s.total).toBe(QUIZ_BANK.length);
  });
});
