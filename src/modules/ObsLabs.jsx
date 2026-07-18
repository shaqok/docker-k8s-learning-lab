import { useEffect, useReducer, useRef, useState } from 'react';
import Html from '../components/Html.jsx';
import Rich from '../components/Rich.jsx';
import Terminal from '../components/Terminal.jsx';
import ManifestEditor from '../components/ManifestEditor.jsx';
import LabRunner from '../components/LabRunner.jsx';
import { ClusterView } from './K8sLab.jsx';
import { useSubRoute } from '../context/RouteContext.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useProgress } from '../context/ProgressContext.jsx';
import { content } from '../content/index.js';
import { OBS_LABS, SLO_TARGET, makeSick } from '../data/obsLabs.js';
import { INCIDENTS, pickIncident, causeChoices, gradeIncident } from '../data/incidents.js';
import { sloOf } from '../sims/k8s/slo.js';
import { createK8sSim } from '../sims/k8sSim.js';

const podsOf = (engine, name) =>
  engine.list('Pod').filter((p) => p.sim.owner === 'default/' + name && p.status.state !== 'Terminating');

const fmtClock = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

/* ---------------- lab panels ---------------- */

/** Logs lab: which container is saying what, without leaving the page. */
function LogsPanel({ sim, c }) {
  const pods = sim.engine.list('Pod').filter((p) => !p.sim.system);
  return (
    <div className="statepanel">
      <h4>{c.panelLogTails}</h4>
      {pods.map((p) => {
        const cname = p.spec.containers[0].name;
        const lines = (p.sim.logs || {})[cname] || [];
        const last = lines[lines.length - 1];
        return (
          <div key={p.metadata.name} className="ckad-row">
            <div className="ckad-row-head">
              <span className="ckad-pod-name">{p.metadata.name}</span>
              <span className={'ckad-chip ' + (p.status.ready ? 'ok' : 'warn')}>{p.status.state}</span>
              {p.status.restarts > 0 && <span className="ckad-chip warn">↻ {p.status.restarts}</span>}
            </div>
            <div className="ckad-row-body">
              <span className="ckad-muted">{last ? last.msg : c.panelNoLines}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Events lab: the aggregated event table, loudest first — the COUNT column made visual. */
function EventsPanel({ sim, c }) {
  const events = [...sim.engine.events].sort((a, b) => (b.count || 1) - (a.count || 1)).slice(0, 8);
  return (
    <div className="statepanel">
      <h4>{c.panelLoudest}</h4>
      {events.length ? events.map((ev, i) => (
        <div key={i} className="ckad-row">
          <div className="ckad-row-head">
            <span className="ckad-pod-name">{ev.object}</span>
            <span className={'ckad-chip ' + (ev.type === 'Warning' ? 'warn' : 'ok')}>{ev.reason}</span>
            <span className="ckad-chip">×{ev.count || 1}</span>
          </div>
          <div className="ckad-row-body"><span className="ckad-muted">{ev.message}</span></div>
        </div>
      )) : <div className="ckad-muted">{c.panelNoEvents}</div>}
    </div>
  );
}

/** A CPU sparkline from a pod's metrics ring — pure inline SVG, no chart library. */
function Spark({ ring }) {
  const pts = ring.slice(-24);
  if (pts.length < 2) return null;
  const max = Math.max(...pts.map((p) => p.cpuM), 1);
  const d = pts.map((p, i) => `${(i / (pts.length - 1)) * 100},${20 - (p.cpuM / max) * 18}`).join(' ');
  return (
    <svg className="obs-spark" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={d} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Metrics lab: per-pod sparklines, the SLO verdict, and the two fault buttons. */
function MetricsPanel({ sim, c }) {
  const engine = sim.engine;
  const pods = podsOf(engine, 'api');
  const slo = sloOf(engine, { selector: { app: 'api' }, target: SLO_TARGET });
  const healthy = pods.filter((p) => p.status.ready);
  const burn = slo.budgetBurn;
  return (
    <div className="statepanel">
      <h4>{c.panelSlo}</h4>
      <div className="ckad-row-body">
        <span className={'ckad-chip ' + (slo.meeting ? 'ok' : 'warn')}>
          {c.panelAvailability}: {slo.availability == null ? '—' : slo.availability.toFixed(1) + '%'} / {SLO_TARGET}%
        </span>
        <span className={'ckad-chip ' + (burn != null && burn > 1 ? 'warn' : 'ok')}>
          {c.panelBurn}: {burn == null ? '—' : burn.toFixed(2)}
        </span>
      </div>

      <h4>{c.panelCpu}</h4>
      {pods.map((p) => (
        <div key={p.metadata.name} className="ckad-row">
          <div className="ckad-row-head">
            <span className="ckad-pod-name">{p.metadata.name}</span>
            <span className={'ckad-chip ' + (p.status.ready ? 'ok' : 'warn')}>{p.status.ready ? 'Ready' : 'NotReady'}</span>
            {(p.sim.load || 1) > 1 && <span className="ckad-chip warn">🔥 ×{p.sim.load}</span>}
          </div>
          <div className="ckad-row-body"><Spark ring={p.sim.metrics || []} /></div>
        </div>
      ))}

      <h4>{c.panelInject}</h4>
      <div className="ckad-row-body">
        <button
          className="act"
          disabled={!healthy.length || pods.some((p) => (p.sim.load || 1) > 1)}
          onClick={() => engine.setLoad(healthy[healthy.length - 1], 8)}
        >🔥 {c.btnSpike}</button>
        <button
          className="act"
          disabled={healthy.length < 2}
          onClick={() => makeSick(engine, healthy[0])}
        >💥 {c.btnBreak}</button>
      </div>
    </div>
  );
}

const PANELS = { logs: LogsPanel, events: EventsPanel, metrics: MetricsPanel };

/* ---------------- incident mode ---------------- */

/**
 * The 3am pager: a random broken cluster, a symptom-only page, and two clocks.
 * Time-to-diagnose stops when you declare a root cause; time-to-resolve stops
 * when the scenario's own checks all pass. Grading is the scenario's, so an
 * incident is exactly as honest as the Troubleshooting Gym it draws from.
 */
function IncidentRunner({ lang, c, onResolved, history }) {
  const [, bump] = useReducer((x) => x + 1, 0);
  const [attempt, setAttempt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [declared, setDeclared] = useState(null);   // {id, atMs}
  const [picking, setPicking] = useState(false);
  const [result, setResult] = useState(null);
  const [showSolution, setShowSolution] = useState(false);

  const runRef = useRef(null);
  if (!runRef.current || runRef.current.attempt !== attempt) {
    const incident = pickIncident(Math.random, history.slice(-4).map((h) => h.id));
    const sim = createK8sSim({ starterFiles: {} });
    incident.setup(sim.engine, sim.files);
    sim.reconcile();
    runRef.current = { attempt, incident, sim, choices: causeChoices(incident), startedAt: Date.now() };
  }
  const { incident, sim, choices, startedAt } = runRef.current;

  useEffect(() => {
    const unsub = sim.subscribe(bump);
    const interval = setInterval(() => { sim.reconcile(); setElapsed(Math.round((Date.now() - startedAt) / 1000)); }, 800);
    return () => { unsub(); clearInterval(interval); };
  }, [sim, startedAt]);

  const resolve = () => {
    const res = gradeIncident({
      incident,
      engine: sim.engine,
      sim,
      diagnosedMs: declared ? declared.atMs - startedAt : null,
      resolvedMs: Date.now() - startedAt,
      causeCorrect: declared ? declared.id === incident.id : false,
    });
    setResult(res);
    if (res.fixed) onResolved(res);
  };

  const restart = () => {
    setAttempt((a) => a + 1);
    setDeclared(null); setPicking(false); setResult(null); setShowSolution(false); setElapsed(0);
  };

  return (
    <>
      <div className="exam-topbar">
        <span className={'exam-clock' + (elapsed > 600 ? ' low' : '')}>⏱ {c.mttrLabel} {fmtClock(elapsed)}</span>
        {declared && (
          <span className="ckad-chip">
            🔍 {c.ttdLabel} {fmtClock(Math.round((declared.atMs - startedAt) / 1000))}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {!declared && <button className="act primary" onClick={() => setPicking(true)}>🔍 {c.btnDeclare}</button>}
        {/* grading early is allowed and common — keep the button until it actually passes */}
        {(!result || !result.fixed) && <button className="act" onClick={resolve}>🏁 {c.btnResolve}</button>}
        <button className="act" onClick={restart}>🎲 {c.btnNewPage}</button>
      </div>

      <div className="card scen-brief obs-page">
        <h4>📟 {c.pagerTitle}</h4>
        <Html tag="div" html={incident.page[lang]} />
        <p className="ckad-muted">{c.pagerHint}</p>
      </div>

      {picking && !declared && (
        <div className="card scen-hints">
          <h4>🔍 {c.declareTitle}</h4>
          {choices.map((ch) => (
            <p key={ch.id}>
              <button className="act" onClick={() => { setDeclared({ id: ch.id, atMs: Date.now() }); setPicking(false); }}>
                {ch.label[lang]}
              </button>
            </p>
          ))}
        </div>
      )}

      {declared && !result && (
        <div className="card scen-hints">
          <p>🔍 {c.declaredNote}</p>
        </div>
      )}

      {result && (
        <div className={'card scen-results' + (result.fixed && result.causeCorrect ? ' pass' : '')}>
          <h4>{result.fixed ? '🎉 ' + c.resolvedTitle : c.notResolvedTitle}</h4>
          <div className="ckad-row-body">
            <span className={'ckad-chip ' + (result.causeCorrect ? 'ok' : 'warn')}>
              🔍 {c.causeLabel}: {result.causeCorrect ? c.causeRight : c.causeWrong}
            </span>
            <span className="ckad-chip">⏱ {c.ttdLabel} {result.timeToDiagnose == null ? '—' : fmtClock(result.timeToDiagnose)}</span>
            <span className="ckad-chip">🏁 {c.mttrLabel} {fmtClock(result.timeToResolve)}</span>
            {result.band && <span className="ckad-chip ok">{result.band.grade} · {result.band.label[lang]}</span>}
          </div>
          {incident.checks.map((ch, i) => (
            <div key={i} className={'scen-checkline ' + (result.results[i] ? 'ok' : 'err')}>
              {result.results[i] ? '✓' : '✗'} <Html tag="span" html={ch.desc[lang]} />
            </div>
          ))}
          {!result.causeCorrect && (
            <p className="ckad-muted">🔍 {c.actualCause}: <Html tag="span" html={incident.cause[lang]} /></p>
          )}
          <button className="act" onClick={() => setShowSolution(true)}>🏳 {c.btnSolution}</button>
        </div>
      )}

      {showSolution && (
        <div className="card scen-solution">
          <h4>🏳 {c.solutionTitle}</h4>
          <Html tag="p" html={incident.solution[lang]} />
        </div>
      )}

      <div className="lab">
        <Terminal
          key={'inc-' + attempt}
          headText={c.termHead}
          placeholder="kubectl get pods"
          greeting={c.greeting}
          onCommand={(cmd, print) => { sim.exec(cmd, print); bump(); }}
        />
        <ClusterView sim={sim} lang={lang} title={c.clusterTitle} />
      </div>
      <ManifestEditor key={'inc-mf-' + attempt} sim={sim} lang={lang} />
    </>
  );
}

/** Module 21 — Observability & Incident Drills (plan step 18). */
export default function ObsLabs() {
  const { lang } = useLang();
  const { obsDone, completeObsMission, resetObsLab, incidentResults, recordIncident } = useProgress();
  const c = content[lang].m21;
  const TABS = [...OBS_LABS.map((l) => l.id), 'incident'];
  const [sub, setTab] = useSubRoute('m21', (id) => TABS.includes(id));
  const tab = sub ?? OBS_LABS[0].id;

  return (
    <>
      <Rich tag="h2" content={c.title} />
      <Rich tag="p" className="sub" content={c.sub} />
      <div className="ckad-tabs">
        {OBS_LABS.map((lab) => (
          <button key={lab.id} className={'act' + (tab === lab.id ? ' ckad-tab-active' : '')} onClick={() => setTab(lab.id)}>
            {lab.tab[lang]}
          </button>
        ))}
        <button className={'act' + (tab === 'incident' ? ' ckad-tab-active' : '')} onClick={() => setTab('incident')}>
          {c.tabIncident}
        </button>
      </div>

      {OBS_LABS.map((lab) => (
        <div key={lab.id} style={{ display: tab === lab.id ? '' : 'none' }}>
          <LabRunner
            lab={lab}
            lang={lang}
            c={c}
            Panel={PANELS[lab.id]}
            done={obsDone[lab.id] || []}
            complete={(mid) => completeObsMission(lab.id, mid)}
            reset={() => resetObsLab(lab.id)}
          />
        </div>
      ))}

      {tab === 'incident' && (
        <>
          <Rich tag="p" className="hint" content={c.incidentIntro} />
          <IncidentRunner lang={lang} c={c} history={incidentResults} onResolved={recordIncident} />
          {!!incidentResults.length && (
            <>
              <h3>{c.historyTitle}</h3>
              {incidentResults.slice().reverse().slice(0, 8).map((r, i) => (
                <div key={i} className="ckad-row">
                  <div className="ckad-row-head">
                    <span className="ckad-pod-name">📟 {r.id}</span>
                    <span className={'ckad-chip ' + (r.causeCorrect ? 'ok' : 'warn')}>
                      {r.causeCorrect ? c.causeRight : c.causeWrong}
                    </span>
                    <span className="ckad-chip">🏁 {fmtClock(r.timeToResolve)}</span>
                    <span className="ckad-muted">{new Date(r.at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </>
          )}
          <p className="ckad-muted">{c.poolNote.replace('{n}', INCIDENTS.length)}</p>
        </>
      )}
    </>
  );
}
