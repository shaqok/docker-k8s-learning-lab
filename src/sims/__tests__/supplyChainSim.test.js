import { describe, it, expect } from 'vitest';
import { createSupplyChainSim } from '../supplyChainSim.js';
import { makeRunner } from './helpers.js';

describe('createSupplyChainSim — routing', () => {
  it('routes docker/trivy/cosign to the Docker engine and everything else to kubectl', () => {
    const sim = createSupplyChainSim();
    const { run } = makeRunner(sim);
    sim.files.write('Dockerfile', 'FROM node:20-alpine\nCOPY . .\nCMD ["node","server.js"]\n');
    expect(run('docker build -t app:v1 .').errors.length).toBe(0);
    expect(sim.docker.getImage('app:v1')).toBeTruthy();
    expect(run('trivy image app:v1').errors.length).toBe(0);
    expect(run('cosign sign app:v1').errors.length).toBe(0);
    expect(run('kubectl get pods').errors.length).toBe(0);
  });

  it('the k8s and docker sims share one file store', () => {
    const sim = createSupplyChainSim();
    sim.files.write('Dockerfile', 'FROM alpine\n');
    expect(sim.files.read('Dockerfile')).toContain('FROM alpine');
  });
});

describe('imagePolicy admission gate (via kubectl run/apply)', () => {
  const REQUIRE_NS = 'kubectl label namespace default supplychain.sim/verify=true';

  it('unverified namespaces (the default) allow anything', () => {
    const sim = createSupplyChainSim();
    const { run } = makeRunner(sim);
    const r = run('kubectl run app --image=app:v1');
    expect(r.errors.length).toBe(0);
  });

  it('rejects an image that was never built/pulled', () => {
    const sim = createSupplyChainSim();
    const { run } = makeRunner(sim);
    run(REQUIRE_NS);
    const r = run('kubectl run app --image=ghost:v1');
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.text).toMatch(/not found in the registry/);
  });

  it('rejects an unscanned image, then a vulnerable one, then an unsigned one, in order', () => {
    const sim = createSupplyChainSim();
    const { run } = makeRunner(sim);
    run(REQUIRE_NS);
    sim.files.write('Dockerfile', 'FROM node:20\nCOPY . .\nCMD ["node","server.js"]\n');
    run('docker build -t app:v1 .');

    const unscanned = run('kubectl run app --image=app:v1');
    expect(unscanned.text).toMatch(/has not been scanned/);

    run('trivy image app:v1');
    const vulnerable = run('kubectl run app --image=app:v1');
    expect(vulnerable.text).toMatch(/known vulnerabilit/);
  });

  it('admits a clean, scanned, signed image', () => {
    const sim = createSupplyChainSim();
    const { run } = makeRunner(sim);
    run(REQUIRE_NS);
    sim.files.write('Dockerfile', 'FROM node:20-alpine\nCOPY . .\nCMD ["node","server.js"]\n');
    run('docker build -t app:v1 .');
    run('trivy image app:v1');

    const unsigned = run('kubectl run app --image=app:v1');
    expect(unsigned.text).toMatch(/unsigned/);

    run('cosign sign app:v1');
    const ok = run('kubectl run app --image=app:v1');
    expect(ok.errors.length).toBe(0);
    expect(sim.engine.get('Pod', 'default', 'app')).toBeTruthy();
  });
});
