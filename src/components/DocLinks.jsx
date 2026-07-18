import { useLang } from '../i18n/LanguageContext.jsx';

const TITLE = {
  en: '📖 In the real docs (allowed in the exam)',
  ko: '📖 실제 문서에서 찾기 (시험에서 허용!)',
};

/**
 * "In the real docs" links. Extracted from LabRunner so the drill labs,
 * troubleshooting scenarios, exam tasks and quiz answers all render them the
 * same way — knowing where a thing lives in kubernetes.io is itself an exam
 * skill, and it was previously only taught in the drill labs.
 *
 * Link labels stay in English: they name doc-site pages, and translating them
 * would make them harder to find, not easier.
 */
export default function DocLinks({ docs, title }) {
  const { lang } = useLang();
  if (!docs || !docs.length) return null;
  return (
    <span className="ckad-docs">
      {title || TITLE[lang]}:{' '}
      {docs.map((d) => (
        <a key={d.url} href={d.url} target="_blank" rel="noreferrer">{d.label}</a>
      ))}
    </span>
  );
}
