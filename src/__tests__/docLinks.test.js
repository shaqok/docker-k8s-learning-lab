import { describe, it, expect } from 'vitest';
import { DOMAIN_DOCS, docsForDomains } from '../data/docLinks.js';
import { ALL_DOMAIN_IDS } from '../data/examDomains.js';
import { SCENARIOS } from '../data/scenarios.js';
import { QUIZ_BANK } from '../data/quiz.js';
import { EXAM_SETS } from '../data/examTasks.js';

/** Every doc link, wherever it lives, must be a labelled https URL. */
const expectWellFormed = (docs, where) => {
  expect(Array.isArray(docs), `${where}: docs is not an array`).toBe(true);
  expect(docs.length, `${where}: docs is empty`).toBeGreaterThan(0);
  for (const d of docs) {
    expect(d.label, `${where}: missing label`).toBeTruthy();
    expect(d.url, `${where}: ${d.label} has no url`).toMatch(/^https:\/\//);
  }
};

describe('DOMAIN_DOCS', () => {
  it('covers every exam domain a quiz question can carry', () => {
    for (const id of ALL_DOMAIN_IDS) expectWellFormed(DOMAIN_DOCS[id], `domain ${id}`);
  });

  it('has no unknown domain keys', () => {
    for (const id of Object.keys(DOMAIN_DOCS)) expect(ALL_DOMAIN_IDS).toContain(id);
  });

  it('gives every question in the bank at least one link', () => {
    for (const q of QUIZ_BANK) expectWellFormed(docsForDomains(q.d), q.q.en);
  });

  it("dedupes a page shared by two of a question's tagged domains", () => {
    // net and troubleshooting both point at service debugging pages
    const twice = [...DOMAIN_DOCS.net, ...DOMAIN_DOCS.net];
    expect(docsForDomains(['net', 'net'])).toHaveLength(DOMAIN_DOCS.net.length);
    expect(twice.length).toBeGreaterThan(docsForDomains(['net', 'net']).length);
  });

  it('returns nothing for no domains rather than throwing', () => {
    expect(docsForDomains([])).toEqual([]);
    expect(docsForDomains(undefined)).toEqual([]);
  });
});

describe('scenario doc links', () => {
  it.each(SCENARIOS.map((s) => [s.id, s]))('%s links to the real docs', (id, s) => {
    expectWellFormed(s.docs, `scenario ${id}`);
  });
});

describe('exam task doc links', () => {
  const tasks = Object.entries(EXAM_SETS).flatMap(([exam, set]) =>
    set.tasks.map((t) => [`${exam}/${t.id}`, t]),
  );

  it.each(tasks)('%s resolves to at least one doc link', (name, task) => {
    // native tasks carry their own; scenario-derived ones inherit; either way
    // MockExam falls back to the task's domain, so this must never be empty
    const docs = task.docs && task.docs.length ? task.docs : docsForDomains([task.domain]);
    expectWellFormed(docs, name);
  });
});
