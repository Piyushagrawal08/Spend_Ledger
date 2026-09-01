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

export const UNCATEGORIZED = { id: null, name: 'Uncategorized', color: '#8A93A6', icon: 'MoreHorizontal', defaultBudget: 0 };

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

/** Last `count` month keys ending at (and including) `monthKey`, oldest first. */
export function lastMonthKeys(monthKey, count) {
  return Array.from({ length: count }, (_, i) => shiftMonth(monthKey, i - (count - 1)));
}

export function monthShortLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}
