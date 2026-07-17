import { describe, it, expect } from 'vitest';
import { deepMerge, setPath, pathToString, diffObjects, projectKeys, diffManifestSets, manifestKey } from '../k8s/diff.js';

describe('deepMerge', () => {
  it('merges nested objects, keeping unrelated base keys', () => {
    expect(deepMerge({ a: { x: 1, y: 2 }, b: 3 }, { a: { y: 9 } })).toEqual({ a: { x: 1, y: 9 }, b: 3 });
  });
  it('replaces arrays wholesale rather than merging by index', () => {
    expect(deepMerge({ list: [1, 2, 3] }, { list: [9] })).toEqual({ list: [9] });
  });
  it('a scalar patch replaces a scalar or object base', () => {
    expect(deepMerge({ a: { x: 1 } }, { a: 5 })).toEqual({ a: 5 });
  });
});

describe('setPath', () => {
  it('sets a nested path, creating containers as needed', () => {
    const obj = {};
    setPath(obj, ['spec', 'replicas'], 3);
    expect(obj).toEqual({ spec: { replicas: 3 } });
  });
  it('handles an array index segment', () => {
    const obj = { spec: { containers: [{ image: 'old' }] } };
    setPath(obj, ['spec', 'containers', 0, 'image'], 'new');
    expect(obj.spec.containers[0].image).toBe('new');
  });
});

describe('pathToString', () => {
  it('formats dotted and bracketed segments', () => {
    expect(pathToString(['spec', 'containers', 0, 'image'])).toBe('spec.containers[0].image');
  });
});

describe('diffObjects', () => {
  it('returns [] for deep-equal values', () => {
    expect(diffObjects({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toEqual([]);
  });
  it('reports a scalar field change with its path', () => {
    expect(diffObjects({ spec: { replicas: 2 } }, { spec: { replicas: 3 } })).toEqual([{ path: ['spec', 'replicas'], from: 2, to: 3 }]);
  });
  it('reports array element changes by index', () => {
    const changes = diffObjects({ containers: [{ image: 'a' }] }, { containers: [{ image: 'b' }] });
    expect(changes).toEqual([{ path: ['containers', 0, 'image'], from: 'a', to: 'b' }]);
  });
  it('treats type mismatches (object vs primitive) as one change', () => {
    expect(diffObjects({ a: 1 }, { a: { b: 1 } })).toEqual([{ path: ['a'], from: 1, to: { b: 1 } }]);
  });
});

describe('projectKeys', () => {
  it('drops live-only fields not present in desired', () => {
    const live = { replicas: 3, status: { readyReplicas: 3 } };
    const desired = { replicas: 3 };
    expect(projectKeys(live, desired)).toEqual({ replicas: 3 });
  });
  it('recurses into nested objects and arrays', () => {
    const live = { template: { spec: { containers: [{ image: 'x', extra: 1 }] } } };
    const desired = { template: { spec: { containers: [{ image: 'x' }] } } };
    expect(projectKeys(live, desired)).toEqual({ template: { spec: { containers: [{ image: 'x' }] } } });
  });
});

describe('manifestKey / diffManifestSets', () => {
  const dep = (ns, name, replicas) => ({ kind: 'Deployment', metadata: { name, namespace: ns }, spec: { replicas } });

  it('keys by kind/namespace/name, defaulting namespace', () => {
    expect(manifestKey({ kind: 'Pod', metadata: { name: 'p' } })).toBe('Pod/default/p');
  });

  it('classifies added, removed, changed, and same', () => {
    const before = [dep('default', 'web', 2), dep('default', 'gone', 1)];
    const after = [dep('default', 'web', 3), dep('default', 'new', 1)];
    const results = diffManifestSets(before, after);
    const byName = Object.fromEntries(results.map((r) => [r.name, r]));
    expect(byName.web.status).toBe('changed');
    expect(byName.web.changes).toEqual([{ path: ['replicas'], from: 2, to: 3 }]);
    expect(byName.new.status).toBe('added');
    expect(byName.gone.status).toBe('removed');
  });

  it('is idempotent: diffing a rendered set against itself is empty of changes', () => {
    const set = [dep('default', 'web', 2)];
    const results = diffManifestSets(set, JSON.parse(JSON.stringify(set)));
    expect(results.every((r) => r.status === 'same')).toBe(true);
  });
});
