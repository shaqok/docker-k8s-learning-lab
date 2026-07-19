import { useState } from 'react';
import Rich from '../components/Rich.jsx';
import Html from '../components/Html.jsx';
import PracticeLink from '../components/PracticeLink.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { content } from '../content/index.js';
import { tr } from '../i18n/dynamic.js';
import { qosOf } from '../sims/k8s/engine.js';

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

      <Rich content={c.yamlCard} />
      <Rich content={c.configCard} />
      <Rich content={c.probesCard} />

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
      <Rich content={c.storageCard} />
      <Rich content={c.trafficCard} />
      <Rich content={c.beyondCard} />
    </>
  );
}
