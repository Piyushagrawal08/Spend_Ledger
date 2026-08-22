export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

export function monthKeyOf(dateStr) {
  return dateStr.slice(0, 7); // YYYY-MM
}

export function currentMonthKey() {
  return todayISO().slice(0, 7);
}

export function monthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function shiftMonth(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function daysInMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function dayOfMonth(dateStr) {
  return Number(dateStr.slice(8, 10));
}

export function isCurrentMonth(monthKey) {
  return monthKey === currentMonthKey();
}

export function elapsedDaysInMonth(monthKey) {
  const total = daysInMonth(monthKey);
  if (!isCurrentMonth(monthKey)) {
    const [y, m] = monthKey.split('-').map(Number);
    const now = new Date();
    const target = new Date(y, m - 1, 1);
    return target < now ? total : 0;
  }
  return Number(todayISO().slice(8, 10));
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
// A month's cycle does not stop on the last calendar day — it runs until
// `resetDay` of the *following* month (default the 7th). That is when the
// ledger "resets" and remaining days start counting toward the next cycle.

export const DEFAULT_CYCLE_RESET_DAY = 7;

export function clampCycleResetDay(day) {
  const n = Math.round(Number(day));
  if (!Number.isFinite(n)) return DEFAULT_CYCLE_RESET_DAY;
  return Math.min(Math.max(n, 1), 28);
}

function toISO(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** ISO date on which the cycle for `monthKey` ends — resetDay of the next month. */
export function cycleEndDate(monthKey, resetDay = DEFAULT_CYCLE_RESET_DAY) {
  const [y, m] = monthKey.split('-').map(Number);
  const next = new Date(y, m, 1); // month is 1-based, so this is the next month
  const ny = next.getFullYear();
  const nm = next.getMonth() + 1;
  const maxDay = new Date(ny, nm, 0).getDate();
  return toISO(ny, nm, Math.min(clampCycleResetDay(resetDay), maxDay));
}

/** ISO date on which the cycle for `monthKey` starts — resetDay of that month. */
export function cycleStartDate(monthKey, resetDay = DEFAULT_CYCLE_RESET_DAY) {
  const [y, m] = monthKey.split('-').map(Number);
  const maxDay = new Date(y, m, 0).getDate();
  return toISO(y, m, Math.min(clampCycleResetDay(resetDay), maxDay));
}

export function diffDays(fromISO, toISOStr) {
  const a = new Date(fromISO + 'T00:00:00');
  const b = new Date(toISOStr + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

/** Whole days left from today until this month's cycle reset (never negative). */
export function daysLeftInCycle(monthKey, resetDay = DEFAULT_CYCLE_RESET_DAY, fromISO = todayISO()) {
  return Math.max(diffDays(fromISO, cycleEndDate(monthKey, resetDay)), 0);
}

/** Total length of the cycle in days: 1st of the month through the reset date. */
export function cycleLengthDays(monthKey, resetDay = DEFAULT_CYCLE_RESET_DAY) {
  return diffDays(`${monthKey}-01`, cycleEndDate(monthKey, resetDay)) + 1;
}

/** True while today still falls inside this month's cycle (i.e. money can still be spent). */
export function isCycleOpen(monthKey, resetDay = DEFAULT_CYCLE_RESET_DAY, fromISO = todayISO()) {
  return diffDays(fromISO, cycleEndDate(monthKey, resetDay)) > 0 && fromISO >= `${monthKey}-01`;
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
