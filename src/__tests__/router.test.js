import { describe, it, expect } from 'vitest';
import { parseHash, hashFor, MODULE_SLUGS, DEFAULT_MODULE } from '../router.js';

describe('parseHash', () => {
  it('resolves every module slug and raw id', () => {
    for (const [id, slug] of Object.entries(MODULE_SLUGS)) {
      expect(parseHash('#/' + slug)).toEqual({ id, sub: null });
      expect(parseHash('#/' + id)).toEqual({ id, sub: null });
    }
  });

  it('falls back to the default module on empty or junk hashes', () => {
    expect(parseHash('')).toEqual({ id: DEFAULT_MODULE, sub: null });
    expect(parseHash('#')).toEqual({ id: DEFAULT_MODULE, sub: null });
    expect(parseHash('#/')).toEqual({ id: DEFAULT_MODULE, sub: null });
    expect(parseHash('#/no-such-module')).toEqual({ id: DEFAULT_MODULE, sub: null });
    expect(parseHash('#/no-such-module/deep')).toEqual({ id: DEFAULT_MODULE, sub: null });
    expect(parseHash(undefined)).toEqual({ id: DEFAULT_MODULE, sub: null });
  });

  it('parses sub-paths (scenario ids, lab tabs)', () => {
    expect(parseHash('#/troubleshooting/svc-selector')).toEqual({ id: 'm10', sub: 'svc-selector' });
    expect(parseHash('#/ckad-drills/qos')).toEqual({ id: 'm11', sub: 'qos' });
    expect(parseHash('#/m14/etcd')).toEqual({ id: 'm14', sub: 'etcd' });
  });

  it('decodes encoded sub segments', () => {
    expect(parseHash('#/quiz/a%20b')).toEqual({ id: 'm6', sub: 'a b' });
  });
});

describe('hashFor', () => {
  it('builds slug hashes, with and without sub', () => {
    expect(hashFor('m0')).toBe('#/roadmap');
    expect(hashFor('m10', 'svc-selector')).toBe('#/troubleshooting/svc-selector');
    expect(hashFor('m10', null)).toBe('#/troubleshooting');
  });

  it('round-trips through parseHash for every module', () => {
    for (const id of Object.keys(MODULE_SLUGS)) {
      expect(parseHash(hashFor(id, 'x'))).toEqual({ id, sub: 'x' });
      expect(parseHash(hashFor(id))).toEqual({ id, sub: null });
    }
  });

  it('maps unknown ids to the default module', () => {
    expect(hashFor('m99')).toBe('#/' + MODULE_SLUGS[DEFAULT_MODULE]);
  });
});
