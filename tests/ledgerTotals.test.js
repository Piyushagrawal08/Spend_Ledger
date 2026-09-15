import { describe, it, expect } from 'vitest';
import {
  ledgerTotals, netSpend, netFlow, netSpendByCategory, totalDebits, totalCredits,
  isCredit, isDebit, isRefund, isIncome, signedAmount, getCreditSource, getCategory,
} from '@/lib/utils';

// The rule this file guards: `amount` is ALWAYS positive and direction lives in
// `kind`. A credit splits by whether it carries a category — with one it is a
// refund that hands spend back, without one it is income that never touches a
// budget.

const debit  = (amount, categoryId = 'cat-a') => ({ kind: 'debit',  amount, categoryId, date: '2026-08-10' });
const refund = (amount, categoryId = 'cat-a') => ({ kind: 'credit', amount, categoryId, date: '2026-08-11' });
const income = (amount) => ({ kind: 'credit', amount, categoryId: null, date: '2026-08-12' });

describe('classification', () => {
  it('separates the two kinds of credit', () => {
    expect(isRefund(refund(100))).toBe(true);
    expect(isIncome(refund(100))).toBe(false);
    expect(isIncome(income(100))).toBe(true);
    expect(isRefund(income(100))).toBe(false);
  });

  it('treats a row with no kind as a debit, so pre-migration rows keep meaning', () => {
    const legacy = { amount: 500, categoryId: 'cat-a', date: '2026-08-10' };
    expect(isDebit(legacy)).toBe(true);
    expect(isCredit(legacy)).toBe(false);
    expect(signedAmount(legacy)).toBe(500);
  });

  it('reads direction off kind, never off the sign of amount', () => {
    expect(signedAmount(debit(500))).toBe(500);
    expect(signedAmount(income(500))).toBe(-500);
  });
});

describe('the two totals', () => {
  const tx = [debit(1000), debit(500, 'cat-b'), refund(200), income(86000)];

  it('netSpend nets refunds off spend and ignores income entirely', () => {
    expect(netSpend(tx)).toBe(1000 + 500 - 200);
  });

  it('netFlow counts every credit including refunds', () => {
    expect(netFlow(tx)).toBe(200 + 86000 - 1500);
  });

  it('ledgerTotals agrees with the standalone helpers in one pass', () => {
    const t = ledgerTotals(tx);
    expect(t.debits).toBe(totalDebits(tx));
    expect(t.credits).toBe(totalCredits(tx));
    expect(t.netSpend).toBe(netSpend(tx));
    expect(t.netFlow).toBe(netFlow(tx));
    expect(t.refunds + t.income).toBe(t.credits);
  });

  it('is all zeroes, not NaN, on an empty ledger', () => {
    const t = ledgerTotals([]);
    for (const v of Object.values(t)) {
      expect(v).toBe(0);
      expect(Number.isNaN(v)).toBe(false);
    }
  });

  it('handles an income-only ledger without a negative spend', () => {
    const t = ledgerTotals([income(50000)]);
    expect(t.netSpend).toBe(0);
    expect(t.netFlow).toBe(50000);
  });

  it('handles a spend-only ledger', () => {
    const t = ledgerTotals([debit(2000)]);
    expect(t.netSpend).toBe(2000);
    expect(t.netFlow).toBe(-2000);
  });

  it('lets a refund exceed the spend without breaking the identity', () => {
    // Returning more than you spent this cycle is legal; it just goes negative.
    const t = ledgerTotals([debit(100), refund(500)]);
    expect(t.netSpend).toBe(-400);
    expect(t.netFlow).toBe(400);
  });
});

describe('netSpendByCategory', () => {
  it('nets a refund off its own category and drops income', () => {
    const map = netSpendByCategory([debit(1000, 'cat-a'), refund(200, 'cat-a'), debit(300, 'cat-b'), income(9000)]);
    expect(map['cat-a']).toBe(800);
    expect(map['cat-b']).toBe(300);
    expect(Object.keys(map)).toHaveLength(2); // income contributed no key
  });

  it('buckets untagged debits under the uncategorized key', () => {
    const map = netSpendByCategory([{ kind: 'debit', amount: 400, categoryId: null, date: '2026-08-10' }], '__uncat__');
    expect(map['__uncat__']).toBe(400);
  });

  it('sums to the ledger netSpend across all categories', () => {
    const tx = [debit(1000, 'cat-a'), refund(200, 'cat-a'), debit(300, 'cat-b'), income(9000)];
    const total = Object.values(netSpendByCategory(tx)).reduce((a, b) => a + b, 0);
    expect(total).toBe(netSpend(tx));
  });
});

describe('label resolution survives deletion', () => {
  const sources = [{ id: 'src-1', name: 'Salary', color: '#fff', icon: 'Banknote', offsetsSpend: false }];

  it('prefers the linked row so a rename propagates through history', () => {
    const tx = { kind: 'credit', sourceId: 'src-1', source: 'Old name' };
    expect(getCreditSource(sources, tx).name).toBe('Salary');
  });

  it('falls back to the frozen label when the source row is gone', () => {
    const tx = { kind: 'credit', sourceId: 'deleted', source: 'Freelance' };
    expect(getCreditSource(sources, tx).name).toBe('Freelance');
  });

  it('degrades to a generic label rather than throwing', () => {
    expect(getCreditSource(sources, { kind: 'credit' }).name).toBe('Credit');
    expect(getCreditSource([], null).name).toBe('Credit');
  });

  it('returns the uncategorized placeholder for a missing category', () => {
    expect(getCategory([], 'gone').name).toBe('Uncategorized');
  });
});
