import { canConnect, policiesFor } from '../sims/k8s/netpol.js';
import { resolveHttp } from '../sims/k8s/routing.js';

/**
 * Networking drill labs (improvement-plan step 7): NetworkPolicy, Ingress,
 * Gateway API. Same shape as the m11/m12 drills — `{ id, setup(engine, files),
 * missions: [{id, desc, check(engine, flags)}], solve(sim, run, settle) }` —
 * missions graded live every reconcile tick. `flags` collects onMission ids
 * fired by the terminal ('net-test', 'net-blocked', 'curl-ok:HOST/PATH', 'curl-404').
 */

const DENY_ALL_YAML = `# Step 1 — default-deny. podSelector: {} selects EVERY pod in this
# namespace, so once this exists ALL ingress traffic to all pods is dropped.
#     kubectl apply -f deny-all.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
spec:
  podSelector: {}
  policyTypes:
  - Ingress
`;

const ALLOW_API_YAML = `# Step 2 — punch a hole. This policy selects the db pod and allows
# ingress ONLY from pods labeled app=api, only on port 5432.
# Uncomment the ingress block, then: kubectl apply -f allow-api.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: db-allow-api
spec:
  podSelector:
    matchLabels:
      app: db
  policyTypes:
  - Ingress
  # ingress:
  # - from:
  #   - podSelector:
  #       matchLabels:
  #         app: api
  #   ports:
  #   - protocol: TCP
  #     port: 5432
`;

