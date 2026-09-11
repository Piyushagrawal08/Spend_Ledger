# SpendLedger — working agreement

## The process — follow this for EVERY change, no exceptions

**1. READ `docs/STRUCTURE.md` first.** Before touching anything, read the
structure map, then open the actual files the change touches — the whole file,
not the fragment you plan to edit. Most mistakes in this repo have come from
changing one branch of a two-sided feature without looking at the other.

**2. THINK.** What else touches this? This app is two-sided almost everywhere
(debit/credit, real store/demo store, schema/migration, app/backup script).
List the counterparts before writing code.

**3. PLAN.** State the plan — files, and what changes in each — before editing.
For anything non-trivial, say the plan out loud to the user first.

**4. UPDATE.** Make the change, including every counterpart from step 2.

**5. TEST ON `/demo`.** `npm run dev`, verify at `http://localhost:3000/demo`,
and tell the user which screen and which control to look at. Never send them to
the real app first.

**6. TEST ON THE REAL APP.** Only after the demo looks right: run any pending
migration, then verify on `/` with real data. Report what was checked.

**7. ASK PERMISSION, THEN PUSH.** **Never `git push` — or `git commit` — without
explicit approval in that message.** Show what would be committed and wait. A
previous approval never carries forward to a later change.

Skipping a step is not a shortcut, it is how a bug reaches real financial data.

### Symmetry check

Before calling any UI change done, ask: *does the mirror-image screen or branch
need this too?* Money out ↔ money in. Categories ↔ credit sources. Real store ↔
demo store. If only one side should get it, say why.

## Show every change on the demo screen first

**Before presenting any UI change, make it visible at `http://localhost:3000/demo`
and tell the user to look there. Never ask them to review a change on the real
app first.**

The reason: the live app requires a Supabase login and renders this user's real
finance data. Reviewing a change there means logging in and risks test entries
landing in the real ledger. `/demo` needs no login and is fabricated data.

The workflow for a UI change:

1. Make the change.
2. Run `npm run dev` if it is not already running.
3. Confirm the change renders at `/demo` — and say which screen and which tab
   to click, e.g. "Ledger tab, the out/in/net bar".
4. Only after the user has seen it and is happy, discuss pushing or touching the
   live app.

If a change cannot be shown on `/demo` — say it only affects a real Supabase
write path — state that explicitly and explain what the demo does and does not
cover, rather than silently skipping the step.

## How the demo works

Full map of the app: **`docs/STRUCTURE.md`** — read it before every change.

| File | Role |
|---|---|
| `app/demo/page.js` | the `/demo` route and its violet DEMO banner |
| `lib/useDemoStore.js` | in-memory store, identical API to `useFinanceStore` |
| `lib/demoData.js` | deterministic seeded fake ledger |
| `lib/ledgerSelectors.js` | budget carry-forward, shared by both stores |
| `components/AppShell.js` | `AppShellWithStore` renders the shell with any store |

Rules that keep the demo trustworthy:

- **Views must never import `useFinanceStore` directly.** They receive `store`
  as a prop. A view that reaches for the real store bypasses the demo and will
  crash it.
- **Any new field on the store must be added to BOTH stores.** If you add a
  method to `useFinanceStore`, add the in-memory equivalent to `useDemoStore`
  in the same change, or `/demo` breaks.
- **The demo makes no network calls.** No Supabase client, no `fetch`. It must
  render with an empty `.env.local`.
- **Seed data stays deterministic.** `lib/demoData.js` uses a fixed-seed PRNG so
  two screenshots differ because the code changed, never because the data
  reshuffled. Do not introduce unseeded `Math.random()` or times that vary
  within a day.
- **Never seed data dated after today.**

To exercise a new feature in the demo, add representative rows to
`lib/demoData.js` — the demo is only useful if the case you changed is visible
in it.

## Data model notes

- Entries live in one `transactions` table. `amount` is **always positive**;
  direction is in `kind` (`'debit' | 'credit'`). Never encode direction as a
  negative amount.
- A **credit with a `category_id`** is a refund: it comes off that category's
  spend and frees the budget. A **credit without one** is income: it never
  touches a category or budget. See the header comment in `lib/utils.js`.
- **Two taxonomies, both user-editable.** `categories` = where money went
  (debits); `credit_sources` = where it came from (credits). Never hard-code
  either list in a component — read `store.categories` / `store.creditSources`.
  `STARTER_CREDIT_SOURCES` in `lib/defaultData.js` only documents what the SQL
  seeds; it is not the runtime list.
- A credit stores **both** `source_id` (the link, so a rename propagates) and
  `source` (the label frozen at write time, so history survives the source
  being deleted). Resolve with `getCreditSource()` — never read `t.source`
  directly for display.
- Periods are **spend cycles**, not calendar months — a cycle runs from
  `cycle_reset_day` of one month to the day before it in the next, keyed by its
  opening month. Use the helpers in `lib/utils.js`; do not add day-of-month
  logic.

## This repo is public

It holds real personal finance data in Supabase. Never commit `.env.local`,
anything under `backups/`, ledger exports, or real transaction values. Fake
data belongs in `lib/demoData.js` and nowhere else.

## Database changes

Add a new numbered file in `supabase/migrations/` and mirror it into
`supabase/schema.sql`. Migrations must be **additive only** — no `DROP TABLE`,
`DROP COLUMN`, `DELETE` or `TRUNCATE` — and safe to re-run. Existing rows must
keep their meaning without being rewritten.
