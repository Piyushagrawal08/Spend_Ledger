'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

function txFromRow(r) {
  return {
    id: r.id,
    amount: Number(r.amount),
    categoryId: r.category_id,
    date: r.date,
    note: r.note || '',
    method: r.method || 'UPI',
    createdAt: new Date(r.created_at).getTime(),
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

export function useFinanceStore() {
  const [supabase] = useState(() => createClient());
  const [userId, setUserId] = useState(null);
  const [userEmail, setUserEmail] = useState(null);
  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState({});
  const [totals, setTotals] = useState({});
  const [settings, setSettings] = useState({ monthlyIncome: 0, currency: 'INR', carryForward: false });
  const [hydrated, setHydrated] = useState(false);

  const loadAll = useCallback(async () => {
    const [catsRes, txsRes, budsRes, totsRes, settRes] = await Promise.all([
      supabase.from('categories').select('*').order('created_at', { ascending: true }),
      supabase.from('transactions').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('budgets').select('*'),
      supabase.from('monthly_totals').select('*'),
      supabase.from('user_settings').select('*').maybeSingle(),
    ]);

    setCategories((catsRes.data || []).map(catFromRow));
    setTransactions((txsRes.data || []).map(txFromRow));

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
        setTransactions([]);
        setBudgets({});
        setTotals({});
      }
      setHydrated(true);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const addTransaction = useCallback(async (tx) => {
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        category_id: tx.categoryId,
        amount: tx.amount,
        date: tx.date,
        note: tx.note || '',
        method: tx.method || 'UPI',
      })
      .select()
      .single();
    if (error) throw error;
    setTransactions((prev) => [txFromRow(data), ...prev]);
    return txFromRow(data);
  }, [supabase, userId]);

  const updateTransaction = useCallback(async (id, patch) => {
    const payload = {};
    if (patch.amount !== undefined) payload.amount = patch.amount;
    if (patch.categoryId !== undefined) payload.category_id = patch.categoryId;
    if (patch.date !== undefined) payload.date = patch.date;
    if (patch.note !== undefined) payload.note = patch.note;
    if (patch.method !== undefined) payload.method = patch.method;

    const { data, error } = await supabase.from('transactions').update(payload).eq('id', id).select().single();
    if (error) throw error;
    setTransactions((prev) => prev.map((t) => (t.id === id ? txFromRow(data) : t)));
  }, [supabase]);

  const deleteTransaction = useCallback(async (id) => {
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) throw error;
    setTransactions((prev) => prev.filter((t) => t.id !== id));
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

  const monthlyTotalFor = useCallback(
    (monthKey) => (totals[monthKey] !== undefined ? totals[monthKey] : null),
    [totals]
  );

  const budgetFor = useCallback(
    (monthKey, categoryId) => {
      const override = budgets[monthKey]?.[categoryId];
      if (override !== undefined) return override;
      const cat = categories.find((c) => c.id === categoryId);
      return cat?.defaultBudget || 0;
    },
    [budgets, categories]
  );

  const updateSettings = useCallback(async (patch) => {
    const payload = { user_id: userId };
    if (patch.monthlyIncome !== undefined) payload.monthly_income = patch.monthlyIncome;
    if (patch.currency !== undefined) payload.currency = patch.currency;
    if (patch.carryForward !== undefined) payload.carry_forward = patch.carryForward;

    const { error } = await supabase.from('user_settings').upsert(payload, { onConflict: 'user_id' });
    if (error) throw error;
    setSettings((prev) => ({ ...prev, ...patch }));
  }, [supabase, userId]);

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
    transactions,
    budgets,
    totals,
    settings,
    hydrated,
    userId,
    userEmail,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    addCategory,
    updateCategory,
    deleteCategory,
    setBudget,
    budgetFor,
    setMonthlyTotal,
    monthlyTotalFor,
    updateSettings,
    clearAllData,
    signOut,
  };
}
