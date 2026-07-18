import { useEffect, useRef, useState } from 'react';
import Rich from '../components/Rich.jsx';
import Html from '../components/Html.jsx';
import PracticeLink from '../components/PracticeLink.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { content } from '../content/index.js';
import { tr } from '../i18n/dynamic.js';
import { SEC_LAYERS } from '../data/securityLayers.js';
import { initialGitops, gitopsDemoStep, gitopsStatus } from '../data/gitopsDemo.js';

const SEC_KEYS = ['rbac', 'podsec', 'netpol', 'supply'];
const SEC_PRACTICE = {
  rbac: { to: 'm12', sub: 'rbac' },
  podsec: { to: 'm20', sub: 'pod-security' },
  netpol: { to: 'm13', sub: 'netpol' },
  supply: { to: 'm20', sub: 'supply-chain' },
};

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

      <Rich content={c.helmCard} />

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

      <Rich content={c.crdCard} />
      <Rich content={c.clusterCard} />
    </>
  );
}
