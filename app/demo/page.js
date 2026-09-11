'use client';

import { FlaskConical, RotateCcw } from 'lucide-react';
import { AppShellWithStore } from '@/components/AppShell';
import { useDemoStore } from '@/lib/useDemoStore';

/**
 * /demo — the review screen.
 *
 * The real app's UI, driven by an in-memory store seeded with fabricated data.
 * No login, no Supabase client, no network call: it renders whether or not
 * .env.local holds real credentials, and nothing done here can reach the live
 * ledger. Edits work and persist until you reload, so a change can actually be
 * clicked through rather than just looked at.
 */
export default function DemoPage() {
  const store = useDemoStore();

  return (
    <AppShellWithStore
      store={store}
      banner={
        <div className="sticky top-0 z-30 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-signal-violet/30 bg-signal-violet/12 px-4 sm:px-8 py-2 backdrop-blur">
          <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-signal-violet">
            <FlaskConical size={12} strokeWidth={2.4} />
            demo
          </span>
          <span className="text-[11px] text-paper-300 min-w-0">
            Fabricated data, no login.{' '}
            <span className="text-paper-500">
              Nothing here touches your real ledger — edits reset on reload.
            </span>
          </span>
          <button
            onClick={store.resetDemo}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-signal-violet/40 px-2.5 py-1 text-[11px] font-mono text-signal-violet hover:bg-signal-violet/12 transition-colors"
          >
            <RotateCcw size={11} /> reset
          </button>
        </div>
      }
    />
  );
}
