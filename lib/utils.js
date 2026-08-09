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
