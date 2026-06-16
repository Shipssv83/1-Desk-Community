import { useState, useCallback } from 'react';

export function useTheme() {
  const [theme, setThemeState] = useState(
    () => document.documentElement.getAttribute('data-theme') || 'light'
  );

  const setTheme = useCallback((next) => {
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}
