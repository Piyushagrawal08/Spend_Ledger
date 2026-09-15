-- SpendLedger schema
-- Run this once in your Supabase project's SQL editor (Dashboard -> SQL Editor -> New query -> paste -> Run).
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE / DROP IF EXISTS guards.
--
-- ALREADY SET UP? Run the files in supabase/migrations/ instead — in order:
--   001_cycle_reset_and_snapshots.sql   cycle reset day + ledger snapshots
--   002_credit_entries.sql              credits alongside debits
--   003_credit_sources.sql              editable credit sources
--   004_opening_balance.sql             opening balance for the running cash balance
-- Each adds only what is new and contains no DROP at all, so neither can
-- touch your existing rows, policies or triggers.
--
-- Note on Supabase's "destructive operations" warning for this file: the only
-- DROP statements below are `drop policy` / `drop trigger`, each immediately
-- followed by recreating that same object. There is no DROP TABLE, DROP COLUMN,
-- DELETE or TRUNCATE anywhere, so no row is ever removed or changed.

create extension if not exists "pgcrypto";

-- ── Tables ──────────────────────────────────────────────────────────────

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#8A93A6',
  icon text not null default 'MoreHorizontal',
  default_budget numeric not null default 0,
  created_at timestamptz not null default now()
);

-- One table holds both sides of the ledger. `amount` is always POSITIVE;
-- the direction lives in `kind`, never in the sign, so no aggregate can be
-- accidentally right for one side and wrong for the other.
--
--   kind = 'debit'   money out. `category_id` says where it went.
--   kind = 'credit'  money in.  `source` says where it came from, and an
--                    optional `category_id` means the credit gives spend
--                    BACK to that category (a refund or reimbursement)
--                    rather than being fresh income.
-- Credits get their own taxonomy, the mirror of categories: categories say
-- where money went, credit sources say where it came from. No budget field —
-- you do not budget for money coming in. `offsets_spend` is the UI default for
-- whether this source normally hands money back to a spend category.
create table if not exists public.credit_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#3DDC97',
  icon text not null default 'Banknote',
  offsets_spend boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  amount numeric not null check (amount > 0),
  date date not null,
  note text default '',
  method text default 'UPI',
  kind text not null default 'debit' check (kind in ('debit', 'credit')),
  source text,                           -- credits only: the label as written
  source_id uuid references public.credit_sources(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Migration for projects created before credits existed. Every pre-existing
-- row is read as exactly what it always was: a debit.
alter table public.transactions
  add column if not exists kind text not null default 'debit';
alter table public.transactions
  add column if not exists source text;
alter table public.transactions
  add column if not exists source_id uuid references public.credit_sources(id) on delete set null;

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

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month_key text not null,               -- e.g. '2026-08'
  category_id uuid not null references public.categories(id) on delete cascade,
  amount numeric not null default 0,
  unique (user_id, month_key, category_id)
);

create table if not exists public.monthly_totals (
  user_id uuid not null references auth.users(id) on delete cascade,
  month_key text not null,
  amount numeric not null default 0,
  primary key (user_id, month_key)
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  monthly_income numeric not null default 0,
  currency text not null default 'INR',
  carry_forward boolean not null default false,
  -- Day of the following month on which the spend cycle resets (default the 7th).
  -- "Remaining days" counts from today up to this date, not to the month end.
  cycle_reset_day smallint not null default 7 check (cycle_reset_day between 1 and 28),
  -- Cash on hand the moment before the oldest entry in the ledger. The anchor
  -- that turns the relative figures (spent, budgeted, left) into an absolute
  -- running balance. Read-side only: no balance is ever stored per cycle, so a
  -- back-dated entry re-derives every later figure rather than leaving a stale
  -- total behind. 0 means "net since you started tracking".
  opening_balance numeric not null default 0
);

-- Migration for projects created before the spend-cycle setting existed:
alter table public.user_settings
  add column if not exists cycle_reset_day smallint not null default 7;

-- Migration for projects created before the opening balance existed:
alter table public.user_settings
  add column if not exists opening_balance numeric not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_settings_cycle_reset_day_check'
  ) then
    alter table public.user_settings
      add constraint user_settings_cycle_reset_day_check
      check (cycle_reset_day between 1 and 28);
  end if;
end $$;

create index if not exists idx_transactions_user_date on public.transactions (user_id, date desc);
create index if not exists idx_transactions_user_kind_date on public.transactions (user_id, kind, date desc);
create index if not exists idx_transactions_source on public.transactions (source_id);
create index if not exists idx_credit_sources_user on public.credit_sources (user_id);
create index if not exists idx_categories_user on public.categories (user_id);
create index if not exists idx_budgets_user_month on public.budgets (user_id, month_key);

-- ── Row Level Security: every user can only ever see/touch their own rows ─

