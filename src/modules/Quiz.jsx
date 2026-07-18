import { useMemo, useState } from 'react';
import Rich from '../components/Rich.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useProgress } from '../context/ProgressContext.jsx';
import { content } from '../content/index.js';
import { QUIZ_BANK } from '../data/quiz.js';
import { EXAMS, DOMAIN_LABELS } from '../data/examDomains.js';
import { questionId, dueCards, deckStats } from '../data/leitner.js';
import { docsForDomains } from '../data/docLinks.js';
import DocLinks from '../components/DocLinks.jsx';

const FILTERS = ['all', 'cka', 'ckad', 'cks'];

/** Module 6 — quiz v2: domain-tagged bank, exam/domain focus, wrong-answer review, per-domain accuracy. */
export default function Quiz() {
  const { lang } = useLang();
  const c = content[lang].m6;
  const { quizStats, recordQuiz, quizDeck, recordCards } = useProgress();

  const [mode, setMode] = useState('practice');
  const [filter, setFilter] = useState('all');
  const [domain, setDomain] = useState('all');
  const [answers, setAnswers] = useState({});
  const [graded, setGraded] = useState(false);

  const domainChips = filter === 'all' || mode === 'review' ? [] : EXAMS[filter].domains.map((d) => d.id);

  /**
   * A review session is a snapshot, not a live query. Grading pushes cards out
   * to future due dates, so reading the deck live would make the list shrink
   * under the reader mid-session. `deckAtOpen` freezes which cards are in the
   * session and `sessionAt` freezes "now"; both refresh when review is entered.
   * Modules here stay mounted forever, so re-entering the tab is what starts a
   * new session — otherwise a deck opened on Monday would still be Monday's.
   */
  const [sessionAt, setSessionAt] = useState(() => Date.now());
  const [deckAtOpen, setDeckAtOpen] = useState(quizDeck);
  const stats = useMemo(() => deckStats(QUIZ_BANK, quizDeck, Date.now()), [quizDeck]);

  const questions = useMemo(() => {
    if (mode === 'review') return dueCards(QUIZ_BANK, deckAtOpen, sessionAt).map((c) => c.q);
    if (filter === 'all') return QUIZ_BANK;
    const ids = new Set(domain === 'all' ? EXAMS[filter].domains.map((d) => d.id) : [domain]);
    return QUIZ_BANK.filter((q) => q.d.some((id) => ids.has(id)));
  }, [mode, filter, domain, deckAtOpen, sessionAt]);

  const setFocus = (f, d) => { setFilter(f); setDomain(d); setAnswers({}); setGraded(false); };
  const setModeAndReset = (m) => {
    if (m === 'review') { setSessionAt(Date.now()); setDeckAtOpen(quizDeck); }
    setMode(m);
    setAnswers({});
    setGraded(false);
  };
  const retry = () => { setAnswers({}); setGraded(false); };

  const grade = () => {
    // two independent folds: per-domain accuracy (readiness dashboard) and
    // per-question Leitner boxes (this module's review deck)
    const delta = {};
    const cards = [];
    questions.forEach((q, i) => {
      const right = answers[i] === q.c;
      for (const id of q.d) {
        if (!delta[id]) delta[id] = { r: 0, w: 0 };
        delta[id][right ? 'r' : 'w']++;
      }
      if (answers[i] !== undefined) cards.push({ id: questionId(q), correct: right });
    });
    recordQuiz(delta);
    recordCards(cards);
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
        <button className={'act' + (mode === 'practice' ? ' ckad-tab-active' : '')} onClick={() => setModeAndReset('practice')}>
          {lang === 'ko' ? '연습' : 'Practice'}
        </button>
        <button className={'act' + (mode === 'review' ? ' ckad-tab-active' : '')} onClick={() => setModeAndReset('review')}>
          🔁 {lang === 'ko' ? '복습' : 'Review'}
          {stats.due > 0 && <span className="quiz-due">{stats.due}</span>}
        </button>
      </div>

      {mode === 'review' && (
        <div className="card">
          <h4 style={{ marginTop: 0 }}>
            🔁 {lang === 'ko'
              ? `이번 세션 ${questions.length}장${stats.due > questions.length ? ` (밀린 카드 ${stats.due}장)` : ''}`
              : `${questions.length} card${questions.length === 1 ? '' : 's'} this session`
                + (stats.due > questions.length ? ` (${stats.due} due in total)` : '')}
          </h4>
          <p className="hint">
            {lang === 'ko'
              ? '정답이면 다음 상자로 올라가 더 나중에 다시 나오고, 오답이면 1번 상자로 돌아옵니다. 5번 상자에 도달하면 졸업입니다.'
              : 'A right answer promotes a card to the next box and pushes it further out; a wrong answer sends it back to box 1. Reach box 5 and it retires.'}
          </p>
          <div className="quiz-acc">
            {stats.boxes.map((n, i) => (
              <span key={i} className={'ckad-chip' + (n > 0 ? ' warn' : '')}>
                {lang === 'ko' ? `${i + 1}번 상자` : `box ${i + 1}`} ▸ {n}
              </span>
            ))}
            <span className="ckad-chip ok">
              {lang === 'ko' ? '졸업' : 'retired'} ▸ {stats.retired}
            </span>
            <span className="ckad-chip">
              {lang === 'ko' ? '미학습' : 'unseen'} ▸ {stats.unseen}
            </span>
          </div>
        </div>
      )}

      {mode === 'practice' && (
        <div className="quiz-filters">
          <span className="quiz-filter-label">{c.focusLabel}</span>
          {FILTERS.map((f) => (
            <button key={f} className={'act' + (filter === f ? ' ckad-tab-active' : '')} onClick={() => setFocus(f, 'all')}>
              {f === 'all' ? c.allLabel : EXAMS[f].label}
            </button>
          ))}
        </div>
      )}
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
      {!(mode === 'review' && questions.length === 0) && (
        <p className="hint">{questions.length} {c.questionCount}</p>
      )}

      {mode === 'review' && questions.length === 0 && (
        <p className="hint">
          {stats.unseen === stats.total
            ? (lang === 'ko'
              ? '아직 푼 문제가 없습니다. 먼저 연습 탭에서 채점하면 복습 카드가 만들어집니다.'
              : 'Nothing to review yet — grade a set in the Practice tab and the cards appear here.')
            : (lang === 'ko'
              ? '오늘 복습할 카드가 없습니다. 나중에 다시 오세요.'
              : "Nothing due today. Come back when a card's interval is up.")}
        </p>
      )}

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

      {!graded && questions.length > 0 && <button className="act primary" onClick={grade}>{c.gradeBtn}</button>}
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
                  <DocLinks docs={docsForDomains(q.d)} />
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
