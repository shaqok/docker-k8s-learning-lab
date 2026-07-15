/**
 * Docker drill labs (improvement-plan step 12) — the Docker counterpart to the
 * CKAD/CKA drills. Same lab shape as ckadLabs.js so they share LabRunner:
 * `{ id, tab, title, brief, docs, starterFiles, missions:[{id,desc,check}], solve }`.
 * Missions are graded LIVE against the Docker engine state; `check(engine, flags,
 * files)` returns pass/fail, `flags` is the set of onMission ids the CLI fired.
 * `solve(sim, run)` is the reference path, proven by dockerLabs.test.js.
 *
 * These finally give the `foundations` (Docker) quiz domain a real practice
 * surface — the beginner end of the roadmap.
 */

const D = 'https://docs.docker.com';

/* small helpers over engine state, shared by the checks */
const builtImages = (engine) => engine.listImages().filter((i) => i.layers.length > 1);
const layerIdx = (img, re) => img.layers.findIndex((l) => re.test(l.instr));
const containersOn = (engine, net) => engine.state.containers.filter((c) => c.networks[net]);

const CACHE_HOSTILE = `# The layer cache can't help this Dockerfile: any source edit re-runs npm ci.
# Fix the ordering so dependencies install BEFORE the full source is copied.
FROM node:20
WORKDIR /app
COPY . .
RUN npm ci
CMD ["node", "server.js"]
`;

const FAT = `# One stage → the shipped image drags the whole Node toolchain along.
# Convert to multi-stage so the final image carries only the built site.
FROM node:20
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build
CMD ["npx", "serve", "dist"]
`;

const APP_FILES = {
  'package.json': '{\n  "name": "app",\n  "version": "1.0.0",\n  "scripts": { "build": "vite build" },\n  "dependencies": { "express": "^4" }\n}\n',
  'server.js': "const express = require('express');\nexpress().get('/', (_, r) => r.send('hi')).listen(3000);\n",
};