alter table public.categories enable row level security;
alter table public.credit_sources enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.monthly_totals enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists categories_owner on public.categories;
create policy categories_owner on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists credit_sources_owner on public.credit_sources;
create policy credit_sources_owner on public.credit_sources
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists transactions_owner on public.transactions;
create policy transactions_owner on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists budgets_owner on public.budgets;
create policy budgets_owner on public.budgets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists monthly_totals_owner on public.monthly_totals;
create policy monthly_totals_owner on public.monthly_totals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists user_settings_owner on public.user_settings;
create policy user_settings_owner on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── New user provisioning ──────────────────────────────────────────────
-- Supabase auto-creates a unique id (auth.users.id) for every sign-up.
-- This trigger seeds that new user with a settings row and 11 starter
-- categories the moment their account is created — no manual setup needed.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.user_settings (user_id) values (new.id)
    on conflict (user_id) do nothing;

  insert into public.categories (user_id, name, color, icon, default_budget) values
    (new.id, 'Food & Dining',          '#F2A93B', 'Utensils',        6000),
    (new.id, 'Groceries',              '#3DDC97', 'ShoppingBasket',  5000),
    (new.id, 'Transport',              '#5B9DF2', 'Bus',             3000),
    (new.id, 'Bills & Utilities',      '#F2545B', 'Receipt',         4000),
    (new.id, 'Rent & Housing',         '#9B8CF2', 'Home',           12000),
    (new.id, 'Shopping',               '#F27CA3', 'ShoppingBag',     3000),
    (new.id, 'Entertainment',          '#4FD1E7', 'Film',            2000),
    (new.id, 'Health & Fitness',       '#7EDB6F', 'HeartPulse',      2000),
    (new.id, 'Learning & Exams',       '#E7C24F', 'BookOpen',        2000),
    (new.id, 'Investments & Savings',  '#38BDF8', 'PiggyBank',       8000),
    (new.id, 'Others',                 '#8A93A6', 'MoreHorizontal',  1500);

  insert into public.credit_sources (user_id, name, color, icon, offsets_spend) values
    (new.id, 'Salary',        '#3DDC97', 'Banknote',       false),
    (new.id, 'Refund',        '#4FD1E7', 'RotateCcw',      true ),
    (new.id, 'Reimbursement', '#5B9DF2', 'Receipt',        true ),
    (new.id, 'Cashback',      '#F2A93B', 'CreditCard',     true ),
    (new.id, 'Transfer in',   '#9B8CF2', 'Landmark',       false),
    (new.id, 'Interest',      '#38BDF8', 'TrendingUp',     false),
    (new.id, 'Investments',   '#7EDB6F', 'PiggyBank',      false),
    (new.id, 'Gift',          '#F27CA3', 'Gift',           false),
    (new.id, 'Other',         '#8A93A6', 'MoreHorizontal', false);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Ledger snapshots (backups) ─────────────────────────────────────────
-- Point-in-time copies of the ledger. A snapshot stores the whole ledger
-- as self-contained JSON — including the categories as they were named
-- and coloured at the time — so later renames or deletions in the live
-- tables can never change what a snapshot shows.
--
-- Snapshots are append-only by design: there is no UPDATE policy, and the
-- trigger below rejects updates outright. Editing your live ledger, or
-- viewing an archive in the app, cannot alter a stored snapshot.

create table if not exists public.ledger_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default '',
  source text not null default 'app',         -- 'app' | 'script'
  payload jsonb not null,                     -- { categories, transactions, budgets, totals, settings }
  tx_count integer not null default 0,
  total_amount numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_snapshots_user_created
  on public.ledger_snapshots (user_id, created_at desc);

alter table public.ledger_snapshots enable row level security;

-- Granular policies: read / create / delete your own, but never update.
drop policy if exists ledger_snapshots_owner on public.ledger_snapshots;
drop policy if exists ledger_snapshots_read on public.ledger_snapshots;
drop policy if exists ledger_snapshots_insert on public.ledger_snapshots;
drop policy if exists ledger_snapshots_delete on public.ledger_snapshots;

create policy ledger_snapshots_read on public.ledger_snapshots
  for select using (auth.uid() = user_id);

create policy ledger_snapshots_insert on public.ledger_snapshots
  for insert with check (auth.uid() = user_id);

create policy ledger_snapshots_delete on public.ledger_snapshots
  for delete using (auth.uid() = user_id);

-- Belt and braces: reject UPDATE at the table level, so a snapshot stays
-- byte-for-byte what it was even if a policy is ever loosened by mistake.
create or replace function public.reject_snapshot_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ledger_snapshots rows are immutable; create a new snapshot instead';
end;
$$;

drop trigger if exists ledger_snapshots_no_update on public.ledger_snapshots;
create trigger ledger_snapshots_no_update
  before update on public.ledger_snapshots
  for each row execute procedure public.reject_snapshot_update();
