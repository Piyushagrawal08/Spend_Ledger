# SpendLedger — structure

**Read this before changing anything.** It is the map of the whole app: every
screen, every store field, every table, and the invariants that tie them
together. Keeping it accurate is part of finishing a change.

SpendLedger is a personal finance cockpit: a two-sided ledger (money out and
money in) organised into **spend cycles** rather than calendar months, with
per-category budgets and append-only backups. Next.js App Router + React 18 +
Tailwind + Recharts, on Supabase (Postgres + auth + row-level security).

---

## 1. Routes

| Route | File | Auth | Purpose |
|---|---|---|---|
| `/` | `app/page.js` → `AppShell` | required | the real app, live Supabase data |
| `/demo` | `app/demo/page.js` | **none** | same UI, fabricated in-memory data |
| `/login` | `app/login/page.js` | public | email OTP or password |
| `/auth/callback` | `app/auth/callback/route.js` | public | OAuth/magic-link code exchange |

`middleware.js` redirects unauthenticated traffic to `/login`. It returns
**before** constructing the Supabase client for `/demo`, so the demo renders
with no credentials and can never read a real session cookie.

`app/layout.js` loads the three fonts (Space Grotesk / Inter / IBM Plex Mono),
wraps everything in `ThemeProvider`, and inlines a no-flash script that reads
the saved theme from `localStorage` before first paint.

---

## 2. The shell

`components/AppShell.js` owns the chrome: sidebar (desktop), top bar + bottom
nav (mobile), and the active tab. It renders one view at a time and passes
every view the same props:

```js
{ store, monthKey, setMonthKey, goTo }
```

- `store` — the data layer (§4). **Views never import a store directly.**
- `monthKey` — the selected cycle, `'YYYY-MM'`. Held as `null` until the user
  picks one, so the default follows the reset day once settings load.
- `goTo(tabId)` — jump to another tab.

Three entry points:

| Export | Store | Used by |
|---|---|---|
| `AppShell` (default) | `useFinanceStore()` | `/` |
| `AppShellWithStore` | whatever you pass | `/demo` |
| `AppInner` (private) | prop | both |

Nav ids: `overview`, `add`, `transactions`, `budgets`, `categories`,
`backups`, `settings`. Mobile nav hides `backups` and pins `settings` at the
right; it labels buttons with `item.label.split(' ')[0]`, so **the first word
of a nav label must stand alone**.

---

## 3. Screens

| Tab | File | What it does |
|---|---|---|
| Overview | `views/Overview.js` | dashboard: global slicer, KPI row, 4 charts, budget gauges, recent entries |
| Add entry | `views/AddEntry.js` | the two-sided entry form + today's list |
| Ledger | `views/Transactions.js` | cycle list, side/category/text filters, edit modal |
| Budgets | `views/Budgets.js` | total + per-category allocation, carry-forward state |
| Categories | `views/Categories.js` | **both** taxonomies behind a two-tab switch |
| Backups | `views/Backups.js` | snapshots list + read-only archive viewer + CSV |
| Settings | `views/SettingsView.js` | account, income, reset day, exports, danger zone |

### Overview — the slicer

One `MultiSelect` above the KPIs drives **every** panel. `slice` is an array of
category ids; empty means all. The matcher lives in one place:

```js
if (!sliced) return true;
if (isIncome(t)) return false;              // income has no category
return slice.includes(t.categoryId || UNCAT_ID);
```

`totalBudget` narrows to the sliced categories too, so "spent vs allocated"
stays a fair pairing. **A new panel on this screen must read from the sliced
`monthTx`, not from `transactions`.**

**The one exception: the carry-forward strip.** It sits *above* the slicer and
reads the whole ledger. Income carries no category, so the matcher above drops
every credit while a slice is active — feeding sliced entries to a cash balance
would silently turn it into a spend total. It also needs every entry *before*
this cycle to know what carried in, which `monthTx` cannot give. Its position
above the control is the visual promise that the filter does not reach it, and
it says so explicitly whenever a slice is on. If you add another absolute-money
panel, put it there too; anything relative belongs below the slicer.

