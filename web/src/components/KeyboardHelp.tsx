'use client';

import { useEffect, useState } from 'react';

const SHORTCUTS = [
  { key: '?', desc: 'Show this help' },
  { key: 'j', desc: 'Inbox: next draft' },
  { key: 'k', desc: 'Inbox: previous draft' },
  { key: '⌘/  Ctrl+/', desc: 'Open assistant' },
  { key: 'Esc', desc: 'Close panel / modal' },
];

export function KeyboardHelp() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-sm rounded border border-ink-700 bg-ink-900 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Keyboard shortcuts</h3>
          <button
            onClick={() => setOpen(false)}
            className="text-ink-400 hover:text-ink-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <ul className="space-y-1.5 text-sm">
          {SHORTCUTS.map((s) => (
            <li key={s.key} className="flex items-center justify-between">
              <span className="text-ink-300">{s.desc}</span>
              <span className="kbd">{s.key}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
