import { useEffect, useRef, useState } from 'react';
import Rich from '../components/Rich.jsx';
import Html from '../components/Html.jsx';
import PracticeLink from '../components/PracticeLink.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { content } from '../content/index.js';
import { tr } from '../i18n/dynamic.js';
import { SEC_LAYERS } from '../data/securityLayers.js';
import { initialGitops, gitopsDemoStep, gitopsStatus } from '../data/gitopsDemo.js';
import { renderDemo, valuesText, diffLines } from '../data/helmDemo.js';

const SEC_KEYS = ['rbac', 'podsec', 'netpol', 'supply'];
const SEC_PRACTICE = {
  rbac: { to: 'm12', sub: 'rbac' },
  podsec: { to: 'm20', sub: 'pod-security' },
  netpol: { to: 'm13', sub: 'netpol' },
  supply: { to: 'm20', sub: 'supply-chain' },
};

const HELM_NARR_VALUES =
  'Same templates, different values — only the highlighted lines changed. This is how one chart serves dev, staging and prod.';
const HELM_NARR_IF =
  "ingress.enabled=true — a whole Ingress object appeared in the render. Values don't just fill blanks; {{ if }} switches entire objects on and off.";

/** Pre block whose changed-vs-baseline lines are highlighted. */
function DiffPre({ text, baseline }) {
  const changed = diffLines(text, baseline);
  return (
    <pre className="code" style={{ margin: 0, flex: 1, minWidth: 0 }}>
      {text.split('\n').map((l, i) => (
        <span key={i} style={changed[i] ? { background: 'rgba(88,166,255,.18)', display: 'block' } : { display: 'block' }}>
          {l || ' '}
        </span>
      ))}
    </pre>
  );
}

/** Three knobs on a real chart, rendered by the real template engine. */
function HelmValuesDemo({ c, lang }) {
  const [replicaCount, setReplicaCount] = useState(1);
  const [tag, setTag] = useState('v1');
  const [ingressOn, setIngressOn] = useState(false);

  const overrides = { replicaCount, image: { tag }, ingress: { enabled: ingressOn } };
  const rendered = renderDemo(overrides).text;
  const baseline = renderDemo().text;
  const isDefault = replicaCount === 1 && tag === 'v1' && !ingressOn;
  const setFlags = [
    replicaCount !== 1 && `replicaCount=${replicaCount}`,
    tag !== 'v1' && `image.tag=${tag}`,
    ingressOn && 'ingress.enabled=true',
  ].filter(Boolean);
  const selStyle = { background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: 5 };
  const headStyle = { margin: '8px 0 4px', fontSize: 12, color: 'var(--muted)' };

  return (
    <>
      <Rich tag="h4" style={{ marginTop: 18 }} content={c.helmDemoTitle} />
      <Rich tag="p" content={c.helmDemoIntro} />
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13 }}>
          <code>replicaCount</code>{' '}
          {[1, 3, 5].map((n) => (
            <button key={n} className={'act mini' + (replicaCount === n ? ' primary' : '')} onClick={() => setReplicaCount(n)}>
              {n}
            </button>
          ))}
        </label>
        <label style={{ fontSize: 13 }}>
          <code>image.tag</code>{' '}
          <select value={tag} onChange={(e) => setTag(e.target.value)} style={selStyle}>
            <option value="v1">v1</option>
            <option value="v2">v2</option>
          </select>
        </label>
        <label style={{ fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={ingressOn} onChange={(e) => setIngressOn(e.target.checked)} /> <code>ingress.enabled</code>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <h5 style={headStyle}>{c.helmValuesHead}</h5>
          <DiffPre text={valuesText(overrides)} baseline={valuesText()} />
        </div>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <h5 style={headStyle}>{c.helmRenderHead}</h5>
          <DiffPre text={rendered} baseline={baseline} />
        </div>
      </div>
      <div className="hint" style={{ minHeight: 40 }}>
        {isDefault ? (
          <Rich tag="span" content={c.helmDemoHint0} />
        ) : (
          <>
            <code>$ helm upgrade web ./mychart --set {setFlags.join(',')}</code>
            <br />
            <Html tag="span" html={tr(lang, ingressOn ? HELM_NARR_IF : HELM_NARR_VALUES)} />
          </>
        )}
      </div>
    </>
  );
}

