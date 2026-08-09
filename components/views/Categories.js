'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import Panel from '@/components/ui/Panel';
import CategoryModal from '@/components/CategoryModal';
import { CategoryIcon } from '@/lib/icons';
import { formatINR } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';

export default function Categories({ store }) {
  const { categories, transactions, addCategory, updateCategory, deleteCategory } = store;
  const toast = useToast();
  const [modal, setModal] = useState(null); // { mode: 'add' | 'edit', cat }

  function countUses(catId) {
    return transactions.filter((t) => t.categoryId === catId).length;
  }

  async function handleDelete(cat) {
    const uses = countUses(cat.id);
    if (uses > 0 && !confirm(`${cat.name} has ${uses} logged transaction(s). They'll become "Uncategorized". Continue?`)) return;
    if (uses === 0 && !confirm(`Delete category "${cat.name}"?`)) return;
    try {
      await deleteCategory(cat.id);
      toast('Category deleted', 'info');
    } catch {
      toast('Could not delete that category', 'warning');
    }
  }

  return (
    <div className="space-y-5 animate-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-paper-500 font-mono mb-1">taxonomy</div>
          <h1 className="font-display text-2xl font-semibold text-paper-100">Categories</h1>
        </div>
        <button
          onClick={() => setModal({ mode: 'add' })}
          className="flex items-center gap-1.5 rounded-xl bg-signal-amber hover:bg-amber-400 text-ink-950 font-display font-semibold text-sm px-4 py-2.5 transition-colors"
        >
          <Plus size={15} strokeWidth={2.6} /> New category
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {categories.map((c) => (
          <Panel key={c.id} noPad>
            <div className="p-4 flex items-start gap-3">
              <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${c.color}22` }}>
                <CategoryIcon name={c.icon} size={16} style={{ color: c.color }} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-paper-100 font-medium truncate">{c.name}</div>
                <div className="text-[11px] font-mono text-paper-500 mt-0.5">
                  default {formatINR(c.defaultBudget || 0)}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setModal({ mode: 'edit', cat: c })} className="p-1.5 text-paper-500 hover:text-signal-amber">
                  <Pencil size={13} />
                </button>
                <button onClick={() => handleDelete(c)} className="p-1.5 text-paper-500 hover:text-signal-red">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </Panel>
        ))}
      </div>

      <CategoryModal
        modal={modal}
        onClose={() => setModal(null)}
        onSubmit={async (data) => {
          try {
            if (modal.mode === 'add') {
              await addCategory(data);
              toast('Category created', 'success');
            } else {
              await updateCategory(modal.cat.id, data);
              toast('Category updated', 'success');
            }
            setModal(null);
          } catch {
            toast('Could not save that category', 'warning');
          }
        }}
      />
    </div>
  );
}
