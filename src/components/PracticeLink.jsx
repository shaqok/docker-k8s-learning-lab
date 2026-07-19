import { useLang } from '../i18n/LanguageContext.jsx';
import { useRoute } from '../context/RouteContext.jsx';
import { useProgress } from '../context/ProgressContext.jsx';
import { moduleLabel } from '../data/modules.js';
import { moduleStats } from '../data/pedagogy.js';

/**
 * Reading-topic → drill-module deep link: "you just read it, now go do it."
 * Shows the target module's live progress pill so the reader sees how much of
 * the hands-on side they've already done before jumping. `sub` deep-links a
 * lab tab (e.g. to="m19" sub="helm" → #/packaging-gitops/helm).
 */
export default function PracticeLink({ to, sub = null, blurb = null }) {
  const { lang } = useLang();
  const { navigate } = useRoute();
  const progress = useProgress();
  const st = moduleStats(progress)[to];

  return (
    <div
      className="practice-link"
      onClick={() => { navigate(to, sub); window.scrollTo(0, 0); }}
    >
      <span className="pl-go">🎯 {lang === 'ko' ? '실습으로' : 'Go hands-on'}</span>
      {blurb && <span className="pl-blurb">{blurb[lang]}</span>}
      <span className="pl-mod">{moduleLabel(to, lang)}</span>
      {st && st.text && (
        <span className={'progress-pill' + (st.complete ? ' done' : '')}>{st.text}</span>
      )}
    </div>
  );
}
