/** Test helpers: run sim commands and capture printed lines as plain text. */

export const strip = (html) =>
  String(html)
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** Wraps a sim's exec(cmd, print) into run(cmd) → captured text of that call. */
export function makeRunner(sim) {
  const all = [];
  return {
    all,
    run(cmd) {
      const lines = [];
      const print = (html, cls = 'out') => {
        const text = strip(html);
        lines.push({ text, cls });
        all.push({ text, cls });
      };
      sim.exec(cmd, print);
      return {
        lines,
        text: lines.map((l) => l.text).join('\n'),
        errors: lines.filter((l) => l.cls === 'err').map((l) => l.text),
      };
    },
  };
}
