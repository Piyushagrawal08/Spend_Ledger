'use client';

import { useState } from 'react';
import { Download, Trash2, ShieldCheck, Wallet2, LogOut, UserCircle, RotateCcw, CalendarClock, Archive, ChevronRight, Landmark } from 'lucide-react';
import Panel from '@/components/ui/Panel';
import {
  formatINR, getCategory, clampCycleResetDay, cycleEndDate, daysLeftInCycle,
  formatDateNice, currentCycleKey, cycleRangeLabel, DEFAULT_CYCLE_RESET_DAY,
  isCredit, signedAmount, getCreditSource, classNames, netFlow,
} from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';

export default function SettingsView({ store, goTo }) {
  const { settings, updateSettings, categories, creditSources, transactions, userEmail, clearAllData, signOut } = store;
  const toast = useToast();
  const [income, setIncome] = useState(settings.monthlyIncome || '');
  const [opening, setOpening] = useState(settings.openingBalance || '');
  const [resetDay, setResetDay] = useState(settings.cycleResetDay ?? DEFAULT_CYCLE_RESET_DAY);
  const [saving, setSaving] = useState(false);
  const [savingCycle, setSavingCycle] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [savingRollover, setSavingRollover] = useState(false);
  const [savingOpening, setSavingOpening] = useState(false);

  async function handleToggleRollover() {
    const next = !settings.carryForward;
    setSavingRollover(true);
    try {
      await updateSettings({ carryForward: next });
      toast(next ? 'Rollover on' : 'Rollover off', 'success');
    } catch {
      toast('Could not change that setting', 'warning');
    } finally {
      setSavingRollover(false);
    }
  }

  function exportJSON() {
    const data = { categories, creditSources, transactions, exportedAt: new Date().toISOString() };
    downloadBlob(JSON.stringify(data, null, 2), `spendledger-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
    toast('Backup exported', 'success');
  }

  function exportCSV() {
    // `Signed amount` sums straight down the column in a spreadsheet: money out
    // is positive, money in negative. `Amount` stays positive on both sides so
    // the rows read the way the app shows them.
    const header = ['Date', 'Type', 'Category', 'Source', 'Amount', 'Signed amount', 'Payment Method', 'Note'];
    const rows = transactions.map((t) => {
      const cat = t.categoryId ? getCategory(categories, t.categoryId) : null;
      return [
        t.date,
        isCredit(t) ? 'Credit' : 'Debit',
        cat ? cat.name : '',
        isCredit(t) ? getCreditSource(creditSources, t).name : '',
        t.amount,
        signedAmount(t),
        t.method || '',
        (t.note || '').replace(/,/g, ';'),
      ];
    });
    const csv = [header, ...rows].map((r) => r.join(',')).join('\n');
    downloadBlob(csv, `spendledger-transactions-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
    toast('CSV exported', 'success');
  }

  function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSaveIncome() {
    setSaving(true);
    try {
      await updateSettings({ monthlyIncome: Number(income) || 0 });
      toast('Saved', 'success');
    } catch {
      toast('Could not save', 'warning');
    } finally {
      setSaving(false);
    }
  }

  // Previews off the *typed* value, not the saved one, so the consequence of a
  // number is visible before committing it.
  const ledgerNet = netFlow(transactions);
  const balancePreview = (Number(opening) || 0) + ledgerNet;

  async function handleSaveOpening() {
    setSavingOpening(true);
    try {
      await updateSettings({ openingBalance: Number(opening) || 0 });
      toast('Opening balance saved', 'success');
    } catch {
      toast('Could not save opening balance', 'warning');
    } finally {
      setSavingOpening(false);
    }
  }

  async function handleSaveResetDay() {
    setSavingCycle(true);
    try {
      await updateSettings({ cycleResetDay: clampCycleResetDay(resetDay) });
      toast('Reset day updated', 'success');
    } catch {
      toast('Could not save reset day', 'warning');
    } finally {
      setSavingCycle(false);
    }
  }

  async function handleClear() {
    if (!confirm('This will permanently delete all your transactions and budgets (categories stay). Continue?')) return;
    setClearing(true);
    try {
      await clearAllData();
      toast('Transactions and budgets cleared', 'info');
    } catch {
      toast('Could not clear data', 'warning');
    } finally {
      setClearing(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
  }

  return (
    <div className="space-y-5 animate-rise max-w-2xl">
      <div>
        <div className="text-[10px] uppercase tracking-[0.16em] text-paper-500 font-mono mb-1">preferences</div>
        <h1 className="font-display text-2xl font-semibold text-paper-100">Settings</h1>
      </div>

      <Panel title="Account" eyebrow="signed in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-signal-amber/15 flex items-center justify-center">
              <UserCircle size={18} className="text-signal-amber" />
            </span>
            <div>
              <div className="text-sm text-paper-100 font-medium">{userEmail || 'your account'}</div>
              <div className="text-[11px] text-paper-500 font-mono">data is private to this account</div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex items-center gap-1.5 rounded-xl border border-ink-border bg-ink-850 hover:bg-ink-700 px-3.5 py-2 text-xs text-paper-100 transition-colors disabled:opacity-60"
          >
            <LogOut size={13} /> {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </Panel>

      <Panel title="Monthly income" eyebrow="optional, for reference">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-1.5 rounded-xl border border-ink-border bg-ink-850 px-3 py-2.5">
            <Wallet2 size={14} className="text-paper-500" />
            <span className="text-paper-500 font-mono text-sm">₹</span>
            <input
              type="number" min="0" value={income}
              onChange={(e) => setIncome(e.target.value)}
              className="w-full bg-transparent outline-none text-sm font-mono text-paper-100"
            />
          </div>
          <button
            onClick={handleSaveIncome}
            disabled={saving}
            className="rounded-xl bg-signal-amber hover:bg-amber-400 disabled:opacity-60 text-ink-950 font-display font-semibold text-sm px-4 py-2.5"
          >
            Save
          </button>
        </div>
        {settings.monthlyIncome > 0 && (
          <p className="text-[11px] text-paper-500 mt-2 font-mono">Currently set to {formatINR(settings.monthlyIncome)}</p>
        )}
      </Panel>

      <Panel title="Opening balance" eyebrow="what the running balance counts from">
        <p className="text-xs text-paper-300 leading-relaxed mb-3">
          The cash you held <span className="text-paper-100">before</span> your oldest entry. Every
          other figure in this app is relative — what you spent, what is left of an allocation —
          and none of them know how much money actually exists. This is the anchor that turns them
          into a real balance, shown as the carry-forward strip at the top of the overview.
        </p>
        <p className="text-xs text-paper-300 leading-relaxed mb-3">
          Leave it at zero and the balance still works, it just reads as{' '}
          <span className="text-paper-100">net since you started tracking</span> rather than money
          in the bank. Changing it never touches a single entry: the balance is worked out fresh
          from your ledger every time it is shown, so nothing is stored and nothing is rewritten.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-1.5 rounded-xl border border-ink-border bg-ink-850 px-3 py-2.5">
            <Landmark size={14} className="text-paper-500" />
            <span className="text-paper-500 font-mono text-sm">₹</span>
            <input
              type="number" value={opening}
              onChange={(e) => setOpening(e.target.value)}
              placeholder="0"
              className="w-full bg-transparent outline-none text-sm font-mono text-paper-100"
            />
          </div>
          <button
            onClick={handleSaveOpening}
            disabled={savingOpening || (Number(opening) || 0) === (settings.openingBalance || 0)}
            className="rounded-xl bg-signal-amber hover:bg-amber-400 disabled:opacity-40 text-ink-950 font-display font-semibold text-sm px-4 py-2.5"
          >
            {savingOpening ? 'Saving…' : 'Save'}
          </button>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-ink-border bg-ink-850/60 px-3 py-2.5">
          <Landmark size={14} className="text-signal-green mt-0.5 shrink-0" />
          <p className="text-[11px] font-mono text-paper-500 leading-relaxed">
            With this figure your balance across the whole ledger reads{' '}
            <span className={balancePreview < 0 ? 'text-signal-red' : 'text-signal-green'}>
              {formatINR(balancePreview)}
            </span>{' '}
            — {formatINR(Number(opening) || 0)} to start, {formatINR(ledgerNet)} net from{' '}
            {transactions.length} entr{transactions.length === 1 ? 'y' : 'ies'} since.
          </p>
        </div>
      </Panel>

      <Panel title="Transaction reset day" eyebrow="when the spend cycle rolls over">
        <p className="text-xs text-paper-300 leading-relaxed mb-3">
          This is the day your ledger rolls over. A cycle starts on this day and runs until the same
          day of the next month — so it is <span className="text-paper-100">not</span> a calendar
          month. Every figure in the app follows it: total spent, budget left, daily average,
          avg left/day, projected at reset, and the comparison against the last cycle.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-xl border border-ink-border bg-ink-850 px-3 py-2.5">
            <RotateCcw size={14} className="text-paper-500 shrink-0" />
            <select
              value={resetDay}
              onChange={(e) => setResetDay(Number(e.target.value))}
              className="w-full bg-transparent outline-none text-sm text-paper-100 font-mono"
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {ordinal(d)} of the month
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleSaveResetDay}
            disabled={savingCycle || clampCycleResetDay(resetDay) === settings.cycleResetDay}
            className="rounded-xl bg-signal-amber hover:bg-amber-400 disabled:opacity-40 text-ink-950 font-display font-semibold text-sm px-4 py-2.5"
          >
            {savingCycle ? 'Saving…' : 'Save'}
          </button>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-ink-border bg-ink-850/60 px-3 py-2.5">
          <CalendarClock size={14} className="text-signal-blue mt-0.5 shrink-0" />
          <p className="text-[11px] font-mono text-paper-500 leading-relaxed">
            With this setting the current cycle runs{' '}
            <span className="text-paper-100">
              {cycleRangeLabel(currentCycleKey(clampCycleResetDay(resetDay)), clampCycleResetDay(resetDay))}
            </span>{' '}
            and resets on{' '}
            <span className="text-paper-100">
              {formatDateNice(cycleEndDate(currentCycleKey(clampCycleResetDay(resetDay)), clampCycleResetDay(resetDay)))}
            </span>{' '}
            — {daysLeftInCycle(currentCycleKey(clampCycleResetDay(resetDay)), clampCycleResetDay(resetDay))} day(s) from today.
          </p>
        </div>
      </Panel>

      <Panel title="Roll unspent money over" eyebrow="last cycle's balance lands in the next one">
        <p className="text-xs text-paper-300 leading-relaxed mb-3">
          With this on, whatever is left of a cycle&apos;s budget moves into the next one, like a running
          account balance. Budget <span className="text-paper-100">{formatINR(26000)}</span>, spend{' '}
          <span className="text-paper-100">{formatINR(21000)}</span>, and the next cycle is{' '}
          <span className="text-signal-green">{formatINR(31000)}</span>. Overspend and the deficit
          moves too — spend <span className="text-paper-100">{formatINR(29000)}</span> and the next
          cycle is <span className="text-signal-red">{formatINR(23000)}</span>.
        </p>
        <p className="text-xs text-paper-300 leading-relaxed mb-3">
          It applies to the total cycle budget and to each category separately, and it only ever
          starts from the first cycle you actually set a budget for. This changes nothing on disk:
          your saved budgets keep their own numbers and turning this back off restores every figure
          exactly as it was.
        </p>
        <button
          onClick={handleToggleRollover}
          disabled={savingRollover}
          className={classNames(
            'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 w-full text-left transition-colors disabled:opacity-40',
            settings.carryForward
              ? 'border-signal-green/40 bg-signal-green/10'
              : 'border-ink-border bg-ink-850'
          )}
        >
          <span
            className={classNames(
              'relative h-5 w-9 rounded-full transition-colors shrink-0',
              settings.carryForward ? 'bg-signal-green' : 'bg-ink-600'
            )}
          >
            <span
              className={classNames(
                'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all',
                settings.carryForward ? 'left-[18px]' : 'left-0.5'
              )}
            />
          </span>
          <span className="min-w-0">
            <span className="block text-sm text-paper-100 font-medium">
              {settings.carryForward ? 'Rollover is on' : 'Rollover is off'}
            </span>
            <span className="block text-[11px] font-mono text-paper-500 mt-0.5">
              {settings.carryForward
                ? 'budgets show as “set + rolled over”'
                : 'each cycle starts at exactly the budget you set'}
            </span>
          </span>
        </button>
      </Panel>

      <Panel title="Backups" eyebrow="frozen, read-only copies of your ledger">
        <button
          onClick={() => goTo?.('backups')}
          className="w-full flex items-center gap-2.5 rounded-xl border border-ink-border bg-ink-850 hover:bg-ink-700 px-4 py-3 text-left transition-colors"
        >
          <span className="w-8 h-8 rounded-lg bg-signal-blue/12 flex items-center justify-center shrink-0">
            <Archive size={15} className="text-signal-blue" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-paper-100">
              {store.snapshots?.length
                ? `${store.snapshots.length} snapshot(s) archived`
                : 'Take your first snapshot'}
            </span>
            <span className="block text-[11px] font-mono text-paper-500 mt-0.5">
              append-only · viewing never changes live data
            </span>
          </span>
          <ChevronRight size={15} className="text-paper-500 shrink-0" />
        </button>
      </Panel>

      <Panel title="Export" eyebrow="download a copy of your data">
        <div className="grid sm:grid-cols-2 gap-2.5">
          <button onClick={exportJSON} className="flex items-center gap-2 rounded-xl border border-ink-border bg-ink-850 hover:bg-ink-700 px-4 py-3 text-sm text-paper-100 transition-colors">
            <Download size={15} className="text-signal-blue" /> Export full backup (.json)
          </button>
          <button onClick={exportCSV} className="flex items-center gap-2 rounded-xl border border-ink-border bg-ink-850 hover:bg-ink-700 px-4 py-3 text-sm text-paper-100 transition-colors">
            <Download size={15} className="text-signal-green" /> Export transactions (.csv)
          </button>
        </div>
      </Panel>

      <Panel title="Danger zone" eyebrow="irreversible">
        <button
          onClick={handleClear}
          disabled={clearing}
          className="flex items-center gap-2 rounded-xl border border-signal-red/30 bg-signal-red/10 hover:bg-signal-red/20 disabled:opacity-60 px-4 py-3 text-sm text-signal-red transition-colors"
        >
          <Trash2 size={15} /> {clearing ? 'Clearing…' : 'Erase all transactions & budgets'}
        </button>
      </Panel>

      <Panel>
        <div className="flex items-start gap-2.5 text-xs text-paper-500 leading-relaxed">
          <ShieldCheck size={15} className="text-signal-green mt-0.5 shrink-0" />
          <p>
            Your data lives in your own account, protected by row-level security — no one else can see or touch it.
            Sign in from any device with the same email to pick up right where you left off.
          </p>
        </div>
      </Panel>
    </div>
  );
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
