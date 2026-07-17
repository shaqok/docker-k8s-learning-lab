import { describe, it, expect, beforeEach } from 'vitest';
import { createK8sSim } from '../k8sSim.js';
import { makeRunner } from './helpers.js';

const CHART_FILES = {
  'chart/Chart.yaml': 'name: demo\nversion: 1.0.0\n',
  'chart/values.yaml': 'replicaCount: 1\nimage:\n  tag: v1\nservice:\n  enabled: false\n',
  'chart/templates/deployment.yaml': `apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}-web
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app: {{ .Release.Name }}
  template:
    metadata:
      labels:
        app: {{ .Release.Name }}
    spec:
      containers:
      - name: web
        image: nginx:{{ .Values.image.tag }}
`,
  'chart/templates/service.yaml': `{{ if .Values.service.enabled }}
apiVersion: v1
kind: Service
metadata:
  name: {{ .Release.Name }}-web
spec:
  selector:
    app: {{ .Release.Name }}
  ports:
  - port: 80
{{ end }}
`,
};

describe('helm CLI end-to-end', () => {
  let sim, run;
  beforeEach(() => {
    sim = createK8sSim({ starterFiles: CHART_FILES });
    ({ run } = makeRunner(sim));
  });

  it('install creates a Deployment from the rendered chart', () => {
    const r = run('helm install myrelease chart/');
    expect(r.text).toMatch(/installed/);
    const dep = sim.engine.get('Deployment', 'default', 'myrelease-web');
    expect(dep).toBeTruthy();
    expect(dep.spec.replicas).toBe(1);
    expect(dep.spec.template.spec.containers[0].image).toBe('nginx:v1');
  });

  it('rejects installing over an existing release name', () => {
    run('helm install myrelease chart/');
    const r = run('helm install myrelease chart/');
    expect(r.text).toMatch(/cannot re-use/);
  });

  it('upgrade with --set changes the live image and bumps history', () => {
    run('helm install myrelease chart/');
    run('helm upgrade myrelease chart/ --set image.tag=v2');
    const dep = sim.engine.get('Deployment', 'default', 'myrelease-web');
    expect(dep.spec.template.spec.containers[0].image).toBe('nginx:v2');
    const hist = run('helm history myrelease');
    expect(hist.text).toMatch(/2/);
  });

  it('upgrade flipping a conditional value creates the previously-absent Service', () => {
    run('helm install myrelease chart/');
    expect(sim.engine.get('Service', 'default', 'myrelease-web')).toBeFalsy();
    run('helm upgrade myrelease chart/ --set service.enabled=true');
    expect(sim.engine.get('Service', 'default', 'myrelease-web')).toBeTruthy();
  });

  it('upgrade flipping the conditional back off PRUNES the Service (diffManifestSets removal path)', () => {
    run('helm install myrelease chart/ --set service.enabled=true');
    expect(sim.engine.get('Service', 'default', 'myrelease-web')).toBeTruthy();
    run('helm upgrade myrelease chart/ --set service.enabled=false');
    expect(sim.engine.get('Service', 'default', 'myrelease-web')).toBeFalsy();
  });

  it('rollback restores a past revision and records a NEW revision number', () => {
    run('helm install myrelease chart/'); // rev 1, tag v1
    run('helm upgrade myrelease chart/ --set image.tag=v2'); // rev 2
    run('helm rollback myrelease 1');
    const dep = sim.engine.get('Deployment', 'default', 'myrelease-web');
    expect(dep.spec.template.spec.containers[0].image).toBe('nginx:v1');
    const release = sim.engine.get('HelmRelease', 'default', 'myrelease');
    expect(release.status.revision).toBe(3);
  });

  it('a chart render error leaves the cluster untouched (atomic)', () => {
    run('helm install myrelease chart/');
    sim.files.write('chart/templates/deployment.yaml', 'replicas: {{ .Values.replicaCount');
    const before = sim.engine.get('Deployment', 'default', 'myrelease-web').spec.replicas;
    run('helm upgrade myrelease chart/ --set replicaCount=9');
    expect(sim.engine.get('Deployment', 'default', 'myrelease-web').spec.replicas).toBe(before);
  });
});

