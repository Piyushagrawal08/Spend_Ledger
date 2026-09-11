'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useBudgetSelectors } from '@/lib/ledgerSelectors';
import { DEBIT, CREDIT, netSpend, DEFAULT_CYCLE_RESET_DAY, clampCycleResetDay } from '@/lib/utils';

function txFromRow(r) {
  return {
    id: r.id,
    amount: Number(r.amount),
    categoryId: r.category_id,
    date: r.date,
    note: r.note || '',
    method: r.method || 'UPI',
    // Rows written before credits existed have no `kind`; they are debits,
    // which is exactly what they always were.
    kind: r.kind === CREDIT ? CREDIT : DEBIT,
    source: r.source || null,
    sourceId: r.source_id || null,
    createdAt: new Date(r.created_at).getTime(),
  };
}

function srcFromRow(r) {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    icon: r.icon,
    offsetsSpend: !!r.offsets_spend,
  };
}

function catFromRow(r) {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    icon: r.icon,
    defaultBudget: Number(r.default_budget) || 0,
  };
}

function snapFromRow(r) {
  return {
    id: r.id,
    label: r.label || '',
    source: r.source || 'app',
    txCount: Number(r.tx_count) || 0,
    totalAmount: Number(r.total_amount) || 0,
    createdAt: r.created_at,
  };
}

