import { useEffect, useReducer, useRef, useState } from 'react';
import Html from '../components/Html.jsx';
import Rich from '../components/Rich.jsx';
import Terminal from '../components/Terminal.jsx';
import ManifestEditor from '../components/ManifestEditor.jsx';
import { ClusterView } from './K8sLab.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useProgress } from '../context/ProgressContext.jsx';
import { content } from '../content/index.js';
import { createK8sSim } from '../sims/k8sSim.js';
import { EXAM_SETS, gradeTask, gradeExam } from '../data/examTasks.js';
import { EXAMS, DOMAIN_LABELS } from '../data/examDomains.js';
import { examReadiness } from '../data/readiness.js';

const fmtTime = (secs) => {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};
const pctOr = (v) => (v == null ? '—' : v + '%');

/** One exam's readiness card: overall %, per-domain bars, the three signals. */
function ReadinessCard({ exam, lang, c, progress, onStart }) {
  const r = examReadiness(exam, progress);
  return (
    <div className="card exam-card">
      <div className="exam-card-head">
        <h3 style={{ margin: 0 }}>🎓 {EXAMS[exam].label}</h3>
        <span className={'exam-overall' + (r.overall >= 66 ? ' ok' : '')}>{r.overall}%</span>
      </div>
      {r.domains.map((d) => (
        <div key={d.id} className="dom-row">
          <div className="dom-label">
            <span>{d.label[lang]}</span>
            <span className="dom-weight">{d.weight}%</span>
          </div>
          <div className="rmbar"><div style={{ width: d.readiness + '%' }} /></div>
          <div className="dom-signals">
            <span title={c.sigPracticeTitle}>🧪 {c.sigPractice} {pctOr(d.practice)}</span>
            <span title={c.sigQuizTitle}>❓ {c.sigQuiz} {pctOr(d.quiz)}</span>
            <span title={c.sigMockTitle}>🎓 {c.sigMock} {pctOr(d.mock)}</span>
          </div>
        </div>
      ))}
      <button className="act primary" style={{ marginTop: 10 }} onClick={onStart}>
        ▶ {c.btnStart} — {EXAM_SETS[exam].tasks.length} {c.tasksWord}, {EXAM_SETS[exam].durationMin} {c.minWord}
      </button>
    </div>
  );
}

