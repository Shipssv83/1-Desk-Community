import { useState, useCallback, useEffect } from 'react';

const LANG_EVENT = 'app:lang-change';

export function useLang() {
  const [lang, setLangState] = useState(
    () => localStorage.getItem('lang') || 'en'
  );

  useEffect(() => {
    const handler = () => {
      setLangState(localStorage.getItem('lang') || 'en');
    };
    window.addEventListener(LANG_EVENT, handler);
    return () => window.removeEventListener(LANG_EVENT, handler);
  }, []);

  const setLang = useCallback((l) => {
    localStorage.setItem('lang', l);
    setLangState(l);
    window.dispatchEvent(new Event(LANG_EVENT));
  }, []);

  return { lang, setLang };
}
