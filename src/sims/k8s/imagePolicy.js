/**
 * Supply-chain image admission — same shape as podSecurity.js, gated by a
 * Namespace label (`supplychain.sim/verify: "true"`). It reads `engine.docker`,
 * a Docker-engine reference that only the Supply Chain Security lab's combined
 * sim (supplyChainSim.js) bolts on — every other k8s sim has no such
 * reference, so this is always a no-op (allowed) there.
 */

function requiresVerification(engine, ns) {
  const nsObj = engine.get('Namespace', null, ns);
  return !!(nsObj && nsObj.metadata.labels && nsObj.metadata.labels['supplychain.sim/verify'] === 'true');
}

/** Would `image` be admitted into `ns`? → { allowed, reason } */
export function checkImagePolicy(engine, image, ns) {
  if (!requiresVerification(engine, ns)) return { allowed: true, reason: null };
  const docker = engine.docker;
  if (!docker) return { allowed: true, reason: null }; // no registry wired up here — nothing to check against
  const img = docker.getImage(image);
  if (!img) return { allowed: false, reason: `image "${image}" was not found in the registry — docker build/pull it first` };
  if (!img.scan) return { allowed: false, reason: `image "${image}" has not been scanned — run: trivy image ${image}` };
  if (img.scan.findings.length)
    return { allowed: false, reason: `image "${image}" has ${img.scan.findings.length} known vulnerabilit${img.scan.findings.length === 1 ? 'y' : 'ies'} (${img.scan.findings.map((f) => f.id).join(', ')}) — use a cleaner base and rescan` };
  if (!img.signed) return { allowed: false, reason: `image "${image}" is unsigned — run: cosign sign ${image}` };
  return { allowed: true, reason: null };
}
