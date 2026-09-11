'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, ArrowUpRight, ArrowDownLeft, Undo2 } from 'lucide-react';
import Panel from '@/components/ui/Panel';
import CategoryModal from '@/components/CategoryModal';
import { CategoryIcon } from '@/lib/icons';
import { formatINR, classNames, isCredit, isDebit } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';

const TABS = [
  { id: 'debit',  label: 'Spend categories', hint: 'money out', icon: ArrowUpRight },
  { id: 'credit', label: 'Credit sources',   hint: 'money in',  icon: ArrowDownLeft },
];

export default function Categories({ store }) {
  const {
    categories, transactions,
    addCategory, updateCategory, deleteCategory,
    creditSources, addCreditSource, updateCreditSource, deleteCreditSource,
  } = store;
  const toast = useToast();
  const [tab, setTab] = useState('debit');
  const [modal, setModal] = useState(null); // { mode: 'add' | 'edit', cat }

  const isSource = tab === 'credit';
  const rows = isSource ? creditSources : categories;

  // A category is used by any entry pointing at it (a spend, or a refund handed
  // back to it). A source is used by the credits linked to it.
  function countUses(id) {
    return isSource
      ? transactions.filter((t) => isCredit(t) && t.sourceId === id).length
      : transactions.filter((t) => t.categoryId === id).length;
  }

  async function handleDelete(row) {
    const uses = countUses(row.id);
    const msg = uses > 0
      ? isSource
        ? `${row.name} is on ${uses} credit(s). They keep their amount and their "${row.name}" label, but stop being linked to this source. Continue?`
        : `${row.name} has ${uses} logged transaction(s). They'll become "Uncategorized". Continue?`
      : `Delete ${isSource ? 'credit source' : 'category'} "${row.name}"?`;
    if (!confirm(msg)) return;
    try {
      await (isSource ? deleteCreditSource(row.id) : deleteCategory(row.id));
      toast(isSource ? 'Credit source deleted' : 'Category deleted', 'info');
    } catch {
      toast('Could not delete that', 'warning');
    }
  }

  async function handleSubmit(data) {
    try {
      if (modal.mode === 'add') {
        await (isSource ? addCreditSource(data) : addCategory(data));
        toast(isSource ? 'Credit source created' : 'Category created', 'success');
      } else {
        await (isSource ? updateCreditSource(modal.cat.id, data) : updateCategory(modal.cat.id, data));
        toast('Saved', 'success');
      }
      setModal(null);
    } catch (err) {
      toast(
        /credit_sources/.test(err?.message || '')
          ? 'Run supabase/migrations/003_credit_sources.sql first'
          : 'Could not save that',
        'warning'
      );
    }
  }

  return (
    <div className="space-y-5 animate-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-paper-500 font-mono mb-1">taxonomy</div>
          <h1 className="font-display text-2xl font-semibold text-paper-100">Categories &amp; sources</h1>
        </div>
        <button
          onClick={() => setModal({ mode: 'add' })}
          className={classNames(
            'flex items-center gap-1.5 rounded-xl text-ink-950 font-display font-semibold text-sm px-4 py-2.5 transition-colors',
            isSource ? 'bg-signal-green hover:bg-emerald-400' : 'bg-signal-amber hover:bg-amber-400'
          )}
        >
          <Plus size={15} strokeWidth={2.6} /> {isSource ? 'New credit source' : 'New category'}
        </button>
      </div>

      {/* Both sides of the ledger get the same management screen. */}
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-ink-border bg-ink-850 p-1 max-w-md">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={classNames(
                'flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-display font-medium transition-colors',
                active
                  ? t.id === 'credit'
                    ? 'bg-signal-green/12 text-signal-green'
                    : 'bg-signal-amber/12 text-signal-amber'
                  : 'text-paper-500 hover:text-paper-300'
              )}
            >
              <Icon size={13} />
              {t.label}
              <span className="hidden sm:inline font-mono text-[9.5px] uppercase tracking-wide opacity-70">
                {t.hint}
              </span>
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <Panel>
          <div className="py-10 text-center text-xs font-mono text-paper-500">
            {isSource
              ? 'No credit sources yet — run migration 003, or add one above.'
              : 'No categories yet — add one above.'}
          </div>
        </Panel>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((c) => (
            <Panel key={c.id} noPad>
              <div className="p-4 flex items-start gap-3">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${c.color}22` }}>
                  <CategoryIcon name={c.icon} size={16} style={{ color: c.color }} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-paper-100 font-medium truncate">{c.name}</div>
                  <div className="text-[11px] font-mono text-paper-500 mt-0.5 flex items-center gap-1 truncate">
                    {isSource ? (
                      c.offsetsSpend ? (
                        <><Undo2 size={10} className="text-signal-green shrink-0" /> usually a refund</>
                      ) : (
                        <>income</>
                      )
                    ) : (
                      <>default {formatINR(c.defaultBudget || 0)}</>
                    )}
                  </div>
                  <div className="text-[10px] font-mono text-paper-600 mt-0.5">
                    {countUses(c.id)} entr{countUses(c.id) === 1 ? 'y' : 'ies'}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setModal({ mode: 'edit', cat: c })}
                    className={classNames('p-1.5 text-paper-500', isSource ? 'hover:text-signal-green' : 'hover:text-signal-amber')}
                    aria-label={`Edit ${c.name}`}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(c)}
                    className="p-1.5 text-paper-500 hover:text-signal-red"
                    aria-label={`Delete ${c.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <CategoryModal
        // Remount on tab change so the form never carries the other taxonomy's
        // half-filled state across.
        key={tab}
        variant={isSource ? 'source' : 'category'}
        modal={modal}
        onClose={() => setModal(null)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
