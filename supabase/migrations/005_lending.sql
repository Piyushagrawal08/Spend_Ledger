-- Migration 005 — the lending ledger: money between you and a friend
--
-- Money you lend to a friend, or borrow from one, is neither spending nor
-- income. It buys nothing, so it has no category; it is not yours to keep, so
-- it belongs in no budget. It is a debt that will be settled later. That is
-- why it gets its own two tables and never touches `transactions`: mixing it
-- in would quietly inflate a spend total or a cash balance with money that
-- was only ever passing through.
--
-- Additive only: two new tables and their policies. No DROP, DELETE or
-- TRUNCATE anywhere, no existing row is read or rewritten, and re-running
-- this file changes nothing.
--
--   Dashboard -> SQL Editor -> New query -> paste -> Run
--
-- Supabase may still show its "destructive operations" banner; that check is
-- a keyword scan and `create policy` trips it.

-- ── 1. People ──────────────────────────────────────────────────────────
-- A third taxonomy, the same shape as categories and credit_sources minus the
-- money fields — you do not budget a friend. Nothing is seeded here on
-- purpose: whose names belong in this table is personal, and a starter list
-- of invented friends would be noise every user has to delete.

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#9B8CF2',
  icon text not null default 'UserRound',
  created_at timestamptz not null default now()
);

create index if not exists idx_people_user on public.people (user_id);

alter table public.people enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'people'
      and policyname = 'people_owner'
  ) then
    create policy people_owner on public.people
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- ── 2. The entries ─────────────────────────────────────────────────────
-- One row per movement of money between you and one person. As everywhere
-- else in this app `amount` is always POSITIVE and the direction lives in its
-- own column, never in the sign:
--
--   direction = 'out'  money left your pocket toward them — you lent them
--                      something, or you paid back something you owed.
--   direction = 'in'   money came to you from them — they repaid you, or you
--                      borrowed from them.
--
-- A repayment is simply an entry the other way, which is why there is no
-- "settled" flag on this table. A flag can disagree with the rows beneath it
-- and a part-repayment has nowhere to go; the balance per person is always
-- derived as (out − in), so it cannot drift.
--
-- `person_id` links to the editable row so a rename propagates, and `person`
-- freezes the name at write time so history still reads after that row is
-- deleted — the same pair, for the same reason, as transactions.source_id /
-- transactions.source. Hence ON DELETE SET NULL: removing a person must never
-- remove the record of the money.

create table if not exists public.lending_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  person text,                           -- the label as written, frozen
  direction text not null default 'out' check (direction in ('out', 'in')),
  amount numeric not null check (amount > 0),
  date date not null,
  note text default '',
  method text default 'UPI',
  created_at timestamptz not null default now()
);

create index if not exists idx_lending_user_date on public.lending_entries (user_id, date desc);
create index if not exists idx_lending_person on public.lending_entries (person_id);

alter table public.lending_entries enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'lending_entries'
      and policyname = 'lending_entries_owner'
  ) then
    create policy lending_entries_owner on public.lending_entries
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- ── Verify ─────────────────────────────────────────────────────────────
--   select count(*) from public.transactions;      -- unchanged by this file
--   select count(*) from public.people;            -- 0 until you add someone
--   select count(*) from public.lending_entries;   -- 0 until you log one
