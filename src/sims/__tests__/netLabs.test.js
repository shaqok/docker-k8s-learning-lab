import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createK8sSim } from '../k8sSim.js';
import { canConnect, policiesFor } from '../k8s/netpol.js';
import { resolveHttp, hostMatches } from '../k8s/routing.js';
import { NET_LABS } from '../../data/netLabs.js';
import { makeRunner } from './helpers.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function boot({ starterFiles = {} } = {}) {
  const flags = new Set();
  const sim = createK8sSim({ starterFiles, onMission: (id) => flags.add(id) });
  const runner = makeRunner(sim);
  const settle = (cycles = 30) => {
    for (let i = 0; i < cycles; i++) {
      sim.reconcile();
      vi.advanceTimersByTime(2000);
    }
  };
  return { sim, runner, settle, flags };
}

const applyPolicy = (sim, runner, name, spec) => {
  sim.files.write(name + '.yaml', [
    'apiVersion: networking.k8s.io/v1', 'kind: NetworkPolicy',
    `metadata: {name: ${name}}`, 'spec:', ...spec,
  ].join('\n'));
  return runner.run(`kubectl apply -f ${name}.yaml`);
};

/* ---------- netpol: evaluation ---------- */

describe('networkpolicy evaluation', () => {
  function threePods(sim, settle) {
    sim.engine.makePod({ name: 'frontend', labels: { app: 'frontend' }, image: 'nginx' });
    sim.engine.makePod({ name: 'api', labels: { app: 'api' }, image: 'httpd' });
    sim.engine.makePod({ name: 'db', labels: { app: 'db' }, image: 'postgres' });
    settle(5);
    const e = sim.engine;
    return [e.get('Pod', 'default', 'frontend'), e.get('Pod', 'default', 'api'), e.get('Pod', 'default', 'db')];
  }

  it('no policies = flat network (allow-all)', () => {
    const { sim, settle } = boot();
    const [f, , d] = threePods(sim, settle);
    expect(canConnect(sim.engine, { from: f, to: d, port: 5432 }).allowed).toBe(true);
    expect(policiesFor(sim.engine, d, 'Ingress')).toEqual([]);
  });

  it('default-deny (podSelector {}) blocks everything; a hole reopens exactly one edge', () => {
    const { sim, runner, settle } = boot();
    const [f, a, d] = threePods(sim, settle);
    expect(applyPolicy(sim, runner, 'default-deny', ['  podSelector: {}', '  policyTypes: [Ingress]']).errors).toEqual([]);
    expect(canConnect(sim.engine, { from: f, to: d, port: 5432 }).allowed).toBe(false);
    expect(canConnect(sim.engine, { from: f, to: a, port: 80 }).allowed).toBe(false);
    expect(canConnect(sim.engine, { from: f, to: d, port: 5432 }).policy).toBe('default-deny');

    applyPolicy(sim, runner, 'db-allow-api', [
      '  podSelector: {matchLabels: {app: db}}',
      '  policyTypes: [Ingress]',
      '  ingress:',
      '  - from:',
      '    - podSelector: {matchLabels: {app: api}}',
      '    ports: [{protocol: TCP, port: 5432}]',
    ]);
    expect(canConnect(sim.engine, { from: a, to: d, port: 5432 }).allowed).toBe(true);
    expect(canConnect(sim.engine, { from: f, to: d, port: 5432 }).allowed).toBe(false);
    expect(canConnect(sim.engine, { from: a, to: d, port: 9999 }).allowed).toBe(false); // wrong port
  });

  it('namespaceSelector matches via the kubernetes.io/metadata.name label', () => {
    const { sim, runner, settle } = boot();
    const [, , d] = threePods(sim, settle);
    runner.run('kubectl create namespace tools');
    sim.engine.makePod({ name: 'probe', ns: 'tools', labels: { app: 'probe' }, image: 'busybox', command: ['sh', '-c', 'sleep infinity'] });
    settle(5);
    const probe = sim.engine.get('Pod', 'tools', 'probe');
    applyPolicy(sim, runner, 'db-allow-tools', [
      '  podSelector: {matchLabels: {app: db}}',
      '  policyTypes: [Ingress]',
      '  ingress:',
      '  - from:',
      '    - namespaceSelector: {matchLabels: {kubernetes.io/metadata.name: tools}}',
    ]);
    expect(canConnect(sim.engine, { from: probe, to: d }).allowed).toBe(true);
    const local = sim.engine.get('Pod', 'default', 'frontend');
    expect(canConnect(sim.engine, { from: local, to: d }).allowed).toBe(false);
  });

  it('egress policies restrict the SOURCE pod', () => {
    const { sim, runner, settle } = boot();
    const [f, a, d] = threePods(sim, settle);
    applyPolicy(sim, runner, 'frontend-egress-api', [
      '  podSelector: {matchLabels: {app: frontend}}',
      '  policyTypes: [Egress]',
      '  egress:',
      '  - to:',
      '    - podSelector: {matchLabels: {app: api}}',
    ]);
    expect(canConnect(sim.engine, { from: f, to: a }).allowed).toBe(true);
    const v = canConnect(sim.engine, { from: f, to: d });
    expect(v.allowed).toBe(false);
    expect(v.direction).toBe('egress');
    expect(canConnect(sim.engine, { from: a, to: d }).allowed).toBe(true); // api unaffected
  });

  it('kubectl exec wget times out through a policy and fires the mission flags', () => {
    const { sim, runner, settle, flags } = boot();
    threePods(sim, settle);
    sim.engine.makeService({ name: 'db', selector: { app: 'db' }, port: 5432 });
    expect(runner.run('kubectl exec frontend -- wget -qO- db:5432').text).toContain('Welcome to postgres');
    expect(flags.has('net-test')).toBe(true);
    applyPolicy(sim, runner, 'default-deny', ['  podSelector: {}', '  policyTypes: [Ingress]']);
    const out = runner.run('kubectl exec frontend -- wget -qO- db:5432');
    expect(out.text).toContain('timed out');
    expect(out.text).toContain('default-deny');
    expect(flags.has('net-blocked')).toBe(true);
  });

  it('netpol objects are visible via get/describe', () => {
    const { sim, runner, settle } = boot();
    threePods(sim, settle);
    applyPolicy(sim, runner, 'default-deny', ['  podSelector: {}', '  policyTypes: [Ingress]']);
    expect(runner.run('kubectl get netpol').text).toContain('default-deny');
    expect(runner.run('kubectl describe networkpolicy default-deny').text).toContain('Policy Types: Ingress');
  });
});

