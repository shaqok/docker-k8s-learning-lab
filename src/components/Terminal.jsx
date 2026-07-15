import { useCallback, useEffect, useRef, useState } from 'react';
import { useLang } from '../i18n/LanguageContext.jsx';
import { tr } from '../i18n/dynamic.js';
import { esc } from '../sims/util.js';

/**
 * Reusable simulated terminal.
 * onCommand(cmd, print) receives every non-`clear` command;
 * print(html, cls) appends a line (teaching notes get translated via tr()).
 * Pass `printRef` to let a parent write into the terminal too (see LabRunner's
 * "solve it for me", which replays the reference solution command by command).
 */
export default function Terminal({ headText, placeholder, greeting, onCommand, printRef }) {
  const { lang } = useLang();
  const langRef = useRef(lang);
  langRef.current = lang;

  const [lines, setLines] = useState([]);
  const [value, setValue] = useState('');
  const hist = useRef([]);
  const hi = useRef(0);
  const bodyRef = useRef(null);
  const greeted = useRef(false);

  const print = useCallback((txt, cls = 'out') => {
    setLines((l) => [...l, { html: tr(langRef.current, txt), cls }]);
  }, []);

  if (printRef) printRef.current = print;

  useEffect(() => {
    if (!greeted.current) { greeted.current = true; print(greeting, 'info'); }
  }, [greeting, print]);

  useEffect(() => {
    const b = bodyRef.current;
    if (b) b.scrollTop = b.scrollHeight;
  }, [lines]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      const cmd = value.trim();
      setValue('');
      if (!cmd) return;
      hist.current.push(cmd);
      hi.current = hist.current.length;
      if (cmd === 'clear') { setLines([]); return; }
      print("<span style='color:var(--green)'>$</span> " + esc(cmd), 'cmd');
      onCommand(cmd, print);
    } else if (e.key === 'ArrowUp') {
      if (hi.current > 0) { hi.current--; setValue(hist.current[hi.current]); e.preventDefault(); }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (hi.current < hist.current.length - 1) { hi.current++; setValue(hist.current[hi.current]); }
      else { hi.current = hist.current.length; setValue(''); }
    }
  };

  return (
    <div className="term">
      <div className="term-head">
        <span className="dot" style={{ background: '#f85149' }} />
        <span className="dot" style={{ background: '#d29922' }} />
        <span className="dot" style={{ background: '#3fb950' }} /> {headText}
      </div>
      <div className="term-body" ref={bodyRef} onClick={(e) => e.currentTarget.parentElement.querySelector('input')?.focus()}>
        {lines.map((l, i) => (
          <div key={i} className={l.cls} dangerouslySetInnerHTML={{ __html: l.html }} />
        ))}
      </div>
      <div className="term-input">
        <span className="prompt">$</span>
        <input
          type="text"
          spellCheck={false}
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
}