const ALLOW_API_SOLVED = ALLOW_API_YAML.replace(/^  # /gm, '  ').replace(/^  #$/gm, '  ');

const INGRESS_YAML = `# The YAML twin of the imperative one-liner:
#   kubectl create ingress shop --rule=shop.example.com/=web:80 --rule=shop.example.com/api=api:8080
# Use either. To route /api, uncomment the second path and apply.
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shop
spec:
  rules:
  - host: shop.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web
            port:
              number: 80
      # - path: /api
      #   pathType: Prefix
      #   backend:
      #     service:
      #       name: api
      #       port:
      #         number: 8080
`;

const GATEWAY_YAML = `# Gateway API layer 1: the Gateway = a listener (class + port + hostname).
# Routes are separate objects that ATTACH to it — apply this first.
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: main-gw
spec:
  gatewayClassName: sim-gc
  listeners:
  - name: http
    protocol: HTTP
    port: 80
    hostname: "*.example.com"
`;

const ROUTE_YAML = `# Gateway API layer 2: the HTTPRoute attaches via parentRefs.
# Final mission: uncomment the second backendRef — weighted backends
# are a built-in canary (90/10 split), something Ingress can't do.
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: app-route
spec:
  parentRefs:
  - name: main-gw
  hostnames:
  - app.example.com
  rules:
  - backendRefs:
    - name: web
      port: 80
      weight: 90
    # - name: web-v2
    #   port: 80
    #   weight: 10
`;

const ROUTE_SOLVED = ROUTE_YAML.replace(/^    # /gm, '    ').replace(/^    #$/gm, '    ');

const pod = (e, name) => {
  const p = e.get('Pod', 'default', name);
  return p && p.status.state !== 'Terminating' ? p : null;
};

export const NET_LABS = [
  {
    id: 'netpol',
    tab: { en: '🕸 NetworkPolicy', ko: '🕸 NetworkPolicy' },
    title: { en: 'NetworkPolicy — from flat network to allow-list', ko: 'NetworkPolicy — 평평한 네트워크에서 허용 목록으로' },
    brief: {
      en: 'Three pods — <code>frontend</code>, <code>api</code>, <code>db</code> — each behind a Service. Out of the box the pod network is <b>flat</b>: anyone can talk to anyone (prove it with <code>kubectl exec frontend -- wget -qO- db:5432</code>). NetworkPolicies are <b>allow-lists over pods</b>: the moment any policy selects a pod, everything not explicitly allowed is dropped. The classic exam pattern is exactly this lab: default-deny the namespace, then open only <code>api → db:5432</code>. The <b>connectivity matrix</b> on the right re-evaluates live as you apply policies.',
      ko: '파드 셋 — <code>frontend</code>, <code>api</code>, <code>db</code> — 각각 Service 뒤에 있습니다. 기본 상태의 파드 네트워크는 <b>평평</b>해서 누구나 누구에게든 접속할 수 있습니다(<code>kubectl exec frontend -- wget -qO- db:5432</code>로 확인). NetworkPolicy는 <b>파드에 대한 허용 목록</b>입니다: 어떤 정책이든 파드를 선택하는 순간, 명시적으로 허용되지 않은 트래픽은 전부 차단됩니다. 시험의 고전 패턴이 바로 이 실습입니다: 네임스페이스 전체 기본 거부 후 <code>api → db:5432</code>만 열기. 오른쪽 <b>연결 매트릭스</b>가 정책을 적용할 때마다 실시간으로 다시 평가됩니다.',
    },
    docs: [
      { label: 'Network Policies', url: 'https://kubernetes.io/docs/concepts/services-networking/network-policies/' },
      { label: 'Declare Network Policy (task)', url: 'https://kubernetes.io/docs/tasks/administer-cluster/declare-network-policy/' },
    ],
    starterFiles: { 'deny-all.yaml': DENY_ALL_YAML, 'allow-api.yaml': ALLOW_API_YAML },
    setup(engine) {
      engine.makePod({ name: 'frontend', labels: { app: 'frontend' }, image: 'nginx:1.27' });
      engine.makePod({ name: 'api', labels: { app: 'api' }, image: 'httpd' });
      engine.makePod({ name: 'db', labels: { app: 'db' }, image: 'postgres' });
      engine.makeService({ name: 'frontend', selector: { app: 'frontend' }, port: 80 });
      engine.makeService({ name: 'api', selector: { app: 'api' }, port: 80 });
      engine.makeService({ name: 'db', selector: { app: 'db' }, port: 5432 });
    },
    missions: [
      {
        id: 'np-probe',
        desc: { en: '🔎 Prove the network is flat: from any pod, reach another over its Service — e.g. <code>kubectl exec frontend -- wget -qO- db:5432</code>', ko: '🔎 네트워크가 평평함을 증명하세요: 아무 파드에서 다른 파드에 Service로 접속 — 예: <code>kubectl exec frontend -- wget -qO- db:5432</code>' },
        check: (e, flags) => !!(flags && flags.has('net-test')),
      },
      {
        id: 'np-deny',
        desc: { en: '🔒 Apply a <b>default-deny</b> ingress policy for the whole namespace (<code>podSelector: {}</code>) — see <code>deny-all.yaml</code>. The matrix should go all-red', ko: '🔒 네임스페이스 전체에 <b>기본 거부</b> ingress 정책을 적용하세요(<code>podSelector: {}</code>) — <code>deny-all.yaml</code> 참고. 매트릭스가 전부 빨간색이 되어야 합니다' },
        check: (e) => {
          const f = pod(e, 'frontend'), a = pod(e, 'api'), d = pod(e, 'db');
          if (!f || !a || !d) return false;
          return policiesFor(e, f, 'Ingress').length > 0 &&
            !canConnect(e, { from: f, to: d, port: 5432 }).allowed &&
            !canConnect(e, { from: f, to: a, port: 80 }).allowed;
        },
      },
      {
        id: 'np-allow',
        desc: { en: '🔑 Punch exactly one hole: allow <code>app=api</code> → <code>db</code> on port <code>5432</code> (<code>allow-api.yaml</code>). frontend must STAY blocked', ko: '🔑 딱 하나만 여세요: <code>app=api</code> → <code>db</code>의 <code>5432</code> 포트 허용 (<code>allow-api.yaml</code>). frontend는 계속 차단되어야 합니다' },
        check: (e) => {
          const f = pod(e, 'frontend'), a = pod(e, 'api'), d = pod(e, 'db');
          if (!f || !a || !d) return false;
          return canConnect(e, { from: a, to: d, port: 5432 }).allowed &&
            !canConnect(e, { from: f, to: d, port: 5432 }).allowed;
        },
      },
      {
        id: 'np-verify',
        desc: { en: '⚖️ Verify in the terminal: <code>wget</code> from <code>api</code> answers, from <code>frontend</code> it <b>times out</b> (policies drop packets — no "connection refused"!)', ko: '⚖️ 터미널로 검증하세요: <code>api</code>에서의 <code>wget</code>은 응답하고, <code>frontend</code>에서는 <b>타임아웃</b>됩니다 (정책은 패킷을 조용히 버립니다 — "connection refused"가 아니에요!)' },
        check: (e, flags) => {
          if (!flags || !flags.has('net-blocked')) return false;
          const f = pod(e, 'frontend'), a = pod(e, 'api'), d = pod(e, 'db');
          if (!f || !a || !d) return false;
          return canConnect(e, { from: a, to: d, port: 5432 }).allowed &&
            !canConnect(e, { from: f, to: d, port: 5432 }).allowed;
        },
      },
    ],
    solve(sim, run, settle) {
      settle(6);
      run('kubectl exec frontend -- wget -qO- db:5432');
      run('kubectl apply -f deny-all.yaml');
      sim.files.write('allow-api.yaml', ALLOW_API_SOLVED);
      run('kubectl apply -f allow-api.yaml');
      run('kubectl exec api -- wget -qO- db:5432');
      run('kubectl exec frontend -- wget -qO- db:5432');
    },
  },

  {
    id: 'ingress',
    tab: { en: '🚪 Ingress', ko: '🚪 Ingress' },
    title: { en: 'Ingress — host & path routing at the cluster edge', ko: 'Ingress — 클러스터 입구의 호스트/경로 라우팅' },
    brief: {
      en: 'Two Deployments are running: <code>web</code> (2 replicas, Service <code>web:80</code>) and <code>api</code> (Service <code>api:8080</code>). An <b>Ingress</b> is a set of host/path rules that an ingress-controller enforces at the cluster edge — one external IP, many Services behind it. Build the classic split: <code>shop.example.com/</code> → web, <code>shop.example.com/api</code> → api. In this lab <code>curl http://HOST/PATH</code> makes you the <b>external client</b>; the router panel shows each rule and where it lands. Exam tip: <code>kubectl create ingress NAME --rule=host/path=svc:port</code> beats writing the YAML by hand.',
      ko: 'Deployment 둘이 돌고 있습니다: <code>web</code>(레플리카 2, Service <code>web:80</code>)과 <code>api</code>(Service <code>api:8080</code>). <b>Ingress</b>는 ingress-controller가 클러스터 입구에서 집행하는 호스트/경로 규칙 모음입니다 — 외부 IP 하나 뒤에 여러 Service. 고전적인 분기를 만들어 보세요: <code>shop.example.com/</code> → web, <code>shop.example.com/api</code> → api. 이 실습에서 <code>curl http://호스트/경로</code>를 치면 당신이 <b>외부 클라이언트</b>가 됩니다. 라우터 패널이 각 규칙과 도착지를 보여줍니다. 시험 팁: YAML을 손으로 쓰는 것보다 <code>kubectl create ingress 이름 --rule=host/path=svc:port</code>가 빠릅니다.',
    },
    docs: [
      { label: 'Ingress', url: 'https://kubernetes.io/docs/concepts/services-networking/ingress/' },
      { label: 'kubectl create ingress', url: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_create/kubectl_create_ingress/' },
    ],
    starterFiles: { 'ingress.yaml': INGRESS_YAML },
    setup(engine) {
      engine.makeDeployment({ name: 'web', replicas: 2, image: 'nginx:1.27' });
      engine.makeService({ name: 'web', selector: { app: 'web' }, port: 80 });
      engine.makeDeployment({ name: 'api', replicas: 1, image: 'httpd' });
      engine.makeService({ name: 'api', selector: { app: 'api' }, port: 8080, targetPort: 80 });
    },
    missions: [
      {
        id: 'ing-root',
        desc: { en: '🚪 Route <code>shop.example.com/</code> → Service <code>web:80</code> — via <code>kubectl create ingress shop --rule=…</code> or <code>ingress.yaml</code>', ko: '🚪 <code>shop.example.com/</code> → Service <code>web:80</code> 라우팅 — <code>kubectl create ingress shop --rule=…</code> 또는 <code>ingress.yaml</code>' },
        check: (e) => {
          const r = resolveHttp(e, { host: 'shop.example.com', path: '/' });
          return r.status === 200 && r.matched.kind === 'Ingress' && r.backends[0].svc.metadata.name === 'web';
        },
      },
      {
        id: 'ing-path',
        desc: { en: '🔀 Add a second rule: <code>shop.example.com/api</code> → Service <code>api:8080</code>. Longest path prefix wins', ko: '🔀 규칙을 추가하세요: <code>shop.example.com/api</code> → Service <code>api:8080</code>. 가장 긴 경로 접두사가 이깁니다' },
        check: (e) => {
          const r = resolveHttp(e, { host: 'shop.example.com', path: '/api' });
          return r.status === 200 && r.backends[0].svc.metadata.name === 'api';
        },
      },
      {
        id: 'ing-curl',
        desc: { en: '🌍 Play the external client: <code>curl http://shop.example.com/</code> AND <code>curl http://shop.example.com/api</code> — different backends answer', ko: '🌍 외부 클라이언트가 되어 보세요: <code>curl http://shop.example.com/</code> 그리고 <code>curl http://shop.example.com/api</code> — 서로 다른 백엔드가 응답합니다' },
        check: (e, flags) => !!(flags && flags.has('curl-ok:shop.example.com/') && flags.has('curl-ok:shop.example.com/api')),
      },
      {
        id: 'ing-host',
        desc: { en: '🙅 Prove routing is host-based: <code>curl http://wrong.example.com/</code> must return <b>404</b> — the edge only answers for hosts a rule claims', ko: '🙅 호스트 기반 라우팅임을 증명하세요: <code>curl http://wrong.example.com/</code>은 <b>404</b>여야 합니다 — 입구는 규칙이 선언한 호스트에만 응답합니다' },
        check: (e, flags) => {
          if (!flags || !flags.has('curl-404')) return false;
          return resolveHttp(e, { host: 'shop.example.com', path: '/' }).status === 200;
        },
      },
    ],
    solve(sim, run, settle) {
      settle(8);
      run('kubectl create ingress shop --rule=shop.example.com/=web:80 --rule=shop.example.com/api=api:8080');
      run('curl http://shop.example.com/');
      run('curl http://shop.example.com/api');
      run('curl http://wrong.example.com/');
    },
  },

  {
    id: 'gateway',
    tab: { en: '🛣 Gateway API', ko: '🛣 Gateway API' },
    title: { en: 'Gateway API — Gateway, HTTPRoute, and a weighted canary', ko: 'Gateway API — Gateway, HTTPRoute, 그리고 가중치 카나리' },
    brief: {
      en: 'The Gateway API (in the CKA blueprint since 2025) splits Ingress into role-separated objects: <b>GatewayClass</b> (which implementation — here <code>sim-gc</code>, already installed) → <b>Gateway</b> (a listener: port + hostname, owned by the platform team) → <b>HTTPRoute</b> (matching rules + backends, owned by the app team, attached via <code>parentRefs</code>). Deployments <code>web</code> and <code>web-v2</code> are running behind Services. Wire the chain for <code>app.example.com</code>, then do what Ingress can\'t: split traffic <b>90/10</b> between the two backends with weighted <code>backendRefs</code> — a canary release in three lines of YAML.',
      ko: 'Gateway API(2025년부터 CKA 범위)는 Ingress를 역할이 분리된 오브젝트들로 나눕니다: <b>GatewayClass</b>(어떤 구현체인가 — 여기서는 <code>sim-gc</code>, 이미 설치됨) → <b>Gateway</b>(리스너: 포트 + 호스트네임, 플랫폼 팀 소유) → <b>HTTPRoute</b>(매칭 규칙 + 백엔드, 앱 팀 소유, <code>parentRefs</code>로 연결). Deployment <code>web</code>과 <code>web-v2</code>가 Service 뒤에서 돌고 있습니다. <code>app.example.com</code>의 체인을 연결한 뒤, Ingress가 못 하는 걸 해보세요: 가중치 <code>backendRefs</code>로 두 백엔드에 트래픽을 <b>90/10</b>으로 나누기 — YAML 세 줄짜리 카나리 배포입니다.',
    },
    docs: [
      { label: 'Gateway API (k8s docs)', url: 'https://kubernetes.io/docs/concepts/services-networking/gateway/' },
      { label: 'gateway-api.sigs.k8s.io', url: 'https://gateway-api.sigs.k8s.io/' },
    ],
    starterFiles: { 'gateway.yaml': GATEWAY_YAML, 'route.yaml': ROUTE_YAML },
    setup(engine) {
      engine.put({ apiVersion: 'gateway.networking.k8s.io/v1', kind: 'GatewayClass', metadata: { name: 'sim-gc', creationTimestamp: Date.now() }, spec: { controllerName: 'sim.io/gateway-controller' }, status: {}, sim: {} });
      engine.makeDeployment({ name: 'web', replicas: 1, image: 'nginx:1.27' });
      engine.makeService({ name: 'web', selector: { app: 'web' }, port: 80 });
      engine.makeDeployment({ name: 'web-v2', replicas: 1, image: 'httpd' });
      engine.makeService({ name: 'web-v2', selector: { app: 'web-v2' }, port: 80 });
    },
    missions: [
      {
        id: 'gw-gw',
        desc: { en: '🚉 Create Gateway <code>main-gw</code>: class <code>sim-gc</code>, HTTP listener on port <code>80</code> for <code>*.example.com</code> (<code>gateway.yaml</code>)', ko: '🚉 Gateway <code>main-gw</code>를 만드세요: 클래스 <code>sim-gc</code>, <code>*.example.com</code>용 HTTP 리스너 포트 <code>80</code> (<code>gateway.yaml</code>)' },
        check: (e) => {
          const g = e.get('Gateway', 'default', 'main-gw');
          return !!(g && g.spec.gatewayClassName === 'sim-gc' && (g.spec.listeners || []).some((l) => Number(l.port) === 80));
        },
      },
      {
        id: 'gw-route',
        desc: { en: '🧭 Attach HTTPRoute <code>app-route</code> to it (<code>parentRefs</code>): hostname <code>app.example.com</code> → backend <code>web:80</code> (<code>route.yaml</code>)', ko: '🧭 HTTPRoute <code>app-route</code>를 연결하세요(<code>parentRefs</code>): 호스트네임 <code>app.example.com</code> → 백엔드 <code>web:80</code> (<code>route.yaml</code>)' },
        check: (e) => {
          const r = resolveHttp(e, { host: 'app.example.com', path: '/' });
          return r.status === 200 && r.matched.kind === 'HTTPRoute' && r.backends.some((b) => b.svc.metadata.name === 'web');
        },
      },
      {
        id: 'gw-curl',
        desc: { en: '🌍 <code>curl http://app.example.com/</code> — the response names the whole chain: Gateway → HTTPRoute → Service → pod', ko: '🌍 <code>curl http://app.example.com/</code> — 응답에 전체 체인이 표시됩니다: Gateway → HTTPRoute → Service → 파드' },
        check: (e, flags) => !!(flags && flags.has('curl-ok:app.example.com/')),
      },
      {
        id: 'gw-split',
        desc: { en: '⚖️ Canary: give the route TWO weighted <code>backendRefs</code> — <code>web</code> (90) and <code>web-v2</code> (10) — then curl a few times and watch who answers', ko: '⚖️ 카나리: 라우트에 가중치 <code>backendRefs</code> 둘을 주세요 — <code>web</code>(90), <code>web-v2</code>(10) — 그리고 몇 번 curl 하면서 누가 응답하는지 보세요' },
        check: (e) => {
          const rt = e.get('HTTPRoute', 'default', 'app-route');
          if (!rt) return false;
          const refs = ((rt.spec.rules || [])[0] || {}).backendRefs || [];
          const names = refs.map((b) => b.name);
          if (refs.length < 2 || !names.includes('web') || !names.includes('web-v2') || !refs.every((b) => b.weight != null)) return false;
          const r = resolveHttp(e, { host: 'app.example.com', path: '/' });
          return r.status === 200 && r.backends.length === 2 && r.backends.every((b) => b.endpoints.length > 0);
        },
      },
    ],
    solve(sim, run, settle) {
      settle(8);
      run('kubectl apply -f gateway.yaml');
      run('kubectl apply -f route.yaml');
      run('curl http://app.example.com/');
      sim.files.write('route.yaml', ROUTE_SOLVED);
      run('kubectl apply -f route.yaml');
      run('curl http://app.example.com/');
    },
  },
];

export const NET_MISSION_TOTAL = NET_LABS.reduce((s, l) => s + l.missions.length, 0);
