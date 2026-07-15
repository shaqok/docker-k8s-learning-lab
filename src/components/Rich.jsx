/**
 * Renders the structured rich-text content in src/content/{en,ko}.js
 * (converted by scripts/convert-content.mjs) without dangerouslySetInnerHTML.
 *
 * A content value is either a plain string or an array of nodes;
 * a node is a string (text) or { t, cls?, st?, href?, c? }.
 */

const isBlank = (n) => typeof n === 'string' && !n.trim();

/** Concept/teaching card — a div.card (optionally accent-striped via `st`). */
function Card({ node }) {
  return (
    <div className={node.cls} style={node.st}>
      <Nodes nodes={node.c} />
    </div>
  );
}

/** Comparison table (table.cmp): rows under <tbody>, whitespace nodes dropped. */
function CmpTable({ node }) {
  const rows = (node.c || []).filter((n) => !isBlank(n));
  return (
    <table className={node.cls} style={node.st}>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className={row.cls} style={row.st}>
            {(row.c || []).filter((n) => !isBlank(n)).map((cell, j) => (
              <Node key={j} node={cell} />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Code/terminal block. */
function CodeBlock({ node }) {
  return (
    <pre className={node.cls} style={node.st}>
      <Nodes nodes={node.c} />
    </pre>
  );
}

function Node({ node }) {
  if (typeof node === 'string') return node;
  const { t, cls, st, href, c } = node;
  if (t === 'table') return <CmpTable node={node} />;
  if (t === 'pre') return <CodeBlock node={node} />;
  if (t === 'div' && cls && cls.split(' ').includes('card')) return <Card node={node} />;
  if (t === 'br') return <br />;
  const Tag = t;
  const extra = href ? { href, target: '_blank', rel: 'noreferrer' } : {};
  return (
    <Tag className={cls} style={st} {...extra}>
      {c && <Nodes nodes={c} />}
    </Tag>
  );
}

function Nodes({ nodes }) {
  return (nodes || []).map((n, i) => <Node key={i} node={n} />);
}

/**
 * Drop-in counterpart of Html for structured content:
 *   <Rich tag="h2" content={c.title} />       — wraps in <h2>
 *   <Rich content={c.vm} />                   — bare nodes (cards render themselves)
 * Strings render as text; arrays render as node trees.
 */
export default function Rich({ content, tag: Tag, className, style, ...rest }) {
  const body = typeof content === 'string' ? content : <Nodes nodes={content} />;
  if (!Tag && !className && !style && Object.keys(rest).length === 0 && typeof content !== 'string') {
    return body;
  }
  const El = Tag || 'div';
  return (
    <El className={className} style={style} {...rest}>
      {body}
    </El>
  );
}