/* ---------- ingress & gateway: routing ---------- */

describe('http routing', () => {
  it('wildcard host matching', () => {
    expect(hostMatches('*.example.com', 'app.example.com')).toBe(true);
    expect(hostMatches('*.example.com', 'a.b.example.com')).toBe(false);
    expect(hostMatches('*.example.com', 'example.com')).toBe(false);
    expect(hostMatches('shop.example.com', 'shop.example.com')).toBe(true);
  });

  function webAndApi(sim, settle) {
    sim.engine.makeDeployment({ name: 'web', replicas: 2, image: 'nginx:1.27' });
    sim.engine.makeService({ name: 'web', selector: { app: 'web' }, port: 80 });
    sim.engine.makeDeployment({ name: 'api', replicas: 1, image: 'httpd' });
    sim.engine.makeService({ name: 'api', selector: { app: 'api' }, port: 8080, targetPort: 80 });
    settle(10);
  }

  it('kubectl create ingress + longest-prefix path routing', () => {
    const { sim, runner, settle } = boot();
    webAndApi(sim, settle);
    const out = runner.run('kubectl create ingress shop --rule=shop.example.com/=web:80 --rule=shop.example.com/api=api:8080');
    expect(out.errors).toEqual([]);
    expect(resolveHttp(sim.engine, { host: 'shop.example.com', path: '/' }).backends[0].svc.metadata.name).toBe('web');
    const api = resolveHttp(sim.engine, { host: 'shop.example.com', path: '/api/v1' });
    expect(api.status).toBe(200);
    expect(api.backends[0].svc.metadata.name).toBe('api');
    expect(resolveHttp(sim.engine, { host: 'wrong.example.com', path: '/' }).status).toBe(404);
    expect(runner.run('kubectl get ingress').text).toContain('shop.example.com');
    expect(runner.run('kubectl describe ingress shop').text).toContain('web:80');
  });

  it('curl acts as the external client and fires host+path flags', () => {
    const { sim, runner, settle, flags } = boot();
    webAndApi(sim, settle);
    runner.run('kubectl create ingress shop --rule=shop.example.com/=web:80 --rule=shop.example.com/api=api:8080');
    expect(runner.run('curl http://shop.example.com/').text).toContain('Welcome to nginx');
    expect(runner.run('curl http://shop.example.com/api').text).toContain('Welcome to httpd');
    expect(runner.run('curl http://wrong.example.com/').text).toContain('404');
    expect(flags.has('curl-ok:shop.example.com/')).toBe(true);
    expect(flags.has('curl-ok:shop.example.com/api')).toBe(true);
    expect(flags.has('curl-404')).toBe(true);
  });

  it('curl reports 503 when the rule matches but the backend is broken', () => {
    const { sim, runner, settle } = boot();
    settle(3);
    runner.run('kubectl create ingress ghost --rule=ghost.example.com/=nothing:80');
    expect(runner.run('curl http://ghost.example.com/').text).toContain('503');
  });

  it('gateway + httproute chain routes, and weights split across both backends', () => {
    const { sim, runner, settle } = boot();
    sim.engine.put({ apiVersion: 'gateway.networking.k8s.io/v1', kind: 'GatewayClass', metadata: { name: 'sim-gc', creationTimestamp: Date.now() }, spec: { controllerName: 'sim.io/gateway-controller' }, status: {}, sim: {} });
    sim.engine.makeDeployment({ name: 'web', replicas: 1, image: 'nginx:1.27' });
    sim.engine.makeService({ name: 'web', selector: { app: 'web' }, port: 80 });
    sim.engine.makeDeployment({ name: 'web-v2', replicas: 1, image: 'httpd' });
    sim.engine.makeService({ name: 'web-v2', selector: { app: 'web-v2' }, port: 80 });
    settle(10);
    sim.files.write('gw.yaml', [
      'apiVersion: gateway.networking.k8s.io/v1', 'kind: Gateway', 'metadata: {name: main-gw}',
      'spec:', '  gatewayClassName: sim-gc',
      '  listeners:', '  - {name: http, protocol: HTTP, port: 80, hostname: "*.example.com"}',
    ].join('\n'));
    expect(runner.run('kubectl apply -f gw.yaml').errors).toEqual([]);
    // route not attached to any gateway → 404
    sim.files.write('rt.yaml', [
      'apiVersion: gateway.networking.k8s.io/v1', 'kind: HTTPRoute', 'metadata: {name: app-route}',
      'spec:', '  parentRefs: [{name: main-gw}]', '  hostnames: [app.example.com]',
      '  rules:',
      '  - backendRefs:', '    - {name: web, port: 80, weight: 90}', '    - {name: web-v2, port: 80, weight: 10}',
    ].join('\n'));
    expect(runner.run('kubectl apply -f rt.yaml').errors).toEqual([]);
    const r = resolveHttp(sim.engine, { host: 'app.example.com', path: '/' });
    expect(r.status).toBe(200);
    expect(r.matched.kind).toBe('HTTPRoute');
    expect(r.backends.map((b) => b.svc.metadata.name).sort()).toEqual(['web', 'web-v2']);
    expect(r.backends.every((b) => b.endpoints.length > 0)).toBe(true);
    // host outside the listener's wildcard → 404
    expect(resolveHttp(sim.engine, { host: 'app.other.com', path: '/' }).status).toBe(404);
    expect(runner.run('curl http://app.example.com/').text).toMatch(/Welcome to (nginx|httpd)/);
    expect(runner.run('kubectl get gateway').text).toContain('True');
    expect(runner.run('kubectl get httproute').text).toContain('app.example.com');
  });
});

