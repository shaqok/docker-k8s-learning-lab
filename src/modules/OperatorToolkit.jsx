import Rich from '../components/Rich.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { content } from '../content/index.js';

const TOPICS = ['yamlCard', 'configCard', 'probesCard', 'qosCard', 'scaleCard', 'storageCard', 'trafficCard', 'beyondCard'];

/** Stage 4 — YAML, ConfigMaps/Secrets, probes, resources, autoscaling, storage, Ingress. */
export default function OperatorToolkit() {
  const { lang } = useLang();
  const c = content[lang].m8;
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
