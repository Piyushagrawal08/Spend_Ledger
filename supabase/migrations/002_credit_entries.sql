-- Migration 002 — credits alongside debits in one ledger
--
-- Run this if your project is already set up. It is additive only: two new
-- nullable-or-defaulted columns and one index. There is no DROP, DELETE or
-- TRUNCATE anywhere, so every existing transaction keeps its row untouched and
-- is simply read as what it always was — a debit.
--
--   Dashboard -> SQL Editor -> New query -> paste -> Run
--
-- Supabase may still show its "destructive operations" banner; that check is a
-- keyword scan and ALTER TABLE trips it. Nothing below removes data.

-- ── 1. Which side of the ledger an entry sits on ──────────────────────
-- `amount` stays strictly positive on BOTH sides (the existing amount > 0
-- check is left exactly as it is). The direction lives in `kind`, never in
-- the sign, so no historical row has to be rewritten and no aggregate that
-- already exists can silently flip meaning.

alter table public.transactions
  add column if not exists kind text not null default 'debit';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_kind_check'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_kind_check check (kind in ('debit', 'credit'));
  end if;
end $$;

-- ── 2. Where a credit came from ───────────────────────────────────────
-- Categories answer "where did the money go" and only make sense for debits.
-- `source` is the mirror of that for credits — Salary, Refund, Cashback and so
-- on. Null on debits.

alter table public.transactions
  add column if not exists source text;

-- ── 3. Index for the ledger's side filter ─────────────────────────────
create index if not exists idx_transactions_user_kind_date
  on public.transactions (user_id, kind, date desc);

-- ── Verify ────────────────────────────────────────────────────────────
--   select count(*) from public.transactions;                    -- unchanged
--   select kind, count(*) from public.transactions group by kind; -- all 'debit'
