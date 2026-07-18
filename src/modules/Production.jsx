import { useState } from 'react';
import Rich from '../components/Rich.jsx';
import Html from '../components/Html.jsx';
import PracticeLink from '../components/PracticeLink.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { content } from '../content/index.js';
import { SEC_LAYERS } from '../data/securityLayers.js';

const SEC_KEYS = ['rbac', 'podsec', 'netpol', 'supply'];
const SEC_PRACTICE = {
  rbac: { to: 'm12', sub: 'rbac' },
  podsec: { to: 'm20', sub: 'pod-security' },
  netpol: { to: 'm13', sub: 'netpol' },
  supply: { to: 'm20', sub: 'supply-chain' },
};

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
      <Rich content={c.gitopsCard} />
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
