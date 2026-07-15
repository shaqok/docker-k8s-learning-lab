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

const buildText = (df, tag = 'app:v1') => { write('Dockerfile', df); return runner.run(`docker build -t ${tag} .`).text; };
const imgSize = (repo) => sim.engine.listImages().find((i) => i.repo === repo)?.size;

describe('docker build — layers & cache', () => {
  const DF = `FROM node:20
WORKDIR /app
COPY package.json .
RUN npm ci
COPY . .
CMD ["node","server.js"]`;

  it('builds an image and tags it', () => {
    write('package.json', '{"a":1}');
    const out = buildText(DF);
    expect(out).toContain('Successfully tagged app:v1');
    expect(sim.engine.getImage('app:v1')).toBeTruthy();
    expect(missions).toContain('build');
  });

  it('reuses every layer on an identical rebuild', () => {
    write('package.json', '{"a":1}');
    write('server.js', 'x');
    buildText(DF);
    const second = buildText(DF);
    expect(second).toContain('CACHED');
    expect(missions).toContain('build-cached');
  });

  it('busts the cache from the first changed line downward', () => {
    write('package.json', '{"a":1}');
    write('server.js', 'v1');
    buildText(DF);
    // editing a file only COPY . . sees should keep npm ci cached...
    write('server.js', 'v2');
    const out = buildText(DF);
    const runNpm = out.split('\n').find((l) => l.includes('RUN npm ci'));
    const copyAll = out.split('\n').find((l) => l.includes('COPY . .'));
    expect(runNpm).toContain('CACHED');   // package.json unchanged → npm ci still cached
    expect(copyAll).not.toContain('CACHED'); // COPY . . sees the changed server.js
  });

  it('busts npm ci when package.json changes (why COPY package.json goes first)', () => {
    write('package.json', '{"a":1}');
    buildText(DF);
    write('package.json', '{"a":2}');
    const out = buildText(DF);
    expect(out.split('\n').find((l) => l.includes('RUN npm ci'))).not.toContain('CACHED');
  });

  it('--no-cache rebuilds everything', () => {
    write('package.json', '{"a":1}');
    buildText(DF);
    const out = runner.run('docker build --no-cache -t app:v1 .').text;
    expect(out).not.toContain('CACHED');
  });
});

describe('docker build — multi-stage slimming', () => {
  it('final image is far smaller than the builder base', () => {
    const single = `FROM node:20
WORKDIR /app
COPY . .
RUN npm ci
CMD ["node","server.js"]`;
    write('server.js', 'x');
    buildText(single, 'fat:v1');
    const fat = imgSize('fat');

    const multi = `FROM node:20 AS builder
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html`;
    buildText(multi, 'slim:v1');
    const slim = imgSize('slim');

    expect(fat).toBeGreaterThan(1000);   // carries the whole node toolchain
    expect(slim).toBeLessThan(60);       // just nginx:alpine + the copied dist
    expect(slim).toBeLessThan(fat);
    expect(missions).toContain('multistage');
    expect(missions).toContain('slim-image');
  });
});

describe('volumes persist beyond the container', () => {
  it('data written to a mounted volume survives docker rm', () => {
    runner.run('docker volume create data');
    runner.run('docker run -d -v data:/data --name w1 redis');
    runner.run("docker exec w1 sh -c 'echo hello > /data/note.txt'");
    runner.run('docker rm -f w1');
    runner.run('docker run -d -v data:/data --name w2 redis');
    expect(runner.run('docker exec w2 cat /data/note.txt').text).toContain('hello');
  });

  it('the writable layer does NOT survive — no volume, no persistence', () => {
    runner.run('docker run -d --name e1 redis');
    runner.run("docker exec e1 sh -c 'echo temp > /tmp/x'");
    runner.run('docker rm -f e1');
    runner.run('docker run -d --name e2 redis');
    expect(runner.run('docker exec e2 cat /tmp/x').errors.join('')).toContain('No such file');
  });
});

describe('user-defined networks give DNS; the default bridge does not', () => {
  it('resolves a container by name over a shared user network', () => {
    runner.run('docker network create appnet');
    runner.run('docker run -d --network appnet --name api nginx');
    runner.run('docker run -d --network appnet --name client redis');
    expect(runner.run('docker exec client curl http://api').text).toContain('Welcome');
    expect(missions).toContain('net-dns');
  });

  it('fails to resolve names on the default bridge', () => {
    runner.run('docker run -d --name api nginx');
    runner.run('docker run -d --name client redis');
    expect(runner.run('docker exec client curl http://api').errors.join('')).toContain('bad address');
  });
});

describe('docker compose', () => {
  it('brings up a stack on a project network with name-based DNS', () => {
    write('compose.yaml', `services:
  web:
    image: nginx
    ports: ["8080:80"]
    depends_on: [api]
  api:
    image: redis`);
    const out = runner.run('docker compose up -d').text;
    expect(out).toContain('web');
    expect(out).toContain('api');
    expect(missions).toContain('compose-up');
    // web can reach api by service name over the implicit project network
    expect(runner.run('docker exec app-web-1 curl http://api:6379').text).toContain('Welcome');
  });

  it('down removes the containers but a named volume persists', () => {
    write('compose.yaml', `services:
  db:
    image: postgres
    volumes: ["pgdata:/var/lib/postgresql/data"]
volumes:
  pgdata: {}`);
    runner.run('docker compose up -d');
    runner.run("docker exec app-db-1 sh -c 'echo row > /var/lib/postgresql/data/1.sql'");
    runner.run('docker compose down');
    expect(sim.engine.state.containers.length).toBe(0);
    runner.run('docker compose up -d');
    expect(runner.run('docker exec app-db-1 cat /var/lib/postgresql/data/1.sql').text).toContain('row');
  });
});

describe('registry: tag / push / history', () => {
  it('tags, pushes, and shows layer history', () => {
    write('Dockerfile', 'FROM alpine\nRUN echo hi');
    runner.run('docker build -t myapp .');
    runner.run('docker tag myapp registry.example.com/team/myapp:1.0');
    expect(sim.engine.getImage('registry.example.com/team/myapp:1.0')).toBeTruthy();
    expect(missions).toContain('tag');
    expect(runner.run('docker push registry.example.com/team/myapp:1.0').text).toContain('digest');
    expect(runner.run('docker history myapp').text).toContain('FROM alpine');
  });
});