describe('kustomize CLI end-to-end', () => {
  let sim, run;
  const KFILES = {
    'base/kustomization.yaml': 'resources:\n  - deployment.yaml\n',
    'base/deployment.yaml': 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  replicas: 1\n  template:\n    spec:\n      containers:\n      - name: web\n        image: nginx:1.27\n',
    'overlays/prod/kustomization.yaml': 'resources:\n  - ../../base\nnamePrefix: prod-\nreplicas:\n  - name: prod-web\n    count: 3\n',
  };
  beforeEach(() => { sim = createK8sSim({ starterFiles: KFILES }); ({ run } = makeRunner(sim)); });

  it('build prints the rendered manifest set', () => {
    const r = run('kustomize build overlays/prod');
    expect(r.text).toMatch(/prod-web/);
    expect(r.text).toMatch(/replicas: 3/);
  });

  it('kubectl apply -k applies the built manifest set to the live cluster', () => {
    run('kubectl apply -k overlays/prod');
    const dep = sim.engine.get('Deployment', 'default', 'prod-web');
    expect(dep).toBeTruthy();
    expect(dep.spec.replicas).toBe(3);
  });

  it('diff reports the replicas change between base and overlay', () => {
    const r = run('kustomize diff base overlays/prod');
    expect(r.text).toMatch(/prod-web/);
  });
});

describe('GitOps drift lab end-to-end', () => {
  let sim, run;
  const GFILES = {
    'base/kustomization.yaml': 'resources:\n  - deployment.yaml\n',
    'base/deployment.yaml': 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\n  namespace: default\nspec:\n  replicas: 2\n  template:\n    spec:\n      containers:\n      - name: web\n        image: nginx:1.27\n',
    'overlays/prod/kustomization.yaml': 'resources:\n  - ../../base\n',
  };
  beforeEach(() => { sim = createK8sSim({ starterFiles: GFILES }); ({ run } = makeRunner(sim)); });

  it('a GitOpsApp with autoSync reverts hand-edited drift within a couple of reconcile ticks', () => {
    run('kubectl apply -k overlays/prod');
    sim.engine.makeGitOpsApp({ name: 'prod-app', ns: 'default', sourcePath: 'overlays/prod', autoSync: true });
    run('kubectl scale deployment web --replicas=5');
    expect(sim.engine.get('Deployment', 'default', 'web').spec.replicas).toBe(5);
    sim.reconcile();
    sim.reconcile();
    expect(sim.engine.get('Deployment', 'default', 'web').spec.replicas).toBe(2);
    const app = sim.engine.get('GitOpsApp', 'default', 'prod-app');
    expect(app.status.syncStatus).toBe('Synced');
  });

  it('with autoSync off, drift persists across ticks until a manual sync', () => {
    run('kubectl apply -k overlays/prod');
    sim.engine.makeGitOpsApp({ name: 'prod-app', ns: 'default', sourcePath: 'overlays/prod', autoSync: false });
    run('kubectl scale deployment web --replicas=5');
    sim.reconcile();
    sim.reconcile();
    sim.reconcile();
    expect(sim.engine.get('Deployment', 'default', 'web').spec.replicas).toBe(5);
    const app = sim.engine.get('GitOpsApp', 'default', 'prod-app');
    expect(app.status.syncStatus).toBe('OutOfSync');
    run('gitops sync prod-app');
    expect(sim.engine.get('Deployment', 'default', 'web').spec.replicas).toBe(2);
  });

  it('recreates a resource deleted out from under an autoSync app', () => {
    run('kubectl apply -k overlays/prod');
    sim.engine.makeGitOpsApp({ name: 'prod-app', ns: 'default', sourcePath: 'overlays/prod', autoSync: true });
    run('kubectl delete deploy web');
    sim.reconcile();
    sim.reconcile();
    expect(sim.engine.get('Deployment', 'default', 'web')).toBeTruthy();
  });
});
