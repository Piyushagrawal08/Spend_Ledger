'use client';

import { useCallback, useMemo } from 'react';

// ── Budget carry-forward ──────────────────────────────────────────────
// A budget you set stays in force for every later cycle until you change it
// again. Only if you have never set one does the category's default apply.
// This is read-side only — no cycle is ever written to on your behalf, so
// historical rows keep exactly the numbers you gave them.
//
// This lives apart from the store so the live Supabase store and the demo
// store cannot drift: both derive their budget figures from this one
// implementation, and a change here shows up in the demo and the real app
// at the same time.

export function useBudgetSelectors({ budgets, totals, categories }) {
  /** Cycle keys with any stored budget, newest first. */
  const budgetKeysDesc = useMemo(
    () => Object.keys(budgets).sort().reverse(),
    [budgets]
  );

  const totalKeysDesc = useMemo(
    () => Object.keys(totals).sort().reverse(),
    [totals]
  );

  /** Where a category's budget for `monthKey` comes from, and how much. */
  const budgetOriginFor = useCallback(
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

  const budgetFor = useCallback(
    (monthKey, categoryId) => budgetOriginFor(monthKey, categoryId).amount,
    [budgetOriginFor]
  );

  const monthlyTotalOriginFor = useCallback(
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

  const monthlyTotalFor = useCallback(
    (monthKey) => monthlyTotalOriginFor(monthKey).amount,
    [monthlyTotalOriginFor]
  );

  return { budgetFor, budgetOriginFor, monthlyTotalFor, monthlyTotalOriginFor };
}
