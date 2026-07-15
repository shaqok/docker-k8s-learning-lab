import Rich from '../components/Rich.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { content } from '../content/index.js';

/** Stage 5 — Helm, GitOps, observability, security, operators, cluster ops. */
export default function Production() {
  const { lang } = useLang();
  const c = content[lang].m9;
  return (
    <>
      <Rich tag="h2" content={c.title} />
      <Rich tag="p" className="sub" content={c.sub} />
      {c.cards.map((nodes, i) => (
        <Rich key={i} content={nodes} />
      ))}
    </>
  );
}
