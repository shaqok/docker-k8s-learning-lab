/**
 * HTTP routing resolution for Ingress and the Gateway API — shared by the
 * external-client `curl` command, the m13 router panels, and mission checks.
 * Pure function over the engine's store: host + path in, backend pods out.
 */

/** Ingress/listener host matching, incl. the `*.example.com` wildcard form. */
export function hostMatches(pattern, host) {
  if (!pattern) return true; // no host = catch-all
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1); // ".example.com"
    return host.endsWith(suffix) && host.slice(0, -suffix.length).split('.').length === 1 && host.length > suffix.length;
  }
  return pattern === host;
}

/** PathPrefix semantics: /api matches /api and /api/v1, not /apix. */
const pathMatches = (prefix, path) =>
  prefix === '/' || path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : prefix + '/');

/** All Ingress rules + Gateway-attached HTTPRoute rules matching host+path. */
function candidatesFor(engine, host, path) {
  const out = [];

  for (const ing of engine.list('Ingress', { all: true })) {
    for (const rule of ing.spec.rules || []) {
      if (!hostMatches(rule.host, host)) continue;
      for (const p of (rule.http && rule.http.paths) || []) {
        const prefix = p.path || '/';
        if (!pathMatches(prefix, path)) continue;
        const svc = (p.backend && p.backend.service) || {};
        out.push({
          kind: 'Ingress', via: ing, ns: ing.metadata.namespace, prefix,
          backends: [{ name: svc.name, port: svc.port && svc.port.number != null ? svc.port.number : svc.port, weight: 1 }],
        });
      }
    }
  }

  for (const rt of engine.list('HTTPRoute', { all: true })) {
    const gw = (rt.spec.parentRefs || [])
      .map((r) => engine.get('Gateway', rt.metadata.namespace, r.name || ''))
      .find(Boolean);
    if (!gw || !engine.get('GatewayClass', null, gw.spec.gatewayClassName || '')) continue;
    if (!(gw.spec.listeners || []).some((l) => hostMatches(l.hostname, host))) continue;
    const hostnames = rt.spec.hostnames || [];
    if (hostnames.length && !hostnames.some((h) => hostMatches(h, host))) continue;
    for (const rule of rt.spec.rules || []) {
      const matches = rule.matches && rule.matches.length ? rule.matches : [{ path: { value: '/' } }];
      for (const m of matches) {
        const prefix = (m.path && m.path.value) || '/';
        if (!pathMatches(prefix, path)) continue;
        out.push({
          kind: 'HTTPRoute', via: rt, gateway: gw, ns: rt.metadata.namespace, prefix,
          backends: (rule.backendRefs || []).map((b) => ({ name: b.name, port: b.port, weight: b.weight == null ? 1 : Number(b.weight) })),
        });
      }
    }
  }

  return out;
}

/**
 * Resolve an external HTTP request. Returns:
 *   { status: 200, matched, backends: [{svc, weight, endpoints}] }
 *   { status: 503, matched, reason }   — rule matched, backend broken
 *   { status: 404, reason }            — nothing matched host+path
 */
export function resolveHttp(engine, { host, path = '/' }) {
  const candidates = candidatesFor(engine, host, path);
  if (!candidates.length)
    return { status: 404, reason: `no Ingress rule or HTTPRoute matches host "${host}" path "${path}"` };

  candidates.sort((a, b) => b.prefix.length - a.prefix.length); // longest prefix wins
  const matched = candidates[0];

  if (!matched.backends.length || !matched.backends[0].name)
    return { status: 503, matched, reason: 'the matched rule has no backend service' };

  const backends = [];
  for (const b of matched.backends) {
    const svc = engine.get('Service', matched.ns, b.name);
    if (!svc) return { status: 503, matched, reason: `backend service "${b.name}" not found` };
    const svcPort = svc.spec.ports[0].port;
    if (b.port != null && Number(b.port) !== Number(svcPort))
      return { status: 503, matched, reason: `backend points at port ${b.port}, but service "${b.name}" listens on ${svcPort}` };
    backends.push({ svc, weight: b.weight, endpoints: engine.endpointsOf(svc) });
  }
  if (backends.every((b) => !b.endpoints.length))
    return { status: 503, matched, reason: `service "${backends.map((b) => b.svc.metadata.name).join('", "')}" has no ready endpoints` };

  return { status: 200, matched, backends };
}
