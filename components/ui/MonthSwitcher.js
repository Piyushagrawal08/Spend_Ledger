'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { monthLabel, shiftMonth, currentCycleKey, cycleRangeLabel, DEFAULT_CYCLE_RESET_DAY } from '@/lib/utils';

export default function MonthSwitcher({ monthKey, onChange, resetDay = DEFAULT_CYCLE_RESET_DAY }) {
  const current = currentCycleKey(resetDay);
  const isCurrent = monthKey === current;
  return (
    <div className="flex items-center gap-1 rounded-full border border-ink-border bg-ink-800/80 px-1.5 py-1">
      <button
        onClick={() => onChange(shiftMonth(monthKey, -1))}
        className="p-1.5 rounded-full hover:bg-ink-700 text-paper-500 hover:text-paper-100 transition-colors"
        aria-label="Previous cycle"
      >
        <ChevronLeft size={15} />
      </button>
      <span className="px-1.5 min-w-[110px] text-center select-none leading-tight">
        <span className="block font-mono text-xs text-paper-100">{monthLabel(monthKey)}</span>
        <span className="block font-mono text-[9px] text-paper-500">{cycleRangeLabel(monthKey, resetDay)}</span>
      </span>
      <button
        onClick={() => onChange(shiftMonth(monthKey, 1))}
        disabled={isCurrent}
        className="p-1.5 rounded-full hover:bg-ink-700 text-paper-500 hover:text-paper-100 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-paper-500"
        aria-label="Next cycle"
      >
        <ChevronRight size={15} />
      </button>
      {!isCurrent && (
        <button
          onClick={() => onChange(current)}
          className="ml-1 text-[10px] uppercase tracking-wide text-signal-amber hover:text-amber-300 font-mono px-1.5"
        >
          today
        </button>
      )}
    </div>
  );
}
