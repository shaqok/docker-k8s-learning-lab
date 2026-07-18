import { useLang } from '../i18n/LanguageContext.jsx';
import { useProgress } from '../context/ProgressContext.jsx';
import { moduleLabel } from '../data/modules.js';
import { trackState } from '../data/pedagogy.js';

/**
 * The "next →" bar. Rendered once in App.jsx below the module sections rather
 * than inside each module, so adding it cost one insertion point instead of
 * edits to twenty-two module files.
 *
 * Hidden until a track is chosen, and hidden on the module you're already on —
 * a next-step button pointing at the current page is just noise.
 */
export default function TrackBar({ active, setActive }) {
  const { lang } = useLang();
  const progress = useProgress();
  const track = progress.goal ? trackState(progress.goal, progress) : null;

  if (!track || !track.nextId || track.nextId === active) return null;

  const entry = track.modules.find((m) => m.id === track.nextId);
  const locked = !!(entry && entry.locked);

  return (
    <div className="trackbar">
      <span className="trackbar-label">
        {locked
          ? (lang === 'ko' ? '건너뛴 모듈이 있습니다 —' : 'You skipped ahead —')
          : (lang === 'ko' ? '다음 단계' : 'Next up')}
      </span>
      <button className="act primary" onClick={() => { setActive(track.nextId); window.scrollTo(0, 0); }}>
        {moduleLabel(track.nextId, lang)} →
      </button>
      <span className="trackbar-count">{track.done} / {track.total}</span>
    </div>
  );
}
