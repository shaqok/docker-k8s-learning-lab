import Rich from '../components/Rich.jsx';
import { useSubRoute } from '../context/RouteContext.jsx';
import LabRunner from '../components/LabRunner.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useProgress } from '../context/ProgressContext.jsx';
import { content } from '../content/index.js';
import { PACKAGING_LABS } from '../data/packagingLabs.js';
import { buildKustomization } from '../sims/k8s/kustomize.js';
import { diffManifestSets, pathToString } from '../sims/k8s/diff.js';

/** Helm lab widget: releases with their revision history. */
function HelmPanel({ sim, lang, c }) {
  const releases = sim.engine.list('HelmRelease');
  return (
    <div className="statepanel">
      <h4>{c.panelReleases}</h4>
      {releases.length ? releases.map((r) => (
        <div key={r.metadata.name} className="ckad-row">
          <div className="ckad-row-head">
            <span className="ckad-pod-name">⎈ {r.metadata.name}</span>
            <span className="ckad-chip ok">{c.panelRevision} {r.status.revision}</span>
          </div>
          <div className="ckad-row-body">
            <span className="ckad-muted">{r.spec.chart}</span>
            {r.sim.history.map((h) => (
              <span key={h.rev} className={'ckad-chip' + (h.rev === r.status.revision ? ' on' : '')}>#{h.rev}</span>
            ))}
          </div>
        </div>
      )) : <div className="ckad-muted">{c.panelNoReleases}</div>}
    </div>
  );
}

/** Kustomize lab widget: a live base-vs-overlay diff, recomputed from the current file-store text. */
function KustomizePanel({ sim, lang, c }) {
  const { files } = sim;
  // Rebuilt on every render straight from student-editable files — guard against
  // anything unexpected (beyond buildKustomization's own {error} returns) throwing
  // mid-render, which would otherwise take down every other still-mounted module.
  let base = {}, overlay = {}, error;
  try {
    base = buildKustomization(files, 'k8s/base');
    overlay = buildKustomization(files, 'k8s/overlays/prod');
    error = base.error || overlay.error;
  } catch (e) {
    error = String(e && e.message);
  }
  const rows = error ? [] : diffManifestSets(base.docs, overlay.docs);
  return (
    <div className="statepanel">
      <h4>{c.panelDiff}</h4>
      {error && <div className="ckad-chip warn">{error}</div>}
      {!error && rows.map((r) => (
        <div key={r.key} className="ckad-row">
          <div className="ckad-row-head">
            <span className="ckad-pod-name">{r.kind}/{r.name}</span>
            <span className={'ckad-chip ' + (r.status === 'same' ? '' : r.status === 'removed' ? 'warn' : 'ok')}>{r.status}</span>
          </div>
          {r.changes.length > 0 && (
            <div className="ckad-row-body">
              {r.changes.map((ch, i) => (
                <span key={i} className="ckad-muted">{pathToString(ch.path)}: {JSON.stringify(ch.from)} → {JSON.stringify(ch.to)}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** GitOps lab widget: sync status, drifted resources, and an autoSync toggle. */
function GitOpsPanel({ sim, lang, c }) {
  const engine = sim.engine;
  const apps = engine.list('GitOpsApp');
  return (
    <div className="statepanel">
      <h4>{c.panelApps}</h4>
      {apps.map((app) => (
        <div key={app.metadata.name} className="ckad-row">
          <div className="ckad-row-head">
            <span className="ckad-pod-name">🔄 {app.metadata.name}</span>
            <span className={'ckad-chip ' + (app.status.syncStatus === 'Synced' ? 'ok' : app.status.syncStatus === 'Error' ? 'warn' : 'on')}>{app.status.syncStatus}</span>
          </div>
          <div className="ckad-row-body">
            <span className="ckad-muted">{c.panelSource}: {app.spec.sourcePath}</span>
            <button className="act mini" onClick={() => engine.setAutoSync(app, !app.spec.autoSync)}>
              {app.spec.autoSync ? c.btnAutoSyncOn : c.btnAutoSyncOff}
            </button>
          </div>
          {(app.status.lastDrift || []).length > 0 && (
            <div className="ckad-row-body">
              {app.status.lastDrift.map((d, i) => (
                <span key={i} className="ckad-chip warn">{d.type === 'missing' ? c.panelMissing : c.panelModified} {d.kind}/{d.name}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const PANELS = { helm: HelmPanel, kustomize: KustomizePanel, gitops: GitOpsPanel };

/** Module 18 — Packaging & GitOps: Helm, Kustomize, and a GitOps drift-reconciliation lab (plan step 16). */
export default function PackagingLabs() {
  const { lang } = useLang();
  const { packagingDone, completePackagingMission, resetPackagingLab } = useProgress();
  const c = content[lang].m18;
  const [sub, setTab] = useSubRoute('m18', (id) => PACKAGING_LABS.some((l) => l.id === id));
  const tab = sub ?? PACKAGING_LABS[0].id;

  return (
    <>
      <Rich tag="h2" content={c.title} />
      <Rich tag="p" className="sub" content={c.sub} />
      <div className="ckad-tabs">
        {PACKAGING_LABS.map((lab) => (
          <button key={lab.id} className={'act' + (tab === lab.id ? ' ckad-tab-active' : '')} onClick={() => setTab(lab.id)}>
            {lab.tab[lang]}
          </button>
        ))}
      </div>
      {PACKAGING_LABS.map((lab) => (
        <div key={lab.id} style={{ display: tab === lab.id ? '' : 'none' }}>
          <LabRunner
            lab={lab}
            lang={lang}
            c={c}
            Panel={PANELS[lab.id]}
            done={packagingDone[lab.id] || []}
            complete={(mid) => completePackagingMission(lab.id, mid)}
            reset={() => resetPackagingLab(lab.id)}
            editorCmdHint="kubectl apply -k k8s/overlays/prod"
          />
        </div>
      ))}
    </>
  );
}
