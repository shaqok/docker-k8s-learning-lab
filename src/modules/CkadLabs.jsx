import Rich from '../components/Rich.jsx';
import { useSubRoute } from '../context/RouteContext.jsx';
import LabRunner from '../components/LabRunner.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useProgress } from '../context/ProgressContext.jsx';
import { content } from '../content/index.js';
import { qosOf, parseMem, K8S_NODE_ALLOC } from '../sims/k8s/engine.js';
import { CKAD_LABS } from '../data/ckadLabs.js';

const APP_FACE = { ok: '😀', hang: '💀', 503: '🤒' };

const userPods = (engine) =>
  engine.list('Pod').filter((p) => !p.sim.system && p.status.state !== 'Terminating')
    .sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));

function StatusChip({ pod }) {
  const bad = !pod.status.ready || pod.status.state !== 'Running';
  return (
    <span className={'ckad-chip ' + (bad ? 'warn' : 'ok')}>
      {pod.status.state}{pod.status.state === 'Running' && !pod.status.ready ? ' · NotReady' : ''}
    </span>
  );
}

/** Probes lab widget: the app inside each container + Service endpoints. */
function ProbesPanel({ sim, lang, c }) {
  const engine = sim.engine;
  const pods = userPods(engine);
  const svcs = engine.list('Service');
  return (
    <div className="statepanel">
      <h4>{c.panelApp}</h4>
      {pods.map((p) => {
        const ct = p.spec.containers[0];
        const running = p.status.state === 'Running';
        return (
          <div key={p.metadata.name} className="ckad-row">
            <div className="ckad-row-head">
              <span className="ckad-pod-name">{APP_FACE[p.sim.app] || '😀'} {p.metadata.name}</span>
              <StatusChip pod={p} />
            </div>
            <div className="ckad-row-body">
              <span className={'ckad-chip ' + (ct.livenessProbe ? 'on' : 'off')}>L</span>
              <span className={'ckad-chip ' + (ct.readinessProbe ? 'on' : 'off')}>R</span>
              {!ct.livenessProbe && !ct.readinessProbe && <span className="ckad-muted">{c.noProbes}</span>}
              <span className="ckad-muted">↻ {p.status.restarts}</span>
              {running && (
                <span className="ckad-btns">
                  <button className="act mini" onClick={() => engine.setAppState(p, 'hang')}>{c.btnHang}</button>
                  <button className="act mini" onClick={() => engine.setAppState(p, '503')}>{c.btn503}</button>
                  <button className="act mini" onClick={() => engine.setAppState(p, 'ok')}>{c.btnHeal}</button>
                </span>
              )}
            </div>
          </div>
        );
      })}
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

/** Resources lab widget: QoS badges, live memory vs limit, node capacity. */
function QosPanel({ sim, lang, c }) {
  const engine = sim.engine;
  const pods = userPods(engine);
  const workers = engine.list('Node').filter((n) => n.sim.role !== 'control-plane');
  return (
    <div className="statepanel">
      <h4>{c.panelApp}</h4>
      {pods.map((p) => {
        const ct = p.spec.containers[0];
        const limMi = parseMem(ct.resources && ct.resources.limits && ct.resources.limits.memory);
        const scale = limMi || K8S_NODE_ALLOC.memMi;
        const pct = Math.min(100, Math.round(((p.sim.memMi || 0) / scale) * 100));
        const qos = qosOf(p);
        const running = p.status.state === 'Running';
        return (
          <div key={p.metadata.name} className="ckad-row">
            <div className="ckad-row-head">
              <span className="ckad-pod-name">{p.metadata.name}</span>
              <span className={'ckad-chip qos-' + qos.toLowerCase()}>{qos}</span>
              <StatusChip pod={p} />
            </div>
            <div className="ckad-row-body">
              <div className="membar" title={`${p.sim.memMi || 0}Mi / ${limMi ? limMi + 'Mi' : c.limitNone}`}>
                <div className={'membar-fill' + (pct > 80 ? ' hot' : '')} style={{ width: pct + '%' }} />
              </div>
              <span className="ckad-muted">{Math.round(p.sim.memMi || 0)}Mi / {limMi ? limMi + 'Mi' : c.limitNone}</span>
              <span className="ckad-muted">↻ {p.status.restarts}{p.sim.oomCount ? ` · OOM ×${p.sim.oomCount}` : ''}</span>
              {running && (
                <button className="act mini" onClick={() => engine.setLeak(p, !p.sim.leakSince)}>
                  {p.sim.leakSince ? c.btnStopLeak : c.btnLeak}
                </button>
              )}
            </div>
          </div>
        );
      })}
      <h4 style={{ marginTop: 12 }}>{c.panelNodes}</h4>
      {workers.map((n) => {
        const used = engine.nodeRequested(n);
        const memPct = Math.min(100, Math.round((used.memMi / K8S_NODE_ALLOC.memMi) * 100));
        const cpuPct = Math.min(100, Math.round((used.cpuM / K8S_NODE_ALLOC.cpuM) * 100));
        return (
          <div key={n.metadata.name} className="ckad-row">
            <div className="ckad-row-head"><span className="ckad-pod-name">⬢ {n.metadata.name}</span></div>
            <div className="ckad-row-body">
              <span className="ckad-muted">mem</span>
              <div className="membar"><div className={'membar-fill' + (memPct > 80 ? ' hot' : '')} style={{ width: memPct + '%' }} /></div>
              <span className="ckad-muted">{used.memMi}/{K8S_NODE_ALLOC.memMi}Mi</span>
            </div>
            <div className="ckad-row-body">
              <span className="ckad-muted">cpu</span>
              <div className="membar"><div className={'membar-fill' + (cpuPct > 80 ? ' hot' : '')} style={{ width: cpuPct + '%' }} /></div>
              <span className="ckad-muted">{used.cpuM}/{K8S_NODE_ALLOC.cpuM}m</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Config lab widget: ConfigMaps/Secrets in the cluster + consuming pods. */
function ConfigPanel({ sim, lang, c }) {
  const engine = sim.engine;
  const cms = engine.list('ConfigMap');
  const secrets = engine.list('Secret');
  const pods = userPods(engine);
  return (
    <div className="statepanel">
      <h4>{c.panelObjects}</h4>
      {!cms.length && !secrets.length && <div className="ckad-muted">{lang === 'ko' ? '아직 없습니다 — 터미널에서 만드세요.' : 'none yet — create them in the terminal.'}</div>}
      {cms.map((o) => (
        <div key={o.metadata.name} className="ckad-row">
          <div className="ckad-row-head">
            <span className="ckad-pod-name">🗺 cm/{o.metadata.name}</span>
            <span className="ckad-muted">{Object.entries(o.data || {}).map(([k, v]) => `${k}=${v}`).join(' · ')}</span>
          </div>
        </div>
      ))}
      {secrets.map((o) => (
        <div key={o.metadata.name} className="ckad-row">
          <div className="ckad-row-head">
            <span className="ckad-pod-name">🔑 secret/{o.metadata.name}</span>
            <span className="ckad-muted">{Object.entries(o.data || {}).map(([k, v]) => `${k}=${v} (base64)`).join(' · ')}</span>
          </div>
        </div>
      ))}
      {pods.length > 0 && <h4 style={{ marginTop: 12 }}>{c.panelPods}</h4>}
      {pods.map((p) => (
        <div key={p.metadata.name} className="ckad-row">
          <div className="ckad-row-head">
            <span className="ckad-pod-name">{p.metadata.name}</span>
            <StatusChip pod={p} />
          </div>
          {p.status.state === 'CreateContainerConfigError' && (
            <div className="ckad-muted">{lang === 'ko' ? '⛔ 참조하는 ConfigMap/Secret이 없습니다 — 만들면 스스로 회복합니다' : '⛔ a referenced ConfigMap/Secret is missing — it self-heals once created'}</div>
          )}
        </div>
      ))}
    </div>
  );
}

const PANELS = { probes: ProbesPanel, qos: QosPanel, config: ConfigPanel };

/** Module 11 — CKAD drills: probes, resources/QoS, ConfigMap/Secret (plan step 5). */
export default function CkadLabs() {
  const { lang } = useLang();
  const { ckadDone, completeCkadMission, resetCkadLab } = useProgress();
  const c = content[lang].m11;
  // lab tab lives in the URL sub-path; a bare module hash keeps the last tab
  const [sub, setTab] = useSubRoute('m11', (id) => CKAD_LABS.some((l) => l.id === id));
  const tab = sub ?? CKAD_LABS[0].id;

  return (
    <>
      <Rich tag="h2" content={c.title} />
      <Rich tag="p" className="sub" content={c.sub} />
      <div className="ckad-tabs">
        {CKAD_LABS.map((lab) => (
          <button key={lab.id} className={'act' + (tab === lab.id ? ' ckad-tab-active' : '')} onClick={() => setTab(lab.id)}>
            {lab.tab[lang]}
          </button>
        ))}
      </div>
      {/* all labs stay mounted so their sims keep running */}
      {CKAD_LABS.map((lab) => (
        <div key={lab.id} style={{ display: tab === lab.id ? '' : 'none' }}>
          <LabRunner
            lab={lab}
            lang={lang}
            c={c}
            Panel={PANELS[lab.id]}
            done={ckadDone[lab.id] || []}
            complete={(mid) => completeCkadMission(lab.id, mid)}
            reset={() => resetCkadLab(lab.id)}
          />
        </div>
      ))}
    </>
  );
}
