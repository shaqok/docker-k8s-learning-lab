import { useState } from 'react';
import Html from '../components/Html.jsx';
import Rich from '../components/Rich.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { tr } from '../i18n/dynamic.js';
import { content } from '../content/index.js';

const MS_RESULT = `<div style="font-family:ui-monospace,Menlo,monospace;font-size:12px">
  <div>naive single-stage:&nbsp; <b style="color:var(--red)">1.34 GB</b><div class="rmbar" style="margin:2px 0 8px"><div style="width:100%;background:var(--red)"></div></div></div>
  <div>multi-stage final:&nbsp;&nbsp; <b style="color:var(--green)">15.2 MB</b> (−98.9%)<div class="rmbar" style="margin:2px 0"><div style="width:2%;background:var(--green)"></div></div></div></div>`;

/** Stage 2 — multi-stage builds, caching, volumes, networking, compose, registries. */
export default function DockerDepth() {
  const { lang } = useLang();
  const c = content[lang].m7;
  const [built, setBuilt] = useState(false);

  return (
    <>
      <Rich tag="h2" content={c.title} />
      <Rich tag="p" className="sub" content={c.sub} />

      <div className="card">
        <Rich tag="h4" content={c.msTitle} />
        <div className="grid2">
          <Rich content={c.msPre} />
          <div>
            <button className="act primary" onClick={() => setBuilt(true)}>
              {lang === 'ko' ? '▶ 두 방식으로 빌드' : '▶ Build both ways'}
            </button>
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)' }}>
              {built ? (
                <Html html={tr(lang, MS_RESULT)} />
              ) : (
                <span>{lang === 'ko' ? '이미지 크기를 비교해 보세요.' : 'Compare the image sizes.'}</span>
              )}
            </div>
            <Rich tag="p" className="hint" content={c.msHint} />
          </div>
        </div>
      </div>

      {c.cards.map((nodes, i) => (
        <Rich key={i} content={nodes} />
      ))}
    </>
  );
}
