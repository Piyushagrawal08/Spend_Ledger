'use client';

import { useMemo, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import Panel from '@/components/ui/Panel';
import { CategoryIcon } from '@/lib/icons';
import { PAYMENT_METHODS } from '@/lib/defaultData';
import { todayISO, formatINR, sum, classNames, getCategory } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';

export default function AddExpense({ store }) {
  const { categories, addTransaction, transactions, deleteTransaction } = store;
  const toast = useToast();

  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [method, setMethod] = useState('UPI');

  const todayEntries = useMemo(
    () => transactions.filter((t) => t.date === todayISO()).slice(0, 8),
    [transactions]
  );
  const todayTotal = sum(transactions.filter((t) => t.date === todayISO()), (t) => t.amount);

  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      toast('Enter a valid amount', 'warning');
      return;
    }
    if (!categoryId) {
      toast('Choose a category', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      await addTransaction({ amount: numAmount, categoryId, date, note: note.trim(), method });
      toast(`Logged ${formatINR(numAmount)} to ${getCategory(categories, categoryId).name}`, 'success');
      setAmount('');
      setNote('');
    } catch (err) {
      toast('Could not save that entry — try again', 'warning');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5 animate-rise max-w-2xl mx-auto">
      <div>
        <div className="text-[10px] uppercase tracking-[0.16em] text-paper-500 font-mono mb-1">daily entry</div>
        <h1 className="font-display text-2xl font-semibold text-paper-100">Log a spend</h1>
      </div>

      <Panel noPad>
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Amount */}
          <div>
            <label className="text-[11px] uppercase tracking-wide text-paper-500 font-mono mb-2 block">Amount</label>
            <div className="flex items-center gap-2 rounded-2xl border border-ink-border bg-ink-850 px-4 py-3 focus-within:border-signal-amber/60 transition-colors">
              <span className="font-mono text-2xl text-paper-500">₹</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                autoFocus
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 bg-transparent outline-none font-mono text-3xl text-paper-100 placeholder:text-paper-600 w-full"
              />
            </div>
          </div>

          {/* Category grid */}
          <div>
            <label className="text-[11px] uppercase tracking-wide text-paper-500 font-mono mb-2 block">Category</label>
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {categories.map((c) => {
                const active = categoryId === c.id;
                return (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => setCategoryId(c.id)}
                    className={classNames(
                      'flex flex-col items-center gap-1.5 rounded-xl border py-3 px-1 transition-all',
                      active ? 'border-transparent' : 'border-ink-border bg-ink-850 hover:bg-ink-700'
                    )}
                    style={active ? { background: `${c.color}22`, borderColor: `${c.color}66` } : {}}
                  >
                    <CategoryIcon name={c.icon} size={17} style={{ color: active ? c.color : 'rgb(var(--c-paper-500))' }} />
                    <span className={classNames('text-[9.5px] text-center leading-tight', active ? 'text-paper-100' : 'text-paper-500')}>
                      {c.name.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date + method */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-wide text-paper-500 font-mono mb-2 block">Date</label>
              <input
                type="date"
                value={date}
                max={todayISO()}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-ink-border bg-ink-850 px-3 py-2.5 text-sm text-paper-100 outline-none focus:border-signal-amber/60 font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wide text-paper-500 font-mono mb-2 block">Payment</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full rounded-xl border border-ink-border bg-ink-850 px-3 py-2.5 text-sm text-paper-100 outline-none focus:border-signal-amber/60"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="text-[11px] uppercase tracking-wide text-paper-500 font-mono mb-2 block">Note (optional)</label>
            <input
              type="text"
              placeholder="e.g. Lunch with team"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={80}
              className="w-full rounded-xl border border-ink-border bg-ink-850 px-3 py-2.5 text-sm text-paper-100 outline-none focus:border-signal-amber/60 placeholder:text-paper-600"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-signal-amber hover:bg-amber-400 disabled:opacity-60 text-ink-950 font-display font-semibold text-sm py-3.5 transition-colors"
          >
            <Check size={16} strokeWidth={2.6} /> {submitting ? 'Logging…' : 'Log spend'}
          </button>
        </form>
      </Panel>

      <Panel title="Today" eyebrow={`total ${formatINR(todayTotal)}`}>
        {todayEntries.length === 0 ? (
          <div className="text-center text-paper-500 text-xs font-mono py-6">Nothing logged today yet</div>
        ) : (
          <div className="space-y-2">
            {todayEntries.map((t) => {
              const cat = getCategory(categories, t.categoryId);
              return (
                <div key={t.id} className="group flex items-center gap-2.5 text-xs">
                  <span className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${cat?.color}22` }}>
                    <CategoryIcon name={cat?.icon} size={12} style={{ color: cat?.color }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-paper-100 truncate">{t.note || cat?.name}</div>
                    <div className="text-paper-500 text-[10px]">{t.method}</div>
                  </div>
                  <span className="font-mono text-paper-100">{formatINR(t.amount)}</span>
                  <button
                    onClick={async () => {
                      try { await deleteTransaction(t.id); toast('Entry removed', 'info'); }
                      catch { toast('Could not delete that entry', 'warning'); }
                    }}
                    className="opacity-0 group-hover:opacity-100 text-paper-500 hover:text-signal-red transition-opacity"
                    aria-label="Delete entry"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
