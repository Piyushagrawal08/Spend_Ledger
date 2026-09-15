'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const ThemeCtx = createContext(null);
const STORAGE_KEY = 'spendledger.theme';

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('dark');

  // localStorage and matchMedia do not exist during the server render, so the
  // real theme cannot seed useState without a hydration mismatch. The inline
  // no-flash script in app/layout.js paints the right colours before this runs.
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const initial = saved || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(initial);
    document.documentElement.classList.toggle('dark', initial === 'dark');
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      window.localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.classList.toggle('dark', next === 'dark');
      return next;
    });
  }, []);

  return <ThemeCtx.Provider value={{ theme, toggleTheme }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
