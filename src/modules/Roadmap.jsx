import Rich from '../components/Rich.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useProgress } from '../context/ProgressContext.jsx';
import { tr } from '../i18n/dynamic.js';
import { content } from '../content/index.js';
import { ROADMAP_EN, ROADMAP_KO, MODNAMES } from '../data/roadmap.js';

const RM_TOTAL = ROADMAP_EN.reduce((s, st) => s + st.items.length, 0);

const stageMsg = (pct) =>
  pct === 0 ? 'Every expert started at 0.'
  : pct < 25 ? 'Foundations first — Modules 1–2.'
  : pct < 50 ? 'Solid. Kubernetes core is where it gets fun.'
  : pct < 75 ? "You'd pass most junior DevOps interviews now."
  : pct < 100 ? 'Expert territory — GPUs and production await.'
  : '🏆 Roadmap complete. Go run it for real.';

/** Landing page: beginner→expert staged checklist with persisted progress. */
export default function Roadmap({ setActive }) {
  const { lang } = useLang();
  const { roadmap, setRoadmapItem } = useProgress();
  const c = content[lang].m0;

  const done = Object.values(roadmap).filter(Boolean).length;
  const pct = Math.round((done / RM_TOTAL) * 100);

  return (
    <>
      <Rich tag="h2" content={c.title} />
      <Rich tag="p" className="sub" content={c.sub} />

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <b>{done} / {RM_TOTAL} {lang === 'ko' ? '스킬' : 'skills'}</b>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>{tr(lang, stageMsg(pct))}</span>
        </div>
        <div className="rmbar"><div style={{ width: pct + '%' }} /></div>
      </div>

      {ROADMAP_EN.map((stage, si) => (
        <div key={si} className="card" style={{ borderLeft: `4px solid ${stage.c}` }}>
          <h4 style={{ color: stage.c, marginTop: 0 }}>{lang === 'ko' ? ROADMAP_KO[si].s : stage.s}</h4>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '2px 0 8px' }}>
            {lang === 'ko' ? ROADMAP_KO[si].note : stage.note}
          </p>
          {stage.items.map(([textEn, mod], ii) => {
            const key = si + '.' + ii;
            const checked = !!roadmap[key];
            const text = lang === 'ko' ? ROADMAP_KO[si].items[ii] : textEn;
            return (
              <label key={key} className={'rmitem' + (checked ? ' checked' : '')}>
                <input type="checkbox" checked={checked} onChange={(e) => setRoadmapItem(key, e.target.checked)} />
                <span className="it">{text}</span>
                <span
                  className={'where' + (mod === 'rw' ? ' rw' : '')}
                  onClick={(e) => { e.preventDefault(); if (mod !== 'rw') setActive(mod); }}
                >
                  {MODNAMES[lang][mod]}
                </span>
              </label>
            );
          })}
        </div>
      ))}

      <Rich content={c.ladder} />
    </>
  );
}