export function useFinanceStore() {
  const [supabase] = useState(() => createClient());
  const [userId, setUserId] = useState(null);
  const [userEmail, setUserEmail] = useState(null);
  const [categories, setCategories] = useState([]);
  const [creditSources, setCreditSources] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState({});
  const [totals, setTotals] = useState({});
  const [settings, setSettings] = useState({
    monthlyIncome: 0,
    currency: 'INR',
    carryForward: false,
    cycleResetDay: DEFAULT_CYCLE_RESET_DAY,
  });
  const [snapshots, setSnapshots] = useState([]);
  const [hydrated, setHydrated] = useState(false);

  const loadAll = useCallback(async () => {
    const [catsRes, srcsRes, txsRes, budsRes, totsRes, settRes, snapsRes] = await Promise.all([
      supabase.from('categories').select('*').order('created_at', { ascending: true }),
      supabase.from('credit_sources').select('*').order('created_at', { ascending: true }),
      supabase.from('transactions').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('budgets').select('*'),
      supabase.from('monthly_totals').select('*'),
      supabase.from('user_settings').select('*').maybeSingle(),
      supabase
        .from('ledger_snapshots')
        .select('id, label, source, tx_count, total_amount, created_at')
        .order('created_at', { ascending: false }),
    ]);

    setCategories((catsRes.data || []).map(catFromRow));
    // A missing table (before the credit-sources migration) must not break boot;
    // entries still render off the `source` label frozen on each row.
    setCreditSources(srcsRes.error ? [] : (srcsRes.data || []).map(srcFromRow));
    setTransactions((txsRes.data || []).map(txFromRow));
    // A missing table (before the snapshots migration is run) must not break boot.
    setSnapshots(snapsRes.error ? [] : (snapsRes.data || []).map(snapFromRow));

    const budgetMap = {};
    (budsRes.data || []).forEach((b) => {
      budgetMap[b.month_key] = budgetMap[b.month_key] || {};
      budgetMap[b.month_key][b.category_id] = Number(b.amount);
    });
    setBudgets(budgetMap);

    const totalMap = {};
    (totsRes.data || []).forEach((t) => { totalMap[t.month_key] = Number(t.amount); });
    setTotals(totalMap);

    if (settRes.data) {
      setSettings({
        monthlyIncome: Number(settRes.data.monthly_income) || 0,
        currency: settRes.data.currency || 'INR',
        carryForward: !!settRes.data.carry_forward,
        cycleResetDay: clampCycleResetDay(
          settRes.data.cycle_reset_day ?? DEFAULT_CYCLE_RESET_DAY
        ),
      });
    }
  }, [supabase]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!mounted) return;
      if (user) {
        setUserId(user.id);
        setUserEmail(user.email);
        await loadAll();
      }
      if (mounted) setHydrated(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        setUserId(session.user.id);
        setUserEmail(session.user.email);
        await loadAll();
      } else {
        setUserId(null);
        setUserEmail(null);
        setCategories([]);
        setCreditSources([]);
        setTransactions([]);
        setBudgets({});
        setTotals({});
        setSnapshots([]);
      }
      setHydrated(true);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  // `amount` is always positive on both sides — `kind` carries the direction.
  // A credit keeps its categoryId only when it is a refund handed back to that
  // category; plain income is stored untagged.
  const addTransaction = useCallback(async (tx) => {
    const kind = tx.kind === CREDIT ? CREDIT : DEBIT;
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        category_id: tx.categoryId || null,
        amount: Math.abs(Number(tx.amount)),
        date: tx.date,
        note: tx.note || '',
        method: tx.method || 'UPI',
        kind,
        // Both are written: the id links to the editable row, the text freezes
        // the label so history survives that row being deleted later.
        source_id: kind === CREDIT ? tx.sourceId || null : null,
        source: kind === CREDIT ? tx.source || null : null,
      })
      .select()
      .single();
    if (error) throw error;
    setTransactions((prev) => [txFromRow(data), ...prev]);
    return txFromRow(data);
  }, [supabase, userId]);

  const updateTransaction = useCallback(async (id, patch) => {
    const payload = {};
    if (patch.amount !== undefined) payload.amount = Math.abs(Number(patch.amount));
    if (patch.categoryId !== undefined) payload.category_id = patch.categoryId || null;
    if (patch.date !== undefined) payload.date = patch.date;
    if (patch.note !== undefined) payload.note = patch.note;
    if (patch.method !== undefined) payload.method = patch.method;
    if (patch.kind !== undefined) payload.kind = patch.kind === CREDIT ? CREDIT : DEBIT;
    // A source only ever belongs to a credit — flipping an entry back to a
    // debit clears it rather than leaving a stale label on the row.
    if (patch.source !== undefined) payload.source = patch.source || null;
    if (patch.sourceId !== undefined) payload.source_id = patch.sourceId || null;
    if (payload.kind === DEBIT) {
      payload.source = null;
      payload.source_id = null;
    }

    const { data, error } = await supabase.from('transactions').update(payload).eq('id', id).select().single();
    if (error) throw error;
    setTransactions((prev) => prev.map((t) => (t.id === id ? txFromRow(data) : t)));
  }, [supabase]);

  const deleteTransaction = useCallback(async (id) => {
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) throw error;
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }, [supabase]);

  // ── Credit sources ──────────────────────────────────────────────────
  // The mirror of categories, for the money-in side of the ledger.
  const addCreditSource = useCallback(async (src) => {
    const { data, error } = await supabase
      .from('credit_sources')
      .insert({
        user_id: userId,
        name: src.name,
        color: src.color,
        icon: src.icon,
        offsets_spend: !!src.offsetsSpend,
      })
      .select()
      .single();
    if (error) throw error;
    const row = srcFromRow(data);
    setCreditSources((prev) => [...prev, row]);
    return row;
  }, [supabase, userId]);

  const updateCreditSource = useCallback(async (id, patch) => {
    const payload = {};
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.color !== undefined) payload.color = patch.color;
    if (patch.icon !== undefined) payload.icon = patch.icon;
    if (patch.offsetsSpend !== undefined) payload.offsets_spend = !!patch.offsetsSpend;

    const { data, error } = await supabase.from('credit_sources').update(payload).eq('id', id).select().single();
    if (error) throw error;
    setCreditSources((prev) => prev.map((s2) => (s2.id === id ? srcFromRow(data) : s2)));
  }, [supabase]);

  const deleteCreditSource = useCallback(async (id) => {
    const { error } = await supabase.from('credit_sources').delete().eq('id', id);
    if (error) throw error;
    setCreditSources((prev) => prev.filter((s2) => s2.id !== id));
    // FK is ON DELETE SET NULL. The entries keep their frozen `source` text,
    // so past credits still read correctly — they just stop being linked.
    setTransactions((prev) => prev.map((t) => (t.sourceId === id ? { ...t, sourceId: null } : t)));
  }, [supabase]);

  const addCategory = useCallback(async (cat) => {
    const { data, error } = await supabase
      .from('categories')
      .insert({
        user_id: userId,
        name: cat.name,
        color: cat.color,
        icon: cat.icon,
        default_budget: cat.defaultBudget || 0,
      })
      .select()
      .single();
    if (error) throw error;
    setCategories((prev) => [...prev, catFromRow(data)]);
    return catFromRow(data);
  }, [supabase, userId]);

  const updateCategory = useCallback(async (id, patch) => {
    const payload = {};
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.color !== undefined) payload.color = patch.color;
    if (patch.icon !== undefined) payload.icon = patch.icon;
    if (patch.defaultBudget !== undefined) payload.default_budget = patch.defaultBudget;

    const { data, error } = await supabase.from('categories').update(payload).eq('id', id).select().single();
    if (error) throw error;
    setCategories((prev) => prev.map((c) => (c.id === id ? catFromRow(data) : c)));
  }, [supabase]);

  const deleteCategory = useCallback(async (id) => {
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) throw error;
    setCategories((prev) => prev.filter((c) => c.id !== id));
    // FK is ON DELETE SET NULL, so affected transactions become "Uncategorized" in the DB too.
    setTransactions((prev) => prev.map((t) => (t.categoryId === id ? { ...t, categoryId: null } : t)));
    setBudgets((prev) => {
      const next = {};
      Object.entries(prev).forEach(([mk, m]) => {
        const { [id]: _drop, ...rest } = m;
        next[mk] = rest;
      });
      return next;
    });
  }, [supabase]);

  const setBudget = useCallback(async (monthKey, categoryId, amount) => {
    const { error } = await supabase
      .from('budgets')
      .upsert({ user_id: userId, month_key: monthKey, category_id: categoryId, amount }, { onConflict: 'user_id,month_key,category_id' });
    if (error) throw error;
    setBudgets((prev) => ({ ...prev, [monthKey]: { ...(prev[monthKey] || {}), [categoryId]: amount } }));
  }, [supabase, userId]);

  const setMonthlyTotal = useCallback(async (monthKey, amount) => {
    const { error } = await supabase
      .from('monthly_totals')
      .upsert({ user_id: userId, month_key: monthKey, amount }, { onConflict: 'user_id,month_key' });
    if (error) throw error;
    setTotals((prev) => ({ ...prev, [monthKey]: amount }));
  }, [supabase, userId]);

  // Budget carry-forward lives in lib/ledgerSelectors.js so the demo store
  // derives its figures from the very same implementation.
  const { budgetFor, budgetOriginFor, monthlyTotalFor, monthlyTotalOriginFor } =
    useBudgetSelectors({ budgets, totals, categories });

  const updateSettings = useCallback(async (patch) => {
    const payload = { user_id: userId };
    if (patch.monthlyIncome !== undefined) payload.monthly_income = patch.monthlyIncome;
    if (patch.currency !== undefined) payload.currency = patch.currency;
    if (patch.carryForward !== undefined) payload.carry_forward = patch.carryForward;
    if (patch.cycleResetDay !== undefined) payload.cycle_reset_day = clampCycleResetDay(patch.cycleResetDay);

    const { error } = await supabase.from('user_settings').upsert(payload, { onConflict: 'user_id' });
    if (error) throw error;
    setSettings((prev) => ({
      ...prev,
      ...patch,
      ...(patch.cycleResetDay !== undefined ? { cycleResetDay: clampCycleResetDay(patch.cycleResetDay) } : {}),
    }));
  }, [supabase, userId]);

  // ── Backups ─────────────────────────────────────────────────────────
  // A snapshot is a self-contained copy of the ledger. It embeds the
  // categories as they are right now, so the read-only archive view never
  // depends on live rows that may later be renamed or deleted.
  const createSnapshot = useCallback(async (label = '', source = 'app') => {
    const payload = {
      // v2 entries carry `kind` and `source`. A v1 payload has neither, and
      // its entries are read as debits — which is all they could have been.
      version: 2,
      capturedAt: new Date().toISOString(),
      categories,
      creditSources,
      transactions,
      budgets,
      totals,
      settings,
    };
    const { data, error } = await supabase
      .from('ledger_snapshots')
      .insert({
        user_id: userId,
        label: label.trim(),
        source,
        payload,
        tx_count: transactions.length,
        // The headline figure for the archive is net spend — debits less any
        // refunds — so it matches what the ledger itself reports for the same
        // entries rather than double-counting money that came back.
        total_amount: netSpend(transactions),
      })
      .select('id, label, source, tx_count, total_amount, created_at')
      .single();
    if (error) throw error;
    const row = snapFromRow(data);
    setSnapshots((prev) => [row, ...prev]);
    return row;
  }, [supabase, userId, categories, creditSources, transactions, budgets, totals, settings]);

  /** Fetch one snapshot's frozen payload. Read-only: nothing is written. */
  const getSnapshot = useCallback(async (id) => {
    const { data, error } = await supabase
      .from('ledger_snapshots')
      .select('id, label, source, tx_count, total_amount, created_at, payload')
      .eq('id', id)
      .single();
    if (error) throw error;
    return { ...snapFromRow(data), payload: data.payload };
  }, [supabase]);

  /** Deletes the backup only. Live transactions and budgets are untouched. */
  const deleteSnapshot = useCallback(async (id) => {
    const { error } = await supabase.from('ledger_snapshots').delete().eq('id', id);
    if (error) throw error;
    setSnapshots((prev) => prev.filter((s2) => s2.id !== id));
  }, [supabase]);

  const clearAllData = useCallback(async () => {
    await Promise.all([
      supabase.from('transactions').delete().eq('user_id', userId),
      supabase.from('budgets').delete().eq('user_id', userId),
      supabase.from('monthly_totals').delete().eq('user_id', userId),
    ]);
    setTransactions([]);
    setBudgets({});
    setTotals({});
  }, [supabase, userId]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }, [supabase]);

  return {
    categories,
    creditSources,
    transactions,
    budgets,
    totals,
    settings,
    snapshots,
    hydrated,
    userId,
    userEmail,
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
    updateSettings,
    createSnapshot,
    getSnapshot,
    deleteSnapshot,
    clearAllData,
    signOut,
  };
}