/** The timed exam: per-task sims, task nav with flags, one grading at the end. */
function ExamRunner({ exam, lang, c, onFinish, onQuit }) {
  const set = EXAM_SETS[exam];
  const [, bump] = useReducer((x) => x + 1, 0);
  const [cur, setCur] = useState(0);
  const [visited, setVisited] = useState([0]);
  const [flagged, setFlagged] = useState({});
  const endsAtRef = useRef(Date.now() + set.durationMin * 60 * 1000);
  const [remaining, setRemaining] = useState(set.durationMin * 60);

  const simsRef = useRef({});
  const getSim = (idx) => {
    if (!simsRef.current[idx]) {
      const sim = createK8sSim({ starterFiles: {} });
      set.tasks[idx].setup(sim.engine, sim.files);
      sim.reconcile();
      simsRef.current[idx] = sim;
    }
    return simsRef.current[idx];
  };
  getSim(cur);

  const finishRef = useRef(() => {});
  finishRef.current = () => {
    const res = gradeExam(exam, (task, i) => {
      const sim = simsRef.current[i];
      if (!sim) return { results: task.checks.map(() => false), earned: 0 };
      return gradeTask(task, sim.engine, sim);
    });
    onFinish(res);
  };

  useEffect(() => {
    const reconciler = setInterval(() => {
      for (const sim of Object.values(simsRef.current)) sim.reconcile();
      bump();
    }, 800);
    const clock = setInterval(() => {
      const left = Math.max(0, Math.round((endsAtRef.current - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) finishRef.current(); // time's up — grade whatever is there
    }, 1000);
    return () => { clearInterval(reconciler); clearInterval(clock); };
  }, []);

  const goTo = (idx) => {
    getSim(idx);
    setVisited((v) => (v.includes(idx) ? v : [...v, idx]));
    setCur(idx);
  };
  const task = set.tasks[cur];

  return (
    <>
      <div className="exam-topbar">
        <span className={'exam-clock' + (remaining < 600 ? ' low' : '')}>⏱ {fmtTime(remaining)}</span>
        <div className="exam-nav">
          {set.tasks.map((t, i) => (
            <button
              key={t.id}
              className={'exam-navbtn' + (i === cur ? ' cur' : '') + (visited.includes(i) ? ' seen' : '')}
              onClick={() => goTo(i)}
              title={c.taskWord + ' ' + (i + 1) + ' · ' + DOMAIN_LABELS[t.domain][lang]}
            >
              {flagged[i] ? '🚩' : i + 1}
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <button className="act" onClick={() => { if (window.confirm(c.confirmEnd)) finishRef.current(); }}>🏁 {c.endBtn}</button>
        <button className="act" onClick={() => { if (window.confirm(c.confirmQuit)) onQuit(); }}>✕ {c.quitBtn}</button>
      </div>

      <div className="scen-head">
        <h3 style={{ margin: 0 }}>{c.taskWord} {cur + 1}/{set.tasks.length} · {DOMAIN_LABELS[task.domain][lang]} · {task.weight} {c.ptsWord}</h3>
        <button className={'act' + (flagged[cur] ? ' exam-flagged' : '')} onClick={() => setFlagged((f) => ({ ...f, [cur]: !f[cur] }))}>
          🚩 {flagged[cur] ? c.flaggedBtn : c.flagBtn}
        </button>
      </div>

      {set.tasks.map((t, i) => visited.includes(i) && (
        <div key={t.id} style={{ display: i === cur ? '' : 'none' }}>
          <div className="card scen-brief"><Html tag="div" html={t.brief[lang]} /></div>
          <div className="lab">
            <Terminal
              headText={c.termHead}
              placeholder="kubectl get pods"
              greeting={c.greeting}
              onCommand={(cmd, print) => { simsRef.current[i].exec(cmd, print); bump(); }}
            />
            <ClusterView sim={simsRef.current[i]} lang={lang} title={c.clusterTitle} />
          </div>
          <ManifestEditor sim={simsRef.current[i]} lang={lang} />
        </div>
      ))}
    </>
  );
}

/** Post-exam report: score vs pass line, per-domain bars, per-task checks + solutions. */
function ExamResult({ exam, result, lang, c, onBack }) {
  const set = EXAM_SETS[exam];
  return (
    <>
      <div className={'card exam-verdict' + (result.pass ? ' pass' : '')}>
        <div className="exam-verdict-score">{result.score}%</div>
        <div>
          <b>{result.pass ? '🎉 ' + c.passed : c.failed}</b>
          <div className="ckad-muted">{c.passLine} · {EXAMS[exam].label}</div>
        </div>
      </div>

      <h3>{c.byDomain}</h3>
      {Object.entries(result.domains).map(([id, d]) => {
        const pct = Math.round((d.earned / d.total) * 100);
        return (
          <div key={id} className="dom-row">
            <div className="dom-label">
              <span>{DOMAIN_LABELS[id][lang]}</span>
              <span className="dom-weight">{Math.round(d.earned)}/{d.total} {c.ptsWord}</span>
            </div>
            <div className="rmbar"><div style={{ width: pct + '%' }} /></div>
          </div>
        );
      })}

      <h3>{c.byTask}</h3>
      {result.tasks.map((t, i) => {
        const task = set.tasks[i];
        const full = t.results.every(Boolean);
        return (
          <div key={t.id} className={'card exam-task-result' + (full ? ' pass' : '')}>
            <div className="exam-task-head">
              <b>{i + 1}. {t.id}</b>
              <span className="ckad-muted">{DOMAIN_LABELS[t.domain][lang]}</span>
              <span className={'ckad-chip ' + (full ? 'ok' : t.earned > 0 ? 'warn' : '')}>{Math.round(t.earned * 10) / 10}/{t.weight} {c.ptsWord}</span>
            </div>
            {task.checks.map((ch, j) => (
              <div key={j} className={'scen-checkline ' + (t.results[j] ? 'ok' : 'err')}>
                {t.results[j] ? '✓' : '✗'} <Html tag="span" html={ch.desc[lang]} />
              </div>
            ))}
            {!full && (
              <details className="exam-solution">
                <summary>🏳 {c.solutionTitle}</summary>
                <Html tag="p" html={task.solution[lang]} />
              </details>
            )}
          </div>
        );
      })}
      <button className="act primary" onClick={onBack}>← {c.backBtn}</button>
    </>
  );
}

/** Module 15 — the Certify layer: readiness dashboard + timed CKA/CKAD mock exams. */
export default function MockExam() {
  const { lang } = useLang();
  const c = content[lang].m15;
  const progress = useProgress();
  const [view, setView] = useState('home');
  const [exam, setExam] = useState(null);
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);

  const start = (id) => { setExam(id); setView('exam'); setAttempt((a) => a + 1); };
  const finish = (res) => {
    progress.recordExamResult({ exam, at: Date.now(), score: res.score, pass: res.pass, domains: res.domains });
    setResult(res);
    setView('result');
  };

  return (
    <>
      <Rich tag="h2" content={c.title} />
      <Rich tag="p" className="sub" content={c.sub} />

      {view === 'home' && (
        <>
          <Rich tag="p" className="hint" content={c.intro} />
          <div className="grid2">
            <ReadinessCard exam="cka" lang={lang} c={c} progress={progress} onStart={() => start('cka')} />
            <ReadinessCard exam="ckad" lang={lang} c={c} progress={progress} onStart={() => start('ckad')} />
          </div>
          <h3>{c.historyTitle}</h3>
          {!progress.examResults.length && <p className="hint">{c.noHistory}</p>}
          {progress.examResults.slice().reverse().map((r, i) => (
            <div key={i} className="ckad-row">
              <div className="ckad-row-head">
                <span className="ckad-pod-name">🎓 {EXAMS[r.exam].label}</span>
                <span className={'ckad-chip ' + (r.pass ? 'ok' : 'warn')}>{r.score}% · {r.pass ? c.passed : c.failed}</span>
                <span className="ckad-muted">{new Date(r.at).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </>
      )}

      {view === 'exam' && (
        <ExamRunner
          key={exam + '-' + attempt}
          exam={exam}
          lang={lang}
          c={c}
          onFinish={finish}
          onQuit={() => setView('home')}
        />
      )}

      {view === 'result' && (
        <ExamResult exam={exam} result={result} lang={lang} c={c} onBack={() => setView('home')} />
      )}
    </>
  );
}
