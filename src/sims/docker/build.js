import { runCost, copyCost, shortId } from './catalog.js';
import { isPullable, imageSizeMB } from './engine.js';

/**
 * `docker build` — the heart of Step 11. Parses a Dockerfile, walks its
 * instructions layer by layer, and reuses layers from a persistent cache when
 * the instruction (and, for COPY, the copied content) is unchanged.
 *
 * The teaching payoff is entirely in the cache behaviour: a layer's cache key
 * folds in its PARENT layer id, so the first changed instruction busts every
 * layer after it — which is exactly why `COPY package.json` + `RUN npm ci`
 * belongs above `COPY . .`, and why a multi-stage final image stays tiny.
 */

const CONTENT_HASH = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
};

/** Split a Dockerfile into instructions, honouring `\` line-continuations and `#` comments. */
export function parseDockerfile(text) {
  const out = [];
  const lines = text.split('\n');
  let buf = '';
  for (let raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (!buf && (/^\s*#/.test(line) || /^\s*$/.test(line))) continue;
    if (/\\\s*$/.test(line)) { buf += line.replace(/\\\s*$/, ' '); continue; }
    buf += line;
    const m = buf.trim().match(/^(\w+)\s+([\s\S]*)$/);
    if (m) out.push({ cmd: m[1].toUpperCase(), value: m[2].trim(), raw: buf.trim() });
    buf = '';
  }
  if (buf.trim()) { const m = buf.trim().match(/^(\w+)\s+([\s\S]*)$/); if (m) out.push({ cmd: m[1].toUpperCase(), value: m[2].trim(), raw: buf.trim() }); }
  return out;
}

/** Files in the build context that a COPY/ADD source refers to (for content hashing). */
function contextHash(sources, contextFiles) {
  let acc = '';
  for (const src of sources) {
    if (src === '.' || src === './') {
      for (const [name, content] of contextFiles) if (name !== 'Dockerfile') acc += name + '=' + content + ';';
    } else {
      const glob = src.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      const re = new RegExp('^' + glob + '$');
      for (const [name, content] of contextFiles) if (re.test(name) || name === src) acc += name + '=' + content + ';';
    }
  }
  return CONTENT_HASH(acc);
}

/**
 * Run a build. `engine` gives us base-image lookup + auto-pull and the persistent
 * `layerCache`. Returns { image, steps, error }; steps are BuildKit-ish rows the
 * CLI renders (each { instr, cached, sizeMB }).
 */
export function buildImage(engine, { dockerfile, tag, contextFiles = new Map(), noCache = false }) {
  const instrs = parseDockerfile(dockerfile);
  if (!instrs.length || instrs[0].cmd !== 'FROM') return { error: 'Dockerfile parse error: file must start with a FROM instruction' };

  engine._layerCache = engine._layerCache || new Map();
  const layerCache = engine._layerCache;

  // partition into stages at each FROM
  const stages = [];
  for (const ins of instrs) {
    if (ins.cmd === 'FROM') {
      const parts = ins.value.split(/\s+/);
      const base = parts[0];
      const asName = parts[1] && parts[1].toUpperCase() === 'AS' ? parts[2] : null;
      stages.push({ base, name: asName, instrs: [], index: stages.length });
    } else {
      if (!stages.length) return { error: 'Dockerfile parse error: instruction before FROM' };
      stages[stages.length - 1].instrs.push(ins);
    }
  }
  const stageByName = new Map();
  stages.forEach((s) => { if (s.name) stageByName.set(s.name, s); stageByName.set(String(s.index), s); });

  const steps = [];
  let finalImage = null;

  for (const stage of stages) {
    // base image: auto-pull if we can, else it must already be present
    let baseImg = engine.getImage(stage.base);
    if (!baseImg) {
      if (isPullable(stage.base)) { engine.pull(stage.base); baseImg = engine.getImage(stage.base); }
      else return { error: `failed to solve: ${stage.base}: not found (pull access denied or unknown to the simulator)` };
    }
    const baseSize = imageSizeMB(stage.base) ?? baseImg.size;
    let parentId = shortId('FROM ' + stage.base);
    const layers = [{ id: parentId, instr: 'FROM ' + stage.base, sizeMB: baseSize, createdBy: 'FROM' }];
    const config = { ...structuredCfg(baseImg.config) };
    steps.push({ instr: 'FROM ' + stage.base + (stage.name ? ' AS ' + stage.name : ''), cached: false, sizeMB: baseSize, base: true });

    for (const ins of stage.instrs) {
      let sizeMB = 0;
      let extra = '';
      if (ins.cmd === 'RUN') sizeMB = runCost(ins.value);
      else if (ins.cmd === 'COPY' || ins.cmd === 'ADD') {
        const { fromStage, sources } = parseCopy(ins.value);
        sizeMB = copyCost(sources[0] || '.', fromStage);
        extra = fromStage
          ? '::from=' + (stageByName.get(fromStage)?.finalId || fromStage)
          : '::' + contextHash(sources, contextFiles);
      } else applyConfig(config, ins);

      const cacheKey = parentId + '::' + ins.raw + extra;
      let layer = !noCache && layerCache.get(cacheKey);
      const cached = !!layer;
      if (!layer) { layer = { id: shortId(cacheKey), instr: ins.raw, sizeMB, createdBy: ins.cmd }; layerCache.set(cacheKey, layer); }
      layers.push(layer);
      parentId = layer.id;
      steps.push({ instr: ins.raw, cached, sizeMB: layer.sizeMB });
    }

    stage.finalId = parentId;
    const size = layers.reduce((s, l) => s + l.sizeMB, 0);
    finalImage = { layers, config, size, repo: baseImg.repo, port: config.exposed[0] || baseImg.port || null,
      logs: baseImg.logs || [], oneshot: false, gpu: baseImg.gpu || false };
  }

  // tag the final stage's image
  const t = tag || '<none>:<none>';
  const [repo, tg = 'latest'] = t.includes(':') ? splitLast(t) : [t, 'latest'];
  const image = { ...finalImage, repo, tag: tg, id: shortId(finalImage.layers.map((l) => l.id).join('')) };
  engine.putImage(image);

  return { image, steps };
}

function parseCopy(value) {
  const toks = value.split(/\s+/);
  let fromStage = null;
  const rest = [];
  for (const t of toks) {
    const m = t.match(/^--from=(.+)$/);
    if (m) fromStage = m[1];
    else if (t.startsWith('--')) { /* --chown etc: ignore */ }
    else rest.push(t);
  }
  const dest = rest.length > 1 ? rest[rest.length - 1] : rest[0];
  const sources = rest.length > 1 ? rest.slice(0, -1) : rest;
  return { fromStage, sources, dest };
}

function structuredCfg(cfg) {
  return { cmd: cfg?.cmd || null, entrypoint: cfg?.entrypoint || null, env: { ...(cfg?.env || {}) }, workdir: cfg?.workdir || '/', exposed: [...(cfg?.exposed || [])] };
}

function applyConfig(config, ins) {
  const v = ins.value;
  if (ins.cmd === 'CMD') config.cmd = stripJsonArray(v);
  else if (ins.cmd === 'ENTRYPOINT') config.entrypoint = stripJsonArray(v);
  else if (ins.cmd === 'WORKDIR') config.workdir = v;
  else if (ins.cmd === 'EXPOSE') for (const p of v.split(/\s+/)) { const n = parseInt(p, 10); if (n) config.exposed.push(n); }
  else if (ins.cmd === 'ENV') { const m = v.match(/^(\S+?)[=\s]+(.+)$/); if (m) config.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
}

const stripJsonArray = (v) => { try { const a = JSON.parse(v); return Array.isArray(a) ? a.join(' ') : v; } catch { return v; } };
const splitLast = (ref) => { const i = ref.lastIndexOf(':'); return ref.lastIndexOf('/') > i ? [ref, 'latest'] : [ref.slice(0, i), ref.slice(i + 1)]; };
