'use client';

import { useState } from 'react';
import { Download, Trash2, ShieldCheck, Wallet2, LogOut, UserCircle } from 'lucide-react';
import Panel from '@/components/ui/Panel';
import { formatINR, getCategory } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';

export default function SettingsView({ store }) {
  const { settings, updateSettings, categories, transactions, userEmail, clearAllData, signOut } = store;
  const toast = useToast();
  const [income, setIncome] = useState(settings.monthlyIncome || '');
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  function exportJSON() {
    const data = { categories, transactions, exportedAt: new Date().toISOString() };
    downloadBlob(JSON.stringify(data, null, 2), `spendledger-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
    toast('Backup exported', 'success');
  }

  function exportCSV() {
    const header = ['Date', 'Category', 'Amount', 'Payment Method', 'Note'];
    const rows = transactions.map((t) => {
      const cat = getCategory(categories, t.categoryId);
      return [t.date, cat.name, t.amount, t.method || '', (t.note || '').replace(/,/g, ';')];
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
