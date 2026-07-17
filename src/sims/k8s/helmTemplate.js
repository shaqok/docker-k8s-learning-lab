/**
 * Mini Helm/Go-template interpreter (improvement-plan step 16) — enough to make
 * values.yaml genuinely drive rendered manifests: dotted-path substitution,
 * {{ if }}/{{ else }}/{{ end }}, and {{ range }}/{{ end }} with real scope
 * rebinding of `.` to the loop item (and the real Helm gotcha where `.Values`
 * INSIDE a range no longer refers to the root — `$.Values.x` does). Not a
 * general Go-template engine: no pipelines, no user functions, no `with`.
 */
import { loadAll, load } from 'js-yaml';
import { deepMerge } from './diff.js';

const ACTION_RE = /{{\s*(.*?)\s*}}/g;

function tokenize(str) {
  const tokens = [];
  let last = 0;
  let m;
  ACTION_RE.lastIndex = 0;
  while ((m = ACTION_RE.exec(str))) {
    if (m.index > last) tokens.push({ type: 'text', value: str.slice(last, m.index) });
    tokens.push({ type: 'action', raw: m[1] });
    last = ACTION_RE.lastIndex;
  }
  if (last < str.length) tokens.push({ type: 'text', value: str.slice(last) });
  return tokens;
}

/** Recursive-descent parse of the flat token list into a node tree. Throws on unmatched if/range. */
function parse(tokens) {
  let i = 0;
  function parseUntil(stopWords) {
    const nodes = [];
    while (i < tokens.length) {
      const t = tokens[i];
      if (t.type === 'text') { nodes.push({ type: 'text', value: t.value }); i++; continue; }
      const word = t.raw.split(/\s+/)[0];
      if (stopWords.has(word)) return nodes;
      if (word === 'if') {
        i++;
        const cond = t.raw.slice(2).trim();
        const thenNodes = parseUntil(new Set(['else', 'end']));
        let elseNodes = [];
        if (tokens[i] && tokens[i].raw.trim() === 'else') { i++; elseNodes = parseUntil(new Set(['end'])); }
        if (!tokens[i] || tokens[i].raw.trim() !== 'end') throw new Error(`{{ if ${cond} }} is missing its {{ end }}`);
        i++;
        nodes.push({ type: 'if', cond, thenNodes, elseNodes });
        continue;
      }
      if (word === 'range') {
        i++;
        const listExpr = t.raw.slice(5).trim();
        const body = parseUntil(new Set(['end']));
        if (!tokens[i] || tokens[i].raw.trim() !== 'end') throw new Error(`{{ range ${listExpr} }} is missing its {{ end }}`);
        i++;
        nodes.push({ type: 'range', listExpr, body });
        continue;
      }
      if (word === 'else' || word === 'end') throw new Error(`unexpected {{ ${word} }} with no matching {{ if }}/{{ range }}`);
      nodes.push({ type: 'interp', expr: t.raw });
      i++;
    }
    return nodes;
  }
  const nodes = parseUntil(new Set());
  if (i < tokens.length) throw new Error('unexpected {{ end }} or {{ else }}');
  return nodes;
}

/** Walk a dotted path (".Values.a.b", ".", "$.Release.Name") against {root, dot}. */
function resolve(expr, ctx) {
  const fromRoot = expr.startsWith('$');
  const path = fromRoot ? expr.slice(1) : expr;
  let cur = fromRoot ? ctx.root : ctx.dot;
  if (path === '' || path === '.') return cur;
  for (const seg of path.replace(/^\./, '').split('.')) {
    if (cur == null) return undefined;
    cur = cur[seg];
  }
  return cur;
}

function truthy(v) {
  if (v == null || v === false || v === '' || v === 0) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

function resolveArg(tok, ctx) {
  if ((tok.startsWith('"') && tok.endsWith('"')) || (tok.startsWith("'") && tok.endsWith("'"))) return tok.slice(1, -1);
  if (tok === 'true') return true;
  if (tok === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(tok)) return Number(tok);
  return resolve(tok, ctx);
}

function evalCond(cond, ctx) {
  const parts = cond.trim().split(/\s+/);
  if (parts[0] === 'not') return !truthy(resolveArg(parts[1], ctx));
  if (parts[0] === 'eq') return String(resolveArg(parts[1], ctx)) === String(resolveArg(parts[2], ctx));
  if (parts[0] === 'ne') return String(resolveArg(parts[1], ctx)) !== String(resolveArg(parts[2], ctx));
  return truthy(resolveArg(parts[0], ctx));
}

function toStr(v) {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function renderNodes(nodes, ctx) {
  let out = '';
  for (const n of nodes) {
    if (n.type === 'text') out += n.value;
    else if (n.type === 'interp') out += toStr(resolve(n.expr, ctx));
    else if (n.type === 'if') out += renderNodes(evalCond(n.cond, ctx) ? n.thenNodes : n.elseNodes, ctx);
    else if (n.type === 'range') {
      const list = resolve(n.listExpr, ctx);
      const items = Array.isArray(list) ? list : list && typeof list === 'object' ? Object.values(list) : [];
      for (const item of items) out += renderNodes(n.body, { root: ctx.root, dot: item });
    }
  }
  return out;
}

/** Render one template string against {Values, Release, Chart}. Returns {text} or {error}. */
export function renderTemplateString(str, values) {
  try {
    const nodes = parse(tokenize(str));
    return { text: renderNodes(nodes, { root: values, dot: values }) };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Render a whole chart directory (flat file-store keys `${chartDir}/Chart.yaml`,
 * `${chartDir}/values.yaml`, `${chartDir}/templates/*.yaml`) against merged
 * values. Returns {docs} (parsed manifest objects, empty-rendered templates
 * silently dropped) or {error} — a render error touches nothing (atomic).
 */
export function renderChart(files, chartDir, { releaseName, namespace = 'default', valuesOverride = {} } = {}) {
  const chartText = files.read(`${chartDir}/Chart.yaml`);
  if (!chartText) return { error: `Chart.yaml not found at ${chartDir}/Chart.yaml` };
  let chartMeta;
  try { chartMeta = load(chartText) || {}; } catch (e) { return { error: 'Chart.yaml: ' + e.message }; }
  if (!chartMeta.name) return { error: 'Chart.yaml: name is required' };

  const valuesText = files.read(`${chartDir}/values.yaml`);
  let defaultValues = {};
  if (valuesText) {
    try { defaultValues = load(valuesText) || {}; } catch (e) { return { error: 'values.yaml: ' + e.message }; }
  }
  const values = deepMerge(defaultValues, valuesOverride);

  const prefix = `${chartDir}/templates/`;
  const templateNames = files.list().filter((n) => n.startsWith(prefix) && /\.ya?ml$/.test(n)).sort();
  if (!templateNames.length) return { error: `no templates found under ${prefix}` };

  const ctx = { Values: values, Release: { Name: releaseName, Namespace: namespace }, Chart: { Name: chartMeta.name, Version: chartMeta.version || '' } };
  const docs = [];
  for (const name of templateNames) {
    const { text, error } = renderTemplateString(files.read(name), ctx);
    if (error) return { error: `${name}: ${error}` };
    if (!text.trim()) continue; // an {{ if false }}-guarded whole file renders to nothing
    let parsed;
    try { parsed = loadAll(text); } catch (e) { return { error: `${name}: ${e.message}` }; }
    for (const doc of parsed) if (doc) docs.push(doc);
  }
  return { docs };
}
