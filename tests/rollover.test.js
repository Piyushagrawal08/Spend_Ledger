import { describe, it, expect } from 'vitest';
import { useBudgetSelectors } from '@/lib/ledgerSelectors';
import { callHook } from './helpers/callHook';

// CARRIED  — the budget NUMBER persists into later cycles until changed.
// ROLLOVER — the unspent MONEY moves, like a running account balance.
// They are different things and this file keeps them apart.

const RESET = 7;
const CATS = [
  { id: 'cat-a', name: 'A', defaultBudget: 1000 },
  { id: 'cat-b', name: 'B', defaultBudget: 0 },
];

const debit = (amount, date, categoryId) => ({ kind: 'debit', amount, date, categoryId });
const income = (amount, date) => ({ kind: 'credit', amount, date, categoryId: null });

const sel = (opts) => callHook(useBudgetSelectors, {
  budgets: {}, totals: {}, categories: CATS, transactions: [],
  resetDay: RESET, rolloverEnabled: false, ...opts,
});

describe('carried — the budget number persists', () => {
  const budgets = { '2026-06': { 'cat-a': 5000 } };

  it('uses the figure set in that very cycle', () => {
    const s = sel({ budgets });
    expect(s.budgetOriginFor('2026-06', 'cat-a')).toMatchObject({ amount: 5000, origin: 'set', from: '2026-06' });
  });

  it('carries it into every later cycle until changed', () => {
    const s = sel({ budgets });
    expect(s.budgetOriginFor('2026-09', 'cat-a')).toMatchObject({ amount: 5000, origin: 'carried', from: '2026-06' });
  });

  it('does NOT carry backwards into an earlier cycle', () => {
    const s = sel({ budgets });
    expect(s.budgetOriginFor('2026-05', 'cat-a').origin).toBe('default');
  });

  it('a later figure supersedes the earlier one', () => {
    const s = sel({ budgets: { '2026-06': { 'cat-a': 5000 }, '2026-08': { 'cat-a': 7000 } } });
    expect(s.budgetFor('2026-07', 'cat-a')).toBe(5000);
    expect(s.budgetFor('2026-09', 'cat-a')).toBe(7000);
  });

  it('falls back to the category default when nothing was ever set', () => {
    const s = sel({});
    expect(s.budgetOriginFor('2026-06', 'cat-a')).toMatchObject({ amount: 1000, origin: 'default' });
  });
});

