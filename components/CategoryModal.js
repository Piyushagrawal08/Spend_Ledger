'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import { CategoryIcon, ICON_NAMES } from '@/lib/icons';
import { classNames } from '@/lib/utils';

const PALETTE = ['#F2A93B', '#3DDC97', '#5B9DF2', '#F2545B', '#9B8CF2', '#F27CA3', '#4FD1E7', '#7EDB6F', '#E7C24F', '#38BDF8', '#8A93A6', '#FB923C'];

export default function CategoryModal({ modal, onClose, onSubmit }) {
  const cat = modal?.cat;
  const [name, setName] = useState(cat?.name || '');
  const [color, setColor] = useState(cat?.color || PALETTE[0]);
  const [icon, setIcon] = useState(cat?.icon || ICON_NAMES[0]);
  const [budget, setBudget] = useState(cat?.defaultBudget ?? 1000);

  useState(() => {
    setName(cat?.name || '');
    setColor(cat?.color || PALETTE[0]);
    setIcon(cat?.icon || ICON_NAMES[0]);
    setBudget(cat?.defaultBudget ?? 1000);
  }, [modal]);

  if (!modal) return null;

  return (
    <Modal open={!!modal} onClose={onClose} title={modal.mode === 'add' ? 'New category' : 'Edit category'}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onSubmit({ name: name.trim(), color, icon, defaultBudget: Number(budget) || 0 });
        }}
        className="space-y-4"
      >
        <div>
          <label className="text-[11px] uppercase tracking-wide text-paper-500 font-mono mb-1.5 block">Name</label>
          <input
            autoFocus
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Subscriptions"
            className="w-full rounded-xl border border-ink-border bg-ink-850 px-3 py-2.5 text-sm text-paper-100 outline-none focus:border-signal-amber/60"
          />
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wide text-paper-500 font-mono mb-1.5 block">Default monthly budget</label>
          <div className="flex items-center gap-1.5 rounded-xl border border-ink-border bg-ink-850 px-3 py-2.5">
            <span className="text-paper-500 font-mono text-sm">₹</span>
            <input
              type="number" min="0" step="100" value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="w-full bg-transparent outline-none text-sm font-mono text-paper-100"
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wide text-paper-500 font-mono mb-1.5 block">Color</label>
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((p) => (
              <button
                type="button" key={p} onClick={() => setColor(p)}
                className={classNames('w-7 h-7 rounded-full transition-transform', color === p && 'ring-2 ring-offset-2 ring-offset-ink-800 ring-paper-100 scale-105')}
                style={{ background: p }}
                aria-label={p}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wide text-paper-500 font-mono mb-1.5 block">Icon</label>
          <div className="grid grid-cols-8 gap-1.5 max-h-32 overflow-y-auto pr-1">
            {ICON_NAMES.map((n) => (
              <button
                type="button" key={n} onClick={() => setIcon(n)}
                className={classNames(
                  'aspect-square rounded-lg flex items-center justify-center border transition-colors',
                  icon === n ? 'border-signal-amber bg-signal-amber/10' : 'border-ink-border bg-ink-850 hover:bg-ink-700'
                )}
              >
                <CategoryIcon name={n} size={14} style={{ color: icon === n ? color : 'rgb(var(--c-paper-500))' }} />
              </button>
            ))}
          </div>
        </div>

        <button type="submit" className="w-full rounded-xl bg-signal-amber hover:bg-amber-400 text-ink-950 font-display font-semibold text-sm py-2.5 transition-colors">
          {modal.mode === 'add' ? 'Create category' : 'Save changes'}
        </button>
      </form>
    </Modal>
  );
}
