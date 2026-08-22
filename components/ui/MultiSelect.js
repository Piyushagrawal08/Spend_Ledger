'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Filter, X } from 'lucide-react';
import { classNames } from '@/lib/utils';

/**
 * Compact checkbox dropdown. `selected` is an array of option ids; an empty
 * array means "everything" so the caller never has to special-case a reset.
 */
export default function MultiSelect({
  options,
  selected,
  onChange,
  label = 'Filter',
  allLabel = 'All',
  align = 'right',
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle(id) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  const active = selected.length > 0;
  const summary = !active
    ? allLabel
    : selected.length === 1
      ? options.find((o) => o.id === selected[0])?.name || '1 selected'
      : `${selected.length} selected`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={classNames(
          'flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-mono transition-colors',
          active
            ? 'border-signal-amber/50 bg-signal-amber/10 text-signal-amber'
            : 'border-ink-border bg-ink-850 text-paper-300 hover:text-paper-100 hover:bg-ink-700'
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Filter size={11} />
        <span className="max-w-[110px] truncate">{summary}</span>
        <ChevronDown size={11} className={classNames('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          className={classNames(
            'absolute z-50 mt-1.5 w-56 max-h-72 overflow-y-auto rounded-xl border border-ink-border bg-ink-800 shadow-panel p-1.5',
            align === 'right' ? 'right-0' : 'left-0'
          )}
          role="listbox"
        >
          <div className="flex items-center justify-between px-2 py-1.5 mb-1 border-b border-ink-border">
            <span className="text-[10px] uppercase tracking-wide text-paper-500 font-mono">{label}</span>
            {active && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="flex items-center gap-1 text-[10px] font-mono text-signal-amber hover:text-amber-300"
              >
                <X size={10} /> clear
              </button>
            )}
          </div>
          {options.length === 0 && (
            <div className="px-2 py-3 text-[11px] font-mono text-paper-500 text-center">nothing to filter</div>
          )}
          {options.map((o) => {
            const on = selected.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => toggle(o.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs text-paper-300 hover:bg-ink-700 hover:text-paper-100 transition-colors"
              >
                <span
                  className={classNames(
                    'w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border',
                    on ? 'border-transparent' : 'border-ink-border'
                  )}
                  style={on ? { background: o.color || '#F2A93B' } : undefined}
                >
                  {on && <Check size={9} className="text-ink-950" strokeWidth={3.5} />}
                </span>
                {o.color && !on && (
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: o.color }} />
                )}
                <span className="truncate flex-1">{o.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