/* ---------- the labs themselves ---------- */

describe.each(NET_LABS.map((l) => [l.id, l]))('net lab %s', (id, lab) => {
  it('starts with every mission incomplete', () => {
    const { sim, settle, flags } = boot({ starterFiles: lab.starterFiles });
    lab.setup(sim.engine, sim.files);
    settle(8);
    const res = lab.missions.map((m) => !!m.check(sim.engine, flags));
    expect(res).not.toContain(true);
  });

  it('is fully solvable by the reference solution', () => {
    const { sim, runner, settle, flags } = boot({ starterFiles: lab.starterFiles });
    lab.setup(sim.engine, sim.files);
    settle(5);
    lab.solve(sim, (cmd) => runner.run(cmd), settle);
    settle(40);
    const res = lab.missions.map((m) => !!m.check(sim.engine, flags));
    expect(res, lab.missions.map((m, i) => `${res[i] ? '✓' : '✗'} ${m.id}`).join(' | ')).not.toContain(false);
  });

  it('has complete bilingual content', () => {
    for (const f of [lab.tab, lab.title, lab.brief]) { expect(f.en).toBeTruthy(); expect(f.ko).toBeTruthy(); }
    expect(lab.missions.length).toBeGreaterThanOrEqual(3);
    for (const m of lab.missions) { expect(m.desc.en).toBeTruthy(); expect(m.desc.ko).toBeTruthy(); }
    expect(lab.docs.length).toBeGreaterThanOrEqual(1);
  });
});
