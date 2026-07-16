import Rich from '../components/Rich.jsx';
import { useSubRoute } from '../context/RouteContext.jsx';
import LabRunner from '../components/LabRunner.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useProgress } from '../context/ProgressContext.jsx';
import { content } from '../content/index.js';
import { POD_LABS } from '../data/podLabs.js';

/** Pod Design lab widget: per-container readiness (main + sidecars), init sequence, Service endpoints. */
function PodPanel({ sim, lang, c }) {
  const engine = sim.engine;
  const pods = engine.list('Pod').filter((p) => !p.sim.system && p.status.state !== 'Terminating')
    .sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
  const svcs = engine.list('Service');
  const setApp = (p, name, state) => (p.spec.containers.length <= 1 ? engine.setAppState(p, state) : engine.setAppState(p, name, state));

  return (
    <div className="statepanel">
      <h4>{c.panelPods}</h4>
      {pods.map((p) => (
        <div key={p.metadata.name} className="ckad-row">
          <div className="ckad-row-head">
            <span className="ckad-pod-name">{p.metadata.name}</span>
            <span className={'ckad-chip ' + (p.status.ready ? 'ok' : 'warn')}>{p.status.state}</span>
          </div>
          {(p.spec.initContainers || []).length > 0 && (
            <div className="ckad-row-body">
              <span className="ckad-muted">
                {c.panelInit}: {(p.status.initContainerStatuses || []).map((cs) => cs.name + '=' + cs.state).join(', ')}
              </span>
            </div>
          )}
          {p.spec.containers.map((ct, i) => {
            const cs = (p.status.containerStatuses || [])[i];
            const running = cs && cs.state === 'Running';
            return (
              <div key={ct.name} className="ckad-row-body">
                <span className="ckad-muted">{ct.name}</span>
                <span className={'ckad-chip ' + (cs && cs.ready ? 'ok' : 'warn')}>{cs ? (cs.ready ? c.ready : c.notReady) : '?'}</span>
                <span className="ckad-muted">↻ {cs ? cs.restartCount || 0 : 0}</span>
                {running && (
                  <span className="ckad-btns">
                    <button className="act mini" onClick={() => setApp(p, ct.name, 'hang')}>{c.btnHang}</button>
                    <button className="act mini" onClick={() => setApp(p, ct.name, '503')}>{c.btn503}</button>
                    <button className="act mini" onClick={() => setApp(p, ct.name, 'ok')}>{c.btnHeal}</button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {svcs.length > 0 && (
        <>
          <h4 style={{ marginTop: 12 }}>{c.panelEndpoints}</h4>
          {svcs.map((s) => {
            const eps = engine.endpointsOf(s);
            return (
              <div key={s.metadata.name} className="ckad-ep">
                <code>{s.metadata.name}</code> →{' '}
                {eps.length
                  ? eps.map((p) => <span key={p.metadata.name} className="ckad-chip ok">{p.metadata.name}</span>)
                  : <span className="ckad-chip warn">{lang === 'ko' ? '엔드포인트 없음' : 'no endpoints'}</span>}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

/** Module 17 — Pod Design: multi-container pods, sidecars, initContainers (plan step 13). */
export default function PodLabs() {
  const { lang } = useLang();
  const { podDone, completePodMission, resetPodLab } = useProgress();
  const c = content[lang].m17;
  const [sub, setTab] = useSubRoute('m17', (id) => POD_LABS.some((l) => l.id === id));
  const tab = sub ?? POD_LABS[0].id;

  return (
    <>
      <Rich tag="h2" content={c.title} />
      <Rich tag="p" className="sub" content={c.sub} />
      <div className="ckad-tabs">
        {POD_LABS.map((lab) => (
          <button key={lab.id} className={'act' + (tab === lab.id ? ' ckad-tab-active' : '')} onClick={() => setTab(lab.id)}>
            {lab.tab[lang]}
          </button>
        ))}
      </div>
      {POD_LABS.map((lab) => (
        <div key={lab.id} style={{ display: tab === lab.id ? '' : 'none' }}>
          <LabRunner
            lab={lab}
            lang={lang}
            c={c}
            Panel={PodPanel}
            done={podDone[lab.id] || []}
            complete={(mid) => completePodMission(lab.id, mid)}
            reset={() => resetPodLab(lab.id)}
          />
        </div>
      ))}
    </>
  );
}
