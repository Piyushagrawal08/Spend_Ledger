'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Pencil, Trash2, Inbox, ArrowUpRight, ArrowDownLeft, Undo2 } from 'lucide-react';
import Panel from '@/components/ui/Panel';
import Modal from '@/components/ui/Modal';
import MonthSwitcher from '@/components/ui/MonthSwitcher';
import { CategoryIcon } from '@/lib/icons';
import { PAYMENT_METHODS } from '@/lib/defaultData';
import {
  formatINR, formatDateNice, groupBy, sum, classNames, getCategory, getCreditSource,
  filterCycle, cycleRangeLabel, DEFAULT_CYCLE_RESET_DAY,
  DEBIT, CREDIT, isCredit, signedAmount, ledgerTotals,
} from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';

const SIDES = [
  { id: 'all', label: 'All' },
  { id: DEBIT, label: 'Money out' },
  { id: CREDIT, label: 'Money in' },
];

export default function Transactions({ store, monthKey, setMonthKey }) {
  const { transactions, categories, creditSources, deleteTransaction, updateTransaction, settings } = store;
  const resetDay = settings?.cycleResetDay ?? DEFAULT_CYCLE_RESET_DAY;
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [side, setSide] = useState('all');
  const [editing, setEditing] = useState(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return filterCycle(transactions, monthKey, resetDay)
      .filter((t) => side === 'all' || (side === CREDIT ? isCredit(t) : !isCredit(t)))
      .filter((t) => catFilter === 'all' || t.categoryId === catFilter)
      // Credits are searchable by their source too — that is their "category".
      .filter((t) => !q || (t.note || '').toLowerCase().includes(q) || (t.source || '').toLowerCase().includes(q));
  }, [transactions, monthKey, resetDay, side, catFilter, query]);

  const grouped = useMemo(() => {
    const g = groupBy(filtered, (t) => t.date);
    return Object.entries(g).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  const totals = useMemo(() => ledgerTotals(filtered), [filtered]);

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
        <div className="p-4 space-y-2.5 border-b border-ink-border">
          {/* Which side of the ledger */}
          <div className="grid grid-cols-3 gap-1 rounded-xl border border-ink-border bg-ink-850 p-1">
            {SIDES.map((s) => (
              <button
                key={s.id}
                onClick={() => setSide(s.id)}
                className={classNames(
                  'rounded-lg py-1.5 text-xs font-display font-medium transition-colors',
                  side === s.id
                    ? s.id === CREDIT
                      ? 'bg-signal-green/12 text-signal-green'
                      : s.id === DEBIT
                        ? 'bg-signal-amber/12 text-signal-amber'
                        : 'bg-ink-700 text-paper-100'
                    : 'text-paper-500 hover:text-paper-300'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="flex-1 flex items-center gap-2 rounded-xl border border-ink-border bg-ink-850 px-3 py-2">
              <Search size={14} className="text-paper-500 shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search notes and sources…"
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
        </div>

        {/* Out / in / net — the three numbers a two-sided ledger owes you. */}
        <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs border-b border-ink-border">
          <span className="text-paper-500 font-mono">{filtered.length} entries</span>
          <div className="flex items-center gap-3 font-mono">
            <span className="text-paper-500">
              out <span className="text-paper-100">{formatINR(totals.debits)}</span>
            </span>
            <span className="text-paper-500">
              in <span className="text-signal-green">{formatINR(totals.credits)}</span>
            </span>
            <span className="text-paper-500 border-l border-ink-border pl-3">
              net{' '}
              <span className={totals.netFlow >= 0 ? 'text-signal-green' : 'text-paper-100'}>
                {totals.netFlow >= 0 ? '+' : '−'}{formatINR(Math.abs(totals.netFlow))}
              </span>
            </span>
          </div>
        </div>

        {totals.refunds > 0 && (
          <div className="px-5 py-2 flex items-center gap-1.5 text-[11px] font-mono text-paper-500 border-b border-ink-border">
            <Undo2 size={11} className="text-signal-green shrink-0" />
            {formatINR(totals.refunds)} of that came back to categories · net spend{' '}
            <span className="text-paper-100">{formatINR(totals.netSpend)}</span>
          </div>
        )}

        {grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-paper-500">
            <Inbox size={22} />
            <span className="text-xs font-mono">No transactions match your filters</span>
          </div>
        ) : (
          <div className="divide-y divide-ink-border">
            {grouped.map(([date, items]) => {
              const dayNet = sum(items, signedAmount);
              return (
                <div key={date} className="px-5 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono text-paper-500">{formatDateNice(date)}</span>
                    <span className={classNames('text-[11px] font-mono', dayNet < 0 ? 'text-signal-green' : 'text-paper-500')}>
                      {dayNet < 0 ? '+' : '−'}{formatINR(Math.abs(dayNet))}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {items.map((t) => {
                      const isIn = isCredit(t);
                      const cat = t.categoryId ? getCategory(categories, t.categoryId) : null;
                      const src = isIn ? getCreditSource(creditSources, t) : null;
                      const icon = isIn ? src.icon : cat?.icon;
                      const tint = isIn ? src.color : cat?.color;
                      const meta = isIn
                        ? [src.name, cat ? `back to ${cat.name}` : 'income', t.method]
                        : [cat?.name, t.method];
                      return (
                        <div key={t.id} className="group flex items-center gap-2.5 text-sm">
                          <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${tint}22` }}>
                            <CategoryIcon name={icon} size={13} style={{ color: tint }} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-paper-100 truncate text-[13px] flex items-center gap-1.5">
                              {isIn && <ArrowDownLeft size={11} className="text-signal-green shrink-0" />}
                              <span className="truncate">{t.note || (isIn ? src.name : cat?.name)}</span>
                            </div>
                            <div className="text-paper-500 text-[10px] font-mono truncate">
                              {meta.filter(Boolean).join(' · ')}
                            </div>
                          </div>
                          <span className={classNames('font-mono text-[13px]', isIn ? 'text-signal-green' : 'text-paper-100')}>
                            {isIn ? '+' : '−'}{formatINR(t.amount)}
                          </span>
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
              );
            })}
          </div>
        )}
      </Panel>

      <EditModal
        tx={editing}
        categories={categories}
        creditSources={creditSources}
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

function EditModal({ tx, categories, creditSources, onClose, onSave }) {
  const [kind, setKind] = useState(DEBIT);
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [method, setMethod] = useState('UPI');
  const [sourceId, setSourceId] = useState('');

  useEffect(() => {
    if (!tx) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKind(isCredit(tx) ? CREDIT : DEBIT);
    setAmount(tx.amount);
    setCategoryId(tx.categoryId || '');
    setDate(tx.date);
    setNote(tx.note || '');
    setMethod(tx.method || 'UPI');
    setSourceId(tx.sourceId || creditSources[0]?.id || '');
  }, [tx, creditSources]);

  if (!tx) return null;

  const credit = kind === CREDIT;

  return (
    <Modal open={!!tx} onClose={onClose} title="Edit entry">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const n = parseFloat(amount);
          if (!n || n <= 0) return;
          const src = creditSources.find((s) => s.id === sourceId) || null;
          onSave({
            kind,
            amount: n,
            // Clearing the category on a credit turns it back into plain income.
            categoryId: categoryId || null,
            sourceId: credit ? src?.id || null : null,
            source: credit ? src?.name || null : null,
            date,
            note: note.trim(),
            method,
          });
        }}
        className="space-y-4"
      >
        {/* Flipping the side here re-files the entry; nothing else is lost. */}
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-ink-border bg-ink-850 p-1">
          <button
            type="button"
            onClick={() => setKind(DEBIT)}
            className={classNames(
              'flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-display font-medium transition-colors',
              !credit ? 'bg-signal-amber/12 text-signal-amber' : 'text-paper-500 hover:text-paper-300'
            )}
          >
            <ArrowUpRight size={13} /> Money out
          </button>
          <button
            type="button"
            onClick={() => setKind(CREDIT)}
            className={classNames(
              'flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-display font-medium transition-colors',
              credit ? 'bg-signal-green/12 text-signal-green' : 'text-paper-500 hover:text-paper-300'
            )}
          >
            <ArrowDownLeft size={13} /> Money in
          </button>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wide text-paper-500 font-mono mb-1.5 block">Amount</label>
          <input
            type="number" step="0.01" min="0" value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border border-ink-border bg-ink-850 px-3 py-2.5 text-sm text-paper-100 outline-none focus:border-signal-amber/60 font-mono"
          />
        </div>

        {credit && (
          <div>
            <label className="text-[11px] uppercase tracking-wide text-paper-500 font-mono mb-1.5 block">Source</label>
            <select
              value={sourceId} onChange={(e) => setSourceId(e.target.value)}
              className="w-full rounded-xl border border-ink-border bg-ink-850 px-3 py-2.5 text-sm text-paper-100 outline-none focus:border-signal-green/60"
            >
              {/* A source deleted since this entry was logged is still offered,
                  so saving does not silently relabel the entry. */}
              {!creditSources.some((s) => s.id === sourceId) && tx.source && (
                <option value="">{tx.source} (deleted)</option>
              )}
              {creditSources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="text-[11px] uppercase tracking-wide text-paper-500 font-mono mb-1.5 block">
            {credit ? 'Goes back to category' : 'Category'}
          </label>
          <select
            value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-xl border border-ink-border bg-ink-850 px-3 py-2.5 text-sm text-paper-100 outline-none focus:border-signal-amber/60"
          >
            <option value="">{credit ? 'None — plain income' : 'Uncategorized'}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {credit && (
            <p className="text-[10px] font-mono text-paper-500 mt-1.5">
              {categoryId
                ? 'a refund — this comes off that category’s spend'
                : 'income — kept out of every category and budget'}
            </p>
          )}
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
            <label className="text-[11px] uppercase tracking-wide text-paper-500 font-mono mb-1.5 block">
              {credit ? 'Received via' : 'Payment'}
            </label>
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
          <button
            type="submit"
            className={classNames(
              'flex-1 rounded-xl text-ink-950 font-display font-semibold text-sm py-2.5 transition-colors',
              credit ? 'bg-signal-green hover:bg-emerald-400' : 'bg-signal-amber hover:bg-amber-400'
            )}
          >
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
