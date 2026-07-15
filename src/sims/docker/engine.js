import { KNOWN_IMAGES } from '../../data/images.js';
import { BASE_IMAGES, shortId, fmtSize } from './catalog.js';
import { hexid, rid } from '../util.js';

/**
 * Simulated Docker engine v2 — pure state + primitive operations, no printing
 * and no DOM (cli.js formats; the facade wires it up). Mirrors the k8s
 * engine/kubectl split so the two sims read the same way.
 *
 * The engine models what the original concept lab couldn't: images as stacks of
 * layers with real sizes (so `docker build` cache hits/misses are visible),
 * volumes that outlive their container, and user-defined networks with DNS.
 */

const norm = (ref) => {
  if (!ref) return { repo: '', tag: 'latest', key: '' };
  const [name, tag = 'latest'] = ref.includes('@') ? [ref.split('@')[0], 'latest'] : splitTag(ref);
  return { repo: name, tag, key: name + ':' + tag };
};

// split on the LAST colon, but not a registry-port colon (host:5000/repo)
function splitTag(ref) {
  const slash = ref.lastIndexOf('/');
  const colon = ref.lastIndexOf(':');
  if (colon > slash) return [ref.slice(0, colon), ref.slice(colon + 1)];
  return [ref, 'latest'];
}

/** MB for a pullable image, from the base catalog or the runnable-image data. */
export function imageSizeMB(ref) {
  const { repo, key } = norm(ref);
  if (BASE_IMAGES[key] != null) return BASE_IMAGES[key];
  if (BASE_IMAGES[repo] != null) return BASE_IMAGES[repo];
  const known = KNOWN_IMAGES[repo];
  if (known) return parseSize(known.size);
  return null;
}

function parseSize(s) {
  const m = String(s).match(/([\d.]+)\s*(kB|MB|GB)/i);
  if (!m) return 100;
  const n = parseFloat(m[1]);
  return m[2].toLowerCase() === 'gb' ? n * 1024 : m[2].toLowerCase() === 'kb' ? n / 1000 : n;
}

/** Is this ref something the simulator can pull (a known runnable or base image)? */
export const isPullable = (ref) => imageSizeMB(ref) != null;

