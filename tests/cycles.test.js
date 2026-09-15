import { describe, it, expect } from 'vitest';
import {
  cycleKeyOf, cycleStartDate, cycleEndDate, cycleLastDate, cycleLengthDays,
  isInCycle, filterCycle, currentCycleKey, clampCycleResetDay, shiftMonth,
  elapsedDaysInCycle, daysLeftInCycle, cycleDateAtOffset,
} from '@/lib/utils';

// A cycle runs [resetDay of its month, resetDay of the next month). It is
// keyed by its OPENING month, so '2026-08' with reset day 7 is 7 Aug – 6 Sep.

describe('cycle boundaries', () => {
  it('opens on the reset day and ends the day before the next one', () => {
    expect(cycleStartDate('2026-08', 7)).toBe('2026-08-07');
    expect(cycleEndDate('2026-08', 7)).toBe('2026-09-07');   // exclusive
    expect(cycleLastDate('2026-08', 7)).toBe('2026-09-06');
  });

  it('treats the reset day itself as the START of the next cycle', () => {
    expect(cycleKeyOf('2026-09-06', 7)).toBe('2026-08');
    expect(cycleKeyOf('2026-09-07', 7)).toBe('2026-09');
    expect(isInCycle('2026-09-07', '2026-08', 7)).toBe(false);
  });

  it('puts an early-month date in the PREVIOUS cycle', () => {
    expect(cycleKeyOf('2026-08-01', 7)).toBe('2026-07');
  });

  it('collapses to calendar months when the reset day is 1', () => {
    expect(cycleStartDate('2026-08', 1)).toBe('2026-08-01');
    expect(cycleEndDate('2026-08', 1)).toBe('2026-09-01');
    expect(cycleKeyOf('2026-08-01', 1)).toBe('2026-08');
    expect(cycleKeyOf('2026-08-31', 1)).toBe('2026-08');
  });
});

describe('cycle boundaries — calendar edge cases', () => {
  it('crosses December into January', () => {
    expect(cycleEndDate('2026-12', 7)).toBe('2027-01-07');
    expect(cycleKeyOf('2027-01-03', 7)).toBe('2026-12');
    expect(cycleKeyOf('2027-01-07', 7)).toBe('2027-01');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2027-01', -1)).toBe('2026-12');
  });

  it('handles a leap February', () => {
    // 2028 is a leap year: 7 Feb -> 6 Mar spans 29 days.
    expect(cycleLengthDays('2028-02', 7)).toBe(29);
    expect(cycleLengthDays('2026-02', 7)).toBe(28);
  });

  it('never yields an invalid start date for any allowed reset day', () => {
    for (let day = 1; day <= 28; day += 1) {
      for (const key of ['2026-01', '2026-02', '2028-02', '2026-04', '2026-12']) {
        const start = cycleStartDate(key, day);
        expect(start.slice(0, 7)).toBe(key);
        expect(Number.isNaN(new Date(start + 'T00:00:00').getTime())).toBe(false);
      }
    }
  });

  it('clamps a reset day outside 1–28 instead of producing a broken cycle', () => {
    expect(clampCycleResetDay(0)).toBe(1);
    expect(clampCycleResetDay(31)).toBe(28);
    expect(clampCycleResetDay('abc')).toBe(7);
  });

  it('gives every cycle a length between 28 and 31 days', () => {
    for (let m = 1; m <= 12; m += 1) {
      const key = `2026-${String(m).padStart(2, '0')}`;
      const len = cycleLengthDays(key, 7);
      expect(len).toBeGreaterThanOrEqual(28);
      expect(len).toBeLessThanOrEqual(31);
    }
  });
});

describe('filterCycle', () => {
  const tx = [
    { date: '2026-08-06', amount: 1, kind: 'debit' }, // previous cycle
    { date: '2026-08-07', amount: 2, kind: 'debit' }, // first day
    { date: '2026-09-06', amount: 3, kind: 'debit' }, // last day
    { date: '2026-09-07', amount: 4, kind: 'debit' }, // next cycle
  ];

  it('is inclusive of the first day and exclusive of the reset day', () => {
    expect(filterCycle(tx, '2026-08', 7).map((t) => t.amount)).toEqual([2, 3]);
  });

  it('partitions the ledger with no entry lost or double-counted', () => {
    const keys = ['2026-07', '2026-08', '2026-09'];
    const seen = keys.flatMap((k) => filterCycle(tx, k, 7));
    expect(seen).toHaveLength(tx.length);
    expect(new Set(seen.map((t) => t.amount)).size).toBe(tx.length);
  });
});

describe('cycle progress', () => {
  it('counts elapsed days from the cycle start, today included', () => {
    expect(elapsedDaysInCycle('2026-08', 7, '2026-08-07')).toBe(1);
    expect(elapsedDaysInCycle('2026-08', 7, '2026-08-08')).toBe(2);
  });

  it('reports zero elapsed before the cycle opens', () => {
    expect(elapsedDaysInCycle('2026-08', 7, '2026-08-01')).toBe(0);
  });

  it('caps elapsed at the cycle length once it has closed', () => {
    const len = cycleLengthDays('2026-08', 7);
    expect(elapsedDaysInCycle('2026-08', 7, '2026-12-01')).toBe(len);
  });

  it('never reports negative days left', () => {
    expect(daysLeftInCycle('2026-08', 7, '2026-12-01')).toBe(0);
  });

  it('places offset 0 on the first day of the cycle', () => {
    expect(cycleDateAtOffset('2026-08', 7, 0)).toBe('2026-08-07');
    expect(cycleDateAtOffset('2026-08', 7, 1)).toBe('2026-08-08');
  });

  it('agrees with cycleKeyOf about which cycle today is in', () => {
    expect(currentCycleKey(7, '2026-09-15')).toBe(cycleKeyOf('2026-09-15', 7));
  });
});
