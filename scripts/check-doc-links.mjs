/**
 * Check every "in the real docs" link still resolves.
 *
 * Doc links are spread across the drill labs, the troubleshooting scenarios,
 * the exam tasks and the per-domain quiz table, and they rot silently as
 * kubernetes.io restructures — a dead link is invisible until a learner clicks
 * it, in a feature whose whole point is "find it in the real docs".
 *
 * This hits the network, so it is deliberately NOT part of `npm test`
 * (the suite must stay offline and fast). Run it before shipping doc changes:
 *
 *   npm run check:docs
 */

import { SCENARIOS } from '../src/data/scenarios.js';
import { EXAM_SETS } from '../src/data/examTasks.js';
import { DOMAIN_DOCS } from '../src/data/docLinks.js';

const LAB_MODULES = [
  ['ckadLabs.js', 'CKAD_LABS'], ['ckaLabs.js', 'CKA_LABS'], ['netLabs.js', 'NET_LABS'],
  ['opsLabs.js', 'OPS_LABS'], ['dockerLabs.js', 'DOCKER_LABS'], ['podLabs.js', 'POD_LABS'],
  ['storageLabs.js', 'STORAGE_LABS'], ['packagingLabs.js', 'PACKAGING_LABS'],
  ['securityLabs.js', 'SECURITY_LABS'], ['obsLabs.js', 'OBS_LABS'],
];

/** url -> the places that link to it, so a failure names what to edit. */
async function collect() {
  const where = new Map();
  const add = (url, src) => where.set(url, [...(where.get(url) || []), src]);

  for (const s of SCENARIOS) for (const d of s.docs || []) add(d.url, `scenario ${s.id}`);
  for (const [exam, set] of Object.entries(EXAM_SETS))
    for (const t of set.tasks) for (const d of t.docs || []) add(d.url, `${exam} task ${t.id}`);
  for (const [domain, docs] of Object.entries(DOMAIN_DOCS))
    for (const d of docs) add(d.url, `docLinks ${domain}`);
  for (const [file, key] of LAB_MODULES) {
    const mod = await import(`../src/data/${file}`);
    for (const lab of mod[key]) for (const d of lab.docs || []) add(d.url, `${file} ${lab.id}`);
  }
  return where;
}

const where = await collect();
const urls = [...where.keys()];
console.log(`checking ${urls.length} doc links…\n`);

const results = await Promise.all(urls.map(async (url) => {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
    return { url, ok: res.ok, status: res.status };
  } catch (e) {
    return { url, ok: false, status: e.name === 'TimeoutError' ? 'timeout' : 'error' };
  }
}));

const bad = results.filter((r) => !r.ok);
for (const r of bad) console.log(`${r.status}  ${r.url}\n      ← ${where.get(r.url).join(', ')}`);

console.log(bad.length ? `\n${bad.length} broken link(s).` : '\nall doc links resolve.');
process.exit(bad.length ? 1 : 0);
