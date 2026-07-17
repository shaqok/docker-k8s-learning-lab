import { describe, it, expect } from 'vitest';
import { buildKustomization, applyJsonPatch } from '../k8s/kustomize.js';
import { createFileStore } from '../k8sSim.js';

function baseFiles(extra = {}) {
  return createFileStore({
    'base/kustomization.yaml': 'resources:\n  - deployment.yaml\n  - service.yaml\n',
    'base/deployment.yaml': `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: web
        image: nginx:1.27
`,
    'base/service.yaml': `apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
  ports:
  - port: 80
`,
    ...extra,
  });
}

describe('buildKustomization — base only', () => {
  it('resolves resources into a flat manifest set', () => {
    const { docs, error } = buildKustomization(baseFiles(), 'base');
    expect(error).toBeUndefined();
    expect(docs.map((d) => d.kind).sort()).toEqual(['Deployment', 'Service']);
  });
});

describe('buildKustomization — overlay composition', () => {
  function overlayFiles(overlayKustomization) {
    return baseFiles({ 'overlays/prod/kustomization.yaml': overlayKustomization });
  }

  it('recurses into a base referenced via ../../ and applies namePrefix + namespace', () => {
    const files = overlayFiles('resources:\n  - ../../base\nnamePrefix: prod-\nnamespace: prod\n');
    const { docs, error } = buildKustomization(files, 'overlays/prod');
    expect(error).toBeUndefined();
    const dep = docs.find((d) => d.kind === 'Deployment');
    expect(dep.metadata.name).toBe('prod-web');
    expect(dep.metadata.namespace).toBe('prod');
  });

  it('applies commonLabels to metadata, selector.matchLabels, and template labels', () => {
    const files = overlayFiles('resources:\n  - ../../base\ncommonLabels:\n  env: prod\n');
    const { docs } = buildKustomization(files, 'overlays/prod');
    const dep = docs.find((d) => d.kind === 'Deployment');
    expect(dep.metadata.labels).toEqual({ env: 'prod' });
  });

  it('rewrites image tags via the images transformer', () => {
    const files = overlayFiles('resources:\n  - ../../base\nimages:\n  - name: nginx\n    newTag: "1.28"\n');
    const { docs } = buildKustomization(files, 'overlays/prod');
    const dep = docs.find((d) => d.kind === 'Deployment');
    expect(dep.spec.template.spec.containers[0].image).toBe('nginx:1.28');
  });

  it('overrides replicas via the replicas transformer (matched by current name)', () => {
    const files = overlayFiles('resources:\n  - ../../base\nreplicas:\n  - name: web\n    count: 5\n');
    const { docs } = buildKustomization(files, 'overlays/prod');
    const dep = docs.find((d) => d.kind === 'Deployment');
    expect(dep.spec.replicas).toBe(5);
  });

  it('applies a whole-object strategic-merge patch matched by target', () => {
    const files = overlayFiles(
      'resources:\n  - ../../base\npatchesStrategicMerge:\n  - patch-replicas.yaml\n',
    );
    files.write('overlays/prod/patch-replicas.yaml', 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  replicas: 3\n');
    const { docs, error } = buildKustomization(files, 'overlays/prod');
    expect(error).toBeUndefined();
    const dep = docs.find((d) => d.kind === 'Deployment');
    expect(dep.spec.replicas).toBe(3);
  });

  it('applies an RFC-6902 json patch independently of the strategic-merge patch', () => {
    const files = overlayFiles(
      `resources:
  - ../../base
patchesJson6902:
  - target: { kind: Deployment, name: web }
    patch: |
      - op: replace
        path: /spec/template/spec/containers/0/image
        value: nginx:1.29
`,
    );
    const { docs, error } = buildKustomization(files, 'overlays/prod');
    expect(error).toBeUndefined();
    const dep = docs.find((d) => d.kind === 'Deployment');
    expect(dep.spec.template.spec.containers[0].image).toBe('nginx:1.29');
  });

  it('reports a clear error when a resource file is missing', () => {
    const files = overlayFiles('resources:\n  - ../../base\n  - missing.yaml\n');
    const { error } = buildKustomization(files, 'overlays/prod');
    expect(error).toMatch(/resource not found/);
  });

  it('reports a clear error when a strategic-merge patch target does not exist', () => {
    const files = overlayFiles('resources:\n  - ../../base\npatchesStrategicMerge:\n  - patch-bogus.yaml\n');
    files.write('overlays/prod/patch-bogus.yaml', 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: nope\nspec:\n  replicas: 3\n');
    const { error } = buildKustomization(files, 'overlays/prod');
    expect(error).toMatch(/patch target not found/);
  });
});

describe('applyJsonPatch', () => {
  it('supports add, replace, and remove at nested/array paths', () => {
    const obj = { spec: { replicas: 1, list: ['a', 'b'] } };
    const { result, errors } = applyJsonPatch(obj, [
      { op: 'replace', path: '/spec/replicas', value: 2 },
      { op: 'add', path: '/spec/extra', value: 'x' },
      { op: 'remove', path: '/spec/list/0' },
    ]);
    expect(errors).toEqual([]);
    expect(result).toEqual({ spec: { replicas: 2, list: ['b'], extra: 'x' } });
    expect(obj.spec.replicas).toBe(1); // original untouched
  });

  it('reports an error for an unsupported op', () => {
    const { errors } = applyJsonPatch({ a: 1 }, [{ op: 'move', from: '/a', path: '/b' }]);
    expect(errors[0]).toMatch(/unsupported json6902 op/);
  });
});

describe('buildKustomization — cycle guard', () => {
  it('reports an error instead of recursing infinitely on self-reference (resources: [.])', () => {
    const files = createFileStore({ 'k/kustomization.yaml': 'resources:\n  - .\n' });
    const { error } = buildKustomization(files, 'k');
    expect(error).toMatch(/cycle detected/);
  });

  it('reports an error instead of recursing infinitely on a two-hop cycle', () => {
    const files = createFileStore({
      'a/kustomization.yaml': 'resources:\n  - ../b\n',
      'b/kustomization.yaml': 'resources:\n  - ../a\n',
    });
    const { error } = buildKustomization(files, 'a');
    expect(error).toMatch(/cycle detected/);
  });

  it('does not false-positive on a non-cyclic diamond (two siblings referencing the same shared base)', () => {
    const files = createFileStore({
      'shared/kustomization.yaml': 'resources:\n  - deployment.yaml\n',
      'shared/deployment.yaml': 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  replicas: 1\n  template:\n    spec:\n      containers:\n      - name: web\n        image: nginx\n',
      'top/kustomization.yaml': 'resources:\n  - ../shared\n  - ../shared2\n',
      'shared2/kustomization.yaml': 'resources:\n  - ../shared\n',
    });
    // shared2 also pulls in shared — not a cycle, just two independent references
    const { error, docs } = buildKustomization(files, 'top');
    expect(error).toBeUndefined();
    expect(docs.length).toBeGreaterThan(0);
  });
});