export function createDockerEngine({ onChange = () => {}, onMission = () => {} } = {}) {
  const state = {
    images: new Map(), // "repo:tag" → image record
    containers: [],
    volumes: new Map(), // name → { name, data: Map }
    networks: new Map(), // name → { name, driver, builtin, containers: Set<id> }
    loggedIn: null,
  };
  // the default bridge exists from the start; it deliberately has NO DNS
  state.networks.set('bridge', { name: 'bridge', driver: 'bridge', builtin: true, containers: new Set() });
  state.networks.set('host', { name: 'host', driver: 'host', builtin: true, containers: new Set() });
  state.networks.set('none', { name: 'none', driver: 'null', builtin: true, containers: new Set() });

  const listeners = new Set();
  const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  const changed = () => { onChange(); listeners.forEach((fn) => fn()); };

  /* ---------------- images ---------------- */

  const getImage = (ref) => state.images.get(norm(ref).key);
  const listImages = () => [...state.images.values()];

  /** Build the image record for a freshly pulled runnable/base image. */
  function pulledImage(ref) {
    const { repo, tag, key } = norm(ref);
    const size = imageSizeMB(ref);
    const known = KNOWN_IMAGES[repo] || {};
    const id = shortId(key + ':pulled');
    return {
      repo, tag, id, size,
      layers: [{ id, instr: 'FROM ' + key, sizeMB: size, createdBy: 'pull' }],
      config: {
        cmd: known.oneshot ? null : (repo === 'nginx' ? 'nginx -g daemon off;' : null),
        env: {}, workdir: '/', exposed: known.port ? [known.port] : [], entrypoint: null,
      },
      logs: known.logs || [],
      port: known.port || null,
      oneshot: !!known.oneshot,
      gpu: !!known.gpu,
      _key: key,
    };
  }

  function pull(ref) {
    if (!isPullable(ref)) return { error: `pull access denied for ${norm(ref).repo}, repository does not exist or may require 'docker login'` };
    const img = pulledImage(ref);
    state.images.set(img._key, img);
    changed();
    return { image: img, layers: 2 };
  }

  function putImage(img) { state.images.set(img.repo + ':' + img.tag, img); changed(); }

  function removeImage(ref) {
    const img = getImage(ref);
    if (!img) return { error: `No such image: ${ref}` };
    if (state.containers.some((c) => c.image === img.repo + ':' + img.tag))
      return { error: `conflict: unable to remove "${ref}" - it is being used by a running/stopped container` };
    state.images.delete(img.repo + ':' + img.tag);
    changed();
    return { untagged: img.repo + ':' + img.tag, deleted: img.id };
  }

  function tagImage(srcRef, dstRef) {
    const src = getImage(srcRef);
    if (!src) return { error: `No such image: ${srcRef}` };
    const { repo, tag } = norm(dstRef);
    const copy = { ...src, repo, tag };
    state.images.set(repo + ':' + tag, copy);
    changed();
    return { ok: true };
  }

  /* ---------------- containers ---------------- */

  const find = (ref) => state.containers.find((c) => c.name === ref || c.id.startsWith(ref));
  const listContainers = (all) => state.containers.filter((c) => all || c.status === 'running');

  let ipCounter = 2;
  function attach(container, netName, aliases = []) {
    const net = state.networks.get(netName);
    if (!net) return { error: `network ${netName} not found` };
    net.containers.add(container.id);
    container.networks[netName] = { ip: '172.' + (17 + netIndex(netName)) + '.0.' + ipCounter++, aliases };
    return {};
  }
  const netIndex = (name) => [...state.networks.keys()].indexOf(name);

  /**
   * Create (and, unless it's a one-shot, start) a container. `opts` is already
   * parsed by the CLI: { image, name, detach, ports:[{host,container}], env,
   * mounts:[{type,source,target}], networks:[name], netAliases, gpus, command }.
   */
  function createContainer(opts) {
    const img = getImage(opts.image);
    if (!img) return { needPull: !isPullable(opts.image), error: isPullable(opts.image) ? null : `Unable to find image '${norm(opts.image).key}' locally` };
    if (opts.name && find(opts.name))
      return { error: `Conflict. The container name "/${opts.name}" is already in use.` };

    const c = {
      id: hexid(64),
      name: opts.name || img.repo.replace(/[^a-z0-9]/g, '_') + '_' + rid(4),
      image: img.repo + ':' + img.tag,
      command: opts.command && opts.command.length ? opts.command.join(' ') : (img.config.cmd || (img.oneshot ? 'sh' : '')),
      status: img.oneshot && !(opts.command && opts.command.length) ? 'exited' : 'running',
      exitCode: 0,
      ports: opts.ports || [],
      env: { ...img.config.env, ...(opts.env || {}) },
      mounts: opts.mounts || [],
      networks: {},
      gpus: !!opts.gpus,
      fs: new Map(),
      serves: img.port || (img.config.exposed && img.config.exposed[0]) || null,
      logs: img.logs ? [...img.logs] : [],
      project: opts.project || null,
      _img: img,
    };

    // ensure named volumes exist, then wire mounts
    for (const m of c.mounts) if (m.type === 'volume' && !state.volumes.has(m.source)) createVolume(m.source);

    // networking: explicit --network, else the default bridge
    const nets = opts.networks && opts.networks.length ? opts.networks : ['bridge'];
    state.containers.push(c);
    for (const n of nets) attach(c, n, opts.netAliases || []);

    changed();
    return { container: c, image: img };
  }

  function startContainer(ref) {
    const c = find(ref);
    if (!c) return { error: `No such container: ${ref}` };
    c.status = 'running';
    changed();
    return { name: c.name };
  }
  function stopContainer(ref) {
    const c = find(ref);
    if (!c) return { error: `No such container: ${ref}` };
    c.status = 'exited';
    changed();
    return { name: c.name };
  }
  function removeContainer(ref, force) {
    const c = find(ref);
    if (!c) return { error: `No such container: ${ref}` };
    if (c.status === 'running' && !force)
      return { error: `You cannot remove a running container ${c.id.slice(0, 12)}. Stop the container before attempting removal or force remove` };
    for (const netName of Object.keys(c.networks)) state.networks.get(netName)?.containers.delete(c.id);
    state.containers = state.containers.filter((x) => x !== c);
    changed();
    return { name: c.name };
  }

  /* ---------------- container filesystem (for volumes) ---------------- */

  /** Route an absolute path to the volume backing it, or the container's own writable layer. */
  function storeFor(container, path) {
    let best = null;
    for (const m of container.mounts) {
      if (path === m.target || path.startsWith(m.target.replace(/\/$/, '') + '/')) {
        if (!best || m.target.length > best.target.length) best = m;
      }
    }
    if (best) {
      const vol = best.type === 'volume' ? state.volumes.get(best.source) : bindVolume(best.source);
      return { data: vol.data, rel: path.slice(best.target.replace(/\/$/, '').length) || '/', mount: best };
    }
    return { data: container.fs, rel: path, mount: null };
  }
  const bindBacking = new Map();
  const bindVolume = (src) => { if (!bindBacking.has(src)) bindBacking.set(src, { name: src, data: new Map() }); return bindBacking.get(src); };

  function writeFile(container, path, content) { const s = storeFor(container, path); s.data.set(s.rel, content); }
  function readFile(container, path) { const s = storeFor(container, path); return s.data.has(s.rel) ? s.data.get(s.rel) : null; }
  function listDir(container, path) {
    const s = storeFor(container, path);
    const prefix = s.rel.replace(/\/$/, '') + '/';
    const names = new Set();
    for (const k of s.data.keys()) if (k.startsWith(prefix)) names.add(k.slice(prefix.length).split('/')[0]);
    return [...names];
  }

  /* ---------------- volumes ---------------- */

  function createVolume(name) {
    if (state.volumes.has(name)) return state.volumes.get(name);
    const v = { name, data: new Map(), createdAt: Date.now() };
    state.volumes.set(name, v);
    changed();
    return v;
  }
  function removeVolume(name) {
    if (!state.volumes.has(name)) return { error: `no such volume: ${name}` };
    if (state.containers.some((c) => c.mounts.some((m) => m.type === 'volume' && m.source === name)))
      return { error: `remove ${name}: volume is in use` };
    state.volumes.delete(name);
    changed();
    return { name };
  }

  /* ---------------- networks ---------------- */

  function createNetwork(name, driver = 'bridge') {
    if (state.networks.has(name)) return { error: `network with name ${name} already exists` };
    state.networks.set(name, { name, driver, builtin: false, containers: new Set() });
    changed();
    return { id: hexid(64) };
  }
  function removeNetwork(name) {
    const net = state.networks.get(name);
    if (!net) return { error: `No such network: ${name}` };
    if (net.builtin) return { error: `${name} is a pre-defined network and cannot be removed` };
    if (net.containers.size) return { error: `network ${name} has active endpoints` };
    state.networks.delete(name);
    changed();
    return { name };
  }
  function connect(netName, ref) {
    const c = find(ref); if (!c) return { error: `No such container: ${ref}` };
    if (!state.networks.has(netName)) return { error: `network ${netName} not found` };
    if (c.networks[netName]) return {};
    attach(c, netName);
    changed();
    return {};
  }
  function disconnect(netName, ref) {
    const c = find(ref); if (!c) return { error: `No such container: ${ref}` };
    state.networks.get(netName)?.containers.delete(c.id);
    delete c.networks[netName];
    changed();
    return {};
  }

  return {
    state, fmtSize, onMission, subscribe,
    // images
    getImage, listImages, pull, putImage, removeImage, tagImage, imageSizeMB,
    // containers
    find, listContainers, createContainer, startContainer, stopContainer, removeContainer,
    // fs
    writeFile, readFile, listDir, storeFor,
    // volumes
    createVolume, removeVolume,
    // networks
    createNetwork, removeNetwork, connect, disconnect,
    changed,
  };
}