### Add entry — the symmetry rule

The form is one component with a `kind` toggle. The Money out and Money in
branches are near-mirror images and **must stay that way**:

| | Money out (debit) | Money in (credit) |
|---|---|---|
| Picker | category grid | source grid |
| Data | `store.categories` | `store.creditSources` |
| Extra field | — | refund toggle + category picker |
| Accent | amber | green |

Both pickers are *label + grid only*. Neither has an inline "add new" — both
taxonomies are managed on the Categories screen. **Adding an affordance to one
branch without the other is the exact mistake to avoid here.**

One deliberate difference: debit chips show `c.name.split(' ')[0]` (so "Food &
Dining" reads "Food") on a `grid-cols-4 sm:grid-cols-5`; credit chips show the
full `s.name` on `grid-cols-4`, because source names are short and "Transfer"
alone would be ambiguous.

---

## 4. The store contract

Two implementations, one shape. **Anything added to one must be added to the
other in the same change**, or `/demo` breaks.

| | Real | Demo |
|---|---|---|
| File | `lib/useFinanceStore.js` | `lib/useDemoStore.js` |
| Backing | Supabase | React state, seeded from `lib/demoData.js` |
| Network | yes | **none** |

```
State      categories  creditSources  transactions  budgets  totals
           settings  snapshots  hydrated  userId  userEmail
Entries    addTransaction  updateTransaction  deleteTransaction
Taxonomy   addCategory  updateCategory  deleteCategory
           addCreditSource  updateCreditSource  deleteCreditSource
Budgets    setBudget  budgetFor  budgetOriginFor
           setMonthlyTotal  monthlyTotalFor  monthlyTotalOriginFor
           rolloverTotalFor  rolloverForCategory
Settings   updateSettings
Backups    createSnapshot  getSnapshot  deleteSnapshot
Danger     clearAllData  signOut
Demo only  resetDemo
```

Shared derivations live in `lib/ledgerSelectors.js` (`useBudgetSelectors`) so
carry-forward logic cannot drift between the two stores.

Client shapes (camelCase; the store maps from snake_case rows):

```js
tx     { id, kind, amount, categoryId, sourceId, source, date, note, method, createdAt }
cat    { id, name, color, icon, defaultBudget }
source { id, name, color, icon, offsetsSpend }
budgets{ 'YYYY-MM': { categoryId: amount } }
totals { 'YYYY-MM': amount }
setting{ monthlyIncome, currency, carryForward, cycleResetDay, openingBalance }
```

Both stores tolerate a table that does not exist yet (pre-migration) by
falling back to `[]` rather than failing to boot.

---

## 5. Domain rules

These are the invariants. Breaking one silently corrupts a number somewhere.

**Direction.** `amount` is *always positive*. Direction lives in `kind`
(`'debit' | 'credit'`). Never encode direction as a negative number.

**Two kinds of credit.**

| | `category_id` | Effect |
|---|---|---|
| Refund | set | comes off that category's spend, frees its budget |
| Income | null | never touches a category or budget |

**Two totals, both needed.** `netSpend` = debits − refunds (what budgets are
judged against). `netFlow` = credits − debits (cash flow). `ledgerTotals()`
returns both plus the parts, in one pass.

**Credit sources are stored twice on purpose.** `source_id` links to the
editable row so a rename propagates everywhere; `source` freezes the label at
write time so history survives that row being deleted. Always display via
`getCreditSource()` — never read `t.source` directly.

**Spend cycles, not months.** A cycle runs from `cycle_reset_day` of one month
to the day before it in the next, keyed by its opening month. With reset day 7,
`'2026-08'` means 7 Aug → 6 Sep. Use the helpers in `lib/utils.js`
(`filterCycle`, `cycleStartDate`, `cycleDateAtOffset`, `currentCycleKey`, …).
**Do not add day-of-month logic** — `lib/utils.js` deliberately has none.

**Budget carry-forward.** A budget set in one cycle stays in force for every
later cycle until changed. Read-side only; no cycle is ever written on the
user's behalf. Falls back to the category's `defaultBudget`.

**Rollover is a different thing — do not conflate the two.** *Carried* is the
budget **number** persisting; *rollover* is the unspent **money** moving. Set
26,000 and spend 21,000 and the next cycle is 31,000; overspend to 29,000 and
it is 23,000, exactly like a running account balance. Gated on
`settings.carryForward` (a column that existed unused until this landed), and
it runs as **two independent chains** — one on the total cycle budget, one per
category — each folding forward from the first cycle that has a *stored*
figure, so a category you never budgeted can never accrue a phantom balance
out of its default. Also read-side only: turning the setting off restores every
number exactly as it was.

**Running cash balance — the only absolute number in the app.** Everything
else is relative: what you spent, what is left of an allocation. `openingBalance`
(settings) is the cash held before the oldest entry, and `cycleCashSummary()` in
`lib/utils.js` walks the ledger from there: `opening + netFlow = closing`, where
a cycle's `opening` is the previous cycle's `closing` by construction — the same
walk one boundary earlier, so the chain cannot disagree with itself. Refunds
count as cash in here, unlike in `netSpend` where they come off a category; the
money came back either way. Read-side only, like carry-forward and rollover: no
balance is ever stored, so a back-dated entry re-derives every later figure
instead of leaving a stale total behind. `openingBalance` of 0 is valid and
means "net since you started tracking". **Never pass these helpers a
category-filtered list** — income has no category, so a slice drops every credit.

`budgetOriginFor` / `monthlyTotalOriginFor` return `{ amount, base, rollover,
origin, from }` where `amount` is the **effective** figure (base + rollover) so
no two screens can disagree. **Populate any input from `base`, never `amount`**
— saving `amount` back would bake the rollover into the base and count the same
money twice.

---

## 6. Database

`supabase/schema.sql` is the full picture; `supabase/migrations/` is what an
existing project runs, **in order**.

| Table | Key columns |
|---|---|
| `categories` | name, color, icon, default_budget |
| `credit_sources` | name, color, icon, offsets_spend |
| `transactions` | amount (>0), date, kind, category_id, source_id, source, method, note |
| `budgets` | month_key, category_id, amount — unique per (user, month, category) |
| `monthly_totals` | month_key, amount |
| `user_settings` | monthly_income, currency, carry_forward, cycle_reset_day (1–28), opening_balance |
| `ledger_snapshots` | label, source, payload jsonb, tx_count, total_amount |

Every table has RLS keyed on `auth.uid() = user_id`. `ledger_snapshots` is
append-only: no UPDATE policy, plus a trigger that rejects updates outright.
`handle_new_user()` seeds a new sign-up with settings, 11 categories and 9
credit sources.

Migrations: `001` cycle reset day + snapshots · `002` credits alongside debits
· `003` editable credit sources · `004` opening balance.

**Rules.** Additive only — no `DROP TABLE`, `DROP COLUMN`, `DELETE`,
`TRUNCATE`. Safe to re-run. Existing rows keep their meaning. Mirror every
migration into `schema.sql`. FKs that touch history use `ON DELETE SET NULL`,
never cascade — deleting a category or source must never delete an entry.

---

## 7. Shared pieces

`lib/utils.js` (314 lines) — formatting, the debit/credit helpers, cycle maths.
The single source of truth for domain logic; prefer adding here over
re-deriving in a view.

`lib/icons.js` — the allow-listed lucide icons. **A new icon name must be added
to `ICON_MAP` or it silently renders as `MoreHorizontal`.**

UI primitives in `components/ui/`: `Panel` (title/eyebrow/action/noPad),
`Modal`, `Gauge`, `MonthSwitcher`, `MultiSelect`, `Toast` (`useToast()`),
`ThemeToggle`. `components/CategoryModal.js` edits either taxonomy via
`variant="category" | "source"`.

Theme is a `dark` class on `<html>`, persisted in `localStorage`; colours are
CSS variables in `app/globals.css` surfaced as Tailwind tokens
(`ink-*`, `paper-*`, `signal-*`). Recharts needs literal hex, so chart palettes
are picked per-theme inside `Overview.js`.

---

## 8. The demo

`/demo` is the review screen — every change is shown there first.

`lib/demoData.js` builds a deterministic ledger from a fixed-seed PRNG:
~474 entries over 7 cycles, both credit flavours present, budgets set on the
oldest cycle so later ones show "carried". Two snapshots with frozen payloads.
`openingBalance` is seeded at 45,000 — non-zero on purpose, or the carry-in
line would read "nothing carried" on the oldest cycle and the anchor half of the
balance would be invisible on the review screen.
`carryForward` is on, and the seeded total (58,000) is tuned so the rollover
chain shows **both** signs against this ledger — the early cycles overspend and
hand a deficit forward, the current one opens about +3,600 up. Re-tune it if
the generator's spend changes, or half the feature stops being visible.

Rules: no network calls; no unseeded `Math.random()` or within-day varying
time; never seed data dated after today. To make a new feature reviewable, add
representative rows here — the demo is only useful if the case you changed is
visible in it.

---

## 9. Scripts

`npm run dev` · `build` · `start` · `lint` · `backup` · `test` · `test:watch`.

`scripts/backup-ledger.mjs` signs in as the user through RLS (no service-role
key), reads every table, writes `backups/ledger-<stamp>.json`, and inserts the
same payload into `ledger_snapshots`. It only ever READs the live tables. New
tables must be added here too or backups quietly lose them.

---

## 10. Tests

`npm test` (vitest, `vitest.config.mjs` mirrors the `@/` alias). Node
environment, no jsdom — `tests/helpers/callHook.js` exercises
`useBudgetSelectors` through a one-shot server render, which is enough because
the hook is `useMemo`/`useCallback` only.

| File | Guards |
|---|---|
| `tests/cashBalance.test.js` | `opening + netFlow = closing`, the cycle-to-cycle chain, back-dating and deletion re-deriving later cycles |
| `tests/cycles.test.js` | reset-day boundaries, Dec→Jan, leap February, reset day 1 and 28, no entry lost between cycles |
| `tests/ledgerTotals.test.js` | debit/refund/income classification, `netSpend` vs `netFlow`, source label surviving deletion |
| `tests/rollover.test.js` | carried vs rollover kept apart, both chains, the `base` vs `amount` double-count trap |
| `tests/demoData.test.js` | determinism, never seeds the future, both credit flavours present, the demo's own cash chain |

These are money calculations, so the suite is mutation-checked: breaking the
boundary comparison in `cashBalanceBefore`, dropping the opening-balance anchor,
reclassifying refunds as income, keying cycles by calendar month, or baking
rollover into `base` each make it fail. **If you change a financial rule and
nothing goes red, the test for it is missing — add it before shipping.**

---

## 11. Change checklist

- [ ] Read this file, and the files the change actually touches.
- [ ] Both sides of a two-sided feature updated (debit *and* credit).
- [ ] Both stores updated if the store contract changed.
- [ ] `lib/demoData.js` shows the new case.
- [ ] Migration written **and** mirrored into `schema.sql`.
- [ ] `scripts/backup-ledger.mjs` covers any new table/column.
- [ ] `npm test` green, and a new financial rule has a test that fails without it.
- [ ] `npm run build` clean.
- [ ] Verified on `/demo`, then on the real app.
