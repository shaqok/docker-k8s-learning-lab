import { useState } from 'react';
import Html from '../components/Html.jsx';
import Rich from '../components/Rich.jsx';
import PracticeLink from '../components/PracticeLink.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { tr } from '../i18n/dynamic.js';
import { content } from '../content/index.js';

const DOCKERFILE = ['FROM python:3.12-slim', 'RUN pip install flask', 'COPY app.py /app/app.py', 'CMD ["python","/app/app.py"]'];

const LAYER_MSGS = [
  "FROM pulls the base image — you start from someone else's layers.",
  'RUN executes a command and snapshots the filesystem diff as a new layer.',
  'COPY adds your files — tiny layer. Order matters: put rarely-changing steps first so the cache survives code edits.',
  'CMD adds no files, only metadata: the default command to run.',
  "docker run adds ONE thin writable layer. 100 containers from one image share the read-only layers — that's the space magic.",
];

const LC = {
  created: '<b>Created</b>: filesystem prepared, process NOT started yet. (docker run = create + start in one go.)',
  running: "<b>Running</b>: the container's main process (PID 1) is alive. When PID 1 exits, the container exits.",
  exited: '<b>Exited</b>: docker sent SIGTERM, waited 10s, then SIGKILL. Filesystem still exists — logs readable, restartable.',
  removed: '<b>Removed</b>: writable layer deleted. Anything not in a volume is gone forever. The image is untouched.',
  errNo: "<span style='color:var(--red)'>Error: no such container — create it first.</span>",
  errNotRunning: "<span style='color:var(--red)'>Error: container is not running.</span>",
  errRunning: "<span style='color:var(--red)'>Error: cannot remove a running container — stop it first (or use -f).</span>",
  errGone: "<span style='color:var(--red)'>Error: no such container.</span>",
};

function LayersDemo({ c, lang }) {
  const [step, setStep] = useState(0);

  const advance = () => { if (step < 5) setStep(step + 1); };
  const reset = () => setStep(0);

  return (
    <div className="card">
      <Rich tag="h4" content={c.layersTitle} />
      <Rich tag="p" content={c.layersIntro} />
      <div className="grid2">
        <div>
          <pre style={{ background: '#010409', border: '1px solid var(--border)', borderRadius: 8, padding: 12, fontSize: 12, lineHeight: 1.9 }}>
            {DOCKERFILE.map((line, i) => (
              <span key={i} style={{ display: 'block', background: step - 1 === i ? 'rgba(88,166,255,.18)' : 'transparent' }}>{line}</span>
            ))}
          </pre>
          <button className="act primary" onClick={advance}>
            {step === 5 ? tr(lang, '✓ Built + running') : <Rich tag="span" content={c.layersBtn} />}
          </button>
          <button className="act" onClick={reset}>{c.layersReset}</button>
        </div>
        <div>
          <div className="layerstack">
            {c.layerLabels.map((label, i) => (
              <Rich
                key={i}
                className={'layer ' + (i === 4 ? 'rw' : 'ro') + (i < step ? ' show' : '')}
                style={i === 3 ? { borderStyle: 'dashed' } : undefined}
                content={label}
              />
            ))}
          </div>
          {step === 0
            ? <Rich tag="p" className="hint" content={c.layersHint0} />
            : <Html tag="p" className="hint" html={tr(lang, LAYER_MSGS[step - 1])} />}
        </div>
      </div>
    </div>
  );
}

function LifecycleDemo({ c, lang }) {
  const [state, setState] = useState('none');
  const [msg, setMsg] = useState(null);

  const act = (a) => {
    if (a === 'create') { setState('created'); setMsg(LC.created); }
    else if (a === 'start') {
      if (state === 'created' || state === 'exited') { setState('running'); setMsg(LC.running); }
      else setMsg(LC.errNo);
    } else if (a === 'stop') {
      if (state === 'running') { setState('exited'); setMsg(LC.exited); }
      else setMsg(LC.errNotRunning);
    } else if (a === 'rm') {
      if (state === 'exited') { setState('removed'); setMsg(LC.removed); }
      else if (state === 'running') setMsg(LC.errRunning);
      else setMsg(LC.errGone);
    }
  };

  return (
    <div className="card">
      <Rich tag="h4" content={c.lcTitle} />
      <div className="lifecycle">
        {['created', 'running', 'exited', 'removed'].map((s, i) => (
          <span key={s} style={{ display: 'contents' }}>
            {i > 0 && <span className="larrow">→</span>}
            <div className={'lstate' + (state === s ? ' on' : '')}>{s[0].toUpperCase() + s.slice(1)}</div>
          </span>
        ))}
      </div>
      {['create', 'start', 'stop', 'rm'].map((a) => (
        <button key={a} className="act" onClick={() => act(a)}>docker {a}</button>
      ))}
      {msg
        ? <Html tag="p" className="hint" html={tr(lang, msg)} />
        : <Rich tag="p" className="hint" content={c.lcHint0} />}
    </div>
  );
}

/** Module 1 — what containers are: layers, lifecycle, vocabulary. */
export default function Containers101() {
  const { lang } = useLang();
  const c = content[lang].m1;
  return (
    <>
      <Rich tag="h2" content={c.title} />
      <Rich tag="p" className="sub" content={c.sub} />
      <Rich content={c.vm} />
      <LayersDemo c={c} lang={lang} />
      <LifecycleDemo c={c} lang={lang} />
      <PracticeLink
        to="m2"
        blurb={{ en: 'Run this exact lifecycle yourself in a simulated engine', ko: '방금 본 생명주기를 시뮬레이션 엔진에서 직접 돌려보기' }}
      />
      <Rich content={c.vocab} />
      <PracticeLink
        to="m16"
        sub="build"
        blurb={{ en: 'Layers become build speed — reorder a Dockerfile and see', ko: '레이어는 곧 빌드 속도 — Dockerfile을 재배치하며 확인하기' }}
      />
    </>
  );
}
