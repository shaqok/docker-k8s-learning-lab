/**
 * Grading one quiz attempt — pure, so the two things it writes can be tested.
 *
 * This fold lived inside Quiz.jsx and produced three bugs in quick succession:
 * a retry could re-promote the same Leitner card until it retired, a retry
 * re-inflated the per-domain accuracy behind the readiness dashboard, and an
 * unanswered question scored as wrong (so one empty "Grade me" recorded a wrong
 * answer against every domain at once). None of them crashed anything — they
 * quietly corrupted persisted progress, which is exactly the failure mode worth
 * a test net.
 *
 * Two rules, and both bugs above are consequences of one or the other:
 *   1. A question scores at most once per session.
 *   2. Only answered questions score at all — skipping is not the same as
 *      getting it wrong.
 */

import { questionId } from './leitner.js';

/**
 * @param questions     the attempt's question list
 * @param answers       { [index]: chosenOptionIndex } — sparse; missing = skipped
 * @param alreadyScored Set of question ids already counted this session
 * @returns {{ delta, cards, scored }}
 *   delta  — { [domainId]: {r, w} } for recordQuiz (the readiness signal)
 *   cards  — [{ id, correct }] for recordCards (the Leitner deck)
 *   scored — question ids counted here, to fold back into alreadyScored
 */
export function gradeAttempt(questions, answers, alreadyScored) {
  const seen = alreadyScored || new Set();
  const delta = {};
  const cards = [];
  const scored = [];

  questions.forEach((q, i) => {
    const chosen = answers[i];
    if (chosen === undefined) return;        // skipped ≠ wrong
    const id = questionId(q);
    if (seen.has(id)) return;                // already counted this session
    scored.push(id);

    const correct = chosen === q.c;
    for (const d of q.d) {
      if (!delta[d]) delta[d] = { r: 0, w: 0 };
      delta[d][correct ? 'r' : 'w']++;
    }
    cards.push({ id, correct });
  });

  return { delta, cards, scored };
}

/** How many of this attempt's answers are right — the on-screen score. */
export function attemptScore(questions, answers) {
  return questions.reduce((s, q, i) => s + (answers[i] === q.c ? 1 : 0), 0);
}
