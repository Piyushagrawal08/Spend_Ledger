'use client';

import { useMemo, useState } from 'react';
import {
  Archive, ArchiveRestore, Download, Trash2, Eye, ArrowLeft, Lock,
  ShieldCheck, Camera, Terminal, HardDriveDownload, Inbox,
} from 'lucide-react';
import Panel from '@/components/ui/Panel';
import { CategoryIcon } from '@/lib/icons';
import { useToast } from '@/components/ui/Toast';
import {
  formatINR, formatCompactINR, formatDateNice, sum, groupBy, classNames,
} from '@/lib/utils';

const UNCAT = { id: '__uncategorized__', name: 'Uncategorized', color: '#8A93A6', icon: 'MoreHorizontal' };

export default function Backups({ store }) {
  const { snapshots, createSnapshot, getSnapshot, deleteSnapshot, transactions } = store;
  const toast = useToast();
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [opening, setOpening] = useState(null);
  const [viewing, setViewing] = useState(null); // { ...meta, payload }

  async function handleCreate() {
    setCreating(true);
    try {
      const row = await createSnapshot(label);
      setLabel('');
      toast(`Snapshot saved — ${row.txCount} entries frozen`, 'success');
    } catch (e) {
      toast(
        /ledger_snapshots/.test(e?.message || '')
          ? 'Run the snapshots migration in supabase/schema.sql first'
          : 'Could not create snapshot',
        'warning'
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleView(meta) {
    setOpening(meta.id);
    try {
      setViewing(await getSnapshot(meta.id));
    } catch {
      toast('Could not open that snapshot', 'warning');
    } finally {
      setOpening(null);
    }
  }

  async function handleDownload(meta, kind) {
    try {
      const snap = viewing?.id === meta.id ? viewing : await getSnapshot(meta.id);
      const stamp = meta.createdAt.slice(0, 10);
      if (kind === 'json') {
        downloadBlob(
          JSON.stringify(snap.payload, null, 2),
          `spendledger-snapshot-${stamp}.json`,
          'application/json'
        );
      } else {
        downloadBlob(toCSV(snap.payload), `spendledger-snapshot-${stamp}.csv`, 'text/csv');
      }
      toast('Snapshot downloaded', 'success');
    } catch {
      toast('Could not download that snapshot', 'warning');
    }
  }

  async function handleDelete(meta) {
    if (!confirm('Delete this backup? Your live ledger is not affected — only the archived copy is removed.')) return;
    try {
      await deleteSnapshot(meta.id);
      if (viewing?.id === meta.id) setViewing(null);
      toast('Backup deleted', 'info');
    } catch {
      toast('Could not delete that backup', 'warning');
    }
  }

  if (viewing) {
    return <SnapshotViewer snapshot={viewing} onBack={() => setViewing(null)} onDownload={handleDownload} />;
  }

  return (
    <div className="space-y-5 animate-rise max-w-3xl">
      <div>
        <div className="text-[10px] uppercase tracking-[0.16em] text-paper-500 font-mono mb-1">safety net</div>
        <h1 className="font-display text-2xl font-semibold text-paper-100">Backups</h1>
      </div>

      <Panel>
        <div className="flex items-start gap-2.5 text-xs text-paper-300 leading-relaxed">
          <Lock size={15} className="text-signal-green mt-0.5 shrink-0" />
          <p>
            A snapshot freezes your whole ledger — every entry, budget and category name exactly as it
            stands today. Snapshots are <span className="text-paper-100">append-only</span>: the database
            rejects any attempt to rewrite one, so nothing you do later in the app can change what a
            snapshot holds. Opening one shows a strictly read-only view.
          </p>
        </div>
      </Panel>

      <Panel title="Take a snapshot" eyebrow={`${transactions.length} live entries right now`}>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional) — e.g. before cleanup"
            maxLength={80}
            className="flex-1 rounded-xl border border-ink-border bg-ink-850 px-3 py-2.5 text-sm text-paper-100 placeholder:text-paper-600 outline-none focus:border-signal-amber/60"
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex items-center justify-center gap-2 rounded-xl bg-signal-amber hover:bg-amber-400 disabled:opacity-60 text-ink-950 font-display font-semibold text-sm px-4 py-2.5 transition-colors"
          >
            <Camera size={15} /> {creating ? 'Freezing…' : 'Create snapshot'}
          </button>
        </div>
      </Panel>

      <Panel title="Archived snapshots" eyebrow={snapshots.length ? `${snapshots.length} stored` : 'nothing archived yet'} noPad>
        {snapshots.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-14 text-paper-500">
            <Inbox size={22} />
            <span className="text-xs font-mono">Take your first snapshot above</span>
          </div>
        ) : (
          <div className="divide-y divide-ink-border">
            {snapshots.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <span className="w-9 h-9 rounded-xl bg-signal-blue/12 flex items-center justify-center shrink-0">
                  <Archive size={16} className="text-signal-blue" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-paper-100 truncate flex items-center gap-2">
                    {s.label || formatStamp(s.createdAt)}
                    {s.source === 'script' && (
                      <span className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wide text-paper-500 border border-ink-border rounded px-1.5 py-0.5 shrink-0">
                        <Terminal size={9} /> cli
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-mono text-paper-500 mt-0.5 truncate">
                    {s.label ? `${formatStamp(s.createdAt)} · ` : ''}
                    {s.txCount} entries · {formatINR(s.totalAmount)}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <IconBtn label="View read-only" onClick={() => handleView(s)} busy={opening === s.id}>
                    <Eye size={14} />
                  </IconBtn>
                  <IconBtn label="Download JSON" onClick={() => handleDownload(s, 'json')}>
                    <Download size={14} />
                  </IconBtn>
                  <IconBtn label="Delete backup" danger onClick={() => handleDelete(s)}>
                    <Trash2 size={14} />
                  </IconBtn>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Backup to your project folder" eyebrow="npm run backup">
        <div className="flex items-start gap-2.5 text-xs text-paper-300 leading-relaxed">
          <HardDriveDownload size={15} className="text-signal-violet mt-0.5 shrink-0" />
          <div className="space-y-2 min-w-0">
            <p>
              Run <code className="font-mono text-paper-100 bg-ink-850 rounded px-1.5 py-0.5">npm run backup</code>{' '}
              in the project to write a timestamped copy into the{' '}
              <code className="font-mono text-paper-100 bg-ink-850 rounded px-1.5 py-0.5">backups/</code> folder
              and store the same snapshot here. Those files are gitignored, so your spend records never
              reach the public repository.
            </p>
            <p className="text-paper-500 font-mono text-[11px]">see backups/README.md for setup</p>
          </div>
        </div>
      </Panel>
    </div>
  );
}

/** Renders a frozen payload. Holds no mutation path of any kind. */
function SnapshotViewer({ snapshot, onBack, onDownload }) {
  const { payload } = snapshot;
  const txs = useMemo(
    () => [...(payload.transactions || [])].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [payload.transactions]
  );
  const cats = payload.categories || [];
  const total = sum(txs, (t) => t.amount);

  const catOf = (id) => cats.find((c) => c.id === id) || UNCAT;

  const byCategory = useMemo(() => {
    const grouped = groupBy(txs, (t) => t.categoryId || UNCAT.id);
    return Object.entries(grouped)
      .map(([id, items]) => ({ ...catOf(id === UNCAT.id ? null : id), spent: sum(items, (t) => t.amount) }))
      .sort((a, b) => b.spent - a.spent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs, cats]);

  const grouped = useMemo(() => {
    const g = groupBy(txs, (t) => t.date);
    return Object.entries(g).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [txs]);

  const span = txs.length ? `${txs[txs.length - 1].date} → ${txs[0].date}` : '—';

  return (
    <div className="space-y-5 animate-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-[11px] font-mono text-signal-amber hover:text-amber-300 mb-1.5"
          >
            <ArrowLeft size={12} /> back to backups
          </button>
          <h1 className="font-display text-2xl font-semibold text-paper-100 truncate">
            {snapshot.label || 'Archived ledger'}
          </h1>
        </div>
        <button
          onClick={() => onDownload(snapshot, 'csv')}
          className="flex items-center gap-1.5 rounded-xl border border-ink-border bg-ink-850 hover:bg-ink-700 px-3.5 py-2 text-xs text-paper-100 transition-colors"
        >
          <Download size={13} className="text-signal-green" /> Export CSV
        </button>
      </div>

      {/* The whole point of this screen: it cannot write anything back. */}
      <div className="flex items-start gap-2.5 rounded-xl border border-signal-blue/30 bg-signal-blue/8 px-4 py-3">
        <ShieldCheck size={16} className="text-signal-blue mt-0.5 shrink-0" />
        <p className="text-xs text-paper-300 leading-relaxed">
          <span className="text-paper-100 font-medium">Read-only archive</span> — captured{' '}
          {formatStamp(snapshot.createdAt)}. This is a frozen copy: there is nothing to edit here, and
          viewing it cannot touch your live ledger. Your current entries carry on unchanged.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={Archive} label="Entries" value={String(txs.length)} accent="blue" />
        <Stat icon={ArchiveRestore} label="Total spend" value={formatINR(total)} accent="amber" />
        <Stat icon={Camera} label="Categories" value={String(cats.length)} accent="violet" />
        <Stat icon={Lock} label="Date range" value={span} accent="green" mono />
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        <Panel title="Category split" eyebrow="as archived" className="lg:col-span-2">
          {byCategory.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-xs font-mono text-paper-500">
              No entries in this snapshot
            </div>
          ) : (
            <div className="space-y-2">
              {byCategory.map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-xs">
                  <span className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${c.color}22` }}>
                    <CategoryIcon name={c.icon} size={12} style={{ color: c.color }} />
                  </span>
                  <span className="text-paper-300 truncate flex-1">{c.name}</span>
                  <span className="text-paper-100 font-mono">{formatCompactINR(c.spent)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Archived entries" eyebrow="newest first" className="lg:col-span-3" noPad>
          {grouped.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-xs font-mono text-paper-500">
              Nothing was logged when this snapshot was taken
            </div>
          ) : (
            <div className="divide-y divide-ink-border max-h-[520px] overflow-y-auto">
              {grouped.map(([date, items]) => (
                <div key={date} className="px-5 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono text-paper-500">{formatDateNice(date)}</span>
                    <span className="text-[11px] font-mono text-paper-500">{formatINR(sum(items, (t) => t.amount))}</span>
                  </div>
                  <div className="space-y-2">
                    {items.map((t, i) => {
                      const cat = catOf(t.categoryId);
                      return (
                        <div key={t.id || `${date}-${i}`} className="flex items-center gap-2.5 text-sm">
                          <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${cat.color}22` }}>
                            <CategoryIcon name={cat.icon} size={13} style={{ color: cat.color }} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-paper-100 truncate text-[13px]">{t.note || cat.name}</div>
                            <div className="text-paper-500 text-[10px] font-mono">{cat.name} · {t.method || '—'}</div>
                          </div>
                          <span className="font-mono text-paper-100 text-[13px]">{formatINR(t.amount)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, accent, mono }) {
  const colors = {
    amber: 'text-signal-amber',
    green: 'text-signal-green',
    blue: 'text-signal-blue',
    violet: 'text-signal-violet',
  };
  return (
    <Panel noPad>
      <div className="p-4">
        <div className="flex items-center justify-between mb-2.5 gap-1">
          <span className="text-[10px] uppercase tracking-wide text-paper-500 font-mono truncate">{label}</span>
          <Icon size={14} className={`${colors[accent]} shrink-0`} />
        </div>
        <div className={classNames('font-semibold text-paper-100 truncate', mono ? 'font-mono text-[11px]' : 'font-display text-lg')}>
          {value}
        </div>
      </div>
    </Panel>
  );
}

function IconBtn({ children, label, onClick, danger, busy }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={label}
      className={classNames(
        'p-2 rounded-lg border border-ink-border transition-colors disabled:opacity-50',
        danger
          ? 'text-paper-500 hover:text-signal-red hover:border-signal-red/40'
          : 'text-paper-500 hover:text-signal-amber hover:border-signal-amber/40'
      )}
    >
      {children}
    </button>
  );
}

function formatStamp(iso) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function toCSV(payload) {
  const cats = payload.categories || [];
  const header = ['Date', 'Category', 'Amount', 'Payment Method', 'Note'];
  const rows = (payload.transactions || []).map((t) => {
    const cat = cats.find((c) => c.id === t.categoryId) || UNCAT;
    return [t.date, cat.name, t.amount, t.method || '', (t.note || '').replace(/,/g, ';')];
  });
  return [header, ...rows].map((r) => r.join(',')).join('\n');
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
