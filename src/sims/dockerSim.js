import { createDockerEngine } from './docker/engine.js';
import { createDockerCli } from './docker/cli.js';
import { createFileStore } from './k8sSim.js';

/**
 * Simulated Docker engine, v2 — see docker/engine.js (image/layer + container +
 * volume + network state) and docker/cli.js (the command layer). This facade
 * keeps the public surface small: { exec, state, engine, files } plus setOnEdit
 * so the shared ManifestEditor can host the Dockerfile / compose.yaml.
 */

const STARTER_DOCKERFILE = `# Edit me, then run:  docker build -t web .
# Reorder the COPY/RUN lines and rebuild to see the layer cache hit or bust.
FROM node:20
WORKDIR /app
COPY package.json .
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
`;

const STARTER_FILES = {
  Dockerfile: STARTER_DOCKERFILE,
  'package.json': '{\n  "name": "web",\n  "version": "1.0.0",\n  "dependencies": { "express": "^4" }\n}\n',
  'server.js': "const express = require('express');\nconst app = express();\napp.get('/', (_, res) => res.send('hello'));\napp.listen(3000);\n",
  'compose.yaml': `services:
  web:
    image: nginx
    ports: ["8080:80"]
    depends_on: [api]
  api:
    image: redis
`,
};

export function createDockerSim({ onChange = () => {}, onMission = () => {}, starterFiles = STARTER_FILES, files = null } = {}) {
  const engine = createDockerEngine({ onChange, onMission });
  const store = files || createFileStore(starterFiles);
  let onEditCb = null;
  const cli = createDockerCli(engine, { files: store, onMission });
  return {
    exec: cli.exec,
    state: engine.state,
    engine,
    files: store,
    subscribe: engine.subscribe,
    setOnEdit: (fn) => { onEditCb = fn; },
    _fireEdit: (f) => onEditCb && onEditCb(f),
  };
}
