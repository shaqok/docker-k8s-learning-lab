import { useEffect, useRef, useState } from 'react';
import Html from '../components/Html.jsx';
import Rich from '../components/Rich.jsx';
import PracticeLink from '../components/PracticeLink.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { tr } from '../i18n/dynamic.js';
import { content } from '../content/index.js';

const POD_COLORS = ['#1f6feb', '#bc8cff', '#39d2c0', '#d29922', '#f778ba', '#ff7b72', '#7ee787', '#79c0ff'];
const INITIAL_NODES = [
  { name: 'gpu-node-1', gpus: 4, alloc: [] },
  { name: 'gpu-node-2', gpus: 4, alloc: [] },
  { name: 'cpu-node-1', gpus: 0, alloc: [] },
];

const MIG_ON = '<b>MIG enabled:</b> the A100 now shows up as <code>nvidia.com/mig-1g.10gb: 7</code>. Seven small pods (notebooks, inference services) can share one physical GPU with hardware isolation. Watch them land:';

function GpuScheduler({ c, lang }) {
  const [nodes, setNodes] = useState(INITIAL_NODES);
  const [eventHtml, setEventHtml] = useState(null); // null → initial text from content
  const [req, setReq] = useState('1');
  const podN = useRef(1);

  const free = (n) => n.gpus - n.alloc.reduce((s, p) => s + p.gpus, 0);

  const schedule = () => {
    const want = parseInt(req);
    const name = 'train-' + podN.current;
    const target = nodes
      .filter((n) => n.gpus)
      .map((n) => ({ n, free: free(n) }))
      .filter((x) => x.free >= want)
      .sort((a, b) => a.free - b.free)[0];

    if (want > 4) {
      setEventHtml(
        `<span style="color:var(--red)">✗ Pod ${name} (${want} GPUs) → <b>Pending forever</b>.</span> FailedScheduling: 0/3 nodes available: 2 Insufficient nvidia.com/gpu (max 4/node), 1 no GPUs.<br><b>Lesson:</b> a pod's GPU request must fit on ONE node — you can't stitch 4+4 across nodes into one pod. Jobs bigger than a node become <i>multiple</i> pods doing distributed training (NCCL/torchrun).`,
      );
    } else if (!target) {
      setEventHtml(
        `<span style="color:var(--yellow)">⏳ Pod ${name} (${want} GPU${want > 1 ? 's' : ''}) → <b>Pending</b>.</span> FailedScheduling: 0/3 nodes available: 2 Insufficient nvidia.com/gpu.<br><b>Lesson:</b> GPUs are never oversubscribed — the pod queues until another job finishes (or an autoscaler adds a GPU node, at $$$).`,
      );
    } else {
      const pod = { name, gpus: want, color: POD_COLORS[(podN.current - 1) % POD_COLORS.length] };
      setNodes((ns) => ns.map((n) => (n.name === target.n.name ? { ...n, alloc: [...n.alloc, pod] } : n)));
      setEventHtml(
        `<span style="color:var(--green)">✓ Pod ${name} scheduled → ${target.n.name}</span> (bin-packing: chose the node with the least free GPUs that still fits, keeping big slots open elsewhere). ${want === 4 ? "Took a whole node's GPUs — a 4-GPU job blocks four 1-GPU jobs." : ''}`,
      );
      podN.current++;
    }
  };

  const reset = () => { setNodes(INITIAL_NODES); podN.current = 1; setEventHtml('Cluster reset.'); };

  return (
    <>
      <Rich tag="h4" style={{ marginTop: 18 }} content={c.simTitle} />
      <Rich tag="p" content={c.simIntro} />
      <div>
        <Rich tag="span" content={c.gpuReqLabel} />{' '}
        <select
          value={req}
          onChange={(e) => setReq(e.target.value)}
          style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: 5 }}
        >
          {['1', '2', '4', '8'].map((v, i) => (
            <option key={v} value={v}>{c.gpuOpts[i]}</option>
          ))}
        </select>{' '}
        <button className="act primary" onClick={schedule}>{c.btnSchedule}</button>
        <button className="act" onClick={reset}>{c.btnReset}</button>
      </div>
      <div className="cluster">
        {nodes.map((n) => {
          const cells = [];
          n.alloc.forEach((pod) => {
            for (let i = 0; i < pod.gpus; i++)
              cells.push(
                <div key={pod.name + i} className="gpu-cell used" style={{ background: pod.color, borderColor: pod.color }} title={pod.name}>
                  {pod.name.replace('train-', 'J')}
                </div>,
              );
          });
          for (let i = cells.length; i < n.gpus; i++)
            cells.push(<div key={'f' + i} className="gpu-cell">{lang === 'ko' ? '여유' : 'free'}</div>);
          return (
            <div key={n.name} className={'knode' + (n.gpus ? ' gpu-node' : '')}>
              <h5>
                ⬢ {n.name}{' '}
                {n.gpus ? (
                  <span style={{ color: 'var(--nvidia)' }}>nvidia.com/gpu: {free(n)}/{n.gpus} {lang === 'ko' ? '여유' : 'free'}</span>
                ) : (
                  <Html tag="span" style={{ color: 'var(--muted)' }} html={tr(lang, 'no GPUs — device plugin not present')} />
                )}
              </h5>
              {n.gpus ? (
                <div className="gpu-grid">{cells}</div>
              ) : (
                <div className="podbox" style={{ marginTop: 6 }}>
                  <Html tag="span" style={{ fontSize: 11, color: 'var(--muted)' }} html={tr(lang, 'runs your web apps, DBs, CI…')} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="hint" style={{ minHeight: 40 }}>
        {eventHtml ? <Html tag="span" html={tr(lang, eventHtml)} /> : <Rich tag="span" content={c.simEvents0} />}
      </div>
    </>
  );
}

function MigCard({ c, lang }) {
  const [mig, setMig] = useState(false);
  const [used, setUsed] = useState(0);

  useEffect(() => {
    if (!mig) { setUsed(0); return; }
    const timers = Array.from({ length: 5 }, (_, i) => setTimeout(() => setUsed(i + 1), 400 + i * 350));
    return () => timers.forEach(clearTimeout);
  }, [mig]);

  return (
    <div className="card">
      <Rich content={c.migBefore} />
      <div className="mig-card">
        <b style={{ color: 'var(--nvidia)' }}>{c.migGpuName}</b>
        <button className="act" style={{ float: 'right' }} onClick={() => setMig(!mig)}>
          {tr(lang, mig ? 'Disable MIG' : 'Enable MIG')}
        </button>
        <div className="mig-slices">
          {mig ? (
            Array.from({ length: 7 }, (_, i) => (
              <div key={i} className={'mig-slice' + (i < used ? ' used' : '')}>
                {i < used ? tr(lang, `pod ${i + 1}`) : '1g.10gb'}
              </div>
            ))
          ) : (
            <div className="mig-slice" style={{ flex: 7, height: 52 }}>{tr(lang, '1 × whole GPU — nvidia.com/gpu: 1')}</div>
          )}
        </div>
        <p className="hint" style={{ marginBottom: 0 }}>
          {mig ? <Html tag="span" html={tr(lang, MIG_ON)} /> : <Rich tag="span" content={c.migHint0} />}
        </p>
      </div>
      <Rich content={c.migAfter} />
    </div>
  );
}

/** Module 5 (Stage 6) — GPUs in Docker & Kubernetes, sharing, distributed training. */
export default function GpuModule() {
  const { lang } = useLang();
  const c = content[lang].m5;
  return (
    <>
      <Rich tag="h2" content={c.title} />
      <Rich tag="p" className="sub" content={c.sub} />
      <Rich content={c.toolkit} />
      <div className="card">
        {/* dpIntro is a single card — render its body inside this card wrapper */}
        <Rich content={c.dpIntro[0].c} />
        <GpuScheduler c={c} lang={lang} />
        <PracticeLink
          to="m2"
          blurb={{ en: 'Try docker run --gpus all in the lab terminal', ko: '실습 터미널에서 docker run --gpus all 직접 실행해 보기' }}
        />
      </div>
      <MigCard c={c} lang={lang} />
      <Rich content={c.expert} />
      <PracticeLink
        to="m12"
        sub="sched"
        blurb={{ en: 'Taints, tolerations and bin-packing — the CKA scheduler drill', ko: '테인트·톨러레이션·빈패킹 — CKA 스케줄러 드릴' }}
      />
    </>
  );
}
