import { load } from 'js-yaml';

/**
 * A minimal `docker compose`. Given a compose.yaml, it fans out to the same
 * engine.createContainer the CLI uses, on an implicit project network — so
 * services reach each other by name for free (the network.js DNS lesson), and
 * named volumes persist across `down`/`up`.
 */

const projectNet = (project) => project + '_default';
const cname = (project, svc) => `${project}-${svc}-1`;

/** Order services so a service starts after everything in its depends_on. */
function ordered(services) {
  const names = Object.keys(services);
  const done = [];
  const seen = new Set();
  const visit = (n, stack = new Set()) => {
    if (seen.has(n) || !services[n]) return;
    if (stack.has(n)) return; // ignore cycles rather than hang
    stack.add(n);
    for (const d of depsOf(services[n])) visit(d, stack);
    seen.add(n); done.push(n);
  };
  names.forEach((n) => visit(n));
  return done;
}
const depsOf = (svc) => (Array.isArray(svc.depends_on) ? svc.depends_on : Object.keys(svc.depends_on || {}));

const parsePorts = (arr) => (arr || []).map((p) => {
  const [host, container] = String(p).split(':');
  return { host, container: parseInt(container || host, 10), proto: 'tcp' };
});

const parseVolumes = (arr) => (arr || []).map((v) => {
  const [source, target] = String(v).split(':');
  return { type: source.startsWith('.') || source.startsWith('/') ? 'bind' : 'volume', source, target: target || source };
});

const parseEnv = (env) => {
  if (!env) return {};
  if (Array.isArray(env)) return Object.fromEntries(env.map((e) => { const i = String(e).indexOf('='); return [e.slice(0, i), e.slice(i + 1)]; }));
  return { ...env };
};

/** Parse compose YAML into { services, volumes, error }. */
export function parseCompose(text) {
  let doc;
  try { doc = load(text) || {}; } catch (e) { return { error: 'yaml: ' + (e.message || 'parse error') }; }
  if (!doc.services || typeof doc.services !== 'object') return { error: 'services must be a mapping' };
  return { services: doc.services, topVolumes: Object.keys(doc.volumes || {}) };
}

export function composeUp(engine, project, text, { detach = true, build = null } = {}) {
  const parsed = parseCompose(text);
  if (parsed.error) return parsed;

  if (!engine.state.networks.has(projectNet(project))) engine.createNetwork(projectNet(project));
  for (const v of parsed.topVolumes) engine.createVolume(`${project}_${v}`);

  const created = [];
  const errors = [];
  for (const svc of ordered(parsed.services)) {
    const s = parsed.services[svc];
    let image = s.image;
    if (!image && s.build && build) {
      const res = build(svc, s); // CLI supplies a builder for `build:` services
      if (res.error) { errors.push(`${svc}: ${res.error}`); continue; }
      image = res.tag;
    }
    if (!image) { errors.push(`${svc}: no image and no build`); continue; }
    if (!engine.getImage(image)) { const pr = engine.pull(image); if (pr.error) { errors.push(`${svc}: ${pr.error}`); continue; } }

    // map named volumes to their project-scoped name
    const mounts = parseVolumes(s.volumes).map((m) => m.type === 'volume' ? { ...m, source: `${project}_${m.source}` } : m);
    const res = engine.createContainer({
      image, name: cname(project, svc), detach,
      ports: parsePorts(s.ports), env: parseEnv(s.environment),
      mounts, networks: [projectNet(project)], netAliases: [svc], project,
      command: s.command ? String(s.command).split(/\s+/) : null,
    });
    if (res.error) errors.push(`${svc}: ${res.error}`);
    else created.push({ service: svc, container: res.container });
  }
  return { created, errors, network: projectNet(project) };
}

export function composeDown(engine, project) {
  const mine = engine.state.containers.filter((c) => c.project === project);
  for (const c of mine) engine.removeContainer(c.id, true);
  engine.removeNetwork(projectNet(project));
  return { removed: mine.map((c) => c.name) };
}

export const composeContainers = (engine, project) => engine.state.containers.filter((c) => c.project === project);
