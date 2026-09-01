'use client';

import { useMemo, useState } from 'react';
import { Search, Pencil, Trash2, Inbox } from 'lucide-react';
import Panel from '@/components/ui/Panel';
import Modal from '@/components/ui/Modal';
import MonthSwitcher from '@/components/ui/MonthSwitcher';
import { CategoryIcon } from '@/lib/icons';
import { PAYMENT_METHODS } from '@/lib/defaultData';
import {
  formatINR, formatDateNice, groupBy, sum, classNames, getCategory,
  filterCycle, cycleRangeLabel, DEFAULT_CYCLE_RESET_DAY,
} from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';

export default function Transactions({ store, monthKey, setMonthKey }) {
  const { transactions, categories, deleteTransaction, updateTransaction, settings } = store;
  const resetDay = settings?.cycleResetDay ?? DEFAULT_CYCLE_RESET_DAY;
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [editing, setEditing] = useState(null);

  const filtered = useMemo(() => {
    return filterCycle(transactions, monthKey, resetDay)
      .filter((t) => catFilter === 'all' || t.categoryId === catFilter)
      .filter((t) => !query || (t.note || '').toLowerCase().includes(query.toLowerCase()));
  }, [transactions, monthKey, resetDay, catFilter, query]);

  const grouped = useMemo(() => {
    const g = groupBy(filtered, (t) => t.date);
    return Object.entries(g).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  const monthTotal = sum(filtered, (t) => t.amount);

  return (
    <div className="space-y-5 animate-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-paper-500 font-mono mb-1">ledger</div>
          <h1 className="font-display text-2xl font-semibold text-paper-100">Transactions</h1>
          <p className="text-[11px] font-mono text-paper-500 mt-1">cycle {cycleRangeLabel(monthKey, resetDay)}</p>
        </div>
        <MonthSwitcher monthKey={monthKey} onChange={setMonthKey} resetDay={resetDay} />
      </div>

      <Panel noPad>
        <div className="p-4 flex flex-col sm:flex-row gap-2.5 border-b border-ink-border">
          <div className="flex-1 flex items-center gap-2 rounded-xl border border-ink-border bg-ink-850 px-3 py-2">
            <Search size={14} className="text-paper-500 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes…"
              className="bg-transparent outline-none text-sm text-paper-100 placeholder:text-paper-600 w-full"
            />
          </div>
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="rounded-xl border border-ink-border bg-ink-850 px-3 py-2 text-sm text-paper-100 outline-none focus:border-signal-amber/60"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="px-5 py-3 flex items-center justify-between text-xs">
          <span className="text-paper-500 font-mono">{filtered.length} entries</span>
          <span className="text-paper-100 font-mono font-medium">{formatINR(monthTotal)}</span>
        </div>

        {grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-paper-500">
            <Inbox size={22} />
            <span className="text-xs font-mono">No transactions match your filters</span>
          </div>
        ) : (
          <div className="divide-y divide-ink-border">
            {grouped.map(([date, items]) => (
              <div key={date} className="px-5 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-mono text-paper-500">{formatDateNice(date)}</span>
                  <span className="text-[11px] font-mono text-paper-500">{formatINR(sum(items, (t) => t.amount))}</span>
                </div>
                <div className="space-y-2">
                  {items.map((t) => {
                    const cat = getCategory(categories, t.categoryId);
                    return (
                      <div key={t.id} className="group flex items-center gap-2.5 text-sm">
                        <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${cat?.color}22` }}>
                          <CategoryIcon name={cat?.icon} size={13} style={{ color: cat?.color }} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-paper-100 truncate text-[13px]">{t.note || cat?.name}</div>
                          <div className="text-paper-500 text-[10px] font-mono">{cat?.name} · {t.method}</div>
                        </div>
                        <span className="font-mono text-paper-100 text-[13px]">{formatINR(t.amount)}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setEditing(t)} className="p-1.5 text-paper-500 hover:text-signal-amber" aria-label="Edit">
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={async () => {
                              try { await deleteTransaction(t.id); toast('Entry deleted', 'info'); }
                              catch { toast('Could not delete that entry', 'warning'); }
                            }}
                            className="p-1.5 text-paper-500 hover:text-signal-red"
                            aria-label="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <EditModal
        tx={editing}
        categories={categories}
        onClose={() => setEditing(null)}
        onSave={async (patch) => {
          try {
            await updateTransaction(editing.id, patch);
            setEditing(null);
            toast('Entry updated', 'success');
          } catch {
            toast('Could not save changes', 'warning');
          }
        }}
      />
    </div>
  );
}

function EditModal({ tx, categories, onClose, onSave }) {
  const [amount, setAmount] = useState(tx?.amount ?? '');
  const [categoryId, setCategoryId] = useState(tx?.categoryId ?? '');
  const [date, setDate] = useState(tx?.date ?? '');
  const [note, setNote] = useState(tx?.note ?? '');
  const [method, setMethod] = useState(tx?.method ?? 'UPI');

  useMemo(() => {
    if (tx) {
      setAmount(tx.amount);
      setCategoryId(tx.categoryId);
      setDate(tx.date);
      setNote(tx.note || '');
      setMethod(tx.method || 'UPI');
    }
  }, [tx]);

  if (!tx) return null;

  return (
    <Modal open={!!tx} onClose={onClose} title="Edit entry">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const n = parseFloat(amount);
          if (!n || n <= 0) return;
          onSave({ amount: n, categoryId, date, note: note.trim(), method });
        }}
        className="space-y-4"
      >
        <div>
          <label className="text-[11px] uppercase tracking-wide text-paper-500 font-mono mb-1.5 block">Amount</label>
          <input
            type="number" step="0.01" min="0" value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border border-ink-border bg-ink-850 px-3 py-2.5 text-sm text-paper-100 outline-none focus:border-signal-amber/60 font-mono"
          />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wide text-paper-500 font-mono mb-1.5 block">Category</label>
          <select
            value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-xl border border-ink-border bg-ink-850 px-3 py-2.5 text-sm text-paper-100 outline-none focus:border-signal-amber/60"
          >
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] uppercase tracking-wide text-paper-500 font-mono mb-1.5 block">Date</label>
            <input
              type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-ink-border bg-ink-850 px-3 py-2.5 text-sm text-paper-100 outline-none focus:border-signal-amber/60 font-mono"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-paper-500 font-mono mb-1.5 block">Payment</label>
            <select
              value={method} onChange={(e) => setMethod(e.target.value)}
              className="w-full rounded-xl border border-ink-border bg-ink-850 px-3 py-2.5 text-sm text-paper-100 outline-none focus:border-signal-amber/60"
            >
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wide text-paper-500 font-mono mb-1.5 block">Note</label>
          <input
            type="text" value={note} onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-xl border border-ink-border bg-ink-850 px-3 py-2.5 text-sm text-paper-100 outline-none focus:border-signal-amber/60"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="submit" className="flex-1 rounded-xl bg-signal-amber hover:bg-amber-400 text-ink-950 font-display font-semibold text-sm py-2.5 transition-colors">
            Save changes
          </button>
          <button type="button" onClick={onClose} className="px-4 rounded-xl border border-ink-border text-paper-300 hover:bg-ink-700 text-sm">
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
