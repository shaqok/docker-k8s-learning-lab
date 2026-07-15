import Rich from '../components/Rich.jsx';
import { useSubRoute } from '../context/RouteContext.jsx';
import LabRunner from '../components/LabRunner.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useProgress } from '../context/ProgressContext.jsx';
import { content } from '../content/index.js';
import { OPS_LABS } from '../data/opsLabs.js';
import { K8S_TARGET } from '../sims/k8s/hostops.js';

const fmtClock = (t) => new Date(t).toLocaleTimeString();

function NodeRows({ engine, lang }) {
  const pods = engine.list('Pod', { all: true }).filter((p) => !p.sim.system && p.status.state !== 'Terminating');
  return engine.list('Node').map((n) => {
    const here = pods.filter((p) => p.spec.nodeName === n.metadata.name);
    return (
      <div key={n.metadata.name} className="ckad-row">
        <div className="ckad-row-head">
          <span className="ckad-pod-name">⬢ {n.metadata.name}</span>
          {n.sim.role === 'control-plane' && <span className="ckad-chip">control-plane</span>}
          {!n.status.ready && <span className="ckad-chip warn">NotReady</span>}
          {n.spec.unschedulable && <span className="ckad-chip warn">cordoned</span>}
        </div>
        <div className="ckad-row-body">
          {here.length
            ? here.map((p) => <span key={p.metadata.name} className={'ckad-chip ' + (p.status.ready ? 'ok' : 'warn')}>{p.metadata.name}</span>)
            : <span className="ckad-muted">{lang === 'ko' ? '(사용자 파드 없음)' : '(no user pods)'}</span>}
        </div>
      </div>
    );
  });
}

