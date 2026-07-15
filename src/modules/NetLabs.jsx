import Rich from '../components/Rich.jsx';
import { useSubRoute } from '../context/RouteContext.jsx';
import LabRunner from '../components/LabRunner.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useProgress } from '../context/ProgressContext.jsx';
import { content } from '../content/index.js';
import { canConnect } from '../sims/k8s/netpol.js';
import { NET_LABS } from '../data/netLabs.js';

const selChips = (sel) => {
  const parts = Object.entries((sel && sel.matchLabels) || {}).map(([k, v]) => k + '=' + v);
  for (const ex of (sel && sel.matchExpressions) || []) parts.push(`${ex.key} ${ex.operator} (${(ex.values || []).join(',')})`);
  return parts;
};

/** Target pod's service targetPort, so matrix verdicts include port rules. */
function portTo(engine, to) {
  const svc = engine.list('Service', { ns: to.metadata.namespace }).find((s) =>
    Object.keys(s.spec.selector || {}).length &&
    Object.entries(s.spec.selector).every(([k, v]) => to.metadata.labels[k] === v));
  return svc ? Number(svc.spec.ports[0].targetPort) : null;
}

/** NetworkPolicy lab widget: live connectivity matrix + policy list. */
function NetPolPanel({ sim, lang, c }) {
  const engine = sim.engine;
  const pods = engine.list('Pod').filter((p) => !p.sim.system && p.status.state !== 'Terminating').slice(0, 5);
  const pols = engine.list('NetworkPolicy');
  return (
    <div className="statepanel">
      <h4>{c.panelMatrix}</h4>
      <table className="net-matrix">
        <thead>
          <tr>
            <th>{c.matrixFrom}</th>
            {pods.map((p) => <th key={p.metadata.name}>{p.metadata.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {pods.map((from) => (
            <tr key={from.metadata.name}>
              <th>{from.metadata.name}</th>
              {pods.map((to) => {
                if (from === to) return <td key={to.metadata.name} className="net-self">·</td>;
                const v = canConnect(engine, { from, to, port: portTo(engine, to) });
                return (
                  <td
                    key={to.metadata.name}
                    className={v.allowed ? 'net-ok' : 'net-block'}
                    title={v.allowed ? 'allowed' : `blocked by ${v.policy} (${v.direction})`}
                  >
                    {v.allowed ? '✓' : '⛔'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <h4 style={{ marginTop: 12 }}>{c.panelPolicies}</h4>
      {!pols.length && <div className="ckad-muted">{c.noPolicies}</div>}
      {pols.map((pol) => {
        const chips = selChips(pol.spec.podSelector);
        return (
          <div key={pol.metadata.name} className="ckad-row">
            <div className="ckad-row-head">
              <span className="ckad-pod-name">🕸 {pol.metadata.name}</span>
              <span className="ckad-chip">{(pol.spec.policyTypes || ['Ingress']).join('+')}</span>
            </div>
            <div className="ckad-row-body">
              <span className="ckad-muted">podSelector:</span>
              {chips.length
                ? chips.map((s) => <span key={s} className="ckad-chip on">🏷 {s}</span>)
                : <span className="ckad-chip warn">{'{}'} = {lang === 'ko' ? '모든 파드' : 'all pods'}</span>}
            </div>
            {(pol.spec.ingress || []).map((r, i) => (
              <div key={i} className="ckad-row-body">
                <span className="ckad-muted">allow from:</span>
                {(r.from || []).flatMap((f) => [...selChips(f.podSelector), ...selChips(f.namespaceSelector).map((s) => 'ns:' + s)])
                  .map((s) => <span key={s} className="ckad-chip ok">{s}</span>)}
                {!(r.from || []).length && <span className="ckad-chip ok">{lang === 'ko' ? '모든 출발지' : 'any source'}</span>}
                {(r.ports || []).map((p) => <span key={p.port} className="ckad-chip">:{p.port}</span>)}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Ingress lab widget: rule table with live backend resolution. */
function IngressPanel({ sim, lang, c }) {
  const engine = sim.engine;
  const ings = engine.list('Ingress');
  return (
    <div className="statepanel">
      <h4>{c.panelRules}</h4>
      {!ings.length && <div className="ckad-muted">{c.noRules}</div>}
      {ings.map((ing) => (
        <div key={ing.metadata.name} className="ckad-row">
          <div className="ckad-row-head">
            <span className="ckad-pod-name">🚪 ingress/{ing.metadata.name}</span>
            <span className="ckad-muted">203.0.113.10</span>
          </div>
          {(ing.spec.rules || []).flatMap((r) =>
            ((r.http && r.http.paths) || []).map((p) => {
              const ref = (p.backend && p.backend.service) || {};
              const port = ref.port && ref.port.number != null ? ref.port.number : ref.port;
              const svc = engine.get('Service', ing.metadata.namespace, ref.name || '');
              const eps = svc ? engine.endpointsOf(svc) : [];
              const bad = !svc ? (lang === 'ko' ? 'Service 없음' : 'no such Service')
                : Number(port) !== Number(svc.spec.ports[0].port) ? (lang === 'ko' ? `Service는 :${svc.spec.ports[0].port}` : `Service listens on :${svc.spec.ports[0].port}`)
                : !eps.length ? (lang === 'ko' ? 'ready 엔드포인트 없음' : 'no ready endpoints') : null;
              return (
                <div key={(r.host || '*') + p.path} className="ckad-row-body">
                  <span className="ckad-chip on">{r.host || '*'}{p.path || '/'}</span>
                  <span className="ckad-muted">→</span>
                  <span className="ckad-chip">{ref.name}:{port}</span>
                  <span className="ckad-muted">→</span>
                  {bad
                    ? <span className="ckad-chip warn">⚠ {bad}</span>
                    : eps.map((q) => <span key={q.metadata.name} className="ckad-chip ok">{q.metadata.name}</span>)}
                </div>
              );
            }))}
        </div>
      ))}
      <div className="ckad-muted" style={{ marginTop: 8 }}>
        {lang === 'ko' ? '외부 클라이언트로 시험: ' : 'test as an external client: '}<code>curl http://shop.example.com/</code>
      </div>
    </div>
  );
}

/** Gateway API lab widget: class → gateway → routes → backends chain. */
function GatewayPanel({ sim, lang, c }) {
  const engine = sim.engine;
  const classes = engine.list('GatewayClass');
  const gws = engine.list('Gateway');
  const routes = engine.list('HTTPRoute');
  return (
    <div className="statepanel">
      <h4>{c.panelChain}</h4>
      <div className="ckad-row">
        <div className="ckad-row-head"><span className="ckad-pod-name">1️⃣ GatewayClass</span></div>
        <div className="ckad-row-body">
          {classes.map((gc) => <span key={gc.metadata.name} className="ckad-chip on">{gc.metadata.name} · {gc.spec.controllerName}</span>)}
        </div>
      </div>
      <div className="ckad-row">
        <div className="ckad-row-head"><span className="ckad-pod-name">2️⃣ Gateway</span></div>
        {!gws.length && <div className="ckad-muted">{c.noGateway}</div>}
        {gws.map((g) => {
          const ok = !!engine.get('GatewayClass', null, g.spec.gatewayClassName || '');
          return (
            <div key={g.metadata.name} className="ckad-row-body">
              <span className="ckad-chip on">{g.metadata.name}</span>
              <span className={'ckad-chip ' + (ok ? 'ok' : 'warn')}>{ok ? 'Programmed' : 'class "' + (g.spec.gatewayClassName || '?') + '" ?'}</span>
              {(g.spec.listeners || []).map((l) => (
                <span key={l.name || l.port} className="ckad-chip">:{l.port} {l.hostname || '*'}</span>
              ))}
            </div>
          );
        })}
      </div>
      <div className="ckad-row">
        <div className="ckad-row-head"><span className="ckad-pod-name">3️⃣ HTTPRoute</span></div>
        {!routes.length && <div className="ckad-muted">{lang === 'ko' ? '아직 HTTPRoute가 없습니다' : 'no HTTPRoute yet'}</div>}
        {routes.map((rt) => {
          const parent = ((rt.spec.parentRefs || [])[0] || {}).name;
          const attached = !!engine.get('Gateway', rt.metadata.namespace, parent || '');
          const refs = (((rt.spec.rules || [])[0] || {}).backendRefs) || [];
          const total = refs.reduce((s, b) => s + (b.weight == null ? 1 : Number(b.weight)), 0) || 1;
          return (
            <div key={rt.metadata.name}>
              <div className="ckad-row-body">
                <span className="ckad-chip on">{rt.metadata.name}</span>
                <span className={'ckad-chip ' + (attached ? 'ok' : 'warn')}>{attached ? '⤴ ' + parent : lang === 'ko' ? 'parentRef 없음' : 'no parentRef'}</span>
                {(rt.spec.hostnames || []).map((h) => <span key={h} className="ckad-chip">{h}</span>)}
              </div>
              <div className="ckad-row-body">
                {refs.map((b) => {
                  const svc = engine.get('Service', rt.metadata.namespace, b.name || '');
                  const eps = svc ? engine.endpointsOf(svc) : [];
                  const pct = Math.round(((b.weight == null ? 1 : Number(b.weight)) / total) * 100);
                  return (
                    <span key={b.name} className={'ckad-chip ' + (eps.length ? 'ok' : 'warn')}>
                      {b.name}:{b.port} · {pct}% · {eps.length} pod{eps.length === 1 ? '' : 's'}
                    </span>
                  );
                })}
                {!refs.length && <span className="ckad-chip warn">{lang === 'ko' ? 'backendRefs 없음' : 'no backendRefs'}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="ckad-muted" style={{ marginTop: 8 }}>
        {lang === 'ko' ? '외부 클라이언트로 시험: ' : 'test as an external client: '}<code>curl http://app.example.com/</code>
      </div>
    </div>
  );
}

const PANELS = { netpol: NetPolPanel, ingress: IngressPanel, gateway: GatewayPanel };

/** Module 13 — networking drills: NetworkPolicy, Ingress, Gateway API (plan step 7). */
export default function NetLabs() {
  const { lang } = useLang();
  const { netDone, completeNetMission, resetNetLab } = useProgress();
  const c = content[lang].m13;
  // lab tab lives in the URL sub-path; a bare module hash keeps the last tab
  const [sub, setTab] = useSubRoute('m13', (id) => NET_LABS.some((l) => l.id === id));
  const tab = sub ?? NET_LABS[0].id;

  return (
    <>
      <Rich tag="h2" content={c.title} />
      <Rich tag="p" className="sub" content={c.sub} />
      <div className="ckad-tabs">
        {NET_LABS.map((lab) => (
          <button key={lab.id} className={'act' + (tab === lab.id ? ' ckad-tab-active' : '')} onClick={() => setTab(lab.id)}>
            {lab.tab[lang]}
          </button>
        ))}
      </div>
      {/* all labs stay mounted so their sims keep running */}
      {NET_LABS.map((lab) => (
        <div key={lab.id} style={{ display: tab === lab.id ? '' : 'none' }}>
          <LabRunner
            lab={lab}
            lang={lang}
            c={c}
            Panel={PANELS[lab.id]}
            done={netDone[lab.id] || []}
            complete={(mid) => completeNetMission(lab.id, mid)}
            reset={() => resetNetLab(lab.id)}
          />
        </div>
      ))}
    </>
  );
}
