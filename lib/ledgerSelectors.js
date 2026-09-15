'use client';

import { useCallback, useMemo } from 'react';
import {
  cycleKeyOf, shiftMonth, isCredit, isIncome, DEFAULT_CYCLE_RESET_DAY,
} from '@/lib/utils';

// ── Two different things, deliberately named apart ────────────────────
//
// CARRIED  — the budget *number* persists. Set 26,000 in one cycle and every
//            later cycle is also 26,000 until you change it. Nothing to do
//            with what you actually spent.
//
// ROLLOVER — the *unspent money* moves. Budget 26,000, spent 21,000, so the
//            next cycle gets 26,000 + 5,000 = 31,000. Overspend and the
//            deficit moves too, exactly like a running account balance:
//            budget 26,000, spent 29,000, next cycle is 23,000.
//
// Rollover is opt-in per user via `settings.carryForward` and applies to both
// the total cycle budget and each category, as two independent chains.
//
// Both are read-side only — no cycle is ever written to on your behalf, so
// historical rows keep exactly the numbers you gave them and switching the
// setting off returns every figure to what it was.
//
// This lives apart from the store so the live Supabase store and the demo
// store cannot drift: both derive their budget figures from this one
// implementation.

// A chain only ever runs from your first stored budget to the cycle on screen.
// This guard exists so a malformed key can never spin forever.
const MAX_CHAIN = 600;

