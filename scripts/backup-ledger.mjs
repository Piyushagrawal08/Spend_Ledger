#!/usr/bin/env node
/**
 * Writes a timestamped copy of your ledger into ./backups and stores the same
 * snapshot in Supabase, so the backup exists both in this folder and on the web.
 *
 *   npm run backup
 *   npm run backup -- --label "before cleanup"
 *   npm run backup -- --local-only        # skip the Supabase copy
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY from
 * .env.local, plus SPENDLEDGER_EMAIL / SPENDLEDGER_PASSWORD to sign in.
 * It authenticates as you and goes through row-level security exactly like the
 * app does — no service-role key, and it only ever READS your live tables.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BACKUP_DIR = resolve(ROOT, 'backups');

function loadEnvLocal() {
  const file = resolve(ROOT, '.env.local');
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : process.argv[i + 1] ?? '';
}

async function prompt(question, { silent = false } = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (silent) {
    // Suppress echo while a password is typed.
    const onData = (char) => {
      if (char.toString() === '\n' || char.toString() === '\r') return;
      rl.output.write('\x1b[2K\x1b[200D' + question + '*'.repeat(rl.line.length));
    };
    rl.input.on('data', onData);
    const answer = await rl.question(question);
    rl.input.off('data', onData);
    rl.output.write('\n');
    rl.close();
    return answer;
  }
  const answer = await rl.question(question);
  rl.close();
  return answer;
}

function fail(message) {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

async function main() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    fail('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in .env.local');
  }

  const localOnly = process.argv.includes('--local-only');
  const label = arg('label') ?? '';

  const email = process.env.SPENDLEDGER_EMAIL || (await prompt('  Supabase account email: '));
  const password = process.env.SPENDLEDGER_PASSWORD || (await prompt('  Password: ', { silent: true }));
  if (!email || !password) fail('An email and password are required to sign in.');

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log('\n  → signing in…');
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) {
    fail(
      `Sign-in failed: ${authError.message}\n` +
      '    If you only ever used the emailed code, set a password first:\n' +
      '    sign in on the web app, then use Supabase Auth to add one.'
    );
  }

  console.log('  → reading ledger (read-only)…');
  const [cats, txs, buds, tots, sett] = await Promise.all([
    supabase.from('categories').select('*').order('created_at', { ascending: true }),
    supabase.from('transactions').select('*').order('date', { ascending: false }),
    supabase.from('budgets').select('*'),
    supabase.from('monthly_totals').select('*'),
    supabase.from('user_settings').select('*').maybeSingle(),
  ]);

  for (const [name, res] of [['categories', cats], ['transactions', txs], ['budgets', buds], ['monthly_totals', tots]]) {
    if (res.error) fail(`Could not read ${name}: ${res.error.message}`);
  }

  const transactions = (txs.data || []).map((r) => ({
    id: r.id,
    amount: Number(r.amount),
    categoryId: r.category_id,
    date: r.date,
    note: r.note || '',
    method: r.method || 'UPI',
  }));

  const categories = (cats.data || []).map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    icon: r.icon,
    defaultBudget: Number(r.default_budget) || 0,
  }));

  const budgets = {};
  for (const b of buds.data || []) {
    budgets[b.month_key] = budgets[b.month_key] || {};
    budgets[b.month_key][b.category_id] = Number(b.amount);
  }

  const totals = {};
  for (const t of tots.data || []) totals[t.month_key] = Number(t.amount);

  const payload = {
    version: 1,
    capturedAt: new Date().toISOString(),
    categories,
    transactions,
    budgets,
    totals,
    settings: sett.data
      ? {
          monthlyIncome: Number(sett.data.monthly_income) || 0,
          currency: sett.data.currency || 'INR',
          carryForward: !!sett.data.carry_forward,
          cycleResetDay: Number(sett.data.cycle_reset_day) || 7,
        }
      : null,
  };

  const totalAmount = transactions.reduce((s, t) => s + t.amount, 0);

  // 1. The copy in this folder.
  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = payload.capturedAt.replace(/[:.]/g, '-').slice(0, 19);
  const file = resolve(BACKUP_DIR, `ledger-${stamp}.json`);
  writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`  ✓ folder backup  ${file.replace(ROOT, '.')}`);

  // 2. The copy on the web — append-only, so it can never be rewritten later.
  if (localOnly) {
    console.log('  · skipped the Supabase copy (--local-only)');
  } else {
    const { error } = await supabase.from('ledger_snapshots').insert({
      user_id: auth.user.id,
      label: label.trim(),
      source: 'script',
      payload,
      tx_count: transactions.length,
      total_amount: totalAmount,
    });
    if (error) {
      console.warn(`  ! could not store the web snapshot: ${error.message}`);
      console.warn('    (run the ledger_snapshots migration in supabase/schema.sql)');
      console.warn('    the folder backup above was still written.');
    } else {
      console.log('  ✓ web snapshot   stored in ledger_snapshots (read-only, immutable)');
    }
  }

  await supabase.auth.signOut();
  console.log(`\n  ${transactions.length} entries · ₹${totalAmount.toLocaleString('en-IN')} archived. Live ledger untouched.\n`);
}

main().catch((e) => fail(e?.message || String(e)));
