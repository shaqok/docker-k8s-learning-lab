import Rich from '../components/Rich.jsx';
import { useSubRoute } from '../context/RouteContext.jsx';
import LabRunner from '../components/LabRunner.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useProgress } from '../context/ProgressContext.jsx';
import { content } from '../content/index.js';
import { STORAGE_LABS } from '../data/storageLabs.js';

/** Storage lab widget: PVCs (bind status + why-Pending), PVs, and pod volume mounts. */
function StoragePanel({ sim, lang, c }) {
  const engine = sim.engine;
  const pvcs = engine.list('PersistentVolumeClaim', { all: true }).sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
  const pvs = engine.list('PersistentVolume').sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
  const pods = engine.list('Pod').filter((p) => !p.sim.system && p.status.state !== 'Terminating' && (p.spec.volumes || []).length)
    .sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));

  return (
    <div className="statepanel">
      <h4>{c.panelPvcs}</h4>
      {!pvcs.length && <div className="ckad-muted">{c.noneYet}</div>}
      {pvcs.map((pvc) => (
        <div key={pvc.metadata.name} className="ckad-row">
          <div className="ckad-row-head">
            <span className="ckad-pod-name">{pvc.metadata.name}</span>
            <span className={'ckad-chip ' + (pvc.status.phase === 'Bound' ? 'ok' : 'warn')}>{pvc.status.phase}</span>
            {pvc.spec.volumeName && <span className="ckad-muted">→ {pvc.spec.volumeName}</span>}
          </div>
          {(pvc.sim.pendingReasons || []).map((r) => (
            <div key={r} className="ckad-muted">✗ {r}</div>
          ))}
        </div>
      ))}

      <h4 style={{ marginTop: 12 }}>{c.panelPvs}</h4>
      {!pvs.length && <div className="ckad-muted">{c.noneYet}</div>}
      {pvs.map((pv) => (
        <div key={pv.metadata.name} className="ckad-row">
          <div className="ckad-row-head">
            <span className="ckad-pod-name">{pv.metadata.name}</span>
            <span className={'ckad-chip ' + (pv.status.phase === 'Bound' ? 'ok' : pv.status.phase === 'Available' ? '' : 'warn')}>{pv.status.phase}</span>
            <span className="ckad-muted">{pv.spec.capacity.storage} · {pv.spec.persistentVolumeReclaimPolicy}{pv.sim.dynamic ? ' · dynamic' : ''}</span>
          </div>
        </div>
      ))}

      <h4 style={{ marginTop: 12 }}>{c.panelPods}</h4>
      {!pods.length && <div className="ckad-muted">{c.noneYet}</div>}
      {pods.map((p) => (
        <div key={p.metadata.name} className="ckad-row">
          <div className="ckad-row-head">
            <span className="ckad-pod-name">{p.metadata.name}</span>
            <span className={'ckad-chip ' + (p.status.ready ? 'ok' : 'warn')}>{p.status.state}</span>
          </div>
          <div className="ckad-row-body">
            {(p.spec.volumes || []).map((v) => (
              <span key={v.name} className="ckad-chip on">
                {v.name}: {v.persistentVolumeClaim ? 'pvc/' + v.persistentVolumeClaim.claimName : v.emptyDir ? 'emptyDir' : v.hostPath ? 'hostPath' : '?'}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Module 18 — Storage: PV/PVC/StorageClass binding, pod-dies-data-survives, StatefulSet volumeClaimTemplates (plan step 15). */
export default function StorageLabs() {
  const { lang } = useLang();
  const { storageDone, completeStorageMission, resetStorageLab } = useProgress();
  const c = content[lang].m18;
  const [sub, setTab] = useSubRoute('m18', (id) => STORAGE_LABS.some((l) => l.id === id));
  const tab = sub ?? STORAGE_LABS[0].id;

  return (
    <>
      <Rich tag="h2" content={c.title} />
      <Rich tag="p" className="sub" content={c.sub} />
      <div className="ckad-tabs">
        {STORAGE_LABS.map((lab) => (
          <button key={lab.id} className={'act' + (tab === lab.id ? ' ckad-tab-active' : '')} onClick={() => setTab(lab.id)}>
            {lab.tab[lang]}
          </button>
        ))}
      </div>
      {STORAGE_LABS.map((lab) => (
        <div key={lab.id} style={{ display: tab === lab.id ? '' : 'none' }}>
          <LabRunner
            lab={lab}
            lang={lang}
            c={c}
            Panel={StoragePanel}
            done={storageDone[lab.id] || []}
            complete={(mid) => completeStorageMission(lab.id, mid)}
            reset={() => resetStorageLab(lab.id)}
          />
        </div>
      ))}
    </>
  );
}
