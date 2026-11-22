'use client';

import { useMemo, useState } from 'react';
import {
  Plus, Pencil, Trash2, ArrowUpRight, ArrowDownLeft, HandCoins, Users,
  Check, Inbox, Handshake, Scale,
} from 'lucide-react';
import Panel from '@/components/ui/Panel';
import Modal from '@/components/ui/Modal';
import CategoryModal from '@/components/CategoryModal';
import { CategoryIcon } from '@/lib/icons';
import { PAYMENT_METHODS } from '@/lib/defaultData';
import {
  todayISO, formatINR, formatDateNice, classNames, groupBy, getPerson,
  lendingTotals, lendingBalanceByPerson, lendingBalanceLabel,
  LENDING_OUT, LENDING_IN, isLendingIn,
} from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';

const ORPHAN = '__unknown_person__';

/**
 * Lending — money between you and a friend.
 *
 * Deliberately NOT cycle-scoped, and that is why this screen ignores the
 * `monthKey` every other view reads. A debt does not reset on the 7th: what
 * someone owes you is cumulative until it is paid, so every figure here walks
 * the whole list. The same reasoning as the cash balance on Overview.
 *
 * Nothing on this screen reaches the spend ledger. Lending is not spending and
 * being repaid is not income, so these entries live in their own table and
 * touch no category, no budget and no cash balance — see lib/utils.js.
 */
