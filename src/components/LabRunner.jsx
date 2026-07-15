import { useEffect, useReducer, useRef, useState } from 'react';
import Html from './Html.jsx';
import Terminal from './Terminal.jsx';
import ManifestEditor from './ManifestEditor.jsx';
import { createK8sSim } from '../sims/k8sSim.js';
import { esc } from '../sims/util.js';

/**
 * Shared runner for the drill labs (CKAD m11, CKA m12, … and Docker Drills m16):
 * each lab owns a sim instance, missions are graded live against engine state
 * every tick, and `Panel` renders the lab-specific state widget next to the
 * terminal. `done` is the list of completed mission ids; `complete(missionId)`
 * persists one; `reset()` clears this lab's completed missions (optional).
 *
 * `createSim` lets a module swap the engine — the k8s drills use the default
 * `createK8sSim`; the Docker drills pass `createDockerSim`. Anything the k8s sim
 * has but Docker lacks (reconcile, flushTerminating) is called optionally.
 */
export default function LabRunner({ lab, lang, c, Panel, done, complete, reset, createSim = createK8sSim, editorCmdHint, termPlaceholder = 'kubectl get pods' }) {
  const [, bump] = useReducer((x) => x + 1, 0);
  const [attempt, setAttempt] = useState(0);
  const [solved, setSolved] = useState(false);
  const printRef = useRef(null);

  const flagsRef = useRef(new Set());
  const simRef = useRef(null);
  const attemptRef = useRef(-1);
  if (attemptRef.current !== attempt) {
    attemptRef.current = attempt;
    flagsRef.current = new Set();
    const sim = createSim({ starterFiles: { ...lab.starterFiles }, onMission: (id) => flagsRef.current.add(id) });
    lab.setup?.(sim.engine, sim.files);
    sim.reconcile?.();
    simRef.current = sim;
  }
  const sim = simRef.current;

  const gradeRef = useRef(() => {});
  gradeRef.current = () => {
    for (const m of lab.missions) {
      if (done.includes(m.id)) continue;
      try { if (m.check(sim.engine, flagsRef.current, sim.files)) complete(m.id); } catch { /* mid-transition state */ }
    }
  };

  useEffect(() => {
    const unsub = sim.subscribe ? sim.subscribe(bump) : () => {};
    const interval = setInterval(() => { sim.reconcile?.(); gradeRef.current(); }, 800);
    return () => { unsub(); clearInterval(interval); };
  }, [sim]);

  /**
   * Replay the lab's reference `solve()` against the live sim, echoing each
   * command into the terminal so the student sees the exact keystrokes. The
   * 800 ms loop above does the settling and the live grading from here on.
   */
  const revealSolution = () => {
    const print = printRef.current;
    if (!print || solved) return;
    setSolved(true);
    const run = (cmd) => {
      print("<span style='color:var(--green)'>$</span> " + esc(cmd), 'cmd');
      sim.exec(cmd, print);
    };
    // `settle` means "let time pass" — the labs use it to wait out a delete
    // before recreating the same pod. Real timers can't fire inside this
    // synchronous replay, so retire Terminating pods explicitly.
    const settle = (cycles = 5) => {
      for (let i = 0; i < cycles; i++) sim.reconcile?.();
      sim.engine.flushTerminating?.();
      for (let i = 0; i < cycles; i++) sim.reconcile?.();
    };
    try {
      lab.solve(sim, run, settle);
    } catch (err) {
      print('solve failed: ' + esc(String(err && err.message)), 'err');
    }
    gradeRef.current();
    bump();
  };

  return (
    <>
      <Html tag="h3" html={lab.title[lang]} />
      <div className="card scen-brief"><Html tag="div" html={lab.brief[lang]} /></div>

      <div className="missions">
        <h4>{c.missionsTitle} · {done.length}/{lab.missions.length}</h4>
        {lab.missions.map((m) => (
          <div key={m.id} className={'mission' + (done.includes(m.id) ? ' done' : '')}>
            <span className="mark">{done.includes(m.id) ? '✅' : '☐'}</span>{' '}
            <Html tag="span" html={m.desc[lang]} />
          </div>
        ))}
      </div>

      <div className="scen-actions">
        <button className="act" onClick={() => { reset?.(); setSolved(false); setAttempt((a) => a + 1); }}>↺ {c.btnReset}</button>
        <button className="act" onClick={revealSolution} disabled={solved}>🏳 {c.btnSolve}</button>
        <span className="ckad-docs">
          {c.docsTitle}:{' '}
          {lab.docs.map((d) => (
            <a key={d.url} href={d.url} target="_blank" rel="noreferrer">{d.label}</a>
          ))}
        </span>
      </div>

      {solved && (
        <div className="card scen-solution">
          <h4>🏳 {c.solutionTitle}</h4>
          <p>{c.solveNote}</p>
        </div>
      )}

      <div className="lab">
        <Terminal
          key={lab.id + '-' + attempt}
          headText={c.termHead}
          placeholder={termPlaceholder}
          greeting={c.greeting}
          printRef={printRef}
          onCommand={(cmd, print) => { sim.exec(cmd, print); bump(); }}
        />
        <Panel sim={sim} lang={lang} c={c} />
      </div>
      <ManifestEditor key={'mf-' + lab.id + '-' + attempt} sim={sim} lang={lang} cmdHint={editorCmdHint} />
    </>
  );
}
