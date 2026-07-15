/**
 * Container networking + DNS for the Docker sim.
 *
 * The one lesson this exists to teach: containers on the **default bridge** can't
 * find each other by name, but containers on a **user-defined network** get
 * automatic DNS. So `docker run --network app …` then `curl http://api:3000`
 * works, while the same two containers on the default bridge get "bad address".
 */

/** User-defined networks the two containers share (excludes the built-in bridge/host/none). */
function sharedUserNetworks(engine, from, target) {
  const out = [];
  for (const n of Object.keys(from.networks)) {
    const net = engine.state.networks.get(n);
    if (net && !net.builtin && target.networks[n]) out.push(n);
  }
  return out;
}

/** Find a running/stopped container reachable from `from` under DNS name `host`. */
export function resolveName(engine, from, host) {
  for (const c of engine.state.containers) {
    if (c === from) continue;
    const names = [c.name, ...Object.values(c.networks).flatMap((e) => e.aliases || [])];
    if (!names.includes(host)) continue;
    if (sharedUserNetworks(engine, from, c).length) return { container: c, resolved: true };
  }
  // name exists but only co-located on the default bridge → no DNS
  const onBridgeOnly = engine.state.containers.find((c) => c !== from && c.name === host);
  return { container: null, resolved: false, existsOnBridge: !!onBridgeOnly };
}

/**
 * Parse a curl/wget target and resolve it to an HTTP-ish result.
 * `from` may be null for a host-side `curl localhost:PORT`.
 * Returns { ok, status, body, reason, target }.
 */
export function httpGet(engine, from, rawUrl) {
  const url = rawUrl.replace(/^https?:\/\//, '');
  const slash = url.indexOf('/');
  const hostport = slash === -1 ? url : url.slice(0, slash);
  const [host, portStr] = hostport.split(':');
  const port = portStr ? parseInt(portStr, 10) : null;

  if (host === 'localhost' || host === '127.0.0.1') {
    const c = engine.state.containers.find((x) => x.status === 'running' && x.ports.some((p) => String(p.host) === String(port)));
    if (c) return { ok: true, status: 200, body: welcome(c), target: c };
    return { ok: false, reason: 'refused', error: `Failed to connect to localhost port ${port ?? ''}: Connection refused` };
  }

  if (!from) return { ok: false, reason: 'no-dns', error: `Could not resolve host: ${host}` };

  const r = resolveName(engine, from, host);
  if (!r.resolved)
    return { ok: false, reason: r.existsOnBridge ? 'no-dns' : 'nxdomain',
      error: r.existsOnBridge
        ? `wget: bad address '${host}' — the default bridge network has no DNS; create a user-defined network and attach both containers`
        : `wget: bad address '${host}'` };

  const t = r.container;
  if (t.status !== 'running') return { ok: false, reason: 'down', error: `wget: can't connect to remote host: Connection refused` };
  const wanted = port ?? t.serves;
  if (t.serves == null || (port != null && port !== t.serves))
    return { ok: false, reason: 'refused', error: `wget: can't connect to remote host (${t.networks[Object.keys(t.networks)[0]].ip}): Connection refused` };
  return { ok: true, status: 200, body: welcome(t), target: t };
}

const welcome = (c) => `<!DOCTYPE html>\n<html><body><h1>Welcome — served by ${c.name} (${c.image})</h1></body></html>`;
