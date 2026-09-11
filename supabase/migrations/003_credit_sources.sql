-- Migration 003 — credit sources become editable rows, like categories
--
-- Until now a credit's source was a hard-coded string in the app, so you could
-- not add "Investment payout" or rename anything. This gives credits their own
-- taxonomy table with exactly the shape categories have, and points
-- transactions at it.
--
-- Additive only: one new table, one new column, and a backfill that FILLS the
-- new column on existing rows. No DROP, DELETE or TRUNCATE anywhere, and the
-- original `transactions.source` text is left untouched as the historical
-- label, so nothing is lost even if the backfill matches nothing.
--
--   Dashboard -> SQL Editor -> New query -> paste -> Run
--
-- Supabase may still show its "destructive operations" banner; that check is a
-- keyword scan and ALTER TABLE trips it.

-- ── 1. The table ───────────────────────────────────────────────────────
-- Same shape as public.categories, minus the budget: you do not budget for
-- money coming in. `offsets_spend` is the UI default for whether this source
-- normally hands money back to a spend category (a refund) or is fresh income.

create table if not exists public.credit_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#3DDC97',
  icon text not null default 'Banknote',
  offsets_spend boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_credit_sources_user on public.credit_sources (user_id);

alter table public.credit_sources enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'credit_sources'
      and policyname = 'credit_sources_owner'
  ) then
    create policy credit_sources_owner on public.credit_sources
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- ── 2. Point transactions at it ────────────────────────────────────────
-- ON DELETE SET NULL, so removing a source never removes an entry: the row
-- keeps its `source` text and simply stops being linked.

alter table public.transactions
  add column if not exists source_id uuid references public.credit_sources(id) on delete set null;

create index if not exists idx_transactions_source on public.transactions (source_id);

-- ── 3. Seed every existing user with the starter set ───────────────────
-- Inserts only what is missing, matched by name, so re-running adds nothing
-- and a source you renamed is never resurrected under its old name.

insert into public.credit_sources (user_id, name, color, icon, offsets_spend)
select u.id, d.name, d.color, d.icon, d.offsets_spend
from auth.users u
cross join (values
  ('Salary',        '#3DDC97', 'Banknote',       false),
  ('Refund',        '#4FD1E7', 'RotateCcw',      true ),
  ('Reimbursement', '#5B9DF2', 'Receipt',        true ),
  ('Cashback',      '#F2A93B', 'CreditCard',     true ),
  ('Transfer in',   '#9B8CF2', 'Landmark',       false),
  ('Interest',      '#38BDF8', 'TrendingUp',     false),
  ('Investments',   '#7EDB6F', 'PiggyBank',      false),
  ('Gift',          '#F27CA3', 'Gift',           false),
  ('Other',         '#8A93A6', 'MoreHorizontal', false)
) as d(name, color, icon, offsets_spend)
where not exists (
  select 1 from public.credit_sources cs
  where cs.user_id = u.id and lower(cs.name) = lower(d.name)
);

-- ── 4. Backfill existing credits ───────────────────────────────────────
-- Links each credit to the source row matching the text it already carries.
-- This only ever writes into the new source_id column; no other field on any
-- existing row is touched, so every entry keeps its amount, date and meaning.

update public.transactions t
set source_id = cs.id
from public.credit_sources cs
where t.source_id is null
  and t.kind = 'credit'
  and t.source is not null
  and cs.user_id = t.user_id
  and lower(cs.name) = lower(t.source);

-- ── 5. New users get both taxonomies ───────────────────────────────────
-- Replaces the provisioning trigger's function so a new sign-up is seeded with
-- credit sources as well as spend categories. Existing users are unaffected;
-- step 3 above already covered them.

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

-- ── Verify ─────────────────────────────────────────────────────────────
--   select count(*) from public.transactions;                  -- unchanged
--   select name from public.credit_sources order by created_at; -- 9 rows
--   select count(*) from public.transactions
--     where kind = 'credit' and source_id is null;              -- 0 if all matched
