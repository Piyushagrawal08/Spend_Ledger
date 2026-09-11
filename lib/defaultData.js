export const PAYMENT_METHODS = ['UPI', 'Cash', 'Credit Card', 'Debit Card', 'Net Banking', 'Other'];

// ── Credit sources ─────────────────────────────────────────────────────
// Categories answer "where did the money go" and only ever apply to debits.
// Credit sources are the mirror image: where money that came IN came from.
//
// These are only the STARTER set, mirrored in the SQL that seeds a new
// account. At runtime the live list comes from `store.creditSources` and is
// fully editable, exactly like categories — never read this array to render.
//
// `offsetsSpend` decides whether the "give it back to a category" picker opens
// pre-armed. What actually makes a credit a refund is having a categoryId, so
// the stored entry stays the single source of truth and re-tagging one later
// changes its meaning immediately.
export const STARTER_CREDIT_SOURCES = [
  { name: 'Salary',        color: '#3DDC97', icon: 'Banknote',       offsetsSpend: false },
  { name: 'Refund',        color: '#4FD1E7', icon: 'RotateCcw',      offsetsSpend: true  },
  { name: 'Reimbursement', color: '#5B9DF2', icon: 'Receipt',        offsetsSpend: true  },
  { name: 'Cashback',      color: '#F2A93B', icon: 'CreditCard',     offsetsSpend: true  },
  { name: 'Transfer in',   color: '#9B8CF2', icon: 'Landmark',       offsetsSpend: false },
  { name: 'Interest',      color: '#38BDF8', icon: 'TrendingUp',     offsetsSpend: false },
  { name: 'Investments',   color: '#7EDB6F', icon: 'PiggyBank',      offsetsSpend: false },
  { name: 'Gift',          color: '#F27CA3', icon: 'Gift',           offsetsSpend: false },
  { name: 'Other',         color: '#8A93A6', icon: 'MoreHorizontal', offsetsSpend: false },
];
