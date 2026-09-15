import { describe, it, expect } from 'vitest';
import {
  cashBalanceBefore, cycleCashSummary, netFlow, DEFAULT_CYCLE_RESET_DAY,
} from '@/lib/utils';

const RESET = DEFAULT_CYCLE_RESET_DAY; // the 7th

const debit  = (amount, date, categoryId = 'cat-a') => ({ kind: 'debit',  amount, date, categoryId });
const income = (amount, date) => ({ kind: 'credit', amount, date, categoryId: null });
const refund = (amount, date, categoryId = 'cat-a') => ({ kind: 'credit', amount, date, categoryId });

/** 7 Jun – 6 Jul, then 7 Jul – 6 Aug. */
const LEDGER = [
  income(86000, '2026-06-07'),
  debit(20000, '2026-06-10', 'cat-rent'),
  refund(1000, '2026-06-20', 'cat-shop'),
  debit(5000, '2026-07-01', 'cat-food'),   // 1 Jul still belongs to the JUNE cycle
  income(86000, '2026-07-07'),
  debit(30000, '2026-07-15', 'cat-misc'),
];

describe('cashBalanceBefore', () => {
  it('returns the anchor untouched when nothing precedes the date', () => {
    expect(cashBalanceBefore(LEDGER, '2026-06-07', 45000)).toBe(45000);
  });

  it('excludes the boundary date itself', () => {
    // The 86,000 landing ON 7 Jun must not be counted by a "before 7 Jun" call.
    expect(cashBalanceBefore(LEDGER, '2026-06-07', 0)).toBe(0);
    expect(cashBalanceBefore(LEDGER, '2026-06-08', 0)).toBe(86000);
  });

  it('adds credits and subtracts debits', () => {
    expect(cashBalanceBefore(LEDGER, '2026-06-21', 0)).toBe(86000 - 20000 + 1000);
  });

  it('survives an empty ledger without producing NaN', () => {
    const v = cashBalanceBefore([], '2026-06-07', 0);
    expect(v).toBe(0);
    expect(Number.isNaN(v)).toBe(false);
  });

  it('ignores malformed rows rather than poisoning the balance with NaN', () => {
    const junk = [{ kind: 'debit', amount: 'abc', date: '2026-06-08' }, { kind: 'credit' }, null];
    const v = cashBalanceBefore(junk, '2026-07-01', 1000);
    expect(Number.isNaN(v)).toBe(false);
    expect(v).toBe(1000);
  });
});

describe('cycleCashSummary — the accounting identity', () => {
  const jun = cycleCashSummary(LEDGER, '2026-06', RESET, 45000);
  const jul = cycleCashSummary(LEDGER, '2026-07', RESET, 45000);

  it('opening + netFlow = closing', () => {
    expect(jun.opening + jun.netFlow).toBe(jun.closing);
    expect(jul.opening + jul.netFlow).toBe(jul.closing);
  });

  it('carries the previous cycle closing into the next cycle opening', () => {
    // The invariant the whole feature rests on.
    expect(jul.opening).toBe(jun.closing);
  });

  it('counts a refund as cash in, unlike netSpend which nets it off a category', () => {
    expect(jun.credits).toBe(86000 + 1000);
    expect(jun.refunds).toBe(1000);
    expect(jun.income).toBe(86000);
  });

  it('splits the cycle on the reset day, not the month end', () => {
    // 1 Jul is inside the June cycle (7 Jun – 6 Jul), so its 5,000 is June's.
    expect(jun.debits).toBe(25000);
    expect(jul.debits).toBe(30000);
  });

  it('shifts the whole chain by exactly the anchor and nothing else', () => {
    const zero = cycleCashSummary(LEDGER, '2026-07', RESET, 0);
    expect(jul.closing - zero.closing).toBe(45000);
    expect(jul.netFlow).toBe(zero.netFlow);
  });

  it('is zero, not NaN, on an empty ledger', () => {
    const empty = cycleCashSummary([], '2026-07', RESET, 0);
    expect(empty.closing).toBe(0);
    expect(empty.opening).toBe(0);
    expect(Number.isNaN(empty.closing)).toBe(false);
  });
});

describe('cycleCashSummary — editing history (prompt rules 6, 7, 8)', () => {
  it('re-derives every later opening when an entry is back-dated in', () => {
    const before = cycleCashSummary(LEDGER, '2026-07', RESET, 45000);
    const after = cycleCashSummary([...LEDGER, debit(10000, '2026-06-11')], '2026-07', RESET, 45000);
    expect(after.opening).toBe(before.opening - 10000);
    expect(after.closing).toBe(before.closing - 10000);
  });

  it('re-derives every later opening when a historical entry is deleted', () => {
    const before = cycleCashSummary(LEDGER, '2026-07', RESET, 45000);
    const without = LEDGER.filter((t) => t.date !== '2026-06-10'); // drop the 20,000 rent
    const after = cycleCashSummary(without, '2026-07', RESET, 45000);
    expect(after.opening).toBe(before.opening + 20000);
  });

  it('moves an entry between cycles when its date changes across the reset day', () => {
    // 6 Jul -> 7 Jul walks the 5,000 from the June cycle into the July one.
    const moved = LEDGER.map((t) => (t.date === '2026-07-01' ? { ...t, date: '2026-07-07' } : t));
    const jun = cycleCashSummary(moved, '2026-06', RESET, 0);
    const jul = cycleCashSummary(moved, '2026-07', RESET, 0);
    expect(jun.debits).toBe(20000);
    expect(jul.debits).toBe(35000);
    expect(jul.opening).toBe(jun.closing); // chain still intact after the move
  });

  it('keeps the closing balance of the final cycle equal to anchor + whole-ledger netFlow', () => {
    const jul = cycleCashSummary(LEDGER, '2026-07', RESET, 45000);
    expect(jul.closing).toBe(45000 + netFlow(LEDGER));
  });
});
