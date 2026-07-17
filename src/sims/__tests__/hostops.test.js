import { describe, it, expect } from 'vitest';
import { createK8sSim } from '../k8sSim.js';
import { makeRunner } from './helpers.js';

describe('hostops: kube-bench / harden (CIS-benchmark drill)', () => {
  it('kube-bench requires being on a node', () => {
    const sim = createK8sSim();
    const { run } = makeRunner(sim);
    const r = run('kube-bench run');
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('master checks only run from the control-plane', () => {
    const sim = createK8sSim();
    const { run } = makeRunner(sim);
    run('ssh worker-1');
    const r = run('kube-bench run --targets=master');
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.text).toMatch(/control-plane/);
  });

  it('reports FAIL on the insecure defaults, then PASS after harden fixes them', () => {
    const sim = createK8sSim();
    const { run } = makeRunner(sim);
    run('ssh control-plane');
    const before = run('kube-bench run --targets=master');
    expect(before.text).toMatch(/FAIL/);
    expect(before.text).not.toMatch(/0 checks FAIL/);

    run('harden anonymous-auth off');
    run('harden profiling off');
    run('harden etcd-client-cert-auth on');
    const after = run('kube-bench run --targets=master');
    expect(after.errors.length).toBe(0);
    expect(after.text).toMatch(/3 checks PASS\n0 checks FAIL/);
    expect(sim.host.state.clusterConfig.anonymousAuth).toBe(false);
    expect(sim.host.state.clusterConfig.etcdClientCertAuth).toBe(true);
  });

  it('kubelet-read-only-port can be hardened from any node, other flags require the control-plane', () => {
    const sim = createK8sSim();
    const { run } = makeRunner(sim);
    run('ssh worker-1');
    const denied = run('harden anonymous-auth off');
    expect(denied.errors.length).toBeGreaterThan(0);
    const ok = run('harden kubelet-read-only-port off');
    expect(ok.errors.length).toBe(0);
    expect(sim.host.state.clusterConfig.kubeletReadOnlyPort).toBe(false);

    const node = run('kube-bench run --targets=node');
    expect(node.text).toMatch(/1 checks PASS\n0 checks FAIL/);
  });
});
