'use client';

import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/lib/ThemeContext';
import { classNames } from '@/lib/utils';

export default function ThemeToggle({ compact }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  if (compact) {
    return (
      <button
        onClick={toggleTheme}
        className="p-2 rounded-lg text-paper-500 hover:text-paper-100 hover:bg-ink-700 transition-colors"
        aria-label="Toggle theme"
      >
        {isDark ? <Sun size={17} /> : <Moon size={17} />}
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-paper-300 hover:bg-ink-800 hover:text-paper-100 transition-colors"
    >
      <span className="relative w-8 h-5 rounded-full bg-ink-700 border border-ink-border flex items-center px-0.5 shrink-0">
        <span
          className={classNames(
            'w-3.5 h-3.5 rounded-full bg-signal-amber flex items-center justify-center transition-transform',
            isDark ? 'translate-x-3.5' : 'translate-x-0'
          )}
        >
          {isDark ? <Moon size={9} className="text-ink-950" /> : <Sun size={9} className="text-ink-950" />}
        </span>
      </span>
      {isDark ? 'Dark mode' : 'Light mode'}
    </button>
  );
}
