import { classNames } from '@/lib/utils';

export default function Panel({ children, className, title, eyebrow, action, noPad }) {
  return (
    <div className={classNames('rounded-2xl border border-ink-border bg-ink-800/70 shadow-panel backdrop-blur-sm', className)}>
      {(title || action || eyebrow) && (
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div>
            {eyebrow && <div className="text-[10px] uppercase tracking-[0.14em] text-paper-500 font-mono mb-0.5">{eyebrow}</div>}
            {title && <h3 className="font-display text-sm font-semibold text-paper-100 tracking-wide">{title}</h3>}
          </div>
          {action}
        </div>
      )}
      <div className={noPad ? '' : 'p-5 pt-3'}>{children}</div>
    </div>
  );
}
