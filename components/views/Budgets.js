'use client';

import { useMemo, useState } from 'react';
import { Save, TrendingUp, TrendingDown, Plus, Trash2, Wallet } from 'lucide-react';
import Panel from '@/components/ui/Panel';
import Gauge from '@/components/ui/Gauge';
import MonthSwitcher from '@/components/ui/MonthSwitcher';
import CategoryModal from '@/components/CategoryModal';
import { CategoryIcon } from '@/lib/icons';
import {
  formatINR, groupBy, sum, classNames, filterCycle, cycleRangeLabel,
  monthShortLabel, monthLabel, DEFAULT_CYCLE_RESET_DAY,
} from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';

export default function Budgets({ store, monthKey, setMonthKey }) {
  const {
    categories, transactions, budgetFor, budgetOriginFor, setBudget, addCategory,
    deleteCategory, monthlyTotalOriginFor, setMonthlyTotal, settings,
  } = store;
  const toast = useToast();
  const [drafts, setDrafts] = useState({});
  const [modal, setModal] = useState(null);
  const [totalDraft, setTotalDraft] = useState('');
  const resetDay = settings?.cycleResetDay ?? DEFAULT_CYCLE_RESET_DAY;
  const monthTx = useMemo(
    () => filterCycle(transactions, monthKey, resetDay),
    [transactions, monthKey, resetDay]
  );
  const spentByCategory = useMemo(() => {
    const g = groupBy(monthTx, (t) => t.categoryId);
    const map = {};
    categories.forEach((c) => { map[c.id] = sum(g[c.id] || [], (t) => t.amount); });
    return map;
  }, [monthTx, categories]);

  const allocated = sum(categories, (c) => budgetFor(monthKey, c.id));
  const totalSpent = sum(categories, (c) => spentByCategory[c.id] || 0);
  const totalOrigin = monthlyTotalOriginFor(monthKey);
  const monthlyTotal = totalOrigin.amount !== null ? totalOrigin.amount : allocated;
  const unallocated = monthlyTotal - allocated;

  function draftFor(catId) {
    return drafts[catId] !== undefined ? drafts[catId] : budgetFor(monthKey, catId);
  }

  async function handleSaveCategoryBudget(catId) {
    const val = Number(drafts[catId]);
    if (isNaN(val) || val < 0) {
      toast('Enter a valid budget amount', 'warning');
      return;
    }
    try {
      await setBudget(monthKey, catId, val);
      setDrafts((d) => { const n = { ...d }; delete n[catId]; return n; });
      toast('Budget updated', 'success');
    } catch {
      toast('Could not save that budget', 'warning');
    }
  }

  async function handleSaveTotal() {
    const val = Number(totalDraft);
    if (isNaN(val) || val < 0) {
      toast('Enter a valid total budget', 'warning');
      return;
    }
    try {
      await setMonthlyTotal(monthKey, val);
      setTotalDraft('');
      toast('Cycle budget saved', 'success');
    } catch {
      toast('Could not save the total budget', 'warning');
    }
  }

  async function handleDeleteCategory(cat) {
    const uses = transactions.filter((t) => t.categoryId === cat.id).length;
    const msg = uses > 0
      ? `${cat.name} has ${uses} logged transaction(s). Deleting it will mark them "Uncategorized" and remove its budget line. Continue?`
      : `Remove "${cat.name}" and its budget line?`;
    if (!confirm(msg)) return;
    try {
      await deleteCategory(cat.id);
      toast('Category removed from budget', 'info');
    } catch {
      toast('Could not delete that category', 'warning');
    }
  }

  async function handleClearAll() {
    if (!confirm('Set every category budget to ₹0 for this cycle? Earlier cycles keep their own numbers — only this cycle onward is affected.')) return;
    try {
      await Promise.all(categories.map((c) => setBudget(monthKey, c.id, 0)));
      toast('All category budgets cleared', 'info');
    } catch {
      toast('Could not clear all budgets', 'warning');
    }
  }

  return (
    <div className="space-y-5 animate-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-paper-500 font-mono mb-1">allocation</div>
          <h1 className="font-display text-2xl font-semibold text-paper-100">Cycle budgets</h1>
          <p className="text-[11px] font-mono text-paper-500 mt-1">
            {monthLabel(monthKey)} · {cycleRangeLabel(monthKey, resetDay)}
          </p>
        </div>
        <MonthSwitcher monthKey={monthKey} onChange={setMonthKey} resetDay={resetDay} />
      </div>

      {/* Total monthly budget */}
      <Panel
        title="Total cycle budget"
        eyebrow="set once — it carries into every later cycle until you change it"
        action={
          <button
            onClick={handleClearAll}
            className="text-[11px] text-signal-red hover:text-red-400 font-mono"
          >
            clear all category budgets
          </button>
        }
      >
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-1.5 rounded-xl border border-ink-border bg-ink-850 px-3 py-2.5">
              <Wallet size={14} className="text-paper-500 shrink-0" />
              <span className="text-paper-500 font-mono text-sm">₹</span>
              <input
                type="number" min="0" step="500"
                placeholder={String(monthlyTotal)}
                value={totalDraft}
                onChange={(e) => setTotalDraft(e.target.value)}
                className="w-full bg-transparent outline-none text-sm font-mono text-paper-100"
              />
            </div>
          </div>
          <button
            onClick={handleSaveTotal}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-signal-amber hover:bg-amber-400 text-ink-950 font-display font-semibold text-sm px-4 py-2.5 transition-colors"
          >
            <Save size={14} /> Save total
          </button>
        </div>

        {totalOrigin.origin === 'carried' && (
          <p className="text-[11px] font-mono text-signal-blue mt-2">
            carried over from {monthShortLabel(totalOrigin.from)} — save a number here to change it from this cycle on
          </p>
        )}

        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-ink-border">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-paper-500 font-mono">Cycle budget</div>
            <div className="font-display text-base font-semibold text-paper-100 mt-1">{formatINR(monthlyTotal)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-paper-500 font-mono">Allocated</div>
            <div className="font-display text-base font-semibold text-paper-100 mt-1">{formatINR(allocated)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-paper-500 font-mono">Unallocated</div>
            <div className={classNames('font-display text-base font-semibold mt-1', unallocated < 0 ? 'text-signal-red' : 'text-signal-green')}>
              {formatINR(unallocated)}
            </div>
          </div>
        </div>
      </Panel>

      <Panel>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-paper-500 font-mono">Total spent so far</div>
            <div className={classNames('font-display text-xl font-semibold mt-1 flex items-center gap-1.5', totalSpent > monthlyTotal && monthlyTotal > 0 ? 'text-signal-red' : 'text-paper-100')}>
              {totalSpent > monthlyTotal && monthlyTotal > 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} className="text-signal-green" />}
              {formatINR(totalSpent)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wide text-paper-500 font-mono">Left of cycle budget</div>
            <div className="font-display text-xl font-semibold text-paper-100 mt-1">{formatINR(Math.max(monthlyTotal - totalSpent, 0))}</div>
          </div>
        </div>
      </Panel>

      {/* Category budget lines */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-paper-100 tracking-wide">Category allocation</h2>
        <button
          onClick={() => setModal({ mode: 'add' })}
          className="flex items-center gap-1.5 rounded-lg bg-signal-amber hover:bg-amber-400 text-ink-950 font-display font-semibold text-xs px-3 py-2 transition-colors"
        >
          <Plus size={13} strokeWidth={2.6} /> Add category budget
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {categories.map((c) => {
          const spent = spentByCategory[c.id] || 0;
          const origin = budgetOriginFor(monthKey, c.id);
          const budget = origin.amount;
          const pct = budget > 0 ? (spent / budget) * 100 : spent > 0 ? 100 : 0;
          const dirty = drafts[c.id] !== undefined && Number(drafts[c.id]) !== budget;
          return (
            <Panel key={c.id} noPad>
              <div className="p-4 flex items-center gap-3">
                <Gauge percent={pct} size={52} stroke={5.5} color={c.color} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm text-paper-100 font-medium truncate">
                    <CategoryIcon name={c.icon} size={14} style={{ color: c.color }} />
                    {c.name}
                  </div>
                  <div className="text-[11px] font-mono text-paper-500 mt-0.5">
                    {formatINR(spent)} spent {budget > 0 && `· ${formatINR(Math.max(budget - spent, 0))} left`}
                  </div>
                  <div className="text-[10px] font-mono mt-0.5 truncate">
                    {origin.origin === 'carried' ? (
                      <span className="text-signal-blue">carried from {monthShortLabel(origin.from)}</span>
                    ) : origin.origin === 'default' ? (
                      <span className="text-paper-600">category default</span>
                    ) : (
                      <span className="text-paper-600">set for this cycle</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteCategory(c)}
                  className="p-1.5 text-paper-500 hover:text-signal-red shrink-0"
                  aria-label={`Remove ${c.name} budget`}
                  title="Remove category"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="px-4 pb-4 flex items-center gap-2">
                <div className="flex-1 flex items-center gap-1.5 rounded-lg border border-ink-border bg-ink-850 px-2.5 py-1.5">
                  <span className="text-paper-500 font-mono text-xs">₹</span>
                  <input
                    type="number" min="0" step="100"
                    value={draftFor(c.id)}
                    onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                    className="w-full bg-transparent outline-none text-xs font-mono text-paper-100"
                  />
                </div>
                <button
                  onClick={() => handleSaveCategoryBudget(c.id)}
                  disabled={!dirty}
                  className={classNames(
                    'p-2 rounded-lg transition-colors',
                    dirty ? 'bg-signal-amber text-ink-950 hover:bg-amber-400' : 'bg-ink-700 text-paper-500 cursor-not-allowed'
                  )}
                  aria-label="Save budget"
                >
                  <Save size={13} />
                </button>
              </div>
              {/* linear progress */}
              <div className="px-4 pb-4">
                <div className="h-1.5 w-full rounded-full bg-ink-700 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(pct, 100)}%`, background: pct > 100 ? '#F2545B' : c.color }}
                  />
                </div>
              </div>
            </Panel>
          );
        })}
      </div>

      <CategoryModal
        modal={modal}
        onClose={() => setModal(null)}
        onSubmit={async (data) => {
          try {
            await addCategory(data);
            toast('Category added to budget', 'success');
            setModal(null);
          } catch {
            toast('Could not add that category', 'warning');
          }
        }}
      />
    </div>
  );
}
