'use client';

import { useEffect, useState } from 'react';
import { Undo2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { CategoryIcon, ICON_NAMES } from '@/lib/icons';
import { classNames } from '@/lib/utils';

const PALETTE = ['#F2A93B', '#3DDC97', '#5B9DF2', '#F2545B', '#9B8CF2', '#F27CA3', '#4FD1E7', '#7EDB6F', '#E7C24F', '#38BDF8', '#8A93A6', '#FB923C'];

/**
 * Edits either taxonomy. `variant` decides which fields apply:
 *
 *   'category'  a spend category — carries a default monthly budget
 *   'source'    a credit source  — no budget (you do not budget money coming
 *               in), but a "usually a refund" default instead
 *
 * Both sides get the same name / colour / icon controls, which is the point:
 * managing where money comes from should feel exactly like managing where it
 * goes.
 */
export default function CategoryModal({ modal, onClose, onSubmit, variant = 'category' }) {
  const isSource = variant === 'source';
  const item = modal?.cat;

  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[0]);
  const [icon, setIcon] = useState(ICON_NAMES[0]);
  const [budget, setBudget] = useState(1000);
  const [offsetsSpend, setOffsetsSpend] = useState(false);

  // Reset the form whenever a different row is opened. This was a `useState`
  // with a dependency array, which never re-runs — so the modal kept showing
  // the first row it was ever opened with.
  useEffect(() => {
    if (!modal) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(item?.name || '');
    setColor(item?.color || (isSource ? '#3DDC97' : PALETTE[0]));
    setIcon(item?.icon || (isSource ? 'Banknote' : ICON_NAMES[0]));
    setBudget(item?.defaultBudget ?? 1000);
    setOffsetsSpend(!!item?.offsetsSpend);
  }, [modal, item, isSource]);

  if (!modal) return null;

  const noun = isSource ? 'credit source' : 'category';
  const accent = isSource ? 'signal-green' : 'signal-amber';

  return (
    <Modal
      open={!!modal}
      onClose={onClose}
      title={`${modal.mode === 'add' ? 'New' : 'Edit'} ${noun}`}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onSubmit(
            isSource
              ? { name: name.trim(), color, icon, offsetsSpend }
              : { name: name.trim(), color, icon, defaultBudget: Number(budget) || 0 }
          );
        }}
        className="space-y-4"
      >
        <div>
          <label className="text-[11px] uppercase tracking-wide text-paper-500 font-mono mb-1.5 block">Name</label>
          <input
            autoFocus
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder={isSource ? 'e.g. Investment payout' : 'e.g. Subscriptions'}
            className={classNames(
              'w-full rounded-xl border border-ink-border bg-ink-850 px-3 py-2.5 text-sm text-paper-100 outline-none',
              isSource ? 'focus:border-signal-green/60' : 'focus:border-signal-amber/60'
            )}
          />
        </div>

        {isSource ? (
          <label className="flex items-start gap-2.5 cursor-pointer rounded-xl border border-ink-border bg-ink-850/60 p-3.5">
            <input
              type="checkbox"
              checked={offsetsSpend}
              onChange={(e) => setOffsetsSpend(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-emerald-500 shrink-0"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm text-paper-100">
                <Undo2 size={13} className="text-signal-green shrink-0" />
                Usually gives money back to a category
              </span>
              <span className="block text-[11px] text-paper-500 mt-0.5 leading-relaxed">
                Turn this on for refunds, cashback and reimbursements: logging one
                opens the category picker ready to hand the spend back. Leave it
                off for income like salary or an investment payout.
              </span>
            </span>
          </label>
        ) : (
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
        )}

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
                  icon === n
                    ? `border-${accent} bg-${accent}/10`
                    : 'border-ink-border bg-ink-850 hover:bg-ink-700'
                )}
                style={icon === n ? { borderColor: color, background: `${color}1A` } : undefined}
              >
                <CategoryIcon name={n} size={14} style={{ color: icon === n ? color : 'rgb(var(--c-paper-500))' }} />
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          className={classNames(
            'w-full rounded-xl text-ink-950 font-display font-semibold text-sm py-2.5 transition-colors',
            isSource ? 'bg-signal-green hover:bg-emerald-400' : 'bg-signal-amber hover:bg-amber-400'
          )}
        >
          {modal.mode === 'add' ? `Create ${noun}` : 'Save changes'}
        </button>
      </form>
    </Modal>
  );
}
