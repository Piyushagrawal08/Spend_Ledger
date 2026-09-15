-- Migration 004 — opening balance, so the ledger can show real cash
--
-- Run this if your project is already set up. It is additive only: one new
-- column with a default. There is no DROP, DELETE or TRUNCATE anywhere, so
-- every existing row keeps its meaning untouched.
--
--   Dashboard -> SQL Editor -> New query -> paste -> Run
--
-- Supabase may still show its "destructive operations" banner; that check is a
-- keyword scan and ALTER TABLE trips it. Nothing below removes data.

-- ── What you held before the first entry ──────────────────────────────
-- Everything in this app up to now has been *relative*: what you spent, what
-- you budgeted, what is left of an allocation. None of it knows how much money
-- actually exists. This column is the anchor that makes an absolute number
-- possible — the cash on hand the moment before the oldest entry in the
-- ledger.
--
-- The running balance is then read-side only, exactly like budget carry-forward
-- and rollover: opening_balance + every credit - every debit, up to whatever
-- date is being asked about. No cycle is ever written on the user's behalf and
-- no balance is stored, so a back-dated entry re-derives every later figure on
-- the next render and can never leave a stale total behind.
--
-- Defaulting to 0 means an existing project is unchanged until the user sets
-- one: the balance simply reads as "net since you started tracking".

alter table public.user_settings
  add column if not exists opening_balance numeric not null default 0;

-- ── Verify ────────────────────────────────────────────────────────────
--   select user_id, monthly_income, opening_balance from public.user_settings;
