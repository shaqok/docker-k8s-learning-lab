import { useEffect, useRef, useState } from 'react';

/**
 * Plain-textarea YAML editor over the sim's in-app file store.
 * The terminal reads the same files: kubectl apply -f <name>.
 * `kubectl edit` and `... > file.yaml` redirects open files here via sim.setOnEdit.
 */
export default function ManifestEditor({ sim, lang, cmdHint }) {
  const files = sim.files;
  const [names, setNames] = useState(files.list());
  const [active, setActive] = useState(names[0] || null);
  const [text, setText] = useState(active ? files.read(active) || '' : '');
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const unsub = files.subscribe(() => {
      setNames(files.list());
      const cur = activeRef.current;
      if (cur != null) {
        const stored = files.read(cur);
        if (stored != null) setText((t) => (t === stored ? t : stored));
      }
    });
    sim.setOnEdit((fname) => { setActive(fname); setText(files.read(fname) || ''); });
    return () => { unsub(); sim.setOnEdit(null); };
  }, [sim, files]);

  const open = (name) => { setActive(name); setText(files.read(name) || ''); };
  const onChange = (e) => { setText(e.target.value); if (active) files.write(active, e.target.value); };

  const newFile = () => {
    const name = prompt(lang === 'ko' ? '파일 이름 (예: deploy.yaml)' : 'File name (e.g. deploy.yaml)');
    if (!name) return;
    const clean = name.trim().replace(/[^\w./-]/g, '');
    if (!clean) return;
    if (files.read(clean) == null) files.write(clean, 'apiVersion: \nkind: \nmetadata:\n  name: \nspec:\n');
    open(clean);
  };

  const delFile = () => {
    if (!active) return;
    if (!confirm((lang === 'ko' ? '삭제할까요: ' : 'Delete ') + active + '?')) return;
    files.remove(active);
    const rest = files.list();
    setNames(rest);
    if (rest.length) open(rest[0]);
    else { setActive(null); setText(''); }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.target;
      const { selectionStart: s, selectionEnd: en, value } = el;
      const next = value.slice(0, s) + '  ' + value.slice(en);
      setText(next);
      if (active) files.write(active, next);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2; });
    }
  };

  return (
    <div className="manifests">
      <div className="manifests-head">
        <span className="mf-title">📝 {lang === 'ko' ? '매니페스트' : 'Manifests'} <span className="mf-hint">~/{active || ''} — {cmdHint ? cmdHint : `kubectl apply -f ${active || 'FILE'}`}</span></span>
        <span>
          <button className="act mf-btn" onClick={newFile}>+ {lang === 'ko' ? '새 파일' : 'new file'}</button>
          {active && <button className="act mf-btn" onClick={delFile}>🗑</button>}
        </span>
      </div>
      <div className="mf-tabs">
        {names.map((n) => (
          <button key={n} className={'mf-tab' + (n === active ? ' active' : '')} onClick={() => open(n)}>{n}</button>
        ))}
      </div>
      {active != null ? (
        <textarea
          className="mf-editor"
          spellCheck={false}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder={lang === 'ko' ? 'YAML을 여기에 작성하고 터미널에서 kubectl apply -f 하세요' : 'Write YAML here, then kubectl apply -f it in the terminal'}
        />
      ) : (
        <div className="mf-empty">{lang === 'ko' ? '파일이 없습니다 — 새 파일을 만들거나 터미널에서 "kubectl create deployment web --image=nginx --dry-run=client -o yaml > web.yaml" 을 실행해 보세요.' : 'No files — create one, or in the terminal try: kubectl create deployment web --image=nginx --dry-run=client -o yaml > web.yaml'}</div>
      )}
    </div>
  );
}
