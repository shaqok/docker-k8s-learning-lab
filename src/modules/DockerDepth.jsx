import { useState } from 'react';
import Html from '../components/Html.jsx';
import Rich from '../components/Rich.jsx';
import PracticeLink from '../components/PracticeLink.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { tr } from '../i18n/dynamic.js';
import { content } from '../content/index.js';

const MS_RESULT = `<div style="font-family:ui-monospace,Menlo,monospace;font-size:12px">
  <div>naive single-stage:&nbsp; <b style="color:var(--red)">1.34 GB</b><div class="rmbar" style="margin:2px 0 8px"><div style="width:100%;background:var(--red)"></div></div></div>
  <div>multi-stage final:&nbsp;&nbsp; <b style="color:var(--green)">15.2 MB</b> (−98.9%)<div class="rmbar" style="margin:2px 0"><div style="width:2%;background:var(--green)"></div></div></div></div>`;

/* ---------- layer-cache demo ---------- */

// [instruction, seconds] — the 40s npm ci is the whole lesson
const LAYERS = {
  bad: [
    ['FROM node:20-alpine', 0],
    ['COPY . .', 0.5],
    ['RUN npm ci', 40],
    ['CMD ["node","app.js"]', 0],
  ],
  good: [
    ['FROM node:20-alpine', 0],
    ['COPY package.json .', 0.1],
    ['RUN npm ci', 40],
    ['COPY . .', 0.5],
    ['CMD ["node","app.js"]', 0],
  ],
};
// index of the layer whose content changes when app.js is edited
const SRC_LAYER = { bad: 1, good: 3 };

const CACHE_NARR = {
  first: 'First build — no cache yet, every layer runs. npm ci alone takes 40s.',
  clean: 'Nothing changed — every layer CACHED. 0.0s.',
  bad: 'One source edit busted the cache at COPY . . — and every layer below it, including the 40s npm ci. You pay 40.5s for every edit.',
  good: "package.json didn't change, so npm ci stayed CACHED. Only COPY . . re-ran: 0.6s. Same image, ~70× faster feedback.",
  reorder: 'Dockerfile reordered — new instruction order means new cache keys, so the next build runs everything once. After that, edits are cheap.',
  edit: 'app.js edited — the next build will show which layers survive.',
};

/** Edit-and-rebuild loop over the two Dockerfile orders — the cache-bust lesson. */
function CacheDemo({ c, lang }) {
  const [order, setOrder] = useState('bad');
  const [srcV, setSrcV] = useState(0);
  const [prev, setPrev] = useState(null); // { order, srcV } of the last build
  const [rows, setRows] = useState(null); // [{ instr, secs, cached }]
  const [narr, setNarr] = useState(null);

  const build = () => {
    const layers = LAYERS[order];
    const sameStack = prev && prev.order === order;
    const dirtyAt = sameStack ? (prev.srcV !== srcV ? SRC_LAYER[order] : layers.length) : 0;
    setRows(layers.map(([instr, secs], i) => ({ instr, secs, cached: i < dirtyAt })));
    setPrev({ order, srcV });
    setNarr(!sameStack ? CACHE_NARR.first : dirtyAt >= layers.length ? CACHE_NARR.clean : CACHE_NARR[order]);
  };

  const flip = () => {
    setOrder((o) => (o === 'bad' ? 'good' : 'bad'));
    setRows(null);
    setNarr(CACHE_NARR.reorder);
  };

  const total = rows ? rows.reduce((s, r) => s + (r.cached ? 0 : r.secs), 0) : null;

  return (
    <>
      <Rich tag="h4" style={{ marginTop: 18 }} content={c.cacheDemoTitle} />
      <Rich tag="p" content={c.cacheDemoIntro} />
      <div>
        <button className="act" onClick={() => { setSrcV((v) => v + 1); setNarr(CACHE_NARR.edit); }}>
          {c.cacheDemoBtns[0]}
        </button>
        <button className="act primary" onClick={build}>{c.cacheDemoBtns[1]}</button>
        <label style={{ marginLeft: 8, fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={order === 'good'} onChange={flip} /> {c.cacheDemoOrder}
        </label>
      </div>
      <pre className="code" style={{ marginTop: 8 }}>
        {LAYERS[order].map(([instr, secs], i) => {
          const r = rows && rows[i];
          const status = !r ? '' : r.cached ? 'CACHED' : secs >= 1 ? `${secs.toFixed(0)}s` : `${secs.toFixed(1)}s`;
          return (
            <span key={i} style={{ display: 'block' }}>
              {instr.padEnd(24)}
              <span style={{ color: !r ? 'var(--muted)' : r.cached ? 'var(--green)' : 'var(--red)' }}>{status}</span>
            </span>
          );
        })}
        {total != null && (
          <span style={{ display: 'block', marginTop: 4, color: total > 10 ? 'var(--red)' : 'var(--green)' }}>
            {c.cacheTimeLabel}: {total.toFixed(1)}s
          </span>
        )}
      </pre>
      <div className="hint" style={{ minHeight: 40 }}>
        {narr ? <Html tag="span" html={tr(lang, narr)} /> : <Rich tag="span" content={c.cacheDemoHint0} />}
      </div>
    </>
  );
}

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
        <PracticeLink
          to="m16"
          sub="slim"
          blurb={{ en: 'Slim a real image under 60 MB with a multi-stage build', ko: '멀티 스테이지 빌드로 이미지를 60MB 아래로 줄여 보기' }}
        />
      </div>

      <div className="card">
        {/* cacheCard is a single card — render its body here so the widget joins it */}
        <Rich content={c.cacheCard[0].c} />
        <CacheDemo c={c} lang={lang} />
        <PracticeLink
          to="m16"
          sub="build"
          blurb={{ en: 'Reorder a real Dockerfile until npm ci stays CACHED', ko: '진짜 Dockerfile을 재배치해 npm ci를 CACHED로 유지하기' }}
        />
      </div>

      <div className="card">
        <Rich content={c.dataCard[0].c} />
        <PracticeLink
          to="m16"
          sub="volumes"
          blurb={{ en: 'Prove data survives docker rm with a mounted volume', ko: '볼륨 마운트로 docker rm 후에도 데이터가 사는지 증명하기' }}
        />
      </div>

      <div className="card">
        <Rich content={c.netCard[0].c} />
        <PracticeLink
          to="m16"
          sub="networks"
          blurb={{ en: 'See DNS work on a user-defined network — and fail on bridge', ko: '사용자 정의 네트워크의 DNS 동작 — bridge에선 실패 — 확인하기' }}
        />
      </div>

      <div className="card">
        <Rich content={c.composeCard[0].c} />
        <PracticeLink
          to="m16"
          sub="compose"
          blurb={{ en: 'Bring a web+api+db stack up with one compose command', ko: 'compose 명령 하나로 web+api+db 스택 띄워 보기' }}
        />
      </div>

      <div className="card">
        <Rich content={c.registryCard[0].c} />
        <PracticeLink
          to="m20"
          sub="supply-chain"
          blurb={{ en: 'Tags, digests, scanning, signing — then gate a cluster on it', ko: '태그·다이제스트·스캔·서명 — 그리고 클러스터 입장 통제까지' }}
        />
      </div>
    </>
  );
}
