import { describe, it, expect } from 'vitest';
import { createK8sSim } from '../k8sSim.js';
import { makeRunner } from './helpers.js';
import { admitPod } from '../k8s/podSecurity.js';

const restrictedOk = { runAsNonRoot: true, allowPrivilegeEscalation: false, capabilities: { drop: ['ALL'] } };

describe('podSecurity.admitPod', () => {
  it('privileged namespaces (the default) allow anything', () => {
    const sim = createK8sSim();
    expect(admitPod(sim.engine, [{ name: 'c', image: 'nginx' }], 'default').allowed).toBe(true);
    expect(admitPod(sim.engine, [{ name: 'c', image: 'nginx', securityContext: { privileged: true } }], 'default').allowed).toBe(true);
  });

  it('baseline rejects privileged containers and dangerous capabilities', () => {
    const sim = createK8sSim();
    sim.engine.get('Namespace', null, 'default').metadata.labels['pod-security.kubernetes.io/enforce'] = 'baseline';
    expect(admitPod(sim.engine, [{ name: 'c', image: 'nginx' }], 'default').allowed).toBe(true);
    const priv = admitPod(sim.engine, [{ name: 'c', image: 'nginx', securityContext: { privileged: true } }], 'default');
    expect(priv.allowed).toBe(false);
    expect(priv.reason).toMatch(/privileged/);
    const cap = admitPod(sim.engine, [{ name: 'c', image: 'nginx', securityContext: { capabilities: { add: ['SYS_ADMIN'] } } }], 'default');
    expect(cap.allowed).toBe(false);
  });

  it('restricted requires runAsNonRoot, no escalation, and dropping ALL capabilities', () => {
    const sim = createK8sSim();
    sim.engine.get('Namespace', null, 'default').metadata.labels['pod-security.kubernetes.io/enforce'] = 'restricted';
    expect(admitPod(sim.engine, [{ name: 'c', image: 'nginx' }], 'default').allowed).toBe(false);
    expect(admitPod(sim.engine, [{ name: 'c', image: 'nginx', securityContext: restrictedOk }], 'default').allowed).toBe(true);
    expect(admitPod(sim.engine, [{ name: 'c', image: 'nginx', securityContext: { ...restrictedOk, runAsNonRoot: false } }], 'default').allowed).toBe(false);
  });

  it('restricted only allows NET_BIND_SERVICE to be added back — any other added capability is rejected', () => {
    const sim = createK8sSim();
    sim.engine.get('Namespace', null, 'default').metadata.labels['pod-security.kubernetes.io/enforce'] = 'restricted';
    const withNetBind = { ...restrictedOk, capabilities: { drop: ['ALL'], add: ['NET_BIND_SERVICE'] } };
    expect(admitPod(sim.engine, [{ name: 'c', image: 'nginx', securityContext: withNetBind }], 'default').allowed).toBe(true);
    const withOther = { ...restrictedOk, capabilities: { drop: ['ALL'], add: ['SYS_TIME'] } };
    const r = admitPod(sim.engine, [{ name: 'c', image: 'nginx', securityContext: withOther }], 'default');
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/SYS_TIME/);
  });
});

describe('kubectl PodSecurity admission wiring', () => {
  it('kubectl run is rejected in a restricted namespace (no way to set securityContext imperatively)', () => {
    const sim = createK8sSim();
    const { run } = makeRunner(sim);
    sim.engine.get('Namespace', null, 'default').metadata.labels['pod-security.kubernetes.io/enforce'] = 'restricted';
    const r = run('kubectl run bare --image=nginx');
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.text).toMatch(/PodSecurity/);
    expect(sim.engine.get('Pod', 'default', 'bare')).toBeUndefined();
  });

  it('apply -f accepts a compliant pod and rejects a non-compliant one under restricted', () => {
    const sim = createK8sSim();
    const { run } = makeRunner(sim);
    run('kubectl label namespace default pod-security.kubernetes.io/enforce=restricted --overwrite');
    sim.files.write('bad.yaml', 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: bad\nspec:\n  containers:\n  - name: bad\n    image: nginx\n');
    const bad = run('kubectl apply -f bad.yaml');
    expect(bad.errors.length).toBeGreaterThan(0);
    expect(sim.engine.get('Pod', 'default', 'bad')).toBeUndefined();

    sim.files.write('good.yaml', [
      'apiVersion: v1',
      'kind: Pod',
      'metadata:',
      '  name: good',
      'spec:',
      '  containers:',
      '  - name: good',
      '    image: nginx',
      '    securityContext:',
      '      runAsNonRoot: true',
      '      allowPrivilegeEscalation: false',
      '      capabilities:',
      '        drop: [ALL]',
      '',
    ].join('\n'));
    const good = run('kubectl apply -f good.yaml');
    expect(good.errors.length).toBe(0);
    expect(sim.engine.get('Pod', 'default', 'good')).toBeTruthy();
  });

  it('kubectl label namespace uses the cluster-scoped lookup (not keyed by -n default)', () => {
    const sim = createK8sSim();
    const { run } = makeRunner(sim);
    run('kubectl create namespace prod');
    const r = run('kubectl label namespace prod pod-security.kubernetes.io/enforce=restricted');
    expect(r.errors.length).toBe(0);
    expect(sim.engine.get('Namespace', null, 'prod').metadata.labels['pod-security.kubernetes.io/enforce']).toBe('restricted');
  });

  it('apply -f a Namespace manifest preserves its labels', () => {
    const sim = createK8sSim();
    const { run } = makeRunner(sim);
    sim.files.write('ns.yaml', [
      'apiVersion: v1',
      'kind: Namespace',
      'metadata:',
      '  name: secure',
      '  labels:',
      '    pod-security.kubernetes.io/enforce: restricted',
      '',
    ].join('\n'));
    run('kubectl apply -f ns.yaml');
    expect(sim.engine.get('Namespace', null, 'secure').metadata.labels['pod-security.kubernetes.io/enforce']).toBe('restricted');
  });
});