export function useBudgetSelectors({
  budgets,
  totals,
  categories,
  transactions = [],
  resetDay = DEFAULT_CYCLE_RESET_DAY,
  rolloverEnabled = false,
}) {
  /** Cycle keys with any stored budget, newest first. */
  const budgetKeysDesc = useMemo(
    () => Object.keys(budgets).sort().reverse(),
    [budgets]
  );

  const totalKeysDesc = useMemo(
    () => Object.keys(totals).sort().reverse(),
    [totals]
  );

  // ── Base figures: what you actually set, carried forward ────────────

  /** Where a category's budget for `monthKey` was set, before any rollover. */
  const baseBudgetOriginFor = useCallback(
    (monthKey, categoryId) => {
      const own = budgets[monthKey]?.[categoryId];
      if (own !== undefined) return { amount: own, origin: 'set', from: monthKey };

      const from = budgetKeysDesc.find(
        (k) => k < monthKey && budgets[k]?.[categoryId] !== undefined
      );
      if (from !== undefined) {
        return { amount: budgets[from][categoryId], origin: 'carried', from };
      }

      const cat = categories.find((c) => c.id === categoryId);
      return { amount: cat?.defaultBudget || 0, origin: 'default', from: null };
    },
    [budgets, budgetKeysDesc, categories]
  );

  const baseMonthlyTotalOriginFor = useCallback(
    (monthKey) => {
      if (totals[monthKey] !== undefined) {
        return { amount: totals[monthKey], origin: 'set', from: monthKey };
      }
      const from = totalKeysDesc.find((k) => k < monthKey);
      if (from !== undefined) return { amount: totals[from], origin: 'carried', from };
      return { amount: null, origin: 'none', from: null };
    },
    [totals, totalKeysDesc]
  );

  // ── Spend per cycle, in one pass ────────────────────────────────────
  // Rollover needs "what was left" for every cycle in the chain, so walking
  // the whole ledger once per cycle would be quadratic. One pass builds both
  // the cycle net and the per-category net that the two chains need.
  // Income is excluded throughout: it has no category, and budgets are judged
  // against netSpend, never against cash flow.

  const spendByCycle = useMemo(() => {
    const map = {};
    for (const t of transactions) {
      if (!t?.date || isIncome(t)) continue;
      const key = cycleKeyOf(t.date, resetDay);
      const bucket = map[key] || (map[key] = { net: 0, byCat: {} });
      const amt = Number(t.amount) || 0;
      const signed = isCredit(t) ? -amt : amt;
      bucket.net += signed;
      if (t.categoryId) {
        bucket.byCat[t.categoryId] = (bucket.byCat[t.categoryId] || 0) + signed;
      }
    }
    return map;
  }, [transactions, resetDay]);

  /** Oldest cycle holding a stored budget, per category. */
  const firstBudgetKeyFor = useMemo(() => {
    const first = {};
    for (const key of Object.keys(budgets).sort()) {
      for (const catId of Object.keys(budgets[key] || {})) {
        if (first[catId] === undefined) first[catId] = key;
      }
    }
    return first;
  }, [budgets]);

  const firstTotalKey = useMemo(() => {
    const keys = Object.keys(totals).sort();
    return keys.length ? keys[0] : null;
  }, [totals]);

  // ── The rollover chains ─────────────────────────────────────────────
  // Both fold forward from the first cycle you ever set a figure for. A
  // category you have never budgeted has no chain at all, so an untouched
  // category can never accumulate a phantom balance out of its default.

  const rolloverTotalFor = useCallback(
    (monthKey) => {
      if (!rolloverEnabled || !monthKey || !firstTotalKey) return 0;
      if (monthKey <= firstTotalKey) return 0;

      let carry = 0;
      let key = firstTotalKey;
      for (let i = 0; i < MAX_CHAIN && key < monthKey; i += 1) {
        const base = baseMonthlyTotalOriginFor(key).amount;
        if (base !== null) {
          carry = base + carry - (spendByCycle[key]?.net || 0);
        }
        key = shiftMonth(key, 1);
      }
      return carry;
    },
    [rolloverEnabled, firstTotalKey, baseMonthlyTotalOriginFor, spendByCycle]
  );

  const rolloverForCategory = useCallback(
    (monthKey, categoryId) => {
      if (!rolloverEnabled || !monthKey) return 0;
      const firstKey = firstBudgetKeyFor[categoryId];
      if (!firstKey || monthKey <= firstKey) return 0;

      let carry = 0;
      let key = firstKey;
      for (let i = 0; i < MAX_CHAIN && key < monthKey; i += 1) {
        const base = baseBudgetOriginFor(key, categoryId).amount;
        carry = base + carry - (spendByCycle[key]?.byCat?.[categoryId] || 0);
        key = shiftMonth(key, 1);
      }
      return carry;
    },
    [rolloverEnabled, firstBudgetKeyFor, baseBudgetOriginFor, spendByCycle]
  );

  // ── What the screens read ───────────────────────────────────────────
  // `amount` stays the effective figure, so every existing caller keeps
  // working and no two screens can disagree about the same budget. `base` is
  // the number you typed — always use that one to populate an input, or
  // saving it back would bake the rollover into the base and double-count it.

  const budgetOriginFor = useCallback(
    (monthKey, categoryId) => {
      const base = baseBudgetOriginFor(monthKey, categoryId);
      const rollover = rolloverForCategory(monthKey, categoryId);
      return {
        ...base,
        base: base.amount,
        rollover,
        amount: base.amount + rollover,
      };
    },
    [baseBudgetOriginFor, rolloverForCategory]
  );

  const budgetFor = useCallback(
    (monthKey, categoryId) => budgetOriginFor(monthKey, categoryId).amount,
    [budgetOriginFor]
  );

  const monthlyTotalOriginFor = useCallback(
    (monthKey) => {
      const base = baseMonthlyTotalOriginFor(monthKey);
      // No total ever set means the Budgets screen falls back to the sum of
      // the category allocations — which already carry their own rollover, so
      // adding one here as well would count the same money twice.
      if (base.amount === null) return { ...base, base: null, rollover: 0 };
      const rollover = rolloverTotalFor(monthKey);
      return {
        ...base,
        base: base.amount,
        rollover,
        amount: base.amount + rollover,
      };
    },
    [baseMonthlyTotalOriginFor, rolloverTotalFor]
  );

  const monthlyTotalFor = useCallback(
    (monthKey) => monthlyTotalOriginFor(monthKey).amount,
    [monthlyTotalOriginFor]
  );

  return {
    budgetFor, budgetOriginFor, monthlyTotalFor, monthlyTotalOriginFor,
    rolloverTotalFor, rolloverForCategory,
  };
}
