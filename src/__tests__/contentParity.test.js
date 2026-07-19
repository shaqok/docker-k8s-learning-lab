import { describe, it, expect } from 'vitest';
import { content } from '../content/index.js';

/**
 * EN and KO content must stay structurally compatible: same module ids, same
 * keys per module, same value types, and equal lengths for positional arrays
 * (cards, button-label lists, mission lists — anything JSX indexes into).
 * Rich node-tree arrays are exempt from the length check: a translation may
 * legitimately merge or split text leaves, changing the child count.
 * This is the safety net for hand-editing the (large, originally
 * auto-generated) content files.
 */

const isElementNode = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && 't' in v;

/** A Rich content tree is an array mixing text leaves and {t,...} element nodes. */
const isNodeTree = (arr) => arr.some(isElementNode);

describe('EN/KO content parity', () => {
  it('has the same module ids', () => {
    expect(Object.keys(content.ko).sort()).toEqual(Object.keys(content.en).sort());
  });

  for (const mid of Object.keys(content.en)) {
    describe(mid, () => {
      it('has identical key sets', () => {
        expect(Object.keys(content.ko[mid]).sort()).toEqual(Object.keys(content.en[mid]).sort());
      });

      it('has matching value types', () => {
        for (const [key, enVal] of Object.entries(content.en[mid])) {
          const koVal = content.ko[mid][key];
          const kind = (v) => (Array.isArray(v) ? 'array' : typeof v);
          expect(kind(koVal), `${mid}.${key}`).toBe(kind(enVal));
        }
      });

      it('positional arrays have equal lengths in both languages', () => {
        for (const [key, enVal] of Object.entries(content.en[mid])) {
          if (!Array.isArray(enVal) || isNodeTree(enVal)) continue;
          expect(content.ko[mid][key], `${mid}.${key}`).toHaveLength(enVal.length);
        }
      });
    });
  }
});
