import { createContext, useContext, useEffect, useState } from 'react';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('dk8slang') || 'en'; } catch { return 'en'; }
  });

  const toggle = () => {
    const next = lang === 'en' ? 'ko' : 'en';
    try { localStorage.setItem('dk8slang', next); } catch { /* private mode */ }
    setLang(next);
  };

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = lang === 'ko' ? 'Docker & 쿠버네티스 인터랙티브 랩' : 'Docker & Kubernetes Interactive Lab';
  }, [lang]);

  return <LanguageContext.Provider value={{ lang, toggle }}>{children}</LanguageContext.Provider>;
}

export const useLang = () => useContext(LanguageContext);