/** Drain-vs-PDB lab widget: nodes + live PodDisruptionBudget accounting. */
function DrainPanel({ sim, lang, c }) {
  const engine = sim.engine;
  const pdbs = engine.list('PodDisruptionBudget', { all: true });
  return (
    <div className="statepanel">
      <h4>{c.panelNodes}</h4>
      <NodeRows engine={engine} lang={lang} />
      <h4 style={{ marginTop: 12 }}>{c.panelPdb}</h4>
      {!pdbs.length && <div className="ckad-muted">{c.noPdb}</div>}
      {pdbs.map((pdb) => {
        const st = engine.pdbStatus(pdb);
        return (
          <div key={pdb.metadata.name} className="ckad-row">
            <div className="ckad-row-head">
              <span className="ckad-pod-name">🛡 pdb/{pdb.metadata.name}</span>
              <span className={'ckad-chip ' + (st.allowed > 0 ? 'ok' : 'warn')}>
                {lang === 'ko' ? '허용 중단' : 'allowed disruptions'}: {st.allowed}
              </span>
            </div>
            <div className="ckad-row-body">
              <span className="ckad-chip on">
                {pdb.spec.minAvailable != null ? `minAvailable: ${pdb.spec.minAvailable}` : `maxUnavailable: ${pdb.spec.maxUnavailable}`}
              </span>
              <span className="ckad-muted">ready {st.ready}/{st.total}</span>
              {st.allowed === 0 && <span className="ckad-muted">{lang === 'ko' ? '→ drain의 축출이 거부됩니다' : '→ drain evictions will be refused'}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Upgrade lab widget: where you are, and every node's kubelet vs the control plane. */
function UpgradePanel({ sim, lang, c }) {
  const engine = sim.engine;
  const host = sim.host.state;
  const api = engine.list('Pod', { ns: 'kube-system' }).find((p) => p.metadata.labels.component === 'kube-apiserver');
  const cpV = api ? api.spec.containers[0].image.split(':').pop() : '?';
  const target = 'v' + K8S_TARGET;
  return (
    <div className="statepanel">
      <h4>{c.panelHost}</h4>
      <div className="ckad-row">
        <div className="ckad-row-head">
          <span className="ckad-pod-name">{host.host ? '🖥 ' + host.host : '⌨️ exam-terminal'}</span>
          {host.host
            ? <span className="ckad-muted">{lang === 'ko' ? "'exit'로 복귀" : "'exit' to leave"}</span>
            : <span className="ckad-muted">{lang === 'ko' ? 'ssh 노드이름 으로 접속' : 'ssh NODE to hop on'}</span>}
        </div>
      </div>
      <h4 style={{ marginTop: 12 }}>{c.panelVersions}</h4>
      <div className="ckad-row">
        <div className="ckad-row-head">
          <span className="ckad-pod-name">🧠 {lang === 'ko' ? '컨트롤 플레인 (API 서버)' : 'control plane (API server)'}</span>
          <span className={'ckad-chip ' + (cpV === target ? 'ok' : 'warn')}>{cpV}</span>
        </div>
      </div>
      {engine.list('Node').map((n) => {
        const p = host.pkgs[n.metadata.name];
        return (
          <div key={n.metadata.name} className="ckad-row">
            <div className="ckad-row-head">
              <span className="ckad-pod-name">⬢ {n.metadata.name}</span>
              <span className={'ckad-chip ' + (n.sim.version === target ? 'ok' : 'warn')}>kubelet {n.sim.version}</span>
              {n.spec.unschedulable && <span className="ckad-chip warn">cordoned</span>}
              {!n.status.ready && <span className="ckad-chip warn">NotReady</span>}
            </div>
            {p && (
              <div className="ckad-row-body">
                <span className="ckad-muted">📦 kubeadm {p.kubeadm} · kubelet pkg {p.kubelet}</span>
              </div>
            )}
          </div>
        );
      })}
      <div className="ckad-muted" style={{ marginTop: 8 }}>{c.upgradeOrder}</div>
    </div>
  );
}

/** etcd lab widget: snapshots on disk vs the live cluster, plus what's at stake. */
function EtcdPanel({ sim, lang, c }) {
  const engine = sim.engine;
  const host = sim.host.state;
  const snaps = Object.entries(host.snapshots);
  const deps = engine.list('Deployment', { all: true });
  const liveObjects = engine.snapshotStore().length;
  return (
    <div className="statepanel">
      <h4>{c.panelSnap}</h4>
      {!snaps.length && <div className="ckad-muted">{c.noSnap}</div>}
      {snaps.map(([path, s]) => (
        <div key={path} className="ckad-row">
          <div className="ckad-row-head">
            <span className="ckad-pod-name">📸 {path}</span>
            <span className="ckad-chip ok">{s.objects} {lang === 'ko' ? '오브젝트' : 'objects'}</span>
          </div>
          <div className="ckad-row-body">
            <span className="ckad-muted">{lang === 'ko' ? '저장 시각' : 'saved at'} {fmtClock(s.at)}</span>
          </div>
        </div>
      ))}
      <h4 style={{ marginTop: 12 }}>{c.panelLive}</h4>
      <div className="ckad-row">
        <div className="ckad-row-head">
          <span className="ckad-pod-name">🗄 etcd ({lang === 'ko' ? '현재' : 'live'})</span>
          <span className="ckad-chip">{liveObjects} {lang === 'ko' ? '오브젝트' : 'objects'}</span>
        </div>
      </div>
      {deps.map((d) => {
        const ready = engine.ownedPods(d).filter((p) => p.status.ready).length;
        return (
          <div key={d.metadata.namespace + '/' + d.metadata.name} className="ckad-row">
            <div className="ckad-row-head">
              <span className="ckad-pod-name">🧩 deploy/{d.metadata.name}</span>
              <span className={'ckad-chip ' + (ready >= d.spec.replicas ? 'ok' : 'warn')}>{ready}/{d.spec.replicas} ready</span>
            </div>
          </div>
        );
      })}
      {!deps.length && <div className="ckad-muted">{c.noDeploys}</div>}
    </div>
  );
}

const PANELS = { pdb: DrainPanel, upgrade: UpgradePanel, etcd: EtcdPanel };

/** Module 14 — cluster-ops drills: drain vs PDB, kubeadm upgrade, etcd backup (plan step 8). */
export default function OpsLabs() {
  const { lang } = useLang();
  const { opsDone, completeOpsMission, resetOpsLab } = useProgress();
  const c = content[lang].m14;
  // lab tab lives in the URL sub-path; a bare module hash keeps the last tab
  const [sub, setTab] = useSubRoute('m14', (id) => OPS_LABS.some((l) => l.id === id));
  const tab = sub ?? OPS_LABS[0].id;

  return (
    <>
      <Rich tag="h2" content={c.title} />
      <Rich tag="p" className="sub" content={c.sub} />
      <div className="ckad-tabs">
        {OPS_LABS.map((lab) => (
          <button key={lab.id} className={'act' + (tab === lab.id ? ' ckad-tab-active' : '')} onClick={() => setTab(lab.id)}>
            {lab.tab[lang]}
          </button>
        ))}
      </div>
      {/* all labs stay mounted so their sims keep running */}
      {OPS_LABS.map((lab) => (
        <div key={lab.id} style={{ display: tab === lab.id ? '' : 'none' }}>
          <LabRunner
            lab={lab}
            lang={lang}
            c={c}
            Panel={PANELS[lab.id]}
            done={opsDone[lab.id] || []}
            complete={(mid) => completeOpsMission(lab.id, mid)}
            reset={() => resetOpsLab(lab.id)}
          />
        </div>
      ))}
    </>
  );
}
