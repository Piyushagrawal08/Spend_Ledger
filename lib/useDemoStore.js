'use client';

import { useCallback, useEffect, useState } from 'react';
import { useBudgetSelectors } from '@/lib/ledgerSelectors';
import { buildDemoLedger, buildDemoSnapshots, DEMO_USER } from '@/lib/demoData';
import { DEBIT, CREDIT, netSpend, clampCycleResetDay, DEFAULT_CYCLE_RESET_DAY } from '@/lib/utils';

// ── Demo store ─────────────────────────────────────────────────────────
// The same shape `useFinanceStore` returns, backed entirely by React state.
// There is no Supabase client here, no auth, and no network call of any kind,
// so the demo runs whether or not .env.local holds real credentials — and
// nothing done on the demo screen can reach the live ledger.
//
// Edits DO work and persist for the session: that is the point, since a change
// has to be clicked through to be reviewed. A reload restores the seed.

let seq = 0;
const nextId = () => `demo-new-${++seq}`;

export function useDemoStore() {
  const [categories, setCategories] = useState([]);
  const [creditSources, setCreditSources] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState({});
  const [totals, setTotals] = useState({});
  const [settings, setSettings] = useState({
    monthlyIncome: 0,
    currency: 'INR',
    carryForward: false,
    cycleResetDay: 7,
    openingBalance: 0,
  });
  const [snapshots, setSnapshots] = useState([]);
  const [payloads, setPayloads] = useState({});
  const [hydrated, setHydrated] = useState(false);

  // Seeded in an effect, not in useState, for two reasons: the generator reads
  // today's date, which would differ between the server render and the client
  // one; and it lets the demo show the same "booting ledger…" gate the real
  // app shows, so the shell is exercised the same way.
  const seed = useCallback(() => {
    const ledger = buildDemoLedger();
    const snaps = buildDemoSnapshots(ledger);
    setCategories(ledger.categories);
    setCreditSources(ledger.creditSources);
    setTransactions(ledger.transactions);
    setBudgets(ledger.budgets);
    setTotals(ledger.totals);
    setSettings(ledger.settings);
    setSnapshots(snaps.map(({ payload, ...meta }) => meta));
    setPayloads(Object.fromEntries(snaps.map((s) => [s.id, s.payload])));
    setHydrated(true);
  }, []);

  // Deliberate, and documented in docs/STRUCTURE.md: the generator reads
  // today's date, which would differ between the server and client renders,
  // and seeding here exercises the same "booting ledger…" gate the real app
  // shows.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { seed(); }, [seed]);

  const addTransaction = useCallback(async (tx) => {
    const kind = tx.kind === CREDIT ? CREDIT : DEBIT;
    const row = {
      id: nextId(),
      kind,
      amount: Math.abs(Number(tx.amount)),
      categoryId: tx.categoryId || null,
      source: kind === CREDIT ? tx.source || null : null,
      sourceId: kind === CREDIT ? tx.sourceId || null : null,
      date: tx.date,
      note: tx.note || '',
      method: tx.method || 'UPI',
      createdAt: Date.now(),
    };
    setTransactions((prev) => [row, ...prev]);
    return row;
  }, []);

  const updateTransaction = useCallback(async (id, patch) => {
    setTransactions((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const next = { ...t };
        if (patch.amount !== undefined) next.amount = Math.abs(Number(patch.amount));
        if (patch.categoryId !== undefined) next.categoryId = patch.categoryId || null;
        if (patch.date !== undefined) next.date = patch.date;
        if (patch.note !== undefined) next.note = patch.note;
        if (patch.method !== undefined) next.method = patch.method;
        if (patch.kind !== undefined) next.kind = patch.kind === CREDIT ? CREDIT : DEBIT;
        if (patch.source !== undefined) next.source = patch.source || null;
        if (patch.sourceId !== undefined) next.sourceId = patch.sourceId || null;
        if (next.kind === DEBIT) { next.source = null; next.sourceId = null; }
        return next;
      })
    );
  }, []);

  const deleteTransaction = useCallback(async (id) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addCategory = useCallback(async (cat) => {
    const row = {
      id: nextId(),
      name: cat.name,
      color: cat.color,
      icon: cat.icon,
      defaultBudget: cat.defaultBudget || 0,
    };
    setCategories((prev) => [...prev, row]);
    return row;
  }, []);

  const updateCategory = useCallback(async (id, patch) => {
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const deleteCategory = useCallback(async (id) => {
    setCategories((prev) => prev.filter((c) => c.id !== id));
    // Mirrors the real FK, which is ON DELETE SET NULL.
    setTransactions((prev) => prev.map((t) => (t.categoryId === id ? { ...t, categoryId: null } : t)));
    setBudgets((prev) => {
      const next = {};
      Object.entries(prev).forEach(([mk, m]) => {
        const { [id]: _drop, ...rest } = m;
        next[mk] = rest;
      });
      return next;
    });
  }, []);

  const addCreditSource = useCallback(async (src) => {
    const row = {
      id: nextId(),
      name: src.name,
      color: src.color,
      icon: src.icon,
      offsetsSpend: !!src.offsetsSpend,
    };
    setCreditSources((prev) => [...prev, row]);
    return row;
  }, []);

  const updateCreditSource = useCallback(async (id, patch) => {
    setCreditSources((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const deleteCreditSource = useCallback(async (id) => {
    setCreditSources((prev) => prev.filter((s) => s.id !== id));
    // Mirrors the real FK (ON DELETE SET NULL): entries keep their frozen
    // `source` label so history still reads, they just stop being linked.
    setTransactions((prev) => prev.map((t) => (t.sourceId === id ? { ...t, sourceId: null } : t)));
  }, []);

  const setBudget = useCallback(async (monthKey, categoryId, amount) => {
    setBudgets((prev) => ({ ...prev, [monthKey]: { ...(prev[monthKey] || {}), [categoryId]: amount } }));
  }, []);

  const setMonthlyTotal = useCallback(async (monthKey, amount) => {
    setTotals((prev) => ({ ...prev, [monthKey]: amount }));
  }, []);

  const {
    budgetFor, budgetOriginFor, monthlyTotalFor, monthlyTotalOriginFor,
    rolloverTotalFor, rolloverForCategory,
  } = useBudgetSelectors({
    budgets,
    totals,
    categories,
    transactions,
    resetDay: settings.cycleResetDay ?? DEFAULT_CYCLE_RESET_DAY,
    rolloverEnabled: !!settings.carryForward,
  });

  const updateSettings = useCallback(async (patch) => {
    setSettings((prev) => ({
      ...prev,
      ...patch,
      ...(patch.cycleResetDay !== undefined
        ? { cycleResetDay: clampCycleResetDay(patch.cycleResetDay) }
        : {}),
    }));
  }, []);

  const createSnapshot = useCallback(async (label = '', source = 'app') => {
    const id = nextId();
    const payload = {
      version: 2,
      capturedAt: new Date().toISOString(),
      categories,
      creditSources,
      transactions,
      budgets,
      totals,
      settings,
    };
    const meta = {
      id,
      label: label.trim(),
      source,
      txCount: transactions.length,
      totalAmount: netSpend(transactions),
      createdAt: payload.capturedAt,
    };
    setPayloads((prev) => ({ ...prev, [id]: payload }));
    setSnapshots((prev) => [meta, ...prev]);
    return meta;
  }, [categories, creditSources, transactions, budgets, totals, settings]);

  const getSnapshot = useCallback(async (id) => {
    const meta = snapshots.find((s) => s.id === id);
    return { ...meta, payload: payloads[id] };
  }, [snapshots, payloads]);

  const deleteSnapshot = useCallback(async (id) => {
    setSnapshots((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const clearAllData = useCallback(async () => {
    setTransactions([]);
    setBudgets({});
    setTotals({});
  }, []);

  // No session to end. Re-seeding is the useful demo equivalent: it puts the
  // screen back to a known state after you have clicked things around.
  const signOut = useCallback(async () => { seed(); }, [seed]);

  return {
    categories,
    creditSources,
    transactions,
    budgets,
    totals,
    settings,
    snapshots,
    hydrated,
    userId: DEMO_USER.id,
    userEmail: DEMO_USER.email,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    addCategory,
    updateCategory,
    deleteCategory,
    addCreditSource,
    updateCreditSource,
    deleteCreditSource,
    setBudget,
    budgetFor,
    budgetOriginFor,
    setMonthlyTotal,
    monthlyTotalFor,
    monthlyTotalOriginFor,
    rolloverTotalFor,
    rolloverForCategory,
    updateSettings,
    createSnapshot,
    getSnapshot,
    deleteSnapshot,
    clearAllData,
    signOut,
    // Demo-only, for the reset button in the banner.
    resetDemo: seed,
  };
}
