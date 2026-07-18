import Rich from '../components/Rich.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { content } from '../content/index.js';

const TOPICS = ['helmCard', 'gitopsCard', 'obsCard', 'secCard', 'crdCard', 'clusterCard'];

/** Stage 5 — Helm, GitOps, observability, security, operators, cluster ops. */
export default function Production() {
  const { lang } = useLang();
  const c = content[lang].m9;
  return (
    <>
      <Rich tag="h2" content={c.title} />
      <Rich tag="p" className="sub" content={c.sub} />
      {TOPICS.map((k) => (
        <Rich key={k} content={c[k]} />
      ))}
    </>
  );
}
