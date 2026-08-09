# SpendLedger — Daily Finance Cockpit

A personal, daily-use finance dashboard with real accounts: sign in with an email OTP code or a password, and your categories, transactions, and budgets are stored privately in your own database — accessible from any device. Built with Next.js (App Router) + Tailwind + Recharts + Supabase (Auth + Postgres).

## Features

- **Accounts** — sign in via a 6-digit email OTP code (no password needed) or a traditional email + password. New accounts are created automatically the first time you sign in.
- **Per-user data** — every category, transaction, and budget is scoped to your account via Postgres Row Level Security; nobody else can read or write your rows, even with the same database.
- **Add spend (front page)** — the app opens straight into the quick daily-entry form, tuned for mobile: amount, category (icon grid), date, payment method, optional note.
- **Overview cockpit** — total spent this month, remaining balance, daily average, projected month-end total, category breakdown donut chart, daily spend bar chart, budget gauges, recent entries, and an auto-generated insight on your top spend category.
- **Ledger (Transactions)** — full searchable, filterable transaction history grouped by day with daily subtotals; inline edit and delete.
- **Budgets** — set one total monthly budget, then split it across categories: add a new category budget line or delete an existing one right from this screen, with a circular gauge + progress bar per category, and an "unallocated" figure.
- **Categories** — create, edit, and delete your own categories with custom color and icon; 11 sensible defaults are seeded automatically for every new account.
- **Dark / light mode** — toggle in the sidebar (desktop) or top bar (mobile); remembers your choice.
- **Settings** — account info + sign out, optional monthly income field, JSON/CSV export, and a way to clear your transactions & budgets without deleting your account.

## 1. Create your Supabase project

1. Go to https://supabase.com, sign in, and click **New project** (the free tier is enough for personal use).
2. Once it's created, open **SQL Editor** in the left sidebar, click **New query**, paste in the entire contents of `supabase/schema.sql` from this repo, and click **Run**.
   This creates all the tables, locks them down with Row Level Security so users can only ever see their own data, and sets up a trigger that automatically gives every new signup a starter set of 11 categories.
3. Go to **Project Settings → API**. You'll need two values from here in a moment: the **Project URL** and the **anon public** key.
4. (Recommended) Go to **Authentication → Providers → Email** and make sure "Email" is enabled. For the OTP flow to send a typeable 6-digit code (not just a magic link), open **Authentication → Email Templates → Magic Link** and confirm the template includes `{{ .Token }}` — Supabase's default template already does.

## 2. Configure environment variables

Copy `.env.local.example` to `.env.local` and fill in the two values from step 1.3:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

These are safe to expose to the browser — Supabase's Row Level Security is what actually protects the data, not secrecy of this key.

## 3. Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/login`. Sign up with either method, and you'll land on the Add Spend screen with your 11 starter categories ready to go.

## 4. Deploy to Vercel

**Via GitHub (recommended)**
1. Push this repo to GitHub (see below if you haven't already).
2. Go to https://vercel.com/new and import the repository.
3. Framework preset: Next.js (auto-detected).
4. Under **Environment Variables**, add the same two keys from step 2 (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
5. Click **Deploy**.

**Via Vercel CLI**
```bash
npm i -g vercel
vercel
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel --prod
```

One more thing in Supabase once you have your live URL: go to **Authentication → URL Configuration** and add your Vercel domain (e.g. `https://spendledger.vercel.app`) to **Site URL** and **Redirect URLs**, so email links and OTP flows work correctly in production.

## Project structure

```
app/                    Next.js App Router entry
app/login/page.js        Sign in / sign up page (email OTP + password)
app/auth/callback/route.js   Exchanges a magic-link code for a session
middleware.js             Refreshes the Supabase session + protects routes
components/AppShell.js    Navigation shell (sidebar/bottom nav) + view routing
components/views/         Overview, AddExpense, Transactions, Budgets, Categories, SettingsView
components/ui/            Reusable primitives: Panel, Gauge, Modal, MonthSwitcher, Toast, ThemeToggle
lib/supabase/client.js    Browser Supabase client
lib/supabase/server.js    Server-side Supabase client (Server Components, route handlers)
lib/useFinanceStore.js    Central state — reads/writes Supabase, exposes the same API to every view
lib/ThemeContext.js       Dark/light mode state
supabase/schema.sql       Run this once in the Supabase SQL editor to set up your database
```

## How the data model works

- `categories`, `transactions`, `budgets`, `monthly_totals`, `user_settings` — every table has a `user_id` column and a Row Level Security policy restricting all reads/writes to `auth.uid() = user_id`.
- When someone signs up, Supabase creates their `auth.users` row (that *is* their user ID — no separate ID system needed). A Postgres trigger (`on_auth_user_created` in `supabase/schema.sql`) fires immediately after and inserts their starter categories + a settings row, so every new user lands on a populated app rather than an empty one.
- Deleting a category doesn't delete its transactions — the foreign key is `ON DELETE SET NULL`, so those transactions become "Uncategorized" instead of disappearing.

## Pushing to GitHub

```bash
git init
git add .
git commit -m "SpendLedger with accounts"
git remote add origin https://github.com/yourusername/spendledger.git
git branch -M main
git push -u origin main
```

`.env.local` is already in `.gitignore`, so your Supabase keys won't be committed — set them in Vercel's dashboard instead (step 4 above).