export const DOCKER_LABS = [
  /* ---------------- 1 · build & layer cache ---------------- */
  {
    id: 'build',
    tab: { en: '🧱 Build & cache', ko: '🧱 빌드 & 캐시' },
    title: { en: 'docker build — make the layer cache work for you', ko: 'docker build — 레이어 캐시를 내 편으로' },
    brief: {
      en: "Each Dockerfile instruction is a <b>layer</b>, and a layer's cache is only reused if it and everything above it is unchanged. The starter <code>Dockerfile</code> copies the whole source (<code>COPY . .</code>) <i>before</i> <code>RUN npm ci</code> — so editing one line of app code re-installs every dependency. Reorder it (copy <code>package.json</code>, install, <i>then</i> copy the rest) and rebuild: <code>docker build -t app .</code>. Edit the Dockerfile in the Manifests pane.",
      ko: "Dockerfile의 각 명령은 <b>레이어</b>이고, 레이어 캐시는 그 위의 모든 것이 그대로일 때만 재사용됩니다. 시작 <code>Dockerfile</code>은 <code>RUN npm ci</code> <i>전에</i> 소스 전체를 복사(<code>COPY . .</code>)합니다 — 그래서 앱 코드 한 줄만 고쳐도 의존성을 전부 다시 설치합니다. 순서를 바꿔(<code>package.json</code> 복사 → 설치 → 나머지 복사) 다시 빌드하세요: <code>docker build -t app .</code>. Dockerfile은 Manifests 패널에서 편집합니다.",
    },
    docs: [
      { label: 'Build cache', url: D + '/build/cache/' },
      { label: 'Dockerfile best practices', url: D + '/develop/develop-images/dockerfile_best-practices/' },
    ],
    starterFiles: { Dockerfile: CACHE_HOSTILE, ...APP_FILES },
    missions: [
      { id: 'built', desc: { en: '🧱 Build the image: <code>docker build -t app .</code>', ko: '🧱 이미지를 빌드: <code>docker build -t app .</code>' },
        check: (e, f) => f.has('build') },
      { id: 'order', desc: { en: '📑 Reorder so <code>COPY package.json</code> + <code>RUN npm ci</code> come <b>before</b> <code>COPY . .</code>, then rebuild', ko: '📑 <code>COPY package.json</code> + <code>RUN npm ci</code>가 <code>COPY . .</code> <b>앞</b>에 오도록 바꾸고 다시 빌드' },
        check: (e) => builtImages(e).some((img) => { const p = layerIdx(img, /COPY\s+package/i), n = layerIdx(img, /RUN\s+npm/i), a = layerIdx(img, /COPY\s+\.\s+\./i); return p >= 0 && n >= 0 && a >= 0 && p < a && n < a; }) },
      { id: 'cache-hit', desc: { en: '⚡ Rebuild after an app-code edit and watch <code>npm ci</code> stay <span style="color:var(--green)">CACHED</span>', ko: '⚡ 앱 코드를 고친 뒤 다시 빌드해 <code>npm ci</code>가 <span style="color:var(--green)">CACHED</span>로 남는 걸 확인' },
        check: (e, f) => f.has('build-cached') },
    ],
    solve(sim, run) {
      sim.files.write('Dockerfile', 'FROM node:20\nWORKDIR /app\nCOPY package.json .\nRUN npm ci\nCOPY . .\nCMD ["node", "server.js"]\n');
      run('docker build -t app .');
      sim.files.write('server.js', "express().get('/', (_, r) => r.send('edited')).listen(3000);");
      run('docker build -t app .');
    },
  },

  /* ---------------- 2 · multi-stage slimming ---------------- */
  {
    id: 'slim',
    tab: { en: '🪶 Multi-stage', ko: '🪶 멀티 스테이지' },
    title: { en: 'Multi-stage builds — ship the app, not the toolchain', ko: '멀티 스테이지 빌드 — 툴체인 말고 앱만' },
    brief: {
      en: "The starter <code>Dockerfile</code> builds a static site on top of <code>node:20</code> and ships the whole thing — over a gigabyte, almost all of it build tooling the running site never needs. Split it: a <code>builder</code> stage (<code>FROM node:20 AS builder</code>) compiles the site, then a tiny final stage (<code>FROM nginx:alpine</code>) does <code>COPY --from=builder /app/dist …</code>. The final image should drop <b>under 60&nbsp;MB</b>.",
      ko: "시작 <code>Dockerfile</code>은 <code>node:20</code> 위에서 정적 사이트를 빌드하고 통째로 배포합니다 — 1GB가 넘고, 대부분은 실행에는 필요 없는 빌드 도구입니다. 나누세요: <code>builder</code> 스테이지(<code>FROM node:20 AS builder</code>)가 사이트를 빌드하고, 작은 최종 스테이지(<code>FROM nginx:alpine</code>)가 <code>COPY --from=builder /app/dist …</code>. 최종 이미지는 <b>60&nbsp;MB 미만</b>이어야 합니다.",
    },
    docs: [
      { label: 'Multi-stage builds', url: D + '/build/building/multi-stage/' },
    ],
    starterFiles: { Dockerfile: FAT, ...APP_FILES },
    missions: [
      { id: 'built-fat', desc: { en: '🏗 Build the single-stage image and note its size: <code>docker build -t site .</code>', ko: '🏗 단일 스테이지 이미지를 빌드하고 크기 확인: <code>docker build -t site .</code>' },
        check: (e, f) => f.has('build') },
      { id: 'multistage', desc: { en: '🪆 Rewrite it with a <code>builder</code> stage + a <code>FROM nginx:alpine</code> final stage using <code>COPY --from=builder</code>', ko: '🪆 <code>builder</code> 스테이지 + <code>FROM nginx:alpine</code> 최종 스테이지(<code>COPY --from=builder</code>)로 다시 작성' },
        check: (e, f) => f.has('multistage') },
      { id: 'slim', desc: { en: '🪶 Get the final image <b>under 60&nbsp;MB</b>', ko: '🪶 최종 이미지를 <b>60&nbsp;MB 미만</b>으로' },
        check: (e, f) => f.has('slim-image') },
    ],
    solve(sim, run) {
      run('docker build -t site .');
      sim.files.write('Dockerfile', 'FROM node:20 AS builder\nWORKDIR /app\nCOPY . .\nRUN npm ci\nRUN npm run build\n\nFROM nginx:alpine\nCOPY --from=builder /app/dist /usr/share/nginx/html\n');
      run('docker build -t site .');
    },
  },

  /* ---------------- 3 · volumes & persistence ---------------- */
  {
    id: 'volumes',
    tab: { en: '💾 Volumes', ko: '💾 볼륨' },
    title: { en: "Volumes — the data that outlives the container", ko: '볼륨 — 컨테이너보다 오래 사는 데이터' },
    brief: {
      en: "A container's writable layer dies with it. Anything you need to keep goes in a <b>volume</b>. Create one named <code>appdata</code> (<code>docker volume create appdata</code>), mount it (<code>docker run -d -v appdata:/data --name db redis</code>), write a file into <code>/data</code>, then <code>docker rm -f db</code> and start a <i>new</i> container on the same volume — the file is still there.",
      ko: "컨테이너의 쓰기 가능 레이어는 컨테이너와 함께 사라집니다. 지켜야 할 데이터는 <b>볼륨</b>에 둡니다. <code>appdata</code>라는 볼륨을 만들고(<code>docker volume create appdata</code>), 마운트한 뒤(<code>docker run -d -v appdata:/data --name db redis</code>), <code>/data</code>에 파일을 쓰고, <code>docker rm -f db</code> 후 같은 볼륨으로 <i>새</i> 컨테이너를 띄우면 파일이 그대로 있습니다.",
    },
    docs: [
      { label: 'Volumes', url: D + '/storage/volumes/' },
    ],
    starterFiles: {},
    missions: [
      { id: 'create', desc: { en: '💾 Create a named volume: <code>docker volume create appdata</code>', ko: '💾 이름 있는 볼륨 생성: <code>docker volume create appdata</code>' },
        check: (e) => e.state.volumes.has('appdata') },
      { id: 'mount', desc: { en: '🔌 Run a container with it mounted: <code>docker run -d -v appdata:/data --name db redis</code>', ko: '🔌 볼륨을 마운트해 컨테이너 실행: <code>docker run -d -v appdata:/data --name db redis</code>' },
        check: (e) => e.state.containers.some((c) => c.mounts.some((m) => m.type === 'volume' && m.source === 'appdata')) },
      { id: 'write', desc: { en: '✍️ Write into the volume: <code>docker exec db sh -c \'echo hi &gt; /data/note.txt\'</code>', ko: '✍️ 볼륨에 쓰기: <code>docker exec db sh -c \'echo hi &gt; /data/note.txt\'</code>' },
        check: (e) => (e.state.volumes.get('appdata')?.data.size || 0) > 0 },
      { id: 'persist', desc: { en: '♻️ Remove <code>db</code>, start a new container on <code>appdata</code>, and <code>cat</code> the file back', ko: '♻️ <code>db</code>를 지우고 <code>appdata</code>로 새 컨테이너를 띄워 파일을 <code>cat</code>으로 다시 읽기' },
        check: (e, f) => f.has('vol-read') },
    ],
    solve(sim, run) {
      run('docker volume create appdata');
      run('docker run -d -v appdata:/data --name db redis');
      run("docker exec db sh -c 'echo hi > /data/note.txt'");
      run('docker rm -f db');
      run('docker run -d -v appdata:/data --name db2 redis');
      run('docker exec db2 cat /data/note.txt');
    },
  },

  /* ---------------- 4 · networks & DNS ---------------- */
  {
    id: 'networks',
    tab: { en: '🕸 Networks & DNS', ko: '🕸 네트워크 & DNS' },
    title: { en: 'User-defined networks — containers find each other by name', ko: '사용자 정의 네트워크 — 이름으로 서로를 찾기' },
    brief: {
      en: "On the default <code>bridge</code>, containers can only reach each other by IP. On a <b>user-defined network</b> they get automatic DNS by container name. Create one (<code>docker network create appnet</code>), run two containers with <code>--network appnet</code>, and from one <code>curl http://&lt;the-other-name&gt;</code>. (Try it on the default bridge first and watch it fail with <i>bad address</i>.)",
      ko: "기본 <code>bridge</code>에서는 컨테이너가 IP로만 서로에게 닿습니다. <b>사용자 정의 네트워크</b>에서는 컨테이너 이름으로 자동 DNS가 됩니다. 하나 만들고(<code>docker network create appnet</code>), <code>--network appnet</code>로 컨테이너 둘을 띄운 뒤, 한쪽에서 <code>curl http://&lt;상대-이름&gt;</code>. (먼저 기본 bridge에서 해 보고 <i>bad address</i>로 실패하는 걸 보세요.)",
    },
    docs: [
      { label: 'Networking', url: D + '/network/' },
      { label: 'Bridge networks', url: D + '/network/drivers/bridge/' },
    ],
    starterFiles: {},
    missions: [
      { id: 'create-net', desc: { en: '🕸 Create a user-defined network: <code>docker network create appnet</code>', ko: '🕸 사용자 정의 네트워크 생성: <code>docker network create appnet</code>' },
        check: (e) => { const n = e.state.networks.get('appnet'); return !!n && !n.builtin; } },
      { id: 'attach', desc: { en: '🔗 Run two containers on it: <code>docker run -d --network appnet --name api nginx</code> (and a client)', ko: '🔗 그 위에 컨테이너 둘 실행: <code>docker run -d --network appnet --name api nginx</code> (그리고 클라이언트)' },
        check: (e) => containersOn(e, 'appnet').length >= 2 },
      { id: 'dns', desc: { en: '📡 From the client reach the other by name: <code>docker exec client curl http://api</code>', ko: '📡 클라이언트에서 이름으로 접속: <code>docker exec client curl http://api</code>' },
        check: (e, f) => f.has('net-dns') },
    ],
    solve(sim, run) {
      run('docker network create appnet');
      run('docker run -d --network appnet --name api nginx');
      run('docker run -d --network appnet --name client redis');
      run('docker exec client curl http://api');
    },
  },

  /* ---------------- 5 · compose stack ---------------- */
  {
    id: 'compose',
    tab: { en: '🧩 Compose', ko: '🧩 Compose' },
    title: { en: 'Compose — the whole stack in one file', ko: 'Compose — 스택 전체를 한 파일로' },
    brief: {
      en: "<code>docker compose</code> brings up a multi-service stack from <code>compose.yaml</code> on its own project network, so services reach each other by <b>service name</b> — no manual <code>network create</code>. Edit <code>compose.yaml</code> in the Manifests pane, then <code>docker compose up -d</code>. Verify the web tier can reach the api tier by name, and that <code>docker compose down</code> + <code>up</code> keeps named-volume data.",
      ko: "<code>docker compose</code>는 <code>compose.yaml</code>로 다중 서비스 스택을 자체 프로젝트 네트워크 위에 띄우므로, 서비스끼리 <b>서비스 이름</b>으로 통신합니다 — 수동 <code>network create</code>가 필요 없습니다. Manifests 패널에서 <code>compose.yaml</code>을 편집한 뒤 <code>docker compose up -d</code>. web 티어가 api 티어에 이름으로 닿는지, 그리고 <code>docker compose down</code> + <code>up</code> 후에도 이름 있는 볼륨 데이터가 남는지 확인하세요.",
    },
    docs: [
      { label: 'Compose overview', url: D + '/compose/' },
      { label: 'Compose file', url: D + '/compose/compose-file/' },
    ],
    starterFiles: {
      'compose.yaml': `services:
  web:
    image: nginx
    ports: ["8080:80"]
    depends_on: [api]
  api:
    image: redis
`,
    },
    missions: [
      { id: 'up', desc: { en: '🧩 Bring the stack up: <code>docker compose up -d</code>', ko: '🧩 스택 올리기: <code>docker compose up -d</code>' },
        check: (e, f) => f.has('compose-up') },
      { id: 'running', desc: { en: '✅ Both services are running', ko: '✅ 두 서비스가 모두 실행 중' },
        check: (e) => { const cs = e.state.containers.filter((c) => c.project); return cs.length >= 2 && cs.every((c) => c.status === 'running'); } },
      { id: 'svc-dns', desc: { en: '📡 web reaches api by service name: <code>docker exec app-web-1 curl http://api:6379</code>', ko: '📡 web이 서비스 이름으로 api에 접속: <code>docker exec app-web-1 curl http://api:6379</code>' },
        check: (e, f) => f.has('net-dns') },
    ],
    solve(sim, run) {
      run('docker compose up -d');
      run('docker exec app-web-1 curl http://api:6379');
    },
  },
];

export const DOCKER_MISSION_TOTAL = DOCKER_LABS.reduce((s, l) => s + l.missions.length, 0);
