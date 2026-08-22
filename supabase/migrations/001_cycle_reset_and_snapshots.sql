-- Migration 001 — spend-cycle reset day + ledger snapshots
--
-- Run this INSTEAD of the full schema.sql if your project is already set up.
-- It is additive only and contains no DROP of any kind, so it cannot alter or
-- remove existing rows, policies or triggers. Safe to re-run.
--
--   Dashboard -> SQL Editor -> New query -> paste -> Run
--
-- Supabase may still show its "destructive operations" banner, because that
-- check is a keyword scan and ALTER TABLE trips it. Nothing below deletes data.

-- ── 1. Configurable cycle reset day ───────────────────────────────────
-- Adds one column to user_settings. Existing rows keep their values and get
-- the default (7). No other column is touched.

alter table public.user_settings
  add column if not exists cycle_reset_day smallint not null default 7;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_settings_cycle_reset_day_check'
      and conrelid = 'public.user_settings'::regclass
  ) then
    alter table public.user_settings
      add constraint user_settings_cycle_reset_day_check
      check (cycle_reset_day between 1 and 28);
  end if;
end $$;

-- ── 2. Ledger snapshots (backups) ─────────────────────────────────────
-- A brand-new table. Nothing else in your database references it, so
-- creating it cannot affect transactions, budgets or categories.

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

-- Read / create / delete your own snapshots. Deliberately no UPDATE policy:
-- a snapshot can never be rewritten, only added or removed.
-- Guarded with IF NOT EXISTS checks so no DROP POLICY is needed.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ledger_snapshots'
      and policyname = 'ledger_snapshots_read'
  ) then
    create policy ledger_snapshots_read on public.ledger_snapshots
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ledger_snapshots'
      and policyname = 'ledger_snapshots_insert'
  ) then
    create policy ledger_snapshots_insert on public.ledger_snapshots
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ledger_snapshots'
      and policyname = 'ledger_snapshots_delete'
  ) then
    create policy ledger_snapshots_delete on public.ledger_snapshots
      for delete using (auth.uid() = user_id);
  end if;
end $$;

-- Belt and braces: reject UPDATE at the table level, so a snapshot stays
-- byte-for-byte what it was even if a policy is ever loosened by mistake.
-- This function name is new, so OR REPLACE cannot overwrite anything of yours.
create or replace function public.reject_snapshot_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ledger_snapshots rows are immutable; create a new snapshot instead';
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'ledger_snapshots_no_update'
      and tgrelid = 'public.ledger_snapshots'::regclass
  ) then
    create trigger ledger_snapshots_no_update
      before update on public.ledger_snapshots
      for each row execute procedure public.reject_snapshot_update();
  end if;
end $$;

-- ── Verify ────────────────────────────────────────────────────────────
-- Run these afterwards to confirm nothing was lost:
--
--   select count(*) from public.transactions;   -- unchanged from before
--   select count(*) from public.categories;     -- unchanged from before
--   select cycle_reset_day from public.user_settings;   -- 7
--   select count(*) from public.ledger_snapshots;       -- 0
