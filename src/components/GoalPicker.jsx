import { useLang } from '../i18n/LanguageContext.jsx';
import { useProgress } from '../context/ProgressContext.jsx';
import { TRACKS, TRACK_IDS } from '../data/tracks.js';
import { trackState } from '../data/pedagogy.js';
import { moduleLabel } from '../data/modules.js';

/**
 * The goal picker, shown at the top of the Roadmap (m0 — the default route, so
 * a first-run visitor lands on it) rather than as a blocking modal: choosing a
 * track narrows the sidebar, and that should be an offer, not a toll gate.
 */
export default function GoalPicker() {
  const { lang } = useLang();
  const progress = useProgress();
  const { goal, setGoal } = progress;

  const track = goal ? trackState(goal, progress) : null;

  if (goal && track) {
    return (
      <div className="card goal-card">
        <div className="goal-head">
          <h4 style={{ margin: 0 }}>
            🎯 {lang === 'ko' ? '학습 목표' : 'Your goal'}: {TRACKS[goal].label[lang]}
          </h4>
          <button className="act mini" onClick={() => setGoal(null)}>
            {lang === 'ko' ? '목표 변경' : 'change goal'}
          </button>
        </div>
        <p className="hint" style={{ marginTop: 4 }}>{TRACKS[goal].blurb[lang]}</p>
        <div className="rmbar"><div style={{ width: track.pct + '%' }} /></div>
        <p className="hint">
          {track.done} / {track.total} {lang === 'ko' ? '모듈 완료' : 'modules complete'}
          {track.nextId && (
            <>
              {' · '}
              {lang === 'ko' ? '다음: ' : 'next: '}
              <b>{moduleLabel(track.nextId, lang)}</b>
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="card goal-card">
      <h4 style={{ marginTop: 0 }}>
        🎯 {lang === 'ko' ? '무엇을 목표로 하나요?' : "What are you here for?"}
      </h4>
      <p className="hint">
        {lang === 'ko'
          ? '목표를 고르면 사이드바가 순서 있는 학습 경로로 바뀝니다. 언제든 바꿀 수 있고, 잠기는 모듈은 없습니다.'
          : 'Pick one and the sidebar becomes an ordered path. Change it any time — nothing ever gets locked away.'}
      </p>
      <div className="goal-grid">
        {TRACK_IDS.map((id) => (
          <button key={id} className="act goal-opt" onClick={() => setGoal(id)}>
            <b>{TRACKS[id].label[lang]}</b>
            <span>{TRACKS[id].blurb[lang]}</span>
            <span className="goal-len">
              {TRACKS[id].modules.length} {lang === 'ko' ? '모듈' : 'modules'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
