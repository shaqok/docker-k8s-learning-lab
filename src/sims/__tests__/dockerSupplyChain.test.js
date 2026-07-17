import { describe, it, expect, beforeEach } from 'vitest';
import { createDockerSim } from '../dockerSim.js';
import { makeRunner } from './helpers.js';

let sim, runner, missions;
const write = (name, content) => sim.files.write(name, content);

beforeEach(() => {
  missions = [];
  sim = createDockerSim({ onMission: (id) => missions.push(id), starterFiles: {} });
  runner = makeRunner(sim);
});

describe('trivy image (Supply Chain Security)', () => {
  it('requires the image to exist locally', () => {
    const r = runner.run('trivy image ghost:v1');
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('flags CVEs on a vulnerable base image', () => {
    runner.run('docker pull node:20');
    const r = runner.run('trivy image node:20');
    expect(r.errors.length).toBeGreaterThan(0); // findings print as 'err' (attention-grabbing), not a crash
    expect(r.text).toMatch(/CVE-/);
    expect(missions).toContain('trivy-scan');
    expect(sim.engine.getImage('node:20').scan.findings.length).toBeGreaterThan(0);
  });

  it('scans clean on a minimal base image', () => {
    runner.run('docker pull node:20-alpine');
    const r = runner.run('trivy image node:20-alpine');
    expect(r.errors.length).toBe(0);
    expect(r.text).toMatch(/0 vulnerabilities/);
    expect(sim.engine.getImage('node:20-alpine').scan.findings.length).toBe(0);
  });

  it('a built image is scanned against its actual FROM base, not the tag', () => {
    write('Dockerfile', 'FROM node:20-alpine\nCOPY . .\nCMD ["node","server.js"]\n');
    runner.run('docker build -t app:v1 .');
    const r = runner.run('trivy image app:v1');
    expect(r.errors.length).toBe(0);
    expect(r.text).toMatch(/0 vulnerabilities/);
  });
});

describe('cosign sign / verify', () => {
  it('verify fails on an unsigned image', () => {
    runner.run('docker pull nginx:alpine');
    const r = runner.run('cosign verify nginx:alpine');
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('sign then verify succeeds', () => {
    runner.run('docker pull nginx:alpine');
    const s = runner.run('cosign sign nginx:alpine');
    expect(s.errors.length).toBe(0);
    expect(missions).toContain('cosign-sign');
    expect(sim.engine.getImage('nginx:alpine').signed).toBe(true);
    const v = runner.run('cosign verify nginx:alpine');
    expect(v.errors.length).toBe(0);
    expect(missions).toContain('cosign-verify');
  });

  it('rejects an image that was never pulled/built', () => {
    const r = runner.run('cosign sign ghost:v1');
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
