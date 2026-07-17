import { describe, it, expect } from 'vitest';
import { createK8sSim } from '../k8sSim.js';
import { makeRunner } from './helpers.js';

describe('audit trail — engine.events records security-relevant actions', () => {
  it('records both allowed and denied RBAC checks', () => {
    const sim = createK8sSim();
    const { run } = makeRunner(sim);
    run('kubectl auth can-i get pods --as=system:serviceaccount:default:ci');
    const denied = sim.engine.events.find((e) => e.reason === 'RBACDenied');
    expect(denied).toBeTruthy();
    expect(denied.object).toBe('ServiceAccount/ci');

    run('kubectl create role reader --verb=get --resource=pods');
    run('kubectl create rolebinding reader-b --role=reader --serviceaccount=default:ci');
    run('kubectl auth can-i get pods --as=system:serviceaccount:default:ci');
    const allowed = sim.engine.events.find((e) => e.reason === 'RBACAllowed');
    expect(allowed).toBeTruthy();

    const viaGet = run('kubectl get events');
    expect(viaGet.errors.length).toBe(0);
    expect(viaGet.text).toMatch(/RBACDenied|RBACAllowed/);
  });

  it('records a FailedCreate event when Pod Security Admission rejects a pod', () => {
    const sim = createK8sSim();
    const { run } = makeRunner(sim);
    run('kubectl label namespace default pod-security.kubernetes.io/enforce=restricted');
    run('kubectl run bare --image=nginx');
    const evt = sim.engine.events.find((e) => e.reason === 'FailedCreate' && e.object === 'Pod/bare');
    expect(evt).toBeTruthy();
    expect(evt.message).toMatch(/PodSecurity/);
  });
});
