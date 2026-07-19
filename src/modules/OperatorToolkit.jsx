import { useEffect, useRef, useState } from 'react';
import Rich from '../components/Rich.jsx';
import Html from '../components/Html.jsx';
import PracticeLink from '../components/PracticeLink.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { content } from '../content/index.js';
import { tr } from '../i18n/dynamic.js';
import { qosOf } from '../sims/k8s/engine.js';

const PROBE_NARR = {
  ok: 'All green: 200s everywhere, pod Ready, receiving traffic.',
  notready:
    'Readiness failed → the pod left the Service endpoints but was <b>not</b> restarted. Readiness gates traffic; it never restarts anything.',
  hung: 'Liveness failing… after 3 misses the kubelet kills and restarts the container.',
  restarted:
    'Restarted — restart count +1 and the app is healthy again. CrashLoopBackOff is exactly this loop happening too fast.',
  starting:
    "Startup probe holding — liveness and readiness are switched off until it passes, so a slow boot isn't killed halfway.",
  started: 'Startup passed — from here the other two probes take over.',
};

// verdict text per probe row for each app state
const PROBE_ROWS = {
  ok: {
    startup: ['✓', 'passed — hands off to the others'],
    readiness: ['✓', '200 — pod Ready, in Service endpoints'],
    liveness: ['✓', '200 — alive'],
  },
  notready: {
    startup: ['✓', 'passed — hands off to the others'],
    readiness: ['✗', '503 — pulled from endpoints (no restart!)'],
    liveness: ['✓', '200 — alive, just not ready'],
  },
  hung: {
    startup: ['✓', 'passed — hands off to the others'],
    readiness: ['✗', 'timeout'],
    liveness: ['✗', 'timeout ×3 → kubelet restarts the container'],
  },
  starting: {
    startup: ['⏳', 'holding liveness & readiness off'],
    readiness: ['·', '(waiting for startup probe)'],
    liveness: ['·', '(waiting for startup probe)'],
  },
};

