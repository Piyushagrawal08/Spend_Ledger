import { describe, it, expect } from 'vitest';
import { buildDemoLedger } from '@/lib/demoData';
import {
  LENDING_OUT, LENDING_IN, isLendingIn, isLendingOut, lendingSignedAmount,
  lendingBalanceByPerson, lendingBalanceWith, lendingTotals, lendingBalanceLabel,
  getPerson, UNKNOWN_PERSON, netSpend, netFlow, cycleCashSummary, currentCycleKey,
} from '@/lib/utils';

// The lending ledger records real money owed between real people, and its one
// structural promise is that it stays OUT of the spend ledger. These guard
// both halves: that the balances are right, and that they never leak.

const TODAY = '2026-09-15';

const entry = (personId, direction, amount, over = {}) => ({
  id: `${personId}-${direction}-${amount}`,
  personId,
  person: over.person ?? personId,
  direction,
  amount,
  date: '2026-09-01',
  note: '',
  method: 'UPI',
  ...over,
});

describe('direction carries the sign, never the amount', () => {
  it('reads each direction the right way round', () => {
    expect(isLendingOut(entry('a', LENDING_OUT, 100))).toBe(true);
    expect(isLendingIn(entry('a', LENDING_OUT, 100))).toBe(false);
    expect(isLendingIn(entry('a', LENDING_IN, 100))).toBe(true);
    expect(isLendingOut(entry('a', LENDING_IN, 100))).toBe(false);
  });

  it('signs money out positive and money back negative', () => {
    expect(lendingSignedAmount(entry('a', LENDING_OUT, 2500))).toBe(2500);
    expect(lendingSignedAmount(entry('a', LENDING_IN, 2500))).toBe(-2500);
  });

  it('treats an unknown direction as money out rather than dropping it', () => {
    expect(lendingSignedAmount(entry('a', 'sideways', 700))).toBe(700);
  });
});

describe('a balance is derived from the entries, so a repayment just reverses one', () => {
  const entries = [
    entry('aarav', LENDING_OUT, 12000),
    entry('aarav', LENDING_IN, 4000),
  ];

  it('nets a part-repayment down to what is still owed', () => {
    expect(lendingBalanceWith(entries, 'aarav')).toBe(8000);
  });

  it('reaches exactly zero when the whole thing is paid back', () => {
    const settled = [...entries, entry('aarav', LENDING_IN, 8000, { id: 'final' })];
    expect(lendingBalanceWith(settled, 'aarav')).toBe(0);
  });

  it('goes negative when you end up owing them instead', () => {
    const flipped = [...entries, entry('aarav', LENDING_IN, 10000, { id: 'over' })];
    expect(lendingBalanceWith(flipped, 'aarav')).toBe(-2000);
  });
});

describe('the two headline figures never cancel each other out', () => {
  // The trap this exists to catch: reporting one net number. Here it would be
  // zero, and two people would still be waiting to be paid.
  const entries = [
    entry('riya', LENDING_OUT, 5000),   // Riya owes you 5,000
    entry('dev', LENDING_IN, 5000),     // you owe Dev 5,000
  ];

  it('keeps what you are owed apart from what you owe', () => {
    const t = lendingTotals(entries);
    expect(t.owedToYou).toBe(5000);
    expect(t.youOwe).toBe(5000);
  });

  it('still reports the raw sides, which do not net either', () => {
    const t = lendingTotals(entries);
    expect(t.gave).toBe(5000);
    expect(t.got).toBe(5000);
  });

  it('only reaches zero on both sides when everyone is actually settled', () => {
    const settled = [
      ...entries,
      entry('riya', LENDING_IN, 5000, { id: 'r2' }),
      entry('dev', LENDING_OUT, 5000, { id: 'd2' }),
    ];
    const t = lendingTotals(settled);
    expect(t.owedToYou).toBe(0);
    expect(t.youOwe).toBe(0);
  });
});

describe('a deleted person does not take the money with them', () => {
  const orphaned = [
    entry(null, LENDING_OUT, 3000, { id: 'o1', person: 'Meera' }),
    entry(null, LENDING_IN, 3000, { id: 'o2', person: 'Dev' }),
  ];

  it('gives each deleted name its own bucket instead of pooling them', () => {
    const balances = lendingBalanceByPerson(orphaned);
    expect(Object.keys(balances)).toHaveLength(2);
    expect(Object.values(balances).sort()).toEqual([-3000, 3000]);
  });

  it('would otherwise net two unrelated debts to nothing', () => {
    // Guards the exact regression: one shared "unknown" key.
    const t = lendingTotals(orphaned);
    expect(t.owedToYou).toBe(3000);
    expect(t.youOwe).toBe(3000);
  });
});

