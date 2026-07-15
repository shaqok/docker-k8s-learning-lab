import { useEffect, useReducer, useRef, useState } from 'react';
import Html from '../components/Html.jsx';
import Rich from '../components/Rich.jsx';
import { useSubRoute } from '../context/RouteContext.jsx';
import Terminal from '../components/Terminal.jsx';
import ManifestEditor from '../components/ManifestEditor.jsx';
import { ClusterView } from './K8sLab.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useProgress } from '../context/ProgressContext.jsx';
import { content } from '../content/index.js';
import { createK8sSim } from '../sims/k8sSim.js';
import { SCENARIOS } from '../data/scenarios.js';

const DIFF = { 1: '●○○', 2: '●●○', 3: '●●●' };

function ScenarioCard({ s, lang, done, onOpen }) {
  return (
    <button className={'scen-card' + (done ? ' done' : '')} onClick={onOpen}>
      <div className="scen-card-top">
        <span className="scen-diff">{DIFF[s.difficulty]}</span>
        {done && <span className="scen-badge">✓</span>}
      </div>
      <Html tag="div" className="scen-title" html={s.title[lang]} />
      <div className="scen-id">{s.id}</div>
    </button>
  );
}

function ScenarioRunner({ scenario, lang, onBack, onPassed }) {
  const c = content[lang].m10;
  const [, bump] = useReducer((x) => x + 1, 0);
  const [attempt, setAttempt] = useState(0);
  const [hintsShown, setHintsShown] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [results, setResults] = useState(null); // null until first Check
  const passed = results && results.every(Boolean);

  const simRef = useRef(null);
  const attemptRef = useRef(-1);
  if (attemptRef.current !== attempt) {
    attemptRef.current = attempt;
    const sim = createK8sSim({ starterFiles: {} });
    scenario.setup(sim.engine, sim.files);
    sim.reconcile();
    simRef.current = sim;
  }
  const sim = simRef.current;

  useEffect(() => {
    const unsub = sim.subscribe(bump);
    const interval = setInterval(() => sim.reconcile(), 800);
    return () => { unsub(); clearInterval(interval); };
  }, [sim]);

  const check = () => {
    const res = scenario.checks.map((ch) => {
      try { return !!ch.test(sim.engine); } catch { return false; }
    });
    setResults(res);
    if (res.every(Boolean)) onPassed(scenario.id);
  };

  const reset = () => { setAttempt((a) => a + 1); setResults(null); setShowSolution(false); setHintsShown(0); };

  return (
    <>
      <div className="scen-head">
        <button className="act" onClick={onBack}>← {c.btnBack}</button>
        <span className="scen-diff" title="difficulty">{DIFF[scenario.difficulty]}</span>
      </div>
      <Html tag="h3" html={'🔧 ' + scenario.title[lang]} />
      <div className="card scen-brief"><Html tag="div" html={scenario.brief[lang]} /></div>

      <div className="scen-actions">
        <button className="act scen-check" onClick={check}>✓ {c.btnCheck}</button>
        {hintsShown < scenario.hints.length && (
          <button className="act" onClick={() => setHintsShown(hintsShown + 1)}>
            💡 {c.btnHint} ({hintsShown}/{scenario.hints.length})
          </button>
        )}
        <button className="act" onClick={() => setShowSolution(true)}>🏳 {c.btnSolution}</button>
        <button className="act" onClick={reset}>↺ {c.btnReset}</button>
      </div>

      {results && (
        <div className={'card scen-results' + (passed ? ' pass' : '')}>
          <h4>{passed ? '🎉 ' + c.passed : c.checksTitle}</h4>
          {scenario.checks.map((ch, i) => (
            <div key={i} className={'scen-checkline ' + (results[i] ? 'ok' : 'err')}>
              {results[i] ? '✓' : '✗'} <Html tag="span" html={ch.desc[lang]} />
            </div>
          ))}
        </div>
      )}

      {hintsShown > 0 && (
        <div className="card scen-hints">
          {scenario.hints.slice(0, hintsShown).map((h, i) => (
            <p key={i}>💡 <Html tag="span" html={h[lang]} /></p>
          ))}
        </div>
      )}

      {showSolution && (
        <div className="card scen-solution">
          <h4>🏳 {c.solutionTitle}</h4>
          <Html tag="p" html={scenario.solution[lang]} />
        </div>
      )}

      <div className="lab">
        <Terminal
          key={scenario.id + '-' + attempt}
          headText={c.termHead}
          placeholder="kubectl get pods"
          greeting={c.greeting}
          onCommand={(cmd, print) => { sim.exec(cmd, print); bump(); }}
        />
        <ClusterView sim={sim} lang={lang} title={c.clusterTitle} />
      </div>
      <ManifestEditor key={'mf-' + scenario.id + '-' + attempt} sim={sim} lang={lang} />
    </>
  );
}

/** Module 10 — the troubleshooting gym: broken clusters, graded fixes. */
export default function Troubleshooting() {
  const { lang } = useLang();
  const { scenariosDone, completeScenario } = useProgress();
  const c = content[lang].m10;
  // scenario id lives in the URL (#/troubleshooting/<id>) so runs are deep-linkable
  const [activeId, setActiveId] = useSubRoute('m10', (id) => SCENARIOS.some((s) => s.id === id), { nullable: true });
  const scenario = SCENARIOS.find((s) => s.id === activeId);

  return (
    <>
      <Rich tag="h2" content={c.title} />
      <Rich tag="p" className="sub" content={c.sub} />
      {!scenario && (
        <>
          <Rich tag="p" className="hint" content={c.intro} />
          <div className="scen-grid">
            {SCENARIOS.map((s) => (
              <ScenarioCard key={s.id} s={s} lang={lang} done={scenariosDone.includes(s.id)} onOpen={() => setActiveId(s.id)} />
            ))}
          </div>
        </>
      )}
      {scenario && (
        <ScenarioRunner
          key={scenario.id}
          scenario={scenario}
          lang={lang}
          onBack={() => setActiveId(null)}
          onPassed={completeScenario}
        />
      )}
    </>
  );
}
