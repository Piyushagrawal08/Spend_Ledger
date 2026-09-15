'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Trash2, ArrowUpRight, ArrowDownLeft, Undo2, Info } from 'lucide-react';
import Panel from '@/components/ui/Panel';
import { CategoryIcon } from '@/lib/icons';
import { PAYMENT_METHODS } from '@/lib/defaultData';
import {
  todayISO, formatINR, classNames, getCategory, getCreditSource, ledgerTotals,
  DEBIT, CREDIT, isCredit,
} from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';

export default function AddEntry({ store }) {
  const { categories, creditSources, addTransaction, transactions, deleteTransaction } = store;
  const toast = useToast();

  // The one control that changes everything below it. Debit is the default
  // because logging a spend is still the overwhelmingly common act.
  const [kind, setKind] = useState(DEBIT);
  const credit = kind === CREDIT;

  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [method, setMethod] = useState('UPI');
  const [sourceId, setSourceId] = useState('');
  // Credits only: whether this money is handed back to a category (a refund)
  // or is fresh income that belongs to no category at all.
  const [offsets, setOffsets] = useState(false);

  const source = creditSources.find((s) => s.id === sourceId) || null;

  // Default to the first source once they load, and recover if the selected
  // one is deleted from the Categories screen while this form is open.
  useEffect(() => {
    if (creditSources.length && !creditSources.some((s) => s.id === sourceId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSourceId(creditSources[0].id);
    }
  }, [creditSources, sourceId]);

  // Picking a source moves the refund switch to that source's usual answer,
  // but only as a starting point — it stays overridable.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (credit && source) setOffsets(!!source.offsetsSpend);
  }, [sourceId, credit, source]);

  const todayEntries = useMemo(
    () => transactions.filter((t) => t.date === todayISO()).slice(0, 8),
    [transactions]
  );
  const todayTotals = useMemo(
    () => ledgerTotals(transactions.filter((t) => t.date === todayISO())),
    [transactions]
  );

  const [submitting, setSubmitting] = useState(false);

  const accent = credit
    ? { text: 'text-signal-green', ring: 'focus-within:border-signal-green/60', border: 'focus:border-signal-green/60', btn: 'bg-signal-green hover:bg-emerald-400' }
    : { text: 'text-signal-amber', ring: 'focus-within:border-signal-amber/60', border: 'focus:border-signal-amber/60', btn: 'bg-signal-amber hover:bg-amber-400' };

  // Credits only need a category when they are a refund; income has none.
  const needsCategory = !credit || offsets;

  async function handleSubmit(e) {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      toast('Enter a valid amount', 'warning');
      return;
    }
    if (needsCategory && !categoryId) {
      toast(credit ? 'Choose the category this credit goes back to' : 'Choose a category', 'warning');
      return;
    }
    if (credit && !source) {
      toast('Choose where this money came from', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      await addTransaction({
        kind,
        amount: numAmount,
        categoryId: needsCategory ? categoryId : null,
        // The id links to the editable row; the name is frozen onto the entry
        // so it still reads correctly if that source is deleted later.
        sourceId: credit ? source.id : null,
        source: credit ? source.name : null,
        date,
        note: note.trim(),
        method,
      });
      toast(
        credit
          ? offsets
            ? `Credited ${formatINR(numAmount)} back to ${getCategory(categories, categoryId).name}`
            : `Logged ${formatINR(numAmount)} in from ${source.name}`
          : `Logged ${formatINR(numAmount)} to ${getCategory(categories, categoryId).name}`,
        'success'
      );
      setAmount('');
      setNote('');
    } catch (err) {
      toast(
        /source_id|credit_sources/i.test(err?.message || '')
          ? 'Run supabase/migrations/003_credit_sources.sql first'
          : /kind|source/i.test(err?.message || '')
            ? 'Run supabase/migrations/002_credit_entries.sql first'
            : 'Could not save that entry — try again',
        'warning'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5 animate-rise max-w-2xl mx-auto">
      <div>
        <div className="text-[10px] uppercase tracking-[0.16em] text-paper-500 font-mono mb-1">daily entry</div>
        <h1 className="font-display text-2xl font-semibold text-paper-100">
          {credit ? 'Log money in' : 'Log a spend'}
        </h1>
      </div>

      <Panel noPad>
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Debit / credit switch */}
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-ink-border bg-ink-850 p-1">
            <SideButton
              active={!credit}
              onClick={() => setKind(DEBIT)}
              icon={ArrowUpRight}
              label="Money out"
              hint="debit"
              activeClass="bg-signal-amber/12 border-signal-amber/50 text-signal-amber"
            />
            <SideButton
              active={credit}
              onClick={() => setKind(CREDIT)}
              icon={ArrowDownLeft}
              label="Money in"
              hint="credit"
              activeClass="bg-signal-green/12 border-signal-green/50 text-signal-green"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="text-[11px] uppercase tracking-wide text-paper-500 font-mono mb-2 block">Amount</label>
            <div className={classNames('flex items-center gap-2 rounded-2xl border border-ink-border bg-ink-850 px-4 py-3 transition-colors', accent.ring)}>
              <span className={classNames('font-mono text-2xl', accent.text)}>{credit ? '+' : '−'}</span>
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

          {/* Credit: where it came from */}
          {credit && (
            <div>
              <label className="text-[11px] uppercase tracking-wide text-paper-500 font-mono mb-2 block">Source</label>
              <div className="grid grid-cols-4 gap-2">
                {creditSources.map((s) => {
                  const active = sourceId === s.id;
                  return (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => setSourceId(s.id)}
                      className={classNames(
                        'flex flex-col items-center gap-1.5 rounded-xl border py-3 px-1 transition-all',
                        active ? 'border-transparent' : 'border-ink-border bg-ink-850 hover:bg-ink-700'
                      )}
                      style={active ? { background: `${s.color}22`, borderColor: `${s.color}66` } : {}}
                    >
                      <CategoryIcon
                        name={s.icon}
                        size={17}
                        style={{ color: active ? s.color : 'rgb(var(--c-paper-500))' }}
                      />
                      <span className={classNames('text-[9.5px] text-center leading-tight', active ? 'text-paper-100' : 'text-paper-500')}>
                        {s.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Credit: refund or income? */}
          {credit && (
            <div className="rounded-2xl border border-ink-border bg-ink-850/60 p-3.5 space-y-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={offsets}
                  onChange={(e) => setOffsets(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-emerald-500 shrink-0"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm text-paper-100">
                    <Undo2 size={13} className="text-signal-green shrink-0" />
                    Give this back to a category
                  </span>
                  <span className="block text-[11px] text-paper-500 mt-0.5 leading-relaxed">
                    {offsets
                      ? 'A refund: it comes off that category’s spend and frees up its budget again.'
                      : 'Fresh money in — counted as income, and it touches no category or budget.'}
                  </span>
                </span>
              </label>

              {offsets && (
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className={classNames(
                    'w-full rounded-xl border border-ink-border bg-ink-850 px-3 py-2.5 text-sm text-paper-100 outline-none',
                    accent.border
                  )}
                >
                  <option value="">Select a category…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Debit: category grid */}
          {!credit && (
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
          )}

          {/* Date + method */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-wide text-paper-500 font-mono mb-2 block">Date</label>
              <input
                type="date"
                value={date}
                max={todayISO()}
                onChange={(e) => setDate(e.target.value)}
                className={classNames('w-full rounded-xl border border-ink-border bg-ink-850 px-3 py-2.5 text-sm text-paper-100 outline-none font-mono', accent.border)}
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wide text-paper-500 font-mono mb-2 block">
                {credit ? 'Received via' : 'Payment'}
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className={classNames('w-full rounded-xl border border-ink-border bg-ink-850 px-3 py-2.5 text-sm text-paper-100 outline-none', accent.border)}
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
              placeholder={credit ? 'e.g. August salary' : 'e.g. Lunch with team'}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={80}
              className={classNames('w-full rounded-xl border border-ink-border bg-ink-850 px-3 py-2.5 text-sm text-paper-100 outline-none placeholder:text-paper-600', accent.border)}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className={classNames(
              'w-full flex items-center justify-center gap-2 rounded-xl disabled:opacity-60 text-ink-950 font-display font-semibold text-sm py-3.5 transition-colors',
              accent.btn
            )}
          >
            <Check size={16} strokeWidth={2.6} />
            {submitting ? 'Logging…' : credit ? 'Log credit' : 'Log spend'}
          </button>
        </form>
      </Panel>

      <Panel
        title="Today"
        eyebrow={
          todayTotals.credits > 0
            ? `${formatINR(todayTotals.debits)} out · ${formatINR(todayTotals.credits)} in`
            : `total ${formatINR(todayTotals.debits)}`
        }
      >
        {todayEntries.length === 0 ? (
          <div className="text-center text-paper-500 text-xs font-mono py-6">Nothing logged today yet</div>
        ) : (
          <div className="space-y-2">
            {todayEntries.map((t) => {
              const isIn = isCredit(t);
              const cat = t.categoryId ? getCategory(categories, t.categoryId) : null;
              // A credit's badge shows its source; a refund still names the
              // category it went back to on the line beneath.
              const src = isIn ? getCreditSource(creditSources, t) : null;
              const icon = isIn ? src.icon : cat?.icon;
              const tint = isIn ? src.color : cat?.color;
              return (
                <div key={t.id} className="group flex items-center gap-2.5 text-xs">
                  <span className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${tint}22` }}>
                    <CategoryIcon name={icon} size={12} style={{ color: tint }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-paper-100 truncate">{t.note || (isIn ? src.name : cat?.name)}</div>
                    <div className="text-paper-500 text-[10px] truncate">
                      {isIn && cat ? `back to ${cat.name} · ` : ''}{t.method}
                    </div>
                  </div>
                  <span className={classNames('font-mono', isIn ? 'text-signal-green' : 'text-paper-100')}>
                    {isIn ? '+' : '−'}{formatINR(t.amount)}
                  </span>
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

      {credit && (
        <div className="flex items-start gap-2.5 rounded-xl border border-ink-border bg-ink-850/50 px-4 py-3">
          <Info size={14} className="text-signal-blue mt-0.5 shrink-0" />
          <p className="text-[11px] text-paper-500 leading-relaxed">
            <span className="text-paper-300">Refunds</span> come off the category they are tagged to, so a
            ₹500 meal refunded in full leaves that budget as if you never spent it.{' '}
            <span className="text-paper-300">Income</span> stays out of the budget maths entirely and shows
            up in your cycle&rsquo;s money-in and net-flow figures instead. Both lists are yours to
            edit &mdash; spend categories and credit sources both live on the Categories screen.
          </p>
        </div>
      )}
    </div>
  );
}

function SideButton({ active, onClick, icon: Icon, label, hint, activeClass }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        'flex items-center justify-center gap-2 rounded-xl border py-2.5 transition-all',
        active ? activeClass : 'border-transparent text-paper-500 hover:text-paper-300'
      )}
    >
      <Icon size={15} strokeWidth={2.4} />
      <span className="font-display text-sm font-semibold">{label}</span>
      <span className="font-mono text-[9.5px] uppercase tracking-wide opacity-70">{hint}</span>
    </button>
  );
}