describe('rollover — the unspent money moves', () => {
  const budgets = { '2026-06': { 'cat-a': 26000 } };

  it('is inert while the setting is off', () => {
    const s = sel({ budgets, transactions: [debit(21000, '2026-06-10', 'cat-a')], rolloverEnabled: false });
    expect(s.budgetOriginFor('2026-07', 'cat-a')).toMatchObject({ amount: 26000, rollover: 0 });
  });

  it('hands a surplus forward (26,000 budget, 21,000 spent gives 31,000)', () => {
    const s = sel({ budgets, transactions: [debit(21000, '2026-06-10', 'cat-a')], rolloverEnabled: true });
    expect(s.budgetOriginFor('2026-07', 'cat-a')).toMatchObject({ base: 26000, rollover: 5000, amount: 31000 });
  });

  it('hands a deficit forward too (26,000 budget, 29,000 spent gives 23,000)', () => {
    const s = sel({ budgets, transactions: [debit(29000, '2026-06-10', 'cat-a')], rolloverEnabled: true });
    expect(s.budgetOriginFor('2026-07', 'cat-a')).toMatchObject({ rollover: -3000, amount: 23000 });
  });

  it('compounds across several cycles', () => {
    const s = sel({
      budgets,
      transactions: [debit(21000, '2026-06-10', 'cat-a'), debit(20000, '2026-07-10', 'cat-a')],
      rolloverEnabled: true,
    });
    // Jun leaves +5,000; Jul budget 26,000 + 5,000 = 31,000, spends 20,000, leaves +11,000.
    expect(s.budgetOriginFor('2026-08', 'cat-a')).toMatchObject({ rollover: 11000, amount: 37000 });
  });

  it('never rolls into the first cycle that has a stored figure', () => {
    const s = sel({ budgets, transactions: [debit(21000, '2026-06-10', 'cat-a')], rolloverEnabled: true });
    expect(s.budgetOriginFor('2026-06', 'cat-a').rollover).toBe(0);
  });

  it('gives a never-budgeted category no chain, so its default cannot accrue a phantom balance', () => {
    const s = sel({ budgets, transactions: [], rolloverEnabled: true });
    // cat-a has a stored budget; cat-b never did.
    expect(s.rolloverForCategory('2026-09', 'cat-b')).toBe(0);
    expect(s.budgetOriginFor('2026-09', 'cat-b').amount).toBe(0);
  });

  it('excludes income from the chain — a salary must not inflate a budget', () => {
    const withIncome = sel({
      budgets,
      transactions: [debit(21000, '2026-06-10', 'cat-a'), income(86000, '2026-06-09')],
      rolloverEnabled: true,
    });
    const without = sel({ budgets, transactions: [debit(21000, '2026-06-10', 'cat-a')], rolloverEnabled: true });
    expect(withIncome.budgetFor('2026-07', 'cat-a')).toBe(without.budgetFor('2026-07', 'cat-a'));
  });

  it('nets a refund back into the category it was tagged to', () => {
    const s = sel({
      budgets,
      transactions: [
        debit(21000, '2026-06-10', 'cat-a'),
        { kind: 'credit', amount: 1000, date: '2026-06-11', categoryId: 'cat-a' },
      ],
      rolloverEnabled: true,
    });
    expect(s.budgetOriginFor('2026-07', 'cat-a').rollover).toBe(6000); // 26,000 less (21,000 less 1,000)
  });

  it('attributes spend by cycle, not by calendar month', () => {
    // 1 Jul belongs to the JUNE cycle, so it must reduce June's leftover.
    const s = sel({ budgets, transactions: [debit(21000, '2026-07-01', 'cat-a')], rolloverEnabled: true });
    expect(s.budgetOriginFor('2026-07', 'cat-a').rollover).toBe(5000);
  });
});

describe('the base/amount split', () => {
  it('reports base separately from the effective amount', () => {
    const s = sel({
      budgets: { '2026-06': { 'cat-a': 26000 } },
      transactions: [debit(21000, '2026-06-10', 'cat-a')],
      rolloverEnabled: true,
    });
    const o = s.budgetOriginFor('2026-07', 'cat-a');
    // Populating an input from `amount` and saving it back would bake the
    // rollover into the base and count the same 5,000 twice.
    expect(o.base).toBe(26000);
    expect(o.amount).toBe(31000);
    expect(o.amount).toBe(o.base + o.rollover);
  });

  it('turning rollover off restores every figure exactly', () => {
    const args = { budgets: { '2026-06': { 'cat-a': 26000 } }, transactions: [debit(21000, '2026-06-10', 'cat-a')] };
    expect(sel({ ...args, rolloverEnabled: false }).budgetFor('2026-08', 'cat-a')).toBe(26000);
  });
});

describe('the monthly total chain, independent of the category chain', () => {
  it('reports no total when none was ever set', () => {
    expect(sel({}).monthlyTotalOriginFor('2026-07')).toMatchObject({ amount: null, origin: 'none', rollover: 0 });
  });

  it('carries a set total forward', () => {
    const s = sel({ totals: { '2026-06': 58000 } });
    expect(s.monthlyTotalOriginFor('2026-08')).toMatchObject({ amount: 58000, origin: 'carried', from: '2026-06' });
  });

  it('rolls the cycle-wide surplus forward using total spend, not per-category', () => {
    const s = sel({
      totals: { '2026-06': 58000 },
      transactions: [debit(20000, '2026-06-10', 'cat-a'), debit(18000, '2026-06-11', 'cat-b')],
      rolloverEnabled: true,
    });
    expect(s.monthlyTotalOriginFor('2026-07')).toMatchObject({ base: 58000, rollover: 20000, amount: 78000 });
  });

  it('adds no rollover when there is no stored total to chain from', () => {
    const s = sel({ transactions: [debit(20000, '2026-06-10', 'cat-a')], rolloverEnabled: true });
    expect(s.monthlyTotalOriginFor('2026-07').rollover).toBe(0);
  });
});
