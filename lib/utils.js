export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

// NB: there are deliberately no calendar-month period helpers here (days in
// month, day of month, "current month"). Every period in this app is a spend
// cycle keyed by `YYYY-MM` — see the "Spending cycle" section below.

export function monthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function shiftMonth(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatINR(amount, opts = {}) {
  const n = Number(amount) || 0;
  return n.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: opts.decimals ?? (Number.isInteger(n) ? 0 : 2),
    minimumFractionDigits: 0,
  });
}

export function formatCompactINR(amount) {
  const n = Number(amount) || 0;
  const abs = Math.abs(n);
  if (abs >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (abs >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${n.toFixed(0)}`;
}

export function formatDateNice(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', weekday: 'short' });
}

export function groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const k = keyFn(item);
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {});
}

export function sum(arr, fn) {
  return arr.reduce((s, item) => s + (Number(fn(item)) || 0), 0);
}

// ── Debit / credit ─────────────────────────────────────────────────────
// Every entry carries a positive `amount`; its direction lives in `kind`.
// Reading the sign off `kind` rather than off the number means an aggregate
// can never be quietly right for spends and wrong for credits.
//
// A credit splits in two by whether it is tagged to a category:
//
//   refund  credit WITH a categoryId — a refund, reimbursement or cashback
//           that hands spend back, so it comes off that category's total.
//   income  credit with NO categoryId — fresh money in (salary, a gift, a
//           transfer). It never touches a category or a budget.
//
// Hence the two different totals below. `netSpend` is what you actually parted
// with and is the number budgets are judged against; `netFlow` is the
// cash-flow view, everything in minus everything out.

export const DEBIT = 'debit';
export const CREDIT = 'credit';

export function isCredit(t) {
  return t.kind === CREDIT;
}

export function isDebit(t) {
  return !isCredit(t);
}

/** A credit handed back to a category — it reduces that category's spend. */
export function isRefund(t) {
  return isCredit(t) && !!t.categoryId;
}

/** A credit that is fresh money in rather than spend given back. */
export function isIncome(t) {
  return isCredit(t) && !t.categoryId;
}

/** Positive for money out, negative for money in. */
export function signedAmount(t) {
  return isCredit(t) ? -(Number(t.amount) || 0) : Number(t.amount) || 0;
}

export function totalDebits(txs) {
  return sum(txs.filter(isDebit), (t) => t.amount);
}

export function totalCredits(txs) {
  return sum(txs.filter(isCredit), (t) => t.amount);
}

/** What you actually spent: debits less the refunds handed back against them. */
export function netSpend(txs) {
  return sum(txs.filter((t) => isDebit(t) || isRefund(t)), signedAmount);
}

/** Cash flow: everything in less everything out. Positive means you gained. */
export function netFlow(txs) {
  return totalCredits(txs) - totalDebits(txs);
}

/** Every headline number for a set of entries, computed in one pass. */
export function ledgerTotals(txs) {
  let debits = 0, refunds = 0, income = 0;
  for (const t of txs) {
    const amt = Number(t.amount) || 0;
    if (isDebit(t)) debits += amt;
    else if (t.categoryId) refunds += amt;
    else income += amt;
  }
  const credits = refunds + income;
  return {
    debits,
    credits,
    refunds,
    income,
    netSpend: debits - refunds,
    netFlow: credits - debits,
  };
}

/**
 * Net spend per category id, refunds already deducted. Untagged entries land
 * under `uncategorizedKey`; income never appears at all, having no category.
 */
export function netSpendByCategory(txs, uncategorizedKey = '__uncategorized__') {
  const map = {};
  for (const t of txs) {
    if (isIncome(t)) continue;
    const key = t.categoryId || uncategorizedKey;
    map[key] = (map[key] || 0) + signedAmount(t);
  }
  return map;
}

export const UNCATEGORIZED = { id: null, name: 'Uncategorized', color: '#8A93A6', icon: 'MoreHorizontal', defaultBudget: 0 };

/** Shown when a credit's source row has been deleted since it was logged. */
export const UNKNOWN_SOURCE = { id: null, name: 'Credit', color: '#3DDC97', icon: 'Banknote', offsetsSpend: false };

/**
 * The source behind a credit. Prefers the linked row so a rename shows up
 * everywhere at once; falls back to the label frozen on the entry, which is
 * what keeps history readable after a source is deleted or for rows written
 * before sources became editable.
 */
export function getCreditSource(creditSources, tx) {
  if (!tx) return UNKNOWN_SOURCE;
  const linked = tx.sourceId && creditSources.find((s) => s.id === tx.sourceId);
  if (linked) return linked;
  if (tx.source) return { ...UNKNOWN_SOURCE, name: tx.source };
  return UNKNOWN_SOURCE;
}

export function getCategory(categories, categoryId) {
  return categories.find((c) => c.id === categoryId) || UNCATEGORIZED;
}

export function classNames(...list) {
  return list.filter(Boolean).join(' ');
}

// ── Spending cycle ─────────────────────────────────────────────────────
// The ledger does not run on calendar months. A cycle starts on `resetDay`
// of its own month and runs up to — but not including — `resetDay` of the
// next month, which is the day everything resets. A cycle is still keyed by
// `YYYY-MM` (its opening month), so "2026-08" with a reset day of 7 means
// 7 Aug → 6 Sep, and a spend logged on 7 Sep belongs to the 2026-09 cycle.
// With a reset day of 1 this collapses back to plain calendar months.

export const DEFAULT_CYCLE_RESET_DAY = 7;

export function clampCycleResetDay(day) {
  const n = Math.round(Number(day));
  if (!Number.isFinite(n)) return DEFAULT_CYCLE_RESET_DAY;
  return Math.min(Math.max(n, 1), 28);
}

function toISO(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function addDaysISO(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function diffDays(fromISO, toISOStr) {
  const a = new Date(fromISO + 'T00:00:00');
  const b = new Date(toISOStr + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

/** First day of the cycle keyed by `cycleKey` — `resetDay` of that month. */
export function cycleStartDate(cycleKey, resetDay = DEFAULT_CYCLE_RESET_DAY) {
  const [y, m] = cycleKey.split('-').map(Number);
  const maxDay = new Date(y, m, 0).getDate();
  return toISO(y, m, Math.min(clampCycleResetDay(resetDay), maxDay));
}

/**
 * The reset date itself — `resetDay` of the following month. This is the
 * EXCLUSIVE end of the cycle: money spent on this date opens the next one.
 */
export function cycleEndDate(cycleKey, resetDay = DEFAULT_CYCLE_RESET_DAY) {
  return cycleStartDate(shiftMonth(cycleKey, 1), resetDay);
}

/** Last day on which a spend still counts toward this cycle. */
export function cycleLastDate(cycleKey, resetDay = DEFAULT_CYCLE_RESET_DAY) {
  return addDaysISO(cycleEndDate(cycleKey, resetDay), -1);
}

/** Length of the cycle in whole days (varies with month length: 28–31). */
export function cycleLengthDays(cycleKey, resetDay = DEFAULT_CYCLE_RESET_DAY) {
  return diffDays(cycleStartDate(cycleKey, resetDay), cycleEndDate(cycleKey, resetDay));
}

/** The date `offset` days into the cycle (offset 0 = its first day). */
export function cycleDateAtOffset(cycleKey, resetDay, offset) {
  return addDaysISO(cycleStartDate(cycleKey, resetDay), offset);
}

/** Which cycle an ISO date falls in. */
export function cycleKeyOf(dateStr, resetDay = DEFAULT_CYCLE_RESET_DAY) {
  const monthKey = dateStr.slice(0, 7);
  return dateStr >= cycleStartDate(monthKey, resetDay) ? monthKey : shiftMonth(monthKey, -1);
}

/** The cycle today falls in — the app's default view. */
export function currentCycleKey(resetDay = DEFAULT_CYCLE_RESET_DAY, fromISO = todayISO()) {
  return cycleKeyOf(fromISO, resetDay);
}

export function isInCycle(dateStr, cycleKey, resetDay = DEFAULT_CYCLE_RESET_DAY) {
  return dateStr >= cycleStartDate(cycleKey, resetDay) && dateStr < cycleEndDate(cycleKey, resetDay);
}

export function filterCycle(transactions, cycleKey, resetDay = DEFAULT_CYCLE_RESET_DAY) {
  const start = cycleStartDate(cycleKey, resetDay);
  const end = cycleEndDate(cycleKey, resetDay);
  return transactions.filter((t) => t.date >= start && t.date < end);
}

/** True while today still falls inside this cycle, i.e. money can still be spent. */
export function isCycleOpen(cycleKey, resetDay = DEFAULT_CYCLE_RESET_DAY, fromISO = todayISO()) {
  return isInCycle(fromISO, cycleKey, resetDay);
}

/** Days of the cycle already lived through, today included. 0 before it opens. */
export function elapsedDaysInCycle(cycleKey, resetDay = DEFAULT_CYCLE_RESET_DAY, fromISO = todayISO()) {
  const start = cycleStartDate(cycleKey, resetDay);
  const length = cycleLengthDays(cycleKey, resetDay);
  if (fromISO < start) return 0;
  return Math.min(diffDays(start, fromISO) + 1, length);
}

/** Whole days left from today until this cycle resets (never negative). */
export function daysLeftInCycle(cycleKey, resetDay = DEFAULT_CYCLE_RESET_DAY, fromISO = todayISO()) {
  return Math.max(diffDays(fromISO, cycleEndDate(cycleKey, resetDay)), 0);
}

/** "7 Aug – 6 Sep" — the span a cycle actually covers. */
export function cycleRangeLabel(cycleKey, resetDay = DEFAULT_CYCLE_RESET_DAY) {
  const fmt = (iso) =>
    new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return `${fmt(cycleStartDate(cycleKey, resetDay))} – ${fmt(cycleLastDate(cycleKey, resetDay))}`;
}

export function pctChange(current, previous) {
  if (!previous) return current > 0 ? null : 0; // null = no baseline to compare against
  return ((current - previous) / previous) * 100;
}

export function formatSignedINR(amount) {
  const n = Number(amount) || 0;
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatINR(Math.abs(n))}`;
}

/** "− ₹450" for a spend, "+ ₹450" for a credit — the ledger's row label. */
export function formatEntryAmount(t) {
  return `${isCredit(t) ? '+' : '−'}${formatINR(Number(t.amount) || 0)}`;
}

/** Last `count` month keys ending at (and including) `monthKey`, oldest first. */
export function lastMonthKeys(monthKey, count) {
  return Array.from({ length: count }, (_, i) => shiftMonth(monthKey, i - (count - 1)));
}

export function monthShortLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}
