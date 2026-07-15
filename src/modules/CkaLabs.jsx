import { useState } from 'react';
import Rich from '../components/Rich.jsx';
import { useSubRoute } from '../context/RouteContext.jsx';
import LabRunner from '../components/LabRunner.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useProgress } from '../context/ProgressContext.jsx';
import { content } from '../content/index.js';
import { canI } from '../sims/k8s/rbac.js';
import { CKA_LABS } from '../data/ckaLabs.js';

const hiddenNodeLabel = (k) => k === 'kubernetes.io/hostname' || k === 'node-role.kubernetes.io/control-plane';

/** Scheduler lab widget: nodes (labels/taints/pods) + why-Pending explainer. */
function SchedulerPanel({ sim, lang, c }) {
  const engine = sim.engine;
  const nodes = engine.list('Node');
  const pods = engine.list('Pod').filter((p) => !p.sim.system && p.status.state !== 'Terminating');
  const pending = pods.filter((p) => !p.spec.nodeName);
  return (
    <div className="statepanel">
      <h4>{c.panelNodes}</h4>
      {nodes.map((n) => {
        const here = pods.filter((p) => p.spec.nodeName === n.metadata.name);
        const labels = Object.entries(n.metadata.labels).filter(([k]) => !hiddenNodeLabel(k));
        return (
          <div key={n.metadata.name} className="ckad-row">
            <div className="ckad-row-head">
              <span className="ckad-pod-name">⬢ {n.metadata.name}</span>
              {n.sim.role === 'control-plane' && <span className="ckad-chip">control-plane</span>}
              {!n.status.ready && <span className="ckad-chip warn">NotReady</span>}
              {n.spec.unschedulable && <span className="ckad-chip warn">cordoned</span>}
            </div>
            <div className="ckad-row-body">
              {labels.map(([k, v]) => <span key={k} className="ckad-chip on">🏷 {k}={v}</span>)}
              {(n.spec.taints || []).map((t) => (
                <span key={t.key} className="ckad-chip warn">☣ {t.key}{t.value ? '=' + t.value : ''}:{t.effect}</span>
              ))}
            </div>
            <div className="ckad-row-body">
              {here.length
                ? here.map((p) => <span key={p.metadata.name} className={'ckad-chip ' + (p.status.ready ? 'ok' : 'warn')}>{p.metadata.name}</span>)
                : <span className="ckad-muted">{lang === 'ko' ? '(사용자 파드 없음)' : '(no user pods)'}</span>}
            </div>
          </div>
        );
      })}
      <h4 style={{ marginTop: 12 }}>{c.panelPending}</h4>
      {!pending.length && <div className="ckad-muted">{c.noPending}</div>}
      {pending.map((p) => (
        <div key={p.metadata.name} className="ckad-row">
          <div className="ckad-row-head">
            <span className="ckad-pod-name">{p.metadata.name}</span>
            <span className="ckad-chip warn">Pending</span>
          </div>
          {(p.sim.pendingReasons || []).map((r) => (
            <div key={r} className="ckad-muted">✗ {r}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

const CAN_I_VERBS = ['get', 'list', 'watch', 'create', 'update', 'delete'];
const CAN_I_RESOURCES = ['pods', 'deployments', 'services', 'secrets', 'configmaps', 'nodes'];

/** RBAC lab widget: subjects/roles/bindings in the cluster + a live can-i tester. */
function RbacPanel({ sim, lang, c }) {
  const engine = sim.engine;
  const sas = engine.list('ServiceAccount', { all: true }).filter((s) => s.metadata.namespace !== 'kube-system');
  const roles = [...engine.list('Role', { all: true }), ...engine.list('ClusterRole', { all: true })];
  const bindings = [...engine.list('RoleBinding', { all: true }), ...engine.list('ClusterRoleBinding', { all: true })];
  const namespaces = engine.list('Namespace').map((n) => n.metadata.name).filter((n) => n !== 'kube-system');

  const [saKey, setSaKey] = useState('build:ci');
  const [verb, setVerb] = useState('list');
  const [resource, setResource] = useState('pods');
  const [ns, setNs] = useState('build');

  const [saNs, saName] = saKey.split(':');
  const exists = !!engine.get('ServiceAccount', saNs, saName || '');
  const allowed = exists && canI(engine, { verb, resource, subject: { kind: 'ServiceAccount', name: saName, namespace: saNs }, ns });

  return (
    <div className="statepanel">
      <h4>{c.panelRbac}</h4>
      {sas.map((s) => (
        <div key={s.metadata.namespace + ':' + s.metadata.name} className="ckad-row">
          <div className="ckad-row-head">
            <span className="ckad-pod-name">👤 sa/{s.metadata.name}</span>
            <span className="ckad-muted">ns: {s.metadata.namespace}</span>
          </div>
        </div>
      ))}
      {roles.map((r) => (
        <div key={r.kind + ':' + (r.metadata.namespace || '') + ':' + r.metadata.name} className="ckad-row">
          <div className="ckad-row-head">
            <span className="ckad-pod-name">📜 {r.kind === 'ClusterRole' ? 'clusterrole' : 'role'}/{r.metadata.name}</span>
            {r.metadata.namespace ? <span className="ckad-muted">ns: {r.metadata.namespace}</span> : <span className="ckad-chip">cluster-wide</span>}
          </div>
          <div className="ckad-row-body">
            {(r.rules || []).map((ru, i) => (
              <span key={i} className="ckad-chip on">{(ru.verbs || []).join(',')} → {(ru.resources || []).join(',')}</span>
            ))}
          </div>
        </div>
      ))}
      {bindings.map((b) => (
        <div key={b.kind + ':' + (b.metadata.namespace || '') + ':' + b.metadata.name} className="ckad-row">
          <div className="ckad-row-head">
            <span className="ckad-pod-name">🔗 {b.kind === 'ClusterRoleBinding' ? 'clusterrolebinding' : 'rolebinding'}/{b.metadata.name}</span>
            {b.metadata.namespace ? <span className="ckad-muted">ns: {b.metadata.namespace}</span> : <span className="ckad-chip">cluster-wide</span>}
          </div>
          <div className="ckad-row-body">
            <span className="ckad-muted">
              {(b.subjects || []).map((s) => (s.kind === 'ServiceAccount' ? `sa ${s.namespace}:${s.name}` : `${s.kind.toLowerCase()} ${s.name}`)).join(', ')}
              {' ⟶ '}{b.roleRef.kind}/{b.roleRef.name}
            </span>
          </div>
        </div>
      ))}
      {!roles.length && !bindings.length && (
        <div className="ckad-muted">{lang === 'ko' ? '아직 Role/Binding이 없습니다 — 기본 거부 상태입니다.' : 'no Roles/Bindings yet — everything is denied.'}</div>
      )}

      <h4 style={{ marginTop: 12 }}>{c.panelTester}</h4>
      <div className="ckad-row">
        <div className="ckad-row-body cka-tester">
          <select value={saKey} onChange={(e) => setSaKey(e.target.value)}>
            {sas.map((s) => {
              const k = s.metadata.namespace + ':' + s.metadata.name;
              return <option key={k} value={k}>sa {k}</option>;
            })}
            {!sas.some((s) => s.metadata.namespace + ':' + s.metadata.name === saKey) && <option value={saKey}>sa {saKey}</option>}
          </select>
          <select value={verb} onChange={(e) => setVerb(e.target.value)}>
            {CAN_I_VERBS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={resource} onChange={(e) => setResource(e.target.value)}>
            {CAN_I_RESOURCES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <span className="ckad-muted">-n</span>
          <select value={ns} onChange={(e) => setNs(e.target.value)}>
            {namespaces.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className={'ckad-chip ' + (allowed ? 'ok' : 'warn')}>{allowed ? 'yes ✓' : 'no ✗'}</span>
        </div>
        {!exists && <div className="ckad-muted">{lang === 'ko' ? '(그 ServiceAccount는 아직 없습니다)' : '(that ServiceAccount does not exist yet)'}</div>}
      </div>
    </div>
  );
}

const PANELS = { sched: SchedulerPanel, rbac: RbacPanel };

/** Module 12 — CKA drills: scheduler workbench + RBAC simulator (plan step 6). */
export default function CkaLabs() {
  const { lang } = useLang();
  const { ckaDone, completeCkaMission, resetCkaLab } = useProgress();
  const c = content[lang].m12;
  // lab tab lives in the URL sub-path; a bare module hash keeps the last tab
  const [sub, setTab] = useSubRoute('m12', (id) => CKA_LABS.some((l) => l.id === id));
  const tab = sub ?? CKA_LABS[0].id;

  return (
    <>
      <Rich tag="h2" content={c.title} />
      <Rich tag="p" className="sub" content={c.sub} />
      <div className="ckad-tabs">
        {CKA_LABS.map((lab) => (
          <button key={lab.id} className={'act' + (tab === lab.id ? ' ckad-tab-active' : '')} onClick={() => setTab(lab.id)}>
            {lab.tab[lang]}
          </button>
        ))}
      </div>
      {/* all labs stay mounted so their sims keep running */}
      {CKA_LABS.map((lab) => (
        <div key={lab.id} style={{ display: tab === lab.id ? '' : 'none' }}>
          <LabRunner
            lab={lab}
            lang={lang}
            c={c}
            Panel={PANELS[lab.id]}
            done={ckaDone[lab.id] || []}
            complete={(mid) => completeCkaMission(lab.id, mid)}
            reset={() => resetCkaLab(lab.id)}
          />
        </div>
      ))}
    </>
  );
}
