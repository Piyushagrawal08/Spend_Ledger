import { describe, it, expect } from 'vitest';
import { buildDemoLedger, buildDemoSnapshots } from '@/lib/demoData';
import {
  cycleCashSummary, currentCycleKey, shiftMonth, isIncome, isRefund, isCredit, isDebit,
} from '@/lib/utils';

// The demo is the review screen: every change is signed off there before it
// reaches real money. These guard the properties that make it trustworthy.

const TODAY = '2026-09-15';

describe('determinism', () => {
  it('produces an identical ledger for the same day', () => {
    expect(buildDemoLedger(TODAY)).toEqual(buildDemoLedger(TODAY));
  });

  it('produces stable ids across builds', () => {
    const a = buildDemoLedger(TODAY).transactions.map((t) => t.id);
    const b = buildDemoLedger(TODAY).transactions.map((t) => t.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length); // and no duplicates
  });
});

describe('never fabricates the future', () => {
  it('seeds no entry dated after today', () => {
    const { transactions } = buildDemoLedger(TODAY);
    const future = transactions.filter((t) => t.date > TODAY);
    expect(future).toEqual([]);
  });

  it('holds on a day that is before the cycle reset day', () => {
    // 3 Sept is before the 7th, so the current cycle opened back in August.
    const { transactions } = buildDemoLedger('2026-09-03');
    expect(transactions.filter((t) => t.date > '2026-09-03')).toEqual([]);
  });
});

describe('both sides of the ledger are represented', () => {
  const { transactions } = buildDemoLedger(TODAY);

  it('has debits, refunds and income, so every branch is visible', () => {
    expect(transactions.some(isDebit)).toBe(true);
    expect(transactions.some(isRefund)).toBe(true);
    expect(transactions.some(isIncome)).toBe(true);
  });

  it('keeps every amount strictly positive, direction in kind', () => {
    for (const t of transactions) {
      expect(t.amount).toBeGreaterThan(0);
      expect(['debit', 'credit']).toContain(t.kind);
    }
  });

  it('gives every credit a source and never gives a debit one', () => {
    for (const t of transactions) {
      if (isCredit(t)) expect(t.sourceId).toBeTruthy();
      else expect(t.sourceId ?? null).toBeNull();
    }
  });
});

describe('the seeded settings exercise the features they gate', () => {
  const { settings } = buildDemoLedger(TODAY);

  it('turns rollover on, or half the budget feature is invisible', () => {
    expect(settings.carryForward).toBe(true);
  });

  it('sets a non-zero opening balance, or the carry-in line reads as nothing', () => {
    expect(settings.openingBalance).toBeGreaterThan(0);
  });
});

describe('the cash chain holds across the whole demo ledger', () => {
  const ledger = buildDemoLedger(TODAY);
  const { cycleResetDay: reset, openingBalance: anchor } = ledger.settings;
  const current = currentCycleKey(reset, TODAY);
  const keys = Array.from({ length: 7 }, (_, i) => shiftMonth(current, i - 6));

  it('makes each cycle opening equal the previous cycle closing', () => {
    let previous = null;
    for (const key of keys) {
      const c = cycleCashSummary(ledger.transactions, key, reset, anchor);
      if (previous !== null) expect(c.opening).toBeCloseTo(previous, 6);
      expect(c.opening + c.netFlow).toBeCloseTo(c.closing, 6);
      previous = c.closing;
    }
  });

  it('anchors the oldest cycle on the opening balance exactly', () => {
    const oldest = cycleCashSummary(ledger.transactions, keys[0], reset, anchor);
    expect(oldest.opening).toBe(anchor);
  });

  it('produces no NaN anywhere in the chain', () => {
    for (const key of keys) {
      const c = cycleCashSummary(ledger.transactions, key, reset, anchor);
      for (const v of Object.values(c)) expect(Number.isNaN(v)).toBe(false);
    }
  });
});

describe('snapshots', () => {
  const ledger = buildDemoLedger(TODAY);
  const snaps = buildDemoSnapshots(ledger, TODAY);

  it('freezes payloads at or before their capture date', () => {
    for (const s of snaps) {
      const cutoff = s.payload.capturedAt.slice(0, 10);
      expect(s.payload.transactions.every((t) => t.date <= cutoff)).toBe(true);
    }
  });

  it('carries the settings forward so an archive opens with its own context', () => {
    for (const s of snaps) expect(s.payload.settings).toMatchObject({ openingBalance: expect.any(Number) });
  });
});
