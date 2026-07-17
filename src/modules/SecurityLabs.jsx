import Rich from '../components/Rich.jsx';
import { useSubRoute } from '../context/RouteContext.jsx';
import LabRunner from '../components/LabRunner.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useProgress } from '../context/ProgressContext.jsx';
import { content } from '../content/index.js';
import { SECURITY_LABS } from '../data/securityLabs.js';
import { createSupplyChainSim } from '../sims/supplyChainSim.js';
import { canConnect } from '../sims/k8s/netpol.js';

const FlagChip = ({ label, ok, c }) => (
  <span className={'ckad-chip ' + (ok ? 'ok' : 'warn')}>{label}: {ok ? c.panelFlagSecure : c.panelFlagInsecure}</span>
);

/** Shared by Cluster Setup + System Hardening: the hostops clusterConfig flags each lab cares about. */
function BenchPanel({ sim, c, flags }) {
  const cc = sim.host?.state.clusterConfig;
  if (!cc) return null;
  return (
    <div className="statepanel">
      <h4>{c.panelBenchTitle}</h4>
      <div className="ckad-row-body">
        {flags.map((f) => <FlagChip key={f.key} label={f.label} ok={cc[f.key] === f.secureWhen} c={c} />)}
      </div>
    </div>
  );
}

const ClusterSetupPanel = ({ sim, c }) => (
  <BenchPanel sim={sim} c={c} flags={[
    { key: 'anonymousAuth', label: 'anonymous-auth', secureWhen: false },
    { key: 'profiling', label: 'profiling', secureWhen: false },
    { key: 'etcdClientCertAuth', label: 'etcd-client-cert-auth', secureWhen: true },
  ]} />
);

const SystemHardeningPanel = ({ sim, c }) => (
  <BenchPanel sim={sim} c={c} flags={[{ key: 'kubeletReadOnlyPort', label: 'kubelet-read-only-port', secureWhen: false }]} />
);

/** Cluster Hardening lab widget: RoleBindings + NetworkPolicies in shop, and live api→db connectivity. */
function ClusterHardeningPanel({ sim, c }) {
  const engine = sim.engine;
  const bindings = engine.list('RoleBinding', { ns: 'shop' });
  const policies = engine.list('NetworkPolicy', { ns: 'shop' });
  const api = engine.list('Pod', { ns: 'shop' }).find((p) => p.metadata.labels.app === 'api');
  const db = engine.list('Pod', { ns: 'shop' }).find((p) => p.metadata.labels.app === 'db');
  const conn = api && db ? canConnect(engine, { from: api, to: db, port: 5432 }) : null;
  return (
    <div className="statepanel">
      <h4>{c.panelBindings}</h4>
      {bindings.map((b) => <div key={b.metadata.name} className="ckad-chip">{b.metadata.name} → {b.roleRef.name}</div>)}
      <h4>{c.panelPolicies}</h4>
      {policies.length ? policies.map((p) => <div key={p.metadata.name} className="ckad-chip">{p.metadata.name}</div>) : <div className="ckad-muted">—</div>}
      <h4>{c.panelConnectivity}</h4>
      {conn && <span className={'ckad-chip ' + (conn.allowed ? 'ok' : 'warn')}>{conn.allowed ? c.panelConnOk : c.panelConnBlocked}</span>}
    </div>
  );
}

/** Pod Security lab widget: the apps namespace's enforced PSA level + the target pod's fate. */
function PodSecurityPanel({ sim, c }) {
  const engine = sim.engine;
  const ns = engine.get('Namespace', null, 'apps');
  const level = ns?.metadata.labels['pod-security.kubernetes.io/enforce'] || 'privileged';
  const pod = engine.get('Pod', 'apps', 'secure-app');
  return (
    <div className="statepanel">
      <h4>{c.panelPsaLevel}</h4>
      <span className={'ckad-chip ' + (level === 'restricted' ? 'ok' : '')}>{level}</span>
      <h4>{c.panelPodStatus}</h4>
      <span className={'ckad-chip ' + (pod ? 'ok' : 'warn')}>{pod ? pod.status.phase : c.panelPodMissing}</span>
    </div>
  );
}