const GITOPS_NARR = {
  'merge-pr': 'PR merged — the repo now wants <b>web:v2</b>. The cluster still runs v1 — <b>OutOfSync</b>. In GitOps the repo changes first; the cluster follows.',
  'git-revert': 'git revert — the repo wants v1 again. Rollback is just another commit; the agent converges the cluster the same way it deploys.',
  'kubectl-edit': 'kubectl edit against prod: replicas 3 → 5. The cluster now disagrees with git — <b>drift</b>. Six months later nobody remembers why prod is different… except the agent, which flags it.',
  sync: "Synced — the agent applied exactly what's in git. Cluster == repo again.",
};
const GITOPS_NARR_AUTO = '⚡ auto-sync: the agent noticed the drift and reverted it by itself. Nobody runs kubectl against prod — the repo is the only door in.';
const GITOPS_NARR_AUTO_ON = 'Auto-sync ON — the agent now converges every drift by itself within seconds.';
const GITOPS_NARR_AUTO_OFF = 'Auto-sync OFF — the agent only reports drift; you press sync.';

const podStyle = (tag) => ({
  width: 14,
  height: 14,
  borderRadius: 3,
  background: tag === 'v2' ? 'var(--purple)' : 'var(--green)',
});

/** Repo → agent → cluster: deploy by merge, roll back by revert, drift by kubectl. */
function GitOpsLoopDemo({ c, lang }) {
  const [s, setS] = useState(initialGitops);
  const [narr, setNarr] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const act = (action) => {
    clearTimeout(timerRef.current);
    const next = gitopsDemoStep(s, action);
    setS(next);
    setNarr(
      action === 'toggle-autosync'
        ? next.autoSync ? GITOPS_NARR_AUTO_ON : GITOPS_NARR_AUTO_OFF
        : GITOPS_NARR[action],
    );
    // the agent: with auto-sync on, any drift snaps back to the repo shortly after
    if (next.autoSync && gitopsStatus(next) === 'drifted') {
      timerRef.current = setTimeout(() => {
        setS((p) => gitopsDemoStep(p, 'sync'));
        setNarr(GITOPS_NARR_AUTO);
      }, 1500);
    }
  };

  const synced = gitopsStatus(s) === 'synced';
  const actionForBtn = ['merge-pr', 'git-revert', 'kubectl-edit', 'sync'];
  const boxStyle = { flex: 1, minWidth: 0, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' };
  const headStyle = { margin: '0 0 6px', fontSize: 12, color: 'var(--muted)' };

  return (
    <>
      <Rich tag="h4" style={{ marginTop: 18 }} content={c.gitopsDemoTitle} />
      <Rich tag="p" content={c.gitopsDemoIntro} />
      <div>
        {actionForBtn.map((a, i) => (
          <button key={a} className={'act' + (a === 'merge-pr' ? ' primary' : '')} onClick={() => act(a)}>
            {c.gitopsDemoBtns[i]}
          </button>
        ))}
        <label style={{ marginLeft: 8, fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={s.autoSync} onChange={() => act('toggle-autosync')} /> {c.gitopsDemoAuto}
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', marginTop: 10, flexWrap: 'wrap' }}>
        <div style={boxStyle}>
          <h5 style={headStyle}>{c.gitopsRepoHead}</h5>
          <pre className="code" style={{ margin: 0 }}>
            image: web:{s.repo.tag}{'\n'}replicas: {s.repo.replicas}
          </pre>
        </div>
        <div style={{ ...boxStyle, flex: '0 0 auto', textAlign: 'center', alignSelf: 'center' }}>
          <h5 style={headStyle}>{c.gitopsAgentHead}</h5>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: synced ? 'var(--green)' : 'var(--yellow)',
              border: '1px solid',
              borderRadius: 10,
              padding: '2px 8px',
              whiteSpace: 'nowrap',
            }}
          >
            {synced ? '✓ Synced' : '⚠ OutOfSync'}
          </span>
        </div>
        <div style={boxStyle}>
          <h5 style={headStyle}>{c.gitopsClusterHead}</h5>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
            {Array.from({ length: s.cluster.replicas }, (_, i) => (
              <div key={i} style={podStyle(s.cluster.tag)} title={`web-${i + 1} · ${s.cluster.tag}`} />
            ))}
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>image: web:{s.cluster.tag} · replicas: {s.cluster.replicas}</span>
        </div>
      </div>
      <div className="hint" style={{ minHeight: 40 }}>
        {narr ? <Html tag="span" html={tr(lang, narr)} /> : <Rich tag="span" content={c.gitopsDemoHint0} />}
      </div>
    </>
  );
}

const OP_YAML_CRD = `# crd.yaml
kind: CustomResourceDefinition
metadata:
  name: postgresclusters.example.io
spec:
  names:
    kind: PostgresCluster`;
const OP_YAML_CR = `# pg.yaml
kind: PostgresCluster
metadata:
  name: shop-db
spec:
  instances: 2
  version: "16"`;

const OP_NARR = [
  'kubectl apply -f crd.yaml — the API server just learned a new kind: PostgresCluster. Nothing is running; the cluster only gained vocabulary.',
  'kubectl apply -f pg.yaml — the CR is stored. Still nothing runs: an object in etcd is just a record of intent. Someone has to act on it.',
  'The operator — itself just a pod — starts watching PostgresClusters. It sees desired (2 instances) ≠ actual (0)… a familiar loop?',
  'The operator creates what a DBA would have: a StatefulSet (primary + replica), a Service, a credentials Secret. Encoded expertise, running the reconcile loop.',
  '💥 The primary dies. The operator promotes the replica and recreates the pod — automatic failover. Same reconcile loop as the ReplicaSet in Module 3; you just wrote the controller.',
];

// what the cluster pane shows after each step (1-indexed by step)
const OP_ROWS = [
  { at: 1, icon: '📘', text: 'API server: new kind registered — PostgresCluster', dim: false },
  { at: 2, icon: '📄', text: 'postgresclusters/shop-db — spec stored, nothing running', dim: false },
  { at: 3, icon: '🤖', text: 'pod postgres-operator — Running, watching PostgresClusters', dim: false },
  { at: 4, icon: '🐘', text: 'pod shop-db-0 — primary', kill: true },
  { at: 4, icon: '🐘', text: 'pod shop-db-1 — replica', promote: true },
  { at: 4, icon: '🔌', text: 'svc shop-db · secret shop-db-creds', dim: false },
  { at: 5, icon: '🐘', text: 'pod shop-db-0 — recreated, replica', dim: false },
];

/** Five-step CRD → CR → operator → children → failover walk-through. */
function OperatorDemo({ c, lang }) {
  const [step, setStep] = useState(0);
  const yaml = step >= 2 ? OP_YAML_CR : step >= 1 ? OP_YAML_CRD : null;
  const headStyle = { margin: '8px 0 4px', fontSize: 12, color: 'var(--muted)' };

  return (
    <>
      <Rich tag="h4" style={{ marginTop: 18 }} content={c.crdDemoTitle} />
      <Rich tag="p" content={c.crdDemoIntro} />
      <div>
        <button className="act primary" onClick={() => setStep((s) => Math.min(s + 1, 5))} disabled={step >= 5}>
          {c.crdDemoBtnNext} {step > 0 && `(${step}/5)`}
        </button>
        <button className="act" onClick={() => setStep(0)}>{c.crdDemoBtnReset}</button>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <h5 style={headStyle}>{c.crdDemoYamlHead}</h5>
          <pre className="code" style={{ margin: 0, minHeight: 120 }}>{yaml || ' '}</pre>
        </div>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <h5 style={headStyle}>{c.crdDemoClusterHead}</h5>
          <div style={{ background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', minHeight: 120 }}>
            {OP_ROWS.filter((r) => step >= r.at).map((r, i) => {
              const killed = r.kill && step >= 5;
              const promoted = r.promote && step >= 5;
              return (
                <div
                  key={i}
                  style={{
                    fontSize: 12,
                    padding: '2px 0',
                    color: killed ? 'var(--red)' : 'var(--text)',
                    textDecoration: killed ? 'line-through' : 'none',
                  }}
                >
                  {r.icon} {tr(lang, promoted ? r.text.replace('replica', 'promoted → primary') : r.text)}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="hint" style={{ minHeight: 40 }}>
        {step === 0 ? <Rich tag="span" content={c.crdDemoHint0} /> : <Html tag="span" html={tr(lang, OP_NARR[step - 1])} />}
      </div>
    </>
  );
}

/** Defense-in-depth stack: click a layer, read what it guards, jump to its drill. */
function SecurityLayers({ c, lang }) {
  const [sel, setSel] = useState(null);
  return (
    <div className="grid2">
      <div>
        {SEC_KEYS.map((k, i) => (
          <div key={k} className={'cpcomp' + (sel === k ? ' sel' : '')} onClick={() => setSel(k)}>
            <span>{c.secLayerLabels[i]}</span>
          </div>
        ))}
      </div>
      <div className="card" style={{ margin: 0 }}>
        {sel ? (
          <>
            <Html tag="p" html={SEC_LAYERS[lang][sel]} />
            <PracticeLink to={SEC_PRACTICE[sel].to} sub={SEC_PRACTICE[sel].sub} />
          </>
        ) : (
          <Rich content={c.secEmpty} />
        )}
      </div>
    </div>
  );
}

/** Stage 5 — Helm, GitOps, observability, security, operators, cluster ops. */
export default function Production() {
  const { lang } = useLang();
  const c = content[lang].m9;
  return (
    <>
      <Rich tag="h2" content={c.title} />
      <Rich tag="p" className="sub" content={c.sub} />

      <div className="card">
        {/* helmCard is a single card — render its body here so the widget joins it */}
        <Rich content={c.helmCard[0].c} />
        <HelmValuesDemo c={c} lang={lang} />
        <PracticeLink
          to="m19"
          sub="helm"
          blurb={{ en: 'Install, upgrade and roll back a real chart with helm', ko: 'helm으로 진짜 차트를 설치·업그레이드·롤백해 보기' }}
        />
      </div>

      <div className="card">
        {/* gitopsCard is a single card — render its body here so the widget joins it */}
        <Rich content={c.gitopsCard[0].c} />
        <GitOpsLoopDemo c={c} lang={lang} />
        <PracticeLink
          to="m19"
          sub="gitops"
          blurb={{ en: 'Run a real sync/drift loop with kubectl and a git file store', ko: 'kubectl과 git 파일 저장소로 진짜 sync/드리프트 루프 돌려보기' }}
        />
      </div>

      <Rich content={c.obsCard} />

      <div className="card">
        {/* secCard is a single card — render its body inside this wrapper so the widget joins it */}
        <Rich content={c.secCard[0].c} />
        <SecurityLayers c={c} lang={lang} />
      </div>

      <div className="card">
        {/* crdCard is a single card — render its body here so the widget joins it */}
        <Rich content={c.crdCard[0].c} />
        <OperatorDemo c={c} lang={lang} />
      </div>

      <Rich content={c.clusterCard} />
    </>
  );
}
