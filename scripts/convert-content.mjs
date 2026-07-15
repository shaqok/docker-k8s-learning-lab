/**
 * One-time migration: src/content/{en,ko}.js from HTML strings to structured
 * node trees rendered by src/components/Rich.jsx (plan step 10).
 *
 *   node scripts/convert-content.mjs
 *
 * Rules:
 *  - every string is parsed with the restricted-HTML parser (entities decoded);
 *    markup-free strings stay plain strings, marked-up ones become node arrays
 *  - `greeting` values stay raw HTML strings — they flow into Terminal.print(),
 *    whose output contract is HTML (same as the sims)
 *  - mission items { id, html } become { id, text: <nodes> }
 *
 * Each conversion is self-checked: serialize(nodes) must re-parse to an equal
 * tree, and the tag count + visible text must match the original.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert';
import { parseHtml, serializeNodes, decodeEntities } from './htmlNodes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const RAW_HTML_KEYS = new Set(['greeting']);

const textOf = (nodes) =>
  nodes.map((n) => (typeof n === 'string' ? n : n.c ? textOf(n.c) : '')).join('');

function convertString(s, keyPath) {
  const nodes = parseHtml(s);
  // self-check: round-trip stability + no content loss
  assert.deepStrictEqual(parseHtml(serializeNodes(nodes)), nodes, `round-trip drift at ${keyPath}`);
  const plainOriginal = decodeEntities(s.replace(/<[^>]+>/g, ''));
  assert.strictEqual(textOf(nodes), plainOriginal, `text drift at ${keyPath}`);
  const tagCount = (s.match(/<[a-zA-Z]/g) || []).length;
  const nodeCount = (function count(ns) {
    return ns.reduce((k, n) => k + (typeof n === 'string' ? 0 : 1 + count(n.c || [])), 0);
  })(nodes);
  assert.strictEqual(nodeCount, tagCount, `tag-count drift at ${keyPath}`);

  if (nodes.length === 0) return '';
  if (nodes.length === 1 && typeof nodes[0] === 'string') return nodes[0];
  return nodes;
}

function convertValue(v, keyPath) {
  if (typeof v === 'string') {
    const key = keyPath.split('.').pop();
    return RAW_HTML_KEYS.has(key) ? v : convertString(v, keyPath);
  }
  if (Array.isArray(v)) return v.map((x, i) => convertValue(x, keyPath + '.' + i));
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (k === 'html') out.text = convertValue(x, keyPath + '.html');
      else out[k] = convertValue(x, keyPath + '.' + k);
    }
    return out;
  }
  return v;
}

async function convertFile(lang) {
  const file = path.join(ROOT, 'src/content', lang + '.js');
  const src = readFileSync(file, 'utf8');
  if (!src.includes('static rich-text content')) {
    console.log(`${lang}.js already converted — skipping`);
    return;
  }
  const data = (await import(file)).default;
  const converted = convertValue(data, lang);
  const header =
    `/* AUTO-GENERATED — structured rich-text content (${lang}).\n` +
    ` * Node trees rendered by src/components/Rich.jsx; converted from the\n` +
    ` * legacy HTML strings by scripts/convert-content.mjs. Edit content here\n` +
    ` * (text nodes are plain strings; elements are { t, cls?, st?, c? }). */\n`;
  writeFileSync(file, header + 'export default ' + JSON.stringify(converted, null, 1) + ';\n');
  console.log(`${lang}.js converted`);
}

await convertFile('en');
await convertFile('ko');
console.log('OK');
