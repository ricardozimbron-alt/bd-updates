'use client';

import { useEffect, useState } from 'react';

const KEY = 'bdu-theme';

export function ThemeToggle() {
  const [mode, setMode] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const stored = (localStorage.getItem(KEY) ?? 'dark') as 'dark' | 'light';
    setMode(stored);
    apply(stored);
  }, []);

  function apply(m: 'dark' | 'light') {
    const root = document.documentElement;
    if (m === 'light') {
      root.classList.remove('dark');
      root.classList.add('light');
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
    }
  }

  function toggle() {
    const next = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    apply(next);
    localStorage.setItem(KEY, next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="text-xs text-ink-400 hover:text-ink-100"
      title="Toggle dark / light"
    >
      {mode === 'dark' ? '☾' : '☼'}
    </button>
  );
}
