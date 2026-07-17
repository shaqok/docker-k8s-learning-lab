/**
 * Image catalog + size heuristics for the Docker build model.
 *
 * These numbers don't need to be exact — they need to be *deterministic* and to
 * make the lessons land: a full `node` base is ~1.1 GB while `node:alpine` is
 * ~180 MB, `apt-get install` costs real megabytes, and a multi-stage build's
 * final image carries only its runtime base + the copied artifact. Tests assert
 * on the relative sizes these produce (single-stage ≫ multi-stage), so keep them
 * stable.
 */

/** Base images allowed after `FROM`, in MB. `scratch` is the empty image. */
export const BASE_IMAGES = {
  scratch: 0,
  busybox: 4,
  alpine: 8,
  'alpine:3.20': 8,
  debian: 124,
  'debian:slim': 74,
  'debian:bookworm-slim': 74,
  ubuntu: 78,
  'ubuntu:22.04': 78,
  node: 1100,
  'node:20': 1100,
  'node:22': 1130,
  'node:slim': 240,
  'node:20-slim': 240,
  'node:alpine': 180,
  'node:20-alpine': 180,
  'node:22-alpine': 190,
  python: 1020,
  'python:3.12': 1020,
  'python:slim': 150,
  'python:3.12-slim': 150,
  'python:alpine': 55,
  'python:3.12-alpine': 55,
  golang: 1130,
  'golang:1.23': 1130,
  'golang:alpine': 350,
  nginx: 192,
  'nginx:alpine': 24,
  'nginx:1.27': 192,
  redis: 117,
  'redis:alpine': 41,
  postgres: 438,
  httpd: 148,
  caddy: 48,
};

/**
 * Estimate the megabytes a `RUN` instruction adds, from what it does. Package
 * installs dominate; a plain shell step is nearly free. Deterministic by design.
 */
export function runCost(cmd) {
  const c = cmd.toLowerCase();
  let mb = 0;
  // package managers: base overhead + per-package
  const pkgInstall = /(apt-get|apt|apk|yum|dnf)\s+(add|install)/;
  if (pkgInstall.test(c)) {
    const after = c.split(pkgInstall)[3] || '';
    const pkgs = after.split(/\s+/).filter((w) => w && !w.startsWith('-') && !w.includes('=') && w !== '&&' && w !== 'update' && w !== 'upgrade');
    mb += 12 + pkgs.length * 22;
  }
  if (/npm\s+(ci|install|i\b)|yarn(\s+install)?|pnpm\s+install/.test(c)) mb += 180;
  if (/pip\s+install|poetry\s+install/.test(c)) mb += 95;
  if (/go\s+(build|install)/.test(c)) mb += 14;
  if (/make\b|gcc|g\+\+|cargo\s+build/.test(c)) mb += 30;
  if (/go\s+mod\s+download/.test(c)) mb += 40;
  // apt caches unless cleaned in the same layer — a classic teaching gotcha
  if (pkgInstall.test(c) && !/rm\s+-rf\s+\/var\/lib\/apt|--no-install-recommends|apk\s+add\s+--no-cache/.test(c)) mb += 8;
  return mb || 1; // even a no-op RUN writes a tiny layer
}

/**
 * Estimate the megabytes a `COPY`/`ADD` adds. Copying source is small; copying a
 * built artifact out of an earlier stage (`--from`) carries just that artifact.
 */
export function copyCost(src, fromStage) {
  if (fromStage) return 3; // a build output: dist/, a compiled binary
  if (/package.*\.json|requirements\.txt|go\.(mod|sum)|Gemfile/.test(src)) return 0.02;
  if (src === '.' || src === './') return 5; // the whole source tree
  return 1;
}

/**
 * Fake CVE data for the Supply Chain Security lab's `trivy image` — keyed the
 * same way as BASE_IMAGES (exact ref, falling back to the bare repo). Slim/
 * alpine variants and anything not listed here scan clean: same "smaller base,
 * smaller attack surface" lesson the size table already teaches.
 */
export const VULN_CATALOG = {
  node: [{ id: 'CVE-2024-21538', severity: 'HIGH', pkg: 'cross-spawn' }],
  'node:20': [{ id: 'CVE-2024-21538', severity: 'HIGH', pkg: 'cross-spawn' }],
  'node:22': [{ id: 'CVE-2024-21538', severity: 'HIGH', pkg: 'cross-spawn' }],
  debian: [{ id: 'CVE-2023-4863', severity: 'CRITICAL', pkg: 'libwebp' }],
  'debian:slim': [{ id: 'CVE-2023-4863', severity: 'CRITICAL', pkg: 'libwebp' }],
  'debian:bookworm-slim': [{ id: 'CVE-2023-4863', severity: 'CRITICAL', pkg: 'libwebp' }],
  ubuntu: [{ id: 'CVE-2023-4863', severity: 'CRITICAL', pkg: 'libwebp' }],
  'ubuntu:22.04': [{ id: 'CVE-2023-4863', severity: 'CRITICAL', pkg: 'libwebp' }],
  python: [{ id: 'CVE-2024-3094', severity: 'CRITICAL', pkg: 'xz-utils' }],
  'python:3.12': [{ id: 'CVE-2024-3094', severity: 'CRITICAL', pkg: 'xz-utils' }],
  nginx: [{ id: 'CVE-2024-7347', severity: 'MEDIUM', pkg: 'nginx-module-mp4' }],
  'nginx:1.27': [{ id: 'CVE-2024-7347', severity: 'MEDIUM', pkg: 'nginx-module-mp4' }],
};

/**
 * CVEs known for a base ref — exact match only (a `node:20-alpine` scanning
 * clean while bare `node`/`node:20` don't is the whole lesson, so this must
 * NOT fall back to the bare repo the way the size catalog does). `:latest` is
 * the one normalization: `docker pull node` and `FROM node` both resolve to
 * the same catalog entry either way the ref happens to be spelled.
 */
export function vulnerabilitiesFor(baseRef) {
  const key = String(baseRef || '').trim();
  return VULN_CATALOG[key] || VULN_CATALOG[key.replace(/:latest$/, '')] || [];
}

/** Short 12-hex layer/image id from a string, so cache keys are reproducible in a session. */
export function shortId(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  let out = '';
  for (let i = 0; i < 12; i++) { out += '0123456789abcdef'[h & 15]; h = (h >>> 4) || (h * 2654435761) >>> 0; }
  return out;
}

/** Format MB the way `docker images` does: kB / MB / GB. */
export function fmtSize(mb) {
  if (mb === 0) return '0B';
  if (mb < 1) return Math.round(mb * 1000) + 'kB';
  if (mb < 1024) return (mb < 10 ? mb.toFixed(2).replace(/\.?0+$/, '') : Math.round(mb)) + 'MB';
  return (mb / 1024).toFixed(2).replace(/\.?0+$/, '') + 'GB';
}