export default function Lending({ store }) {
  const {
    people, lendingEntries,
    addPerson, updatePerson, deletePerson,
    addLendingEntry, updateLendingEntry, deleteLendingEntry,
  } = store;
  const toast = useToast();

  const [personModal, setPersonModal] = useState(null);  // { mode, cat }
  const [entryModal, setEntryModal] = useState(null);    // { mode, entry, preset }
  const [focus, setFocus] = useState(null);              // filter the history to one person

  const totals = useMemo(() => lendingTotals(lendingEntries), [lendingEntries]);
  const balances = useMemo(() => lendingBalanceByPerson(lendingEntries, ORPHAN), [lendingEntries]);

  const counts = useMemo(() => {
    const map = {};
    for (const e of lendingEntries) {
      const key = e.personId || `${ORPHAN}:${e.person || ''}`;
      map[key] = (map[key] || 0) + 1;
    }
    return map;
  }, [lendingEntries]);

  // One row per person, live people first. Entries whose person has been
  // deleted still get a row of their own, keyed by the name frozen on them —
  // otherwise the cards would not add up to the headline above, and money
  // would appear to vanish because a name was tidied away.
  const rows = useMemo(() => {
    const live = people.map((p) => ({
      key: p.id, person: p, balance: balances[p.id] || 0, count: counts[p.id] || 0, live: true,
    }));
    const orphans = Object.keys(balances)
      .filter((k) => k.startsWith(ORPHAN))
      .map((k) => ({
        key: k,
        person: { id: null, name: k.slice(ORPHAN.length + 1) || 'Someone', color: '#8A93A6', icon: 'UserRound' },
        balance: balances[k],
        count: counts[k] || 0,
        live: false,
      }));
    return [...live, ...orphans];
  }, [people, balances, counts]);

  const visibleEntries = useMemo(
    () => (focus ? lendingEntries.filter((e) => e.personId === focus) : lendingEntries),
    [lendingEntries, focus]
  );

  const byDate = useMemo(() => groupBy(visibleEntries, (e) => e.date), [visibleEntries]);
  const dates = useMemo(() => Object.keys(byDate).sort().reverse(), [byDate]);

  const focusedPerson = focus ? people.find((p) => p.id === focus) : null;

  async function handlePersonSubmit(data) {
    try {
      if (personModal.mode === 'add') {
        await addPerson(data);
        toast(`${data.name} added`, 'success');
      } else {
        await updatePerson(personModal.cat.id, data);
        toast('Saved', 'success');
      }
      setPersonModal(null);
    } catch (err) {
      toast(migrationHint(err) || 'Could not save that', 'warning');
    }
  }

  async function handlePersonDelete(row) {
    const outstanding = row.balance !== 0
      ? ` The balance of ${formatINR(Math.abs(row.balance))} between you stops being counted.`
      : '';
    const msg = row.count > 0
      ? `${row.person.name} has ${row.count} entr${row.count === 1 ? 'y' : 'ies'}. They keep their amount and the name "${row.person.name}", but stop being linked.${outstanding} Continue?`
      : `Remove ${row.person.name}?`;
    if (!confirm(msg)) return;
    try {
      await deletePerson(row.person.id);
      if (focus === row.person.id) setFocus(null);
      toast('Person removed', 'info');
    } catch {
      toast('Could not remove that person', 'warning');
    }
  }

  async function handleEntrySubmit(data) {
    try {
      if (entryModal.mode === 'add') {
        await addLendingEntry(data);
        toast(
          data.direction === LENDING_IN
            ? `Logged ${formatINR(data.amount)} from ${data.person}`
            : `Logged ${formatINR(data.amount)} to ${data.person}`,
          'success'
        );
      } else {
        await updateLendingEntry(entryModal.entry.id, data);
        toast('Saved', 'success');
      }
      setEntryModal(null);
    } catch (err) {
      toast(migrationHint(err) || 'Could not save that entry', 'warning');
    }
  }

  async function handleEntryDelete(entry) {
    if (!confirm('Delete this entry? The balance with this person is recalculated from what is left.')) return;
    try {
      await deleteLendingEntry(entry.id);
      toast('Entry deleted', 'info');
    } catch {
      toast('Could not delete that entry', 'warning');
    }
  }

  return (
    <div className="space-y-5 animate-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-paper-500 font-mono mb-1">outside the ledger</div>
          <h1 className="font-display text-2xl font-semibold text-paper-100">Lending &amp; borrowing</h1>
        </div>
        <button
          onClick={() => setEntryModal({ mode: 'add' })}
          disabled={people.length === 0}
          className="flex items-center gap-1.5 rounded-xl bg-signal-violet hover:bg-violet-400 disabled:opacity-50 text-ink-950 font-display font-semibold text-sm px-4 py-2.5 transition-colors"
        >
          <Plus size={15} strokeWidth={2.6} /> Log entry
        </button>
      </div>

      <Panel>
        <div className="flex items-start gap-2.5 text-xs text-paper-300 leading-relaxed">
          <HandCoins size={15} className="text-signal-violet mt-0.5 shrink-0" />
          <p>
            Money you lend to a friend, or borrow from one, is kept{' '}
            <span className="text-paper-100">completely apart</span> from the rest of the app. It is
            not spending and it is not income — it is a debt waiting to be settled, so nothing here
            touches a category, a budget or your running cash balance. A repayment is simply an entry
            the other way, and each balance below is worked out from the entries under it.
          </p>
        </div>
      </Panel>

      {/* Two figures, never one. A friend owing you ₹5,000 while you owe
          someone else ₹5,000 is two live debts, not "all square". */}
      <div className="grid grid-cols-2 gap-3">
        <Panel>
          <div className="text-[10px] uppercase tracking-[0.14em] text-paper-500 font-mono mb-1">owed to you</div>
          <div className="font-mono text-2xl text-signal-green">{formatINR(totals.owedToYou)}</div>
          <div className="text-[11px] text-paper-500 mt-1">
            {countOwing(rows, 1)} {countOwing(rows, 1) === 1 ? 'person owes' : 'people owe'} you
          </div>
        </Panel>
        <Panel>
          <div className="text-[10px] uppercase tracking-[0.14em] text-paper-500 font-mono mb-1">you owe</div>
          <div className="font-mono text-2xl text-signal-red">{formatINR(totals.youOwe)}</div>
          <div className="text-[11px] text-paper-500 mt-1">
            to {countOwing(rows, -1)} {countOwing(rows, -1) === 1 ? 'person' : 'people'}
          </div>
        </Panel>
      </div>

      <Panel
        title="People"
        eyebrow={people.length ? `${people.length} tracked` : 'nobody yet'}
        action={
          <button
            onClick={() => setPersonModal({ mode: 'add' })}
            className="flex items-center gap-1.5 rounded-lg border border-signal-violet/40 px-2.5 py-1 text-[11px] font-mono text-signal-violet hover:bg-signal-violet/12 transition-colors"
          >
            <Plus size={11} /> add person
          </button>
        }
      >
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-paper-500">
            <Users size={22} />
            <span className="text-xs font-mono">Add whoever you lend to or borrow from</span>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rows.map((row) => (
              <PersonCard
                key={row.key}
                row={row}
                focused={focus === row.person.id}
                onFocus={() => setFocus(focus === row.person.id ? null : row.person.id)}
                onLog={() => setEntryModal({ mode: 'add', preset: { personId: row.person.id } })}
                onSettle={() => setEntryModal({
                  mode: 'add',
                  preset: {
                    personId: row.person.id,
                    // A settlement is the same entry, pointing the other way.
                    direction: row.balance > 0 ? LENDING_IN : LENDING_OUT,
                    amount: Math.abs(row.balance),
                    note: 'Settled up',
                  },
                })}
                onEdit={() => setPersonModal({ mode: 'edit', cat: row.person })}
                onDelete={() => handlePersonDelete(row)}
              />
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title={focusedPerson ? `Entries with ${focusedPerson.name}` : 'All entries'}
        eyebrow={`${visibleEntries.length} logged`}
        action={
          focusedPerson ? (
            <button
              onClick={() => setFocus(null)}
              className="text-[11px] font-mono text-paper-500 hover:text-paper-100 transition-colors"
            >
              show everyone
            </button>
          ) : null
        }
        noPad
      >
        {visibleEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-14 text-paper-500">
            <Inbox size={22} />
            <span className="text-xs font-mono">
              {people.length === 0 ? 'Add a person first, then log an entry' : 'Nothing logged yet'}
            </span>
          </div>
        ) : (
          <div className="divide-y divide-ink-border">
            {dates.map((date) => (
              <div key={date}>
                <div className="px-5 pt-3 pb-1 text-[10px] font-mono uppercase tracking-wide text-paper-500">
                  {formatDateNice(date)}
                </div>
                {byDate[date].map((e) => (
                  <EntryRow
                    key={e.id}
                    entry={e}
                    people={people}
                    onEdit={() => setEntryModal({ mode: 'edit', entry: e })}
                    onDelete={() => handleEntryDelete(e)}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <CategoryModal
        variant="person"
        modal={personModal}
        onClose={() => setPersonModal(null)}
        onSubmit={handlePersonSubmit}
      />

      <LendingEntryModal
        // Remount per open so a half-filled form never carries across.
        key={entryModal ? entryModal.entry?.id || 'new' : 'closed'}
        modal={entryModal}
        people={people}
        onClose={() => setEntryModal(null)}
        onSubmit={handleEntrySubmit}
      />
    </div>
  );
}

/** How many rows sit on one side of zero. `sign` is 1 for owed to you, -1 for owing. */
function countOwing(rows, sign) {
  return rows.filter((r) => (sign > 0 ? r.balance > 0 : r.balance < 0)).length;
}

/** The toast hint when the lending tables are not in the database yet. */
function migrationHint(err) {
  return /people|lending_entries/i.test(err?.message || '')
    ? 'Run supabase/migrations/005_lending.sql first'
    : null;
}

function PersonCard({ row, focused, onFocus, onLog, onSettle, onEdit, onDelete }) {
  const { person, balance, count, live } = row;
  const tone = balance > 0 ? 'text-signal-green' : balance < 0 ? 'text-signal-red' : 'text-paper-500';

  return (
    <div
      className={classNames(
        'rounded-2xl border bg-ink-800/70 shadow-panel transition-colors',
        focused ? 'border-signal-violet/60' : 'border-ink-border'
      )}
    >
      <div className="p-4 flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${person.color}22` }}>
          <CategoryIcon name={person.icon} size={16} style={{ color: person.color }} />
        </span>
        <div className="min-w-0 flex-1">
          <button
            onClick={live ? onFocus : undefined}
            disabled={!live}
            className="text-sm text-paper-100 font-medium truncate block text-left hover:text-signal-violet disabled:hover:text-paper-100 transition-colors"
          >
            {person.name}
          </button>
          {/* Wraps rather than truncates: the amount sits at the end of this
              line, so cutting it off in a narrow three-across card hides the
              one number the card exists to show. */}
          <div className={classNames('text-[11px] font-mono mt-0.5 break-words', tone)}>
            {lendingBalanceLabel(person.name, balance)}
          </div>
          <div className="text-[10px] font-mono text-paper-500 mt-0.5">
            {count} entr{count === 1 ? 'y' : 'ies'}
            {!live && ' · person removed'}
          </div>
        </div>
        {live && (
          <div className="flex items-center gap-1">
            <button onClick={onEdit} className="p-1.5 text-paper-500 hover:text-signal-violet" aria-label={`Edit ${person.name}`}>
              <Pencil size={13} />
            </button>
            <button onClick={onDelete} className="p-1.5 text-paper-500 hover:text-signal-red" aria-label={`Remove ${person.name}`}>
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>
      {live && (
        <div className="flex items-center gap-1 px-4 pb-3">
          <button
            onClick={onLog}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-ink-border bg-ink-850 py-1.5 text-[11px] font-mono text-paper-300 hover:bg-ink-700 transition-colors"
          >
            <Plus size={11} /> entry
          </button>
          <button
            onClick={onSettle}
            disabled={balance === 0}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-ink-border bg-ink-850 py-1.5 text-[11px] font-mono text-paper-300 hover:bg-ink-700 disabled:opacity-40 disabled:hover:bg-ink-850 transition-colors"
          >
            <Handshake size={11} /> settle up
          </button>
        </div>
      )}
    </div>
  );
}

function EntryRow({ entry, people, onEdit, onDelete }) {
  const person = getPerson(people, entry);
  const incoming = isLendingIn(entry);
  const Icon = incoming ? ArrowDownLeft : ArrowUpRight;

  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-3">
      <span
        className={classNames(
          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
          incoming ? 'bg-signal-green/12' : 'bg-signal-amber/12'
        )}
      >
        <Icon size={15} className={incoming ? 'text-signal-green' : 'text-signal-amber'} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-paper-100 truncate">
          {incoming ? `Got from ${person.name}` : `Gave to ${person.name}`}
        </div>
        <div className="text-[11px] font-mono text-paper-500 truncate">
          {entry.method}
          {entry.note ? ` · ${entry.note}` : ''}
          {!entry.personId && ' · person removed'}
        </div>
      </div>
      <div className={classNames('font-mono text-sm shrink-0', incoming ? 'text-signal-green' : 'text-signal-amber')}>
        {incoming ? '+' : '−'}{formatINR(entry.amount)}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onEdit} className="p-1.5 text-paper-500 hover:text-signal-violet" aria-label="Edit entry">
          <Pencil size={13} />
        </button>
        <button onClick={onDelete} className="p-1.5 text-paper-500 hover:text-signal-red" aria-label="Delete entry">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

/**
 * The entry form. Two branches that are near-mirror images of each other, and
 * they must stay that way: everything a "you gave" entry can record, a "you
 * got" entry records too. The only difference between them is the wording and
 * the accent — amber for money leaving, green for money arriving, matching the
 * rest of the app.
 */
function LendingEntryModal({ modal, people, onClose, onSubmit }) {
  const preset = modal?.preset || {};
  const existing = modal?.entry || null;

  const [direction, setDirection] = useState(existing?.direction || preset.direction || LENDING_OUT);
  const [personId, setPersonId] = useState(existing?.personId || preset.personId || people[0]?.id || '');
  const [amount, setAmount] = useState(
    existing ? String(existing.amount) : preset.amount ? String(preset.amount) : ''
  );
  const [date, setDate] = useState(existing?.date || todayISO());
  const [method, setMethod] = useState(existing?.method || 'UPI');
  const [note, setNote] = useState(existing?.note || preset.note || '');
  const [submitting, setSubmitting] = useState(false);

  if (!modal) return null;

  const incoming = direction === LENDING_IN;
  const person = people.find((p) => p.id === personId) || null;
  const accent = incoming
    ? { text: 'text-signal-green', border: 'focus:border-signal-green/60', btn: 'bg-signal-green hover:bg-emerald-400' }
    : { text: 'text-signal-amber', border: 'focus:border-signal-amber/60', btn: 'bg-signal-amber hover:bg-amber-400' };

  async function handleSubmit(e) {
    e.preventDefault();
    const value = parseFloat(amount);
    if (!value || value <= 0) return;
    if (!person) return;
    setSubmitting(true);
    try {
      await onSubmit({
        direction,
        personId: person.id,
        // The id links to the editable row; the name is frozen onto the entry
        // so it still reads correctly if that person is removed later.
        person: person.name,
        amount: value,
        date,
        method,
        note: note.trim(),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={!!modal} onClose={onClose} title={modal.mode === 'add' ? 'Log a lending entry' : 'Edit entry'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Which way the money moved. */}
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-ink-border bg-ink-850 p-1">
          <DirectionButton
            active={!incoming}
            onClick={() => setDirection(LENDING_OUT)}
            icon={ArrowUpRight}
            label="You gave"
            hint="they owe you"
            activeClass="bg-signal-amber/12 border-signal-amber/50 text-signal-amber"
          />
          <DirectionButton
            active={incoming}
            onClick={() => setDirection(LENDING_IN)}
            icon={ArrowDownLeft}
            label="You got"
            hint="you owe them"
            activeClass="bg-signal-green/12 border-signal-green/50 text-signal-green"
          />
        </div>

        <p className="text-[11px] text-paper-500 leading-relaxed">
          {incoming
            ? 'Money that came to you from them — they paid you back, or you borrowed from them.'
            : 'Money that left your pocket toward them — you lent it, or you paid back what you owed.'}
        </p>

        {/* Amount */}
        <div>
          <label className="text-[11px] uppercase tracking-wide text-paper-500 font-mono mb-1.5 block">Amount</label>
          <div className="flex items-center gap-2 rounded-xl border border-ink-border bg-ink-850 px-3 py-2.5">
            <span className={classNames('font-mono text-lg', accent.text)}>{incoming ? '+' : '−'}</span>
            <span className="font-mono text-lg text-paper-500">₹</span>
            <input
              type="number" inputMode="decimal" step="0.01" min="0" autoFocus placeholder="0"
              value={amount} onChange={(e) => setAmount(e.target.value)}
              className="flex-1 bg-transparent outline-none font-mono text-xl text-paper-100 w-full"
            />
          </div>
        </div>

        {/* Who */}
        <div>
          <label className="text-[11px] uppercase tracking-wide text-paper-500 font-mono mb-1.5 block">Person</label>
          <div className="grid grid-cols-4 gap-2">
            {people.map((p) => {
              const active = personId === p.id;
              return (
                <button
                  type="button" key={p.id} onClick={() => setPersonId(p.id)}
                  className={classNames(
                    'flex flex-col items-center gap-1.5 rounded-xl border py-3 px-1 transition-all',
                    active ? 'border-transparent' : 'border-ink-border bg-ink-850 hover:bg-ink-700'
                  )}
                  style={active ? { background: `${p.color}22`, borderColor: `${p.color}66` } : {}}
                >
                  <CategoryIcon name={p.icon} size={17} style={{ color: active ? p.color : 'rgb(var(--c-paper-500))' }} />
                  <span className={classNames('text-[9.5px] text-center leading-tight', active ? 'text-paper-100' : 'text-paper-500')}>
                    {p.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Date + method */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] uppercase tracking-wide text-paper-500 font-mono mb-1.5 block">Date</label>
            <input
              type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)}
              className={classNames('w-full rounded-xl border border-ink-border bg-ink-850 px-3 py-2.5 text-sm text-paper-100 outline-none font-mono', accent.border)}
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-paper-500 font-mono mb-1.5 block">
              {incoming ? 'Received via' : 'Paid via'}
            </label>
            <select
              value={method} onChange={(e) => setMethod(e.target.value)}
              className={classNames('w-full rounded-xl border border-ink-border bg-ink-850 px-3 py-2.5 text-sm text-paper-100 outline-none', accent.border)}
            >
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        {/* Note */}
        <div>
          <label className="text-[11px] uppercase tracking-wide text-paper-500 font-mono mb-1.5 block">Note (optional)</label>
          <input
            type="text" maxLength={80} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={incoming ? 'e.g. Paid me back for the tickets' : 'e.g. Lent for his laptop repair'}
            className={classNames('w-full rounded-xl border border-ink-border bg-ink-850 px-3 py-2.5 text-sm text-paper-100 outline-none placeholder:text-paper-500', accent.border)}
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !person}
          className={classNames(
            'w-full flex items-center justify-center gap-2 rounded-xl disabled:opacity-60 text-ink-950 font-display font-semibold text-sm py-3 transition-colors',
            accent.btn
          )}
        >
          <Check size={16} strokeWidth={2.6} />
          {submitting ? 'Saving…' : modal.mode === 'add' ? 'Log entry' : 'Save changes'}
        </button>

        {/* What this entry will do to the running balance, in words. */}
        {person && parseFloat(amount) > 0 && (
          <div className="flex items-start gap-2 text-[11px] text-paper-500 leading-relaxed">
            <Scale size={12} className="mt-0.5 shrink-0" />
            <span>
              {incoming
                ? `Reduces what you owe ${person.name} — or, if you were owed, increases it back toward settled.`
                : `Increases what ${person.name} owes you — or pays down what you owed them.`}
            </span>
          </div>
        )}
      </form>
    </Modal>
  );
}

function DirectionButton({ active, onClick, icon: Icon, label, hint, activeClass }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        'flex flex-col items-center gap-0.5 rounded-xl border py-2.5 transition-colors',
        active ? activeClass : 'border-transparent text-paper-500 hover:text-paper-300'
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-display font-medium">
        <Icon size={14} /> {label}
      </span>
      <span className="text-[9.5px] font-mono uppercase tracking-wide opacity-80">{hint}</span>
    </button>
  );
}
