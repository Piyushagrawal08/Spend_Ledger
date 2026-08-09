'use client';

import { X } from 'lucide-react';
import { useEffect } from 'react';

export default function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md sm:mx-4 max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-ink-border bg-ink-800 shadow-panel animate-rise">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-border sticky top-0 bg-ink-800">
          <h3 className="font-display text-sm font-semibold text-paper-100">{title}</h3>
          <button onClick={onClose} className="text-paper-500 hover:text-paper-100" aria-label="Close">
            <X size={17} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