/** One app, three probes: readiness gates traffic, liveness restarts, startup holds both. */
function ProbeDemo({ c, lang }) {
  const [app, setApp] = useState('ok');
  const [restarts, setRestarts] = useState(0);
  const [narr, setNarr] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const states = ['ok', 'notready', 'hung', 'starting'];
  const set = (next) => {
    clearTimeout(timerRef.current);
    setApp(next);
    setNarr(PROBE_NARR[next]);
    if (next === 'hung') {
      timerRef.current = setTimeout(() => {
        setRestarts((r) => r + 1);
        setApp('ok');
        setNarr(PROBE_NARR.restarted);
      }, 2000);
    } else if (next === 'starting') {
      timerRef.current = setTimeout(() => {
        setApp('ok');
        setNarr(PROBE_NARR.started);
      }, 2500);
    }
  };

  const ready = app === 'ok';
  const rows = PROBE_ROWS[app];
  const mark = { '✓': 'var(--green)', '✗': 'var(--red)', '⏳': 'var(--yellow)', '·': 'var(--muted)' };

  return (
    <>
      <Rich tag="h4" style={{ marginTop: 18 }} content={c.probeDemoTitle} />
      <Rich tag="p" content={c.probeDemoIntro} />
      <div>
        {states.map((s, i) => (
          <button key={s} className={'act' + (app === s ? ' primary' : '')} onClick={() => set(s)}>
            {c.probeDemoBtns[i]}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: '2 1 260px', minWidth: 0, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
          {['startup', 'readiness', 'liveness'].map((probe) => (
            <div key={probe} style={{ fontSize: 12, padding: '3px 0', display: 'flex', gap: 8 }}>
              <code style={{ minWidth: 88 }}>{probe}Probe</code>
              <span style={{ color: mark[rows[probe][0]] }}>
                {rows[probe][0]} {tr(lang, rows[probe][1])}
              </span>
            </div>
          ))}
        </div>
        <div style={{ flex: '1 1 140px', minWidth: 0, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 12 }}>
          <div style={{ color: 'var(--muted)', marginBottom: 4 }}>{c.probeSvcHead}</div>
          <div>
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: ready ? 'var(--green)' : 'var(--border)',
                marginRight: 6,
              }}
            />
            <code>web-0</code>
          </div>
          <div style={{ marginTop: 6, color: restarts ? 'var(--yellow)' : 'var(--muted)' }}>
            {c.probeRestartsLabel}: {restarts}
          </div>
        </div>
      </div>
      <div className="hint" style={{ minHeight: 40 }}>
        {narr ? <Html tag="span" html={tr(lang, narr)} /> : <Rich tag="span" content={c.probeDemoHint0} />}
      </div>
    </>
  );
}

const QOS_NARR = {
  BestEffort:
    'No requests, no limits → <b>BestEffort</b>. First to be evicted under memory pressure — fine for batch jobs, scary for prod.',
  Burstable:
    'Requests or limits exist but not requests == limits everywhere → <b>Burstable</b>. It may burst above its request; under pressure it outlives only BestEffort pods.',
  Guaranteed:
    'requests == limits for CPU and memory → <b>Guaranteed</b>. Evicted last — but the memory limit is a hard wall: exceed it and the container is OOMKilled.',
};
const QOS_NARR_DEFAULTED =
  'Only limits set — requests default to limits, so this is still <b>Guaranteed</b>. A favorite exam trap.';

const QOS_COLOR = { BestEffort: 'var(--red)', Burstable: 'var(--yellow)', Guaranteed: 'var(--green)' };
const NONE = '—';

/** Requests/limits knobs → live QoS badge via the engine's real qosOf. */
function QosPlayground({ c, lang }) {
  const [reqCpu, setReqCpu] = useState(NONE);
  const [limCpu, setLimCpu] = useState(NONE);
  const [reqMem, setReqMem] = useState(NONE);
  const [limMem, setLimMem] = useState(NONE);

  const pick = (obj) => {
    const out = {};
    for (const [k, v] of Object.entries(obj)) if (v !== NONE) out[k] = v;
    return Object.keys(out).length ? out : undefined;
  };
  const resources = {
    requests: pick({ cpu: reqCpu, memory: reqMem }),
    limits: pick({ cpu: limCpu, memory: limMem }),
  };
  const qos = qosOf({ spec: { containers: [{ resources }] } });
  const defaulted = qos === 'Guaranteed' && !resources.requests && !!resources.limits;

  const selStyle = { background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: 5 };
  const knob = (label, value, set, opts) => (
    <label style={{ fontSize: 13 }}>
      <code>{label}</code>{' '}
      <select value={value} onChange={(e) => set(e.target.value)} style={selStyle}>
        {opts.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );

  return (
    <>
      <Rich tag="h4" style={{ marginTop: 18 }} content={c.qosDemoTitle} />
      <Rich tag="p" content={c.qosDemoIntro} />
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {knob('requests.cpu', reqCpu, setReqCpu, [NONE, '250m', '500m'])}
        {knob('limits.cpu', limCpu, setLimCpu, [NONE, '500m'])}
        {knob('requests.memory', reqMem, setReqMem, [NONE, '128Mi', '256Mi'])}
        {knob('limits.memory', limMem, setLimMem, [NONE, '256Mi'])}
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: QOS_COLOR[qos],
            border: '1px solid',
            borderRadius: 10,
            padding: '2px 10px',
            whiteSpace: 'nowrap',
          }}
        >
          {qos}
        </span>
      </div>
      <h5 style={{ margin: '12px 0 4px', fontSize: 12, color: 'var(--muted)' }}>{c.qosEvictHead}</h5>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['BestEffort', 'Burstable', 'Guaranteed'].map((cls, i) => {
          const mine = cls === qos;
          return (
            <div
              key={cls}
              style={{
                flex: 1,
                minWidth: 120,
                background: 'var(--panel2)',
                border: '1px solid ' + (mine ? QOS_COLOR[cls] : 'var(--border)'),
                borderRadius: 8,
                padding: '6px 10px',
                fontSize: 12,
              }}
            >
              <div style={{ color: 'var(--muted)' }}>{c.qosSlotLabels[i]}</div>
              <div style={{ color: QOS_COLOR[cls] }}>
                {cls} {mine && <b>{c.qosYourPod}</b>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="hint" style={{ minHeight: 40 }}>
        <Html tag="span" html={tr(lang, defaulted ? QOS_NARR_DEFAULTED : QOS_NARR[qos])} />
      </div>
    </>
  );
}

/** Stage 4 — YAML, ConfigMaps/Secrets, probes, resources, autoscaling, storage, Ingress. */
export default function OperatorToolkit() {
  const { lang } = useLang();
  const c = content[lang].m8;
  return (
    <>
      <Rich tag="h2" content={c.title} />
      <Rich tag="p" className="sub" content={c.sub} />

      <div className="card">
        <Rich content={c.yamlCard[0].c} />
        <PracticeLink
          to="m4"
          blurb={{ en: 'Write a manifest and apply it in the K8s Lab terminal', ko: 'K8s 실습 터미널에서 매니페스트 작성하고 apply 해 보기' }}
        />
      </div>

      <div className="card">
        <Rich content={c.configCard[0].c} />
        <PracticeLink
          to="m11"
          sub="config"
          blurb={{ en: 'Mount ConfigMaps and Secrets, break the refs, fix them', ko: 'ConfigMap과 Secret 마운트, 참조 깨뜨리고 고쳐 보기' }}
        />
      </div>
      <div className="card">
        {/* probesCard is a single card — render its body here so the widget joins it */}
        <Rich content={c.probesCard[0].c} />
        <ProbeDemo c={c} lang={lang} />
        <PracticeLink
          to="m11"
          sub="probes"
          blurb={{ en: 'Configure real probes and fix a CrashLoopBackOff', ko: '진짜 프로브 설정하고 CrashLoopBackOff 고치기' }}
        />
      </div>

      <div className="card">
        {/* qosCard is a single card — render its body here so the widget joins it */}
        <Rich content={c.qosCard[0].c} />
        <QosPlayground c={c} lang={lang} />
        <PracticeLink
          to="m11"
          sub="qos"
          blurb={{ en: 'Set real requests/limits, trigger an OOMKill, read the QoS', ko: '진짜 requests/limits 설정, OOMKill 유발, QoS 확인' }}
        />
      </div>

      <Rich content={c.scaleCard} />

      <div className="card">
        <Rich content={c.storageCard[0].c} />
        <PracticeLink
          to="m18"
          sub="pvc"
          blurb={{ en: 'Bind a PVC, mount it, prove the data survives the pod', ko: 'PVC 바인딩·마운트, 데이터가 파드보다 오래 사는지 증명하기' }}
        />
      </div>

      <div className="card">
        <Rich content={c.trafficCard[0].c} />
        <PracticeLink
          to="m13"
          sub="ingress"
          blurb={{ en: 'Route real host/path rules through a simulated Ingress', ko: '시뮬레이션 Ingress로 host/path 라우팅 규칙 돌려보기' }}
        />
      </div>

      <div className="card">
        <Rich content={c.beyondCard[0].c} />
        <PracticeLink
          to="m17"
          blurb={{ en: 'Jobs, CronJobs, init containers and sidecars — hands on', ko: 'Job, CronJob, init 컨테이너, 사이드카 — 직접 실습' }}
        />
      </div>
    </>
  );
}
