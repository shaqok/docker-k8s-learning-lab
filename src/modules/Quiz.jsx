import { useMemo, useState } from 'react';
import Rich from '../components/Rich.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useProgress } from '../context/ProgressContext.jsx';
import { content } from '../content/index.js';
import { QUIZ_BANK } from '../data/quiz.js';
import { EXAMS, DOMAIN_LABELS } from '../data/examDomains.js';

const FILTERS = ['all', 'cka', 'ckad', 'cks'];

/** Module 6 — quiz v2: domain-tagged bank, exam/domain focus, wrong-answer review, per-domain accuracy. */
export default function Quiz() {
  const { lang } = useLang();
  const c = content[lang].m6;
  const { quizStats, recordQuiz } = useProgress();

  const [filter, setFilter] = useState('all');
  const [domain, setDomain] = useState('all');
  const [answers, setAnswers] = useState({});
  const [graded, setGraded] = useState(false);

  const domainChips = filter === 'all' ? [] : EXAMS[filter].domains.map((d) => d.id);

  const questions = useMemo(() => {
    if (filter === 'all') return QUIZ_BANK;
    const ids = new Set(domain === 'all' ? EXAMS[filter].domains.map((d) => d.id) : [domain]);
    return QUIZ_BANK.filter((q) => q.d.some((id) => ids.has(id)));
  }, [filter, domain]);

  const setFocus = (f, d) => { setFilter(f); setDomain(d); setAnswers({}); setGraded(false); };
  const retry = () => { setAnswers({}); setGraded(false); };

  const grade = () => {
    // fold this attempt into the persistent per-domain accuracy
    const delta = {};
    questions.forEach((q, i) => {
      const right = answers[i] === q.c;
      for (const id of q.d) {
        if (!delta[id]) delta[id] = { r: 0, w: 0 };
        delta[id][right ? 'r' : 'w']++;
      }
    });
    recordQuiz(delta);
    setGraded(true);
  };

  const score = questions.reduce((s, q, i) => s + (answers[i] === q.c ? 1 : 0), 0);
  const missed = graded ? questions.map((q, i) => ({ q, i })).filter(({ q, i }) => answers[i] !== q.c) : [];
  const pct = questions.length ? Math.round((score / questions.length) * 100) : 0;

  const statDomains = Object.keys(quizStats).filter((id) => DOMAIN_LABELS[id] && quizStats[id].r + quizStats[id].w > 0);

  return (
    <>
      <Rich tag="h2" content={c.title} />
      <Rich tag="p" className="sub" content={c.sub} />

      <div className="quiz-filters">
        <span className="quiz-filter-label">{c.focusLabel}</span>
        {FILTERS.map((f) => (
          <button key={f} className={'act' + (filter === f ? ' ckad-tab-active' : '')} onClick={() => setFocus(f, 'all')}>
            {f === 'all' ? c.allLabel : EXAMS[f].label}
          </button>
        ))}
      </div>
      {domainChips.length > 0 && (
        <div className="quiz-filters">
          <button className={'act mini' + (domain === 'all' ? ' ckad-tab-active' : '')} onClick={() => setFocus(filter, 'all')}>
            {c.allDomains}
          </button>
          {domainChips.map((id) => (
            <button key={id} className={'act mini' + (domain === id ? ' ckad-tab-active' : '')} onClick={() => setFocus(filter, id)}>
              {DOMAIN_LABELS[id][lang]}
            </button>
          ))}
        </div>
      )}
      <p className="hint">{questions.length} {c.questionCount}</p>

      {statDomains.length > 0 && (
        <div className="card">
          <h4>{c.accTitle}</h4>
          <div className="quiz-acc">
            {statDomains.map((id) => {
              const { r, w } = quizStats[id];
              const acc = Math.round((r / (r + w)) * 100);
              return (
                <span key={id} className={'ckad-chip ' + (acc >= 80 ? 'ok' : acc >= 50 ? 'warn' : '')} title={`${r}/${r + w}`}>
                  {DOMAIN_LABELS[id][lang]} · {acc}%
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div>
        {questions.map((q, i) => (
          <div key={q.q.en} className={'q' + (graded ? ' graded' : '')}>
            <p>{i + 1}. {q.q[lang]}</p>
            {q.a[lang].map((a, j) => {
              let cls = '';
              if (graded) {
                if (j === q.c) cls = 'correct';
                else if (answers[i] === j) cls = 'wrong';
              }
              return (
                <label key={j} className={cls}>
                  <input
                    type="radio"
                    name={'q' + i}
                    disabled={graded}
                    checked={answers[i] === j}
                    onChange={() => setAnswers((prev) => ({ ...prev, [i]: j }))}
                  />{' '}
                  {a}
                </label>
              );
            })}
            {graded && (
              <div className="why" style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>💡 {q.why[lang]}</div>
            )}
          </div>
        ))}
      </div>

      {!graded && <button className="act primary" onClick={grade}>{c.gradeBtn}</button>}
      {graded && (
        <>
          <div style={{ fontSize: 18, fontWeight: 700, margin: '12px 0', color: pct >= 66 ? 'var(--green)' : 'var(--yellow)' }}>
            {c.scoreLabel}: {score}/{questions.length} ({pct}%)
          </div>
          {missed.length > 0 && (
            <div className="card scen-hints">
              <h4>🔁 {c.reviewTitle} ({missed.length})</h4>
              {missed.map(({ q, i }) => (
                <div key={q.q.en} className="quiz-miss">
                  <p><b>{i + 1}. {q.q[lang]}</b></p>
                  <p style={{ color: 'var(--green)' }}>✓ {q.a[lang][q.c]}</p>
                  <p style={{ color: 'var(--muted)', fontSize: 13 }}>💡 {q.why[lang]}</p>
                </div>
              ))}
            </div>
          )}
          <button className="act" onClick={retry}>↺ {c.retryBtn}</button>
        </>
      )}
    </>
  );
}