describe('the person on an entry resolves the way a credit source does', () => {
  const people = [{ id: 'p1', name: 'Riya', color: '#fff', icon: 'UserRound' }];

  it('prefers the linked row, so a rename shows up on old entries', () => {
    const e = entry('p1', LENDING_OUT, 100, { person: 'Riya (old name)' });
    expect(getPerson(people, e).name).toBe('Riya');
  });

  it('falls back to the frozen name once that person is deleted', () => {
    const e = entry(null, LENDING_OUT, 100, { person: 'Riya' });
    expect(getPerson(people, e).name).toBe('Riya');
  });

  it('never returns nothing, even for an entry with neither', () => {
    const e = entry(null, LENDING_OUT, 100, { person: null });
    expect(getPerson(people, e)).toEqual(UNKNOWN_PERSON);
  });
});

describe('the balance reads as a sentence, in the right direction', () => {
  it('says who owes whom', () => {
    expect(lendingBalanceLabel('Riya', 2000)).toBe('Riya owes you ₹2,000');
    expect(lendingBalanceLabel('Riya', -2000)).toBe('You owe Riya ₹2,000');
    expect(lendingBalanceLabel('Riya', 0)).toBe('All settled');
  });
});

describe('lending stays out of the spend ledger', () => {
  const ledger = buildDemoLedger(TODAY);

  it('keeps them in separate lists', () => {
    const txIds = new Set(ledger.transactions.map((t) => t.id));
    expect(ledger.lendingEntries.some((e) => txIds.has(e.id))).toBe(false);
  });

  it('never gives a spend entry a lending direction, or the reverse', () => {
    // If the two were ever merged, one of these fields would turn up on the
    // wrong side — and every budget and cash figure in the app would shift.
    expect(ledger.transactions.every((t) => t.direction === undefined)).toBe(true);
    expect(ledger.lendingEntries.every((e) => e.kind === undefined)).toBe(true);
  });

  it('leaves net spend and cash flow untouched by any lending entry', () => {
    const spendOnly = netSpend(ledger.transactions);
    const flowOnly = netFlow(ledger.transactions);
    // The lending entries exist and are non-trivial…
    expect(lendingTotals(ledger.lendingEntries).gave).toBeGreaterThan(0);
    // …and the spend ledger's own figures know nothing about them.
    expect(netSpend(ledger.transactions)).toBe(spendOnly);
    expect(netFlow(ledger.transactions)).toBe(flowOnly);
  });

  it('leaves the running cash balance untouched', () => {
    const { cycleResetDay: reset, openingBalance: anchor } = ledger.settings;
    const key = currentCycleKey(reset, TODAY);
    const cash = cycleCashSummary(ledger.transactions, key, reset, anchor);
    expect(cash.opening + cash.netFlow).toBeCloseTo(cash.closing, 6);
  });
});

describe('the demo lending data shows every case the screen can be in', () => {
  const ledger = buildDemoLedger(TODAY);
  const balances = lendingBalanceByPerson(ledger.lendingEntries);

  it('is deterministic for a given day', () => {
    expect(buildDemoLedger(TODAY).lendingEntries).toEqual(ledger.lendingEntries);
  });

  it('never dates an entry after today', () => {
    expect(ledger.lendingEntries.filter((e) => e.date > TODAY)).toEqual([]);
  });

  it('keeps every amount positive with the direction in its own field', () => {
    for (const e of ledger.lendingEntries) {
      expect(e.amount).toBeGreaterThan(0);
      expect([LENDING_OUT, LENDING_IN]).toContain(e.direction);
    }
  });

  it('gives every entry both the link and the frozen name', () => {
    for (const e of ledger.lendingEntries) {
      expect(e.personId).toBeTruthy();
      expect(e.person).toBeTruthy();
    }
  });

  it('shows somebody owing, somebody owed, and somebody settled', () => {
    const values = Object.values(balances);
    expect(values.some((v) => v > 0)).toBe(true);
    expect(values.some((v) => v < 0)).toBe(true);
    expect(values.some((v) => v === 0)).toBe(true);
  });

  it('uses both directions, so neither branch of the form is invisible', () => {
    expect(ledger.lendingEntries.some(isLendingOut)).toBe(true);
    expect(ledger.lendingEntries.some(isLendingIn)).toBe(true);
  });
});
