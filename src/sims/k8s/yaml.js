/** Tiny YAML *serializer* for -o yaml output (parsing uses js-yaml). */

const PLAIN = /^[a-zA-Z0-9_][a-zA-Z0-9_./:-]*$/;

function scalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  if (s === '' || !PLAIN.test(s) || /^(true|false|null|yes|no|on|off)$/i.test(s) || /^[\d.]+$/.test(s))
    return JSON.stringify(s);
  return s;
}

export function toYaml(v, indent = 0) {
  const pad = '  '.repeat(indent);
  if (Array.isArray(v)) {
    if (!v.length) return pad + '[]';
    return v
      .map((item) => {
        if (item !== null && typeof item === 'object') {
          const body = toYaml(item, indent + 1);
          return pad + '-' + body.slice(pad.length + 1); // hoist first line onto the dash
        }
        return pad + '- ' + scalar(item);
      })
      .join('\n');
  }
  if (v !== null && typeof v === 'object') {
    const keys = Object.keys(v).filter((k) => v[k] !== undefined);
    if (!keys.length) return pad + '{}';
    return keys
      .map((k) => {
        const val = v[k];
        if (val !== null && typeof val === 'object' && (Array.isArray(val) ? val.length : Object.keys(val).length))
          return pad + k + ':\n' + toYaml(val, indent + 1);
        if (val !== null && typeof val === 'object') return pad + k + ': ' + (Array.isArray(val) ? '[]' : '{}');
        return pad + k + ': ' + scalar(val);
      })
      .join('\n');
  }
  return pad + scalar(v);
}
