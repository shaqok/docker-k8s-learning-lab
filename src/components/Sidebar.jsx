import { useLang } from '../i18n/LanguageContext.jsx';
import { MODULE_SLUGS } from '../router.js';
import { useProgress } from '../context/ProgressContext.jsx';
import { SECTIONS, moduleById, moduleLabel } from '../data/modules.js';
import { TRACKS } from '../data/tracks.js';
import { moduleStats, trackState, visibleModules } from '../data/pedagogy.js';

/** Nav rows for the active track: module ids in order, with section dividers woven in. */
function navRows(goal) {
  const ids = visibleModules(goal);
  const rows = [];
  let section = null;
  for (const id of ids) {
    const m = moduleById(id);
    if (!m) continue;
    // a track reorders modules, so only show a divider when the section changes
    if (m.section && m.section !== section) rows.push({ sec: m.section });
    section = m.section;
    rows.push({ id });
  }
  return rows;
}

export default function Sidebar({ active, setActive }) {
  const { lang, toggle } = useLang();
  const progress = useProgress();
  const { goal, setGoal } = progress;

  const stats = moduleStats(progress);
  const track = goal ? trackState(goal, progress) : null;
  const nextId = track && track.nextId;
  const lockedById = track
    ? Object.fromEntries(track.modules.map((m) => [m.id, m]))
    : {};

  const lockTitle = (missing) => {
    const names = missing.map((id) => moduleLabel(id, lang)).join(', ');
    return lang === 'ko' ? `먼저: ${names}` : `Do first: ${names}`;
  };

  return (
    <nav id="sidebar">
      <h1>
        🐳 Docker &amp; ☸️ K8s <span>{lang === 'ko' ? '랩' : 'Lab'}</span>
      </h1>

      {goal && track && (
        <div className="track-head">
          <div className="track-name">
            <span>{TRACKS[goal].label[lang]}</span>
            <button className="track-change" onClick={() => setGoal(null)}>
              {lang === 'ko' ? '변경' : 'change'}
            </button>
          </div>
          <div className="rmbar"><div style={{ width: track.pct + '%' }} /></div>
          <div className="track-count">
            {track.done} / {track.total} {lang === 'ko' ? '모듈' : 'modules'}
          </div>
        </div>
      )}

      {navRows(goal).map((row, i) => {
        if (row.sec) return <div key={'s' + i} className="navsec">{SECTIONS[row.sec][lang]}</div>;
        const st = stats[row.id];
        const entry = lockedById[row.id];
        const locked = !!(entry && entry.locked);
        const isNext = row.id === nextId;
        return (
          <button
            key={row.id}
            className={'navbtn' + (active === row.id ? ' active' : '') + (locked ? ' locked' : '') + (isNext ? ' isnext' : '')}
            onClick={() => { setActive(row.id); window.scrollTo(0, 0); }}
            title={locked ? lockTitle(entry.missing) : '#/' + MODULE_SLUGS[row.id]}
          >
            {locked && <span className="navlock">🔒</span>}
            {moduleLabel(row.id, lang)}
            {isNext && <span className="navnext">{lang === 'ko' ? '다음' : 'next'}</span>}
            {st && st.text && (
              <span className={'progress-pill' + (st.complete ? ' done' : '')}>{st.text}</span>
            )}
          </button>
        );
      })}

      <div style={{ padding: '14px 16px' }}>
        {!goal && (
          <button className="act" style={{ width: '100%', marginBottom: 8 }} onClick={() => setActive('m0')}>
            {lang === 'ko' ? '🎯 학습 목표 정하기' : '🎯 Pick a goal'}
          </button>
        )}
        <button className="act" style={{ width: '100%' }} onClick={toggle}>
          {lang === 'ko' ? '🇺🇸 View in English' : '🇰🇷 한국어로 보기'}
        </button>
      </div>
    </nav>
  );
}
