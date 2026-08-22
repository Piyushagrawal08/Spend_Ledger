# Backups

Timestamped copies of your ledger live here as `ledger-<timestamp>.json`.

## Create one

```bash
npm run backup
npm run backup -- --label "before cleanup"
npm run backup -- --local-only     # write the file, skip the web snapshot
```

The script signs in as you with your Supabase email and password, **reads**
your tables through row-level security, then writes two copies:

1. a JSON file in this folder, and
2. a row in `ledger_snapshots` on Supabase, visible under **Backups** in the app.

It never writes to `transactions`, `budgets`, `categories` or `user_settings`,
so running it cannot alter your live ledger.

To skip the prompts, add these to `.env.local` (which is gitignored):

```
SPENDLEDGER_EMAIL=you@example.com
SPENDLEDGER_PASSWORD=your-password
```

If you have only ever signed in with the emailed 6-digit code, set a password
for the account in the Supabase dashboard first (Authentication → Users).

## Why the JSON files are not committed

`.gitignore` excludes `backups/*.json`. `Spend_Ledger` is a public repository,
and these files contain every amount, note and date in your ledger. Only this
README is tracked. Keep the JSON files somewhere private if you want them
off-machine — the Supabase snapshot already gives you an off-machine copy.

## Restoring

There is deliberately no restore button in the app: a snapshot is an archive,
and the read-only viewer cannot write back to your live data. To restore, load
a JSON file yourself against Supabase, having first taken a fresh snapshot.
