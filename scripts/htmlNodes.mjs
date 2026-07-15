/**
 * Restricted-HTML ↔ node-tree converter used by convert-content.mjs.
 *
 * The generated content files use a small, closed vocabulary:
 *   tags:  div h4 p b code table tr th td i pre span
 *   attrs: class, style (double-quoted)
 *   entities: &amp; &lt; &gt;
 *
 * Node model (what src/components/Rich.jsx renders):
 *   text    → plain JS string (entities decoded)
 *   element → { t: 'div', cls?: 'card', st?: { borderLeft: '…' }, c?: [nodes] }
 */

export const ALLOWED_TAGS = new Set(['div', 'h4', 'p', 'b', 'code', 'table', 'tr', 'th', 'td', 'i', 'pre', 'span', 'ul', 'li', 'br', 'a', 'em']);

export function decodeEntities(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

export function encodeEntities(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 'border-left:4px solid var(--green);color:red' → { borderLeft: '…', color: 'red' } */
export function styleToObject(style) {
  const out = {};
  for (const decl of style.split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim();
    const val = decl.slice(idx + 1).trim();
    if (!prop) continue;
    out[prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = val;
  }
  return out;
}

function objectToStyle(st) {
  return Object.entries(st)
    .map(([k, v]) => k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) + ':' + v)
    .join(';');
}

/** Parse a restricted-HTML string into a node array. Throws on anything outside the vocabulary. */
export function parseHtml(html) {
  const root = { c: [] };
  const stack = [root];
  const tagRe = /<(\/?)([a-zA-Z0-9]+)((?:\s+[a-zA-Z-]+="[^"]*")*)\s*(\/?)>/g;
  let last = 0;
  let m;
  while ((m = tagRe.exec(html))) {
    if (m.index > last) {
      const text = decodeEntities(html.slice(last, m.index));
      if (text) stack[stack.length - 1].c.push(text);
    }
    last = tagRe.lastIndex;
    const [, closing, rawTag, rawAttrs, selfClose] = m;
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) throw new Error(`unexpected tag <${tag}> in: ${html.slice(m.index, m.index + 80)}`);
    if (closing) {
      const open = stack.pop();
      if (!open || open.t !== tag) throw new Error(`mismatched </${tag}> (open: <${open && open.t}>)`);
      continue;
    }
    const node = { t: tag };
    for (const am of rawAttrs.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) {
      const [, name, value] = am;
      if (name === 'class') node.cls = value;
      else if (name === 'style') node.st = styleToObject(decodeEntities(value));
      else if (name === 'href') node.href = decodeEntities(value);
      else throw new Error(`unexpected attribute ${name} on <${tag}>`);
    }
    if (tag === 'br' || selfClose) {
      stack[stack.length - 1].c.push(node);
      continue;
    }
    node.c = [];
    stack[stack.length - 1].c.push(node);
    stack.push(node);
  }
  if (last < html.length) {
    const text = decodeEntities(html.slice(last));
    if (text) stack[stack.length - 1].c.push(text);
  }
  if (stack.length !== 1) throw new Error(`unclosed <${stack[stack.length - 1].t}>`);
  return root.c;
}

/** Serialize a node array back to HTML — used only for the round-trip self-check. */
export function serializeNodes(nodes) {
  return nodes
    .map((n) => {
      if (typeof n === 'string') return encodeEntities(n);
      let attrs = '';
      if (n.cls) attrs += ` class="${n.cls}"`;
      if (n.st) attrs += ` style="${objectToStyle(n.st)}"`;
      if (n.href) attrs += ` href="${n.href}"`;
      if (n.t === 'br') return `<br>`;
      return `<${n.t}${attrs}>${serializeNodes(n.c || [])}</${n.t}>`;
    })
    .join('');
}
