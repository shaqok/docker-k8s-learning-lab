/**
 * A Leitner spaced-repetition deck over the quiz bank.
 *
 * Five boxes with widening intervals. A right answer promotes a card one box
 * and pushes its due date out; a wrong answer sends it straight back to box 1,
 * which is the whole point of Leitner — you re-earn the interval rather than
 * decaying it gently.
 *
 * Question identity: QUIZ_BANK entries have no id field, and their array index
 * is not stable (the module filters the bank by exam/domain before rendering).
 * So identity is a hash of the English question text. The trade-off is
 * deliberate and worth knowing: **editing a question's English text retires its
 * old card and starts a fresh one.** That self-heals in one review and costs
 * nothing, where hand-numbering ~100 questions would be a large diff that still
 * breaks the moment someone reorders the bank.
 */

/** Interval in days before a card in box N comes back. Box 5 is "retired". */
export const BOX_DAYS = [0, 1, 3, 7, 21];
export const MAX_BOX = BOX_DAYS.length; // 5 — a card here is retired
const DAY_MS = 86400000;

/** FNV-1a over the English question text → short stable base36 id. */
export function questionId(q) {
  const text = (q && q.q && q.q.en) || '';
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/**
 * Apply one answer to a card. Right → next box, due after that box's interval.
 * Wrong → back to box 1, due immediately.
 */
export function review(card, correct, now = Date.now()) {
  const prev = card || { box: 1, seen: 0 };
  const box = correct ? Math.min(prev.box + 1, MAX_BOX) : 1;
  const days = BOX_DAYS[Math.min(box, BOX_DAYS.length) - 1];
  return {
    box,
    due: now + days * DAY_MS,
    seen: (prev.seen || 0) + 1,
    lastAt: now,
  };
}

/** Is this card due for review? Cards never seen are due; retired cards are not. */
export function isDue(card, now = Date.now()) {
  if (!card) return true;
  if (card.box >= MAX_BOX) return false;
  return (card.due || 0) <= now;
}

/**
 * How many cards one sitting serves. On a fresh deck every question is "due",
 * and a 96-question wall is not a review session — it's the whole quiz again,
 * which is exactly what spaced repetition exists to avoid. Cards not served
 * today stay due and come back tomorrow.
 */
export const SESSION_LIMIT = 20;

/**
 * Review order: cards you have struggled with first (lowest box), then cards
 * you have never seen.
 *
 * Unseen cards sort last rather than first, and that matters once the session
 * is capped: a bank of ~100 mostly-unseen questions would otherwise starve the
 * handful of lapsed cards you actually got wrong, which are the whole reason
 * to open a review deck. New material fills whatever room is left.
 *
 * Pass limit = 0 for the full backlog (deckStats uses it to report the real count).
 */
export function dueCards(bank, deck, now = Date.now(), limit = SESSION_LIMIT) {
  const d = deck || {};
  const rank = (card) => (card ? card.box : MAX_BOX + 1);
  const due = bank
    .map((q) => ({ q, id: questionId(q), card: d[questionId(q)] }))
    .filter(({ card }) => isDue(card, now))
    .sort((a, b) => rank(a.card) - rank(b.card));
  return limit > 0 ? due.slice(0, limit) : due;
}

/** Deck summary for the review pane: how many cards sit in each box. */
export function deckStats(bank, deck, now = Date.now()) {
  const d = deck || {};
  const boxes = Array(MAX_BOX).fill(0);
  let retired = 0;
  let unseen = 0;
  for (const q of bank) {
    const card = d[questionId(q)];
    if (!card) { unseen++; continue; }
    if (card.box >= MAX_BOX) retired++;
    else boxes[card.box - 1]++;
  }
  const due = dueCards(bank, d, now, 0).length; // the true backlog, not one sitting
  return { boxes, retired, unseen, due, session: Math.min(due, SESSION_LIMIT), total: bank.length };
}