/** Supply Chain lab widget: every image's scan/sign state, and whether the pod made it in. */
function SupplyChainPanel({ sim, c }) {
  const images = sim.docker?.listImages() || [];
  const pod = sim.engine.get('Pod', 'default', 'app');
  return (
    <div className="statepanel">
      <h4>{c.panelImages}</h4>
      {images.map((img) => (
        <div key={img.repo + ':' + img.tag} className="ckad-row">
          <div className="ckad-row-head"><span className="ckad-pod-name">{img.repo}:{img.tag}</span></div>
          <div className="ckad-row-body">
            <span className={'ckad-chip ' + (img.scan ? 'ok' : 'warn')}>{img.scan ? c.panelScanned : c.panelUnscanned}</span>
            {img.scan && <span className={'ckad-chip ' + (img.scan.findings.length ? 'warn' : 'ok')}>{img.scan.findings.length ? img.scan.findings.length + ' CVE' : c.panelClean}</span>}
            <span className={'ckad-chip ' + (img.signed ? 'ok' : 'warn')}>{img.signed ? c.panelSigned : c.panelUnsigned}</span>
          </div>
        </div>
      ))}
      <h4>{c.panelDeployStatus}</h4>
      <span className={'ckad-chip ' + (pod ? 'ok' : 'warn')}>{pod ? pod.status.phase : c.panelPodMissing}</span>
    </div>
  );
}

/** Audit Log lab widget: the most recent engine events, newest first. */
function AuditLogPanel({ sim, c }) {
  const events = [...sim.engine.events].reverse().slice(0, 10);
  return (
    <div className="statepanel">
      <h4>{c.panelEvents}</h4>
      {events.length ? events.map((ev, i) => (
        <div key={i} className="ckad-row">
          <div className="ckad-row-head">
            <span className="ckad-pod-name">{ev.object}</span>
            <span className={'ckad-chip ' + (ev.type === 'Warning' ? 'warn' : 'ok')}>{ev.reason}</span>
          </div>
          <div className="ckad-row-body"><span className="ckad-muted">{ev.message}</span></div>
        </div>
      )) : <div className="ckad-muted">{c.panelNoEvents}</div>}
    </div>
  );
}

const PANELS = {
  'cluster-setup': ClusterSetupPanel,
  'cluster-hardening': ClusterHardeningPanel,
  'system-hardening': SystemHardeningPanel,
  'pod-security': PodSecurityPanel,
  'supply-chain': SupplyChainPanel,
  'audit-log': AuditLogPanel,
};

/** Module 20 — Security Drills: the six official CKS domains (plan step 17). */
export default function SecurityLabs() {
  const { lang } = useLang();
  const { securityDone, completeSecurityMission, resetSecurityLab } = useProgress();
  const c = content[lang].m20;
  const [sub, setTab] = useSubRoute('m20', (id) => SECURITY_LABS.some((l) => l.id === id));
  const tab = sub ?? SECURITY_LABS[0].id;

  return (
    <>
      <Rich tag="h2" content={c.title} />
      <Rich tag="p" className="sub" content={c.sub} />
      <div className="ckad-tabs">
        {SECURITY_LABS.map((lab) => (
          <button key={lab.id} className={'act' + (tab === lab.id ? ' ckad-tab-active' : '')} onClick={() => setTab(lab.id)}>
            {lab.tab[lang]}
          </button>
        ))}
      </div>
      {SECURITY_LABS.map((lab) => (
        <div key={lab.id} style={{ display: tab === lab.id ? '' : 'none' }}>
          <LabRunner
            lab={lab}
            lang={lang}
            c={c}
            Panel={PANELS[lab.id]}
            done={securityDone[lab.id] || []}
            complete={(mid) => completeSecurityMission(lab.id, mid)}
            reset={() => resetSecurityLab(lab.id)}
            createSim={lab.id === 'supply-chain' ? createSupplyChainSim : undefined}
            editorCmdHint={lab.id === 'supply-chain' ? 'docker build -t app:v1 .' : undefined}
            termPlaceholder="kubectl get pods"
          />
        </div>
      ))}
    </>
  );
}
