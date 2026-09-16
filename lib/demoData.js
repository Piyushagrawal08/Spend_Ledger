// ── Demo ledger ────────────────────────────────────────────────────────
// Fabricated data for the /demo route. Nothing here ever touches Supabase,
// and no value in this file corresponds to a real person or a real account.
//
// The generator is deterministic: it is driven by a fixed-seed PRNG, so the
// same day always produces the same ledger. That matters for reviewing a UI
// change — two screenshots differ because the code changed, never because the
// data reshuffled underneath you.

import {
  DEBIT, CREDIT, todayISO, currentCycleKey, shiftMonth,
  cycleStartDate, cycleDateAtOffset, cycleLengthDays, DEFAULT_CYCLE_RESET_DAY,
  LENDING_OUT, LENDING_IN,
} from '@/lib/utils';

const RESET_DAY = DEFAULT_CYCLE_RESET_DAY;   // the 7th
/** Cycles of history to fabricate — enough to fill the 6-cycle trend chart. */
const CYCLES_BACK = 6;

/** mulberry32 — small, fast, and repeatable from a fixed seed. */
function rng(seed) {
  let a = seed;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEMO_CATEGORIES = [
  { id: 'cat-food',    name: 'Food & Dining',         color: '#F2A93B', icon: 'Utensils',       defaultBudget: 6000 },
  { id: 'cat-grocery', name: 'Groceries',             color: '#3DDC97', icon: 'ShoppingBasket', defaultBudget: 5000 },
  { id: 'cat-transit', name: 'Transport',             color: '#5B9DF2', icon: 'Bus',            defaultBudget: 3000 },
  { id: 'cat-bills',   name: 'Bills & Utilities',     color: '#F2545B', icon: 'Receipt',        defaultBudget: 4000 },
  { id: 'cat-rent',    name: 'Rent & Housing',        color: '#9B8CF2', icon: 'Home',           defaultBudget: 12000 },
  { id: 'cat-shop',    name: 'Shopping',              color: '#F27CA3', icon: 'ShoppingBag',    defaultBudget: 3000 },
  { id: 'cat-fun',     name: 'Entertainment',         color: '#4FD1E7', icon: 'Film',           defaultBudget: 2000 },
  { id: 'cat-health',  name: 'Health & Fitness',      color: '#7EDB6F', icon: 'HeartPulse',     defaultBudget: 2000 },
  { id: 'cat-learn',   name: 'Learning & Exams',      color: '#E7C24F', icon: 'BookOpen',       defaultBudget: 2000 },
  { id: 'cat-invest',  name: 'Investments & Savings', color: '#38BDF8', icon: 'PiggyBank',      defaultBudget: 8000 },
  { id: 'cat-other',   name: 'Others',                color: '#8A93A6', icon: 'MoreHorizontal', defaultBudget: 1500 },
];

// `everyDays` is the average gap between spends; `once` pins a category to a
// single charge per cycle (rent, a subscription bill, an SIP).
const SPEND_SHAPE = [
  { id: 'cat-food',    everyDays: 1.4, min: 120,  max: 620,  methods: ['UPI', 'Cash', 'Credit Card'],
    notes: ['Lunch at the office', 'Chai and samosa', 'Dinner with friends', 'Weekend brunch', 'Late-night biryani', 'Coffee run', 'Team lunch'] },
  { id: 'cat-grocery', everyDays: 5,   min: 420,  max: 2400, methods: ['UPI', 'Debit Card'],
    notes: ['Weekly vegetables', 'Milk and eggs', 'Monthly stock-up', 'Fruits and curd', 'Rice and dals'] },
  { id: 'cat-transit', everyDays: 1.8, min: 40,   max: 380,  methods: ['UPI', 'Cash'],
    notes: ['Auto to the metro', 'Cab home', 'Metro recharge', 'Petrol top-up', 'Bus fare'] },
  { id: 'cat-bills',   once: true,     min: 900,  max: 2600, methods: ['Net Banking', 'UPI'],
    notes: ['Electricity bill', 'Broadband renewal', 'Mobile recharge'] },
  { id: 'cat-rent',    once: true,     min: 12000, max: 12000, methods: ['Net Banking'],
    notes: ['Monthly rent'] },
  { id: 'cat-shop',    everyDays: 9,   min: 450,  max: 3800, methods: ['Credit Card', 'UPI'],
    notes: ['Running shoes', 'A pair of jeans', 'Phone case', 'Kitchen odds and ends', 'Headphones'] },
  { id: 'cat-fun',     everyDays: 7,   min: 180,  max: 1300, methods: ['UPI', 'Credit Card'],
    notes: ['Movie tickets', 'Streaming subscription', 'Concert with friends', 'Board game night'] },
  { id: 'cat-health',  everyDays: 11,  min: 280,  max: 2100, methods: ['UPI', 'Debit Card'],
    notes: ['Gym membership', 'Pharmacy', 'Doctor visit', 'Protein refill'] },
  { id: 'cat-learn',   everyDays: 13,  min: 500,  max: 3200, methods: ['Credit Card', 'Net Banking'],
    notes: ['Online course', 'Exam form fee', 'Reference books'] },
  { id: 'cat-invest',  once: true,     min: 8000, max: 8000, methods: ['Net Banking'],
    notes: ['Monthly SIP'] },
  { id: 'cat-other',   everyDays: 8,   min: 90,   max: 800,  methods: ['UPI', 'Cash'],
    notes: ['Haircut', 'Gift for a friend', 'Donation', 'Stationery'] },
];

// The money-in taxonomy, mirroring what the SQL seeds for a real account.
// Editable in the demo just like the real thing.
export const DEMO_CREDIT_SOURCES = [
  { id: 'src-salary',   name: 'Salary',        color: '#3DDC97', icon: 'Banknote',       offsetsSpend: false },
  { id: 'src-refund',   name: 'Refund',        color: '#4FD1E7', icon: 'RotateCcw',      offsetsSpend: true  },
  { id: 'src-reimb',    name: 'Reimbursement', color: '#5B9DF2', icon: 'Receipt',        offsetsSpend: true  },
  { id: 'src-cashback', name: 'Cashback',      color: '#F2A93B', icon: 'CreditCard',     offsetsSpend: true  },
  { id: 'src-transfer', name: 'Transfer in',   color: '#9B8CF2', icon: 'Landmark',       offsetsSpend: false },
  { id: 'src-interest', name: 'Interest',      color: '#38BDF8', icon: 'TrendingUp',     offsetsSpend: false },
  { id: 'src-invest',   name: 'Investments',   color: '#7EDB6F', icon: 'PiggyBank',      offsetsSpend: false },
  { id: 'src-gift',     name: 'Gift',          color: '#F27CA3', icon: 'Gift',           offsetsSpend: false },
  { id: 'src-other',    name: 'Other',         color: '#8A93A6', icon: 'MoreHorizontal', offsetsSpend: false },
];

// ── The lending ledger ─────────────────────────────────────────────────
// Invented friends. None of these names, amounts or stories belongs to a real
// person — like everything else in this file they exist so the screen can be
// reviewed without opening the real app.
export const DEMO_PEOPLE = [
  { id: 'per-aarav', name: 'Aarav', color: '#5B9DF2', icon: 'UserRound' },
  { id: 'per-riya',  name: 'Riya',  color: '#F27CA3', icon: 'UserRound' },
  { id: 'per-kabir', name: 'Kabir', color: '#7EDB6F', icon: 'UserRound' },
  { id: 'per-meera', name: 'Meera', color: '#F2A93B', icon: 'UserRound' },
  { id: 'per-dev',   name: 'Dev',   color: '#9B8CF2', icon: 'UserRound' },
];

// Fixed rather than generated, and deliberately so: these five cover every
// state the Lending screen can be in, and a PRNG would only make that
// coverage accidental. Between them they show a debt part-repaid, a debt you
// owe part-repaid, one settled exactly to zero, and one plain balance each
// way — so both directions, both signs and the "all settled" case are always
// on screen. Dates are counted back from today, so nothing is ever in the
// future. Amounts are round because that is how people actually lend money.
const DEMO_LENDING = [
  // Owed to you, part-repaid.
  { personId: 'per-aarav', direction: LENDING_OUT, daysAgo: 46, amount: 12000, method: 'UPI',         note: 'Cash for his laptop repair' },
  { personId: 'per-aarav', direction: LENDING_IN,  daysAgo: 18, amount: 4000,  method: 'UPI',         note: 'Paid back part of it' },
  // You owe, part-repaid — the mirror image of Aarav.
  { personId: 'per-riya',  direction: LENDING_IN,  daysAgo: 31, amount: 6500,  method: 'UPI',         note: 'Covered my share of the trip' },
  { personId: 'per-riya',  direction: LENDING_OUT, daysAgo: 9,  amount: 2500,  method: 'UPI',         note: 'Paid some of it back' },
  // Settled exactly: the balance reads zero and the row says so.
  { personId: 'per-kabir', direction: LENDING_OUT, daysAgo: 62, amount: 1500,  method: 'Cash',        note: 'Dinner, he forgot his card' },
  { personId: 'per-kabir', direction: LENDING_IN,  daysAgo: 54, amount: 1500,  method: 'UPI',         note: 'Settled up' },
  // One straightforward balance each way.
  { personId: 'per-meera', direction: LENDING_OUT, daysAgo: 6,  amount: 3000,  method: 'Net Banking', note: 'Lent for her deposit' },
  { personId: 'per-dev',   direction: LENDING_IN,  daysAgo: 2,  amount: 2000,  method: 'Cash',        note: 'Borrowed for the airport cab' },
];

const PERSON = Object.fromEntries(DEMO_PEOPLE.map((p) => [p.id, p.name]));

const SRC = Object.fromEntries(DEMO_CREDIT_SOURCES.map((s) => [s.id, s.name]));
/** Credits carry both the link and the frozen label, as the real store does. */
const from = (id) => ({ sourceId: id, source: SRC[id] });

// One salary a cycle, plus the occasional refund or cashback so both flavours
// of credit — money handed back to a category, and fresh income — are visible.
const SALARY = 86000;
/** Cash on hand before the oldest fabricated cycle — the balance's anchor. */
const OPENING_BALANCE = 45000;

function pick(rand, list) {
  return list[Math.floor(rand() * list.length)];
}

function money(rand, min, max, step = 10) {
  if (min === max) return min;
  const raw = min + rand() * (max - min);
  return Math.round(raw / step) * step;
}

function daysBefore(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The lending entries, dated back from `today`. Each carries both the link and
 * the frozen name, exactly as the real table stores them, so deleting a person
 * in the demo shows the same behaviour it would on live data.
 */
function buildDemoLending(today) {
  return DEMO_LENDING.map((e, i) => ({
    id: `demo-lend-${i + 1}`,
    personId: e.personId,
    person: PERSON[e.personId],
    direction: e.direction,
    amount: e.amount,
    date: daysBefore(today, e.daysAgo),
    note: e.note,
    method: e.method,
    createdAt: i + 1,
  })).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
}

/**
 * Builds the whole demo ledger for the cycle `today` falls in, plus the
 * `CYCLES_BACK` cycles before it. Nothing dated after today is generated —
 * a demo that shows spends from next week would just be confusing.
 */
export function buildDemoLedger(today = todayISO()) {
  const rand = rng(20260904);
  const currentKey = currentCycleKey(RESET_DAY, today);
  const keys = Array.from({ length: CYCLES_BACK + 1 }, (_, i) =>
    shiftMonth(currentKey, i - CYCLES_BACK)
  );

  const transactions = [];
  let n = 0;
  const add = (tx) => {
    if (tx.date > today) return;          // never fabricate the future
    transactions.push({ id: `demo-tx-${++n}`, createdAt: n, ...tx });
  };

  for (const key of keys) {
    const length = cycleLengthDays(key, RESET_DAY);
    const start = cycleStartDate(key, RESET_DAY);

    // ── Money in ──────────────────────────────────────────────────────
    // Salary lands on the day the cycle opens — which is the whole point of
    // a reset day that is not the 1st.
    add({
      kind: CREDIT, amount: SALARY, categoryId: null, ...from('src-salary'),
      date: start, method: 'Net Banking', note: 'Monthly salary',
    });

    // A returned purchase, handed back to Shopping.
    if (rand() < 0.7) {
      add({
        kind: CREDIT, amount: money(rand, 600, 2600), categoryId: 'cat-shop', ...from('src-refund'),
        date: cycleDateAtOffset(key, RESET_DAY, Math.floor(rand() * length)),
        method: 'Credit Card', note: 'Returned an online order',
      });
    }

    // Card cashback against everyday spend.
    if (rand() < 0.8) {
      add({
        kind: CREDIT, amount: money(rand, 40, 320), categoryId: pick(rand, ['cat-food', 'cat-grocery']),
        ...from('src-cashback'),
        date: cycleDateAtOffset(key, RESET_DAY, Math.floor(rand() * length)),
        method: 'Credit Card', note: 'Card cashback',
      });
    }

    // A work expense claimed back.
    if (rand() < 0.45) {
      add({
        kind: CREDIT, amount: money(rand, 800, 3200), categoryId: 'cat-transit', ...from('src-reimb'),
        date: cycleDateAtOffset(key, RESET_DAY, Math.floor(rand() * length)),
        method: 'Net Banking', note: 'Travel claim settled',
      });
    }

    // Occasional untagged income that is not salary.
    if (rand() < 0.3) {
      add({
        kind: CREDIT, amount: money(rand, 500, 4000), categoryId: null,
        ...from(pick(rand, ['src-interest', 'src-gift', 'src-transfer', 'src-invest'])),
        date: cycleDateAtOffset(key, RESET_DAY, Math.floor(rand() * length)),
        method: pick(rand, ['Net Banking', 'UPI']), note: '',
      });
    }

    // ── Money out ─────────────────────────────────────────────────────
    for (const shape of SPEND_SHAPE) {
      if (shape.once) {
        add({
          kind: DEBIT, amount: money(rand, shape.min, shape.max),
          categoryId: shape.id,
          date: cycleDateAtOffset(key, RESET_DAY, Math.floor(rand() * 4)),
          method: pick(rand, shape.methods), note: pick(rand, shape.notes),
        });
        continue;
      }
      for (let day = 0; day < length; day++) {
        if (rand() > 1 / shape.everyDays) continue;
        add({
          kind: DEBIT, amount: money(rand, shape.min, shape.max),
          categoryId: shape.id,
          date: cycleDateAtOffset(key, RESET_DAY, day),
          method: pick(rand, shape.methods), note: pick(rand, shape.notes),
        });
      }
    }
  }

  // Newest first, matching the order the real store loads rows in.
  transactions.sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt
  );

  // Budgets are set once, on the oldest cycle, so every later cycle shows the
  // "carried from" state rather than a flat default everywhere.
  const oldestKey = keys[0];
  const budgets = {
    [oldestKey]: Object.fromEntries(
      DEMO_CATEGORIES.map((c) => [c.id, c.defaultBudget])
    ),
  };
  // Chosen so the rollover chain shows BOTH signs against this ledger: the
  // early cycles overspend and hand a deficit forward, the balance climbs back
  // through the quieter cycles, and the current one opens with roughly +3,600
  // rolled in. A number that only ever produced a surplus would leave the
  // overspend half of the feature untested on screen.
  const totals = { [oldestKey]: 58000 };

  return {
    categories: DEMO_CATEGORIES.map((c) => ({ ...c })),
    creditSources: DEMO_CREDIT_SOURCES.map((s) => ({ ...s })),
    people: DEMO_PEOPLE.map((p) => ({ ...p })),
    transactions,
    // Built from its own fixed table rather than from `rand`, so adding a
    // friend here can never shift a single figure in the spend ledger above —
    // including the seeded total that the rollover chain is tuned against.
    lendingEntries: buildDemoLending(today),
    budgets,
    totals,
    settings: {
      monthlyIncome: SALARY,
      currency: 'INR',
      carryForward: true,
      cycleResetDay: RESET_DAY,
      // What this fictional person held before the oldest fabricated entry.
      // Non-zero on purpose: with 0 the carry-in line would read "nothing
      // carried" on the very first cycle and the anchor half of the feature
      // would be invisible on the review screen.
      openingBalance: OPENING_BALANCE,
    },
  };
}

/** Two archived snapshots, so the Backups screen has something to open. */
export function buildDemoSnapshots(ledger, today = todayISO()) {
  const stamp = (daysAgo) => {
    const d = new Date(today + 'T09:30:00');
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString();
  };
  const payloadFor = (cutoff) => ({
    version: 3,
    capturedAt: cutoff,
    categories: ledger.categories,
    creditSources: ledger.creditSources,
    people: ledger.people,
    transactions: ledger.transactions.filter((t) => t.date <= cutoff.slice(0, 10)),
    lendingEntries: ledger.lendingEntries.filter((e) => e.date <= cutoff.slice(0, 10)),
    budgets: ledger.budgets,
    totals: ledger.totals,
    settings: ledger.settings,
  });

  return [
    { id: 'demo-snap-1', label: 'Before the cleanup', source: 'app',   createdAt: stamp(9) },
    { id: 'demo-snap-2', label: '',                   source: 'script', createdAt: stamp(31) },
  ].map((s) => {
    const payload = payloadFor(s.createdAt);
    const netSpent = payload.transactions.reduce((sum, t) => {
      if (t.kind === CREDIT) return sum - (t.categoryId ? t.amount : 0);
      return sum + t.amount;
    }, 0);
    return { ...s, payload, txCount: payload.transactions.length, totalAmount: netSpent };
  });
}

export const DEMO_USER = {
  id: 'demo-user',
  email: 'demo@spendledger.local',
};
