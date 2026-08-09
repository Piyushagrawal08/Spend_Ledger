'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { monthLabel, shiftMonth, currentMonthKey } from '@/lib/utils';

export default function MonthSwitcher({ monthKey, onChange }) {
  const isCurrent = monthKey === currentMonthKey();
  return (
    <div className="flex items-center gap-1 rounded-full border border-ink-border bg-ink-800/80 px-1.5 py-1">
      <button
        onClick={() => onChange(shiftMonth(monthKey, -1))}
        className="p-1.5 rounded-full hover:bg-ink-700 text-paper-500 hover:text-paper-100 transition-colors"
        aria-label="Previous month"
      >
        <ChevronLeft size={15} />
      </button>
      <span className="font-mono text-xs text-paper-100 px-1.5 min-w-[110px] text-center select-none">
        {monthLabel(monthKey)}
      </span>
      <button
        onClick={() => onChange(shiftMonth(monthKey, 1))}
        disabled={isCurrent}
        className="p-1.5 rounded-full hover:bg-ink-700 text-paper-500 hover:text-paper-100 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-paper-500"
        aria-label="Next month"
      >
        <ChevronRight size={15} />
      </button>
      {!isCurrent && (
        <button
          onClick={() => onChange(currentMonthKey())}
          className="ml-1 text-[10px] uppercase tracking-wide text-signal-amber hover:text-amber-300 font-mono px-1.5"
        >
          today
        </button>
      )}
    </div>
  );
}
