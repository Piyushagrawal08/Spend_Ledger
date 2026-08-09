'use client';

import { useState } from 'react';
import { LayoutGrid, PlusCircle, ListChecks, PieChart, Tags, Settings as SettingsIcon, Gauge as GaugeIcon } from 'lucide-react';
import { useFinanceStore } from '@/lib/useFinanceStore';
import { currentMonthKey } from '@/lib/utils';
import { ToastProvider } from '@/components/ui/Toast';
import ThemeToggle from '@/components/ui/ThemeToggle';

import Overview from '@/components/views/Overview';
import AddExpense from '@/components/views/AddExpense';
import Transactions from '@/components/views/Transactions';
import Budgets from '@/components/views/Budgets';
import Categories from '@/components/views/Categories';
import SettingsView from '@/components/views/SettingsView';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'add', label: 'Add spend', icon: PlusCircle },
  { id: 'transactions', label: 'Ledger', icon: ListChecks },
  { id: 'budgets', label: 'Budgets', icon: PieChart },
  { id: 'categories', label: 'Categories', icon: Tags },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

function AppInner() {
  const [tab, setTab] = useState('add');
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const store = useFinanceStore();

  if (!store.hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-paper-500 font-mono text-sm">
          <GaugeIcon size={16} className="animate-pulse text-signal-amber" />
          booting ledger…
        </div>
      </div>
    );
  }

  if (!store.userId) {
    if (typeof window !== 'undefined') window.location.href = '/login';
    return null;
  }

  const viewProps = { store, monthKey, setMonthKey, goTo: setTab };

  return (
    <div className="min-h-screen flex">
      {/* Desktop sidebar */}
      <aside className="hidden sm:flex w-60 flex-col border-r border-ink-border bg-ink-800/60 shrink-0 sticky top-0 h-screen">
        <div className="px-6 py-6 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-signal-amber to-signal-amberDim flex items-center justify-center">
            <GaugeIcon size={16} className="text-ink-950" strokeWidth={2.5} />
          </div>
          <div>
            <div className="font-display font-semibold text-paper-100 text-[15px] leading-none">SpendLedger</div>
            <div className="text-[10px] text-paper-500 font-mono mt-1">daily spend cockpit</div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                  active
                    ? 'bg-ink-700 text-signal-amber font-medium'
                    : 'text-paper-300 hover:bg-ink-800 hover:text-paper-100'
                }`}
              >
                <Icon size={17} strokeWidth={active ? 2.4 : 2} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t border-ink-border space-y-1">
          <ThemeToggle />
          <div className="px-3 pt-2 text-[10px] font-mono text-paper-500 truncate">
            {store.userEmail || 'signed in'}
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sm:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-14 bg-ink-800/90 backdrop-blur border-b border-ink-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-signal-amber to-signal-amberDim flex items-center justify-center">
            <GaugeIcon size={14} className="text-ink-950" strokeWidth={2.5} />
          </div>
          <span className="font-display font-semibold text-sm text-paper-100">SpendLedger</span>
        </div>
        <ThemeToggle compact />
      </header>

      {/* Main content */}
      <main className="flex-1 min-w-0 pt-16 sm:pt-0 pb-24 sm:pb-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
          {tab === 'overview' && <Overview {...viewProps} />}
          {tab === 'add' && <AddExpense {...viewProps} />}
          {tab === 'transactions' && <Transactions {...viewProps} />}
          {tab === 'budgets' && <Budgets {...viewProps} />}
          {tab === 'categories' && <Categories {...viewProps} />}
          {tab === 'settings' && <SettingsView {...viewProps} />}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-ink-800/95 backdrop-blur border-t border-ink-border px-2 py-1.5 flex items-center justify-between">
        {NAV_ITEMS.filter((i) => i.id !== 'settings').map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          const isAdd = item.id === 'add';
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-lg"
            >
              {isAdd ? (
                <div className={`w-10 h-10 -mt-4 rounded-full flex items-center justify-center shadow-lg ${active ? 'bg-signal-amber' : 'bg-signal-amber/90'}`}>
                  <Icon size={20} className="text-ink-950" strokeWidth={2.4} />
                </div>
              ) : (
                <Icon size={19} className={active ? 'text-signal-amber' : 'text-paper-500'} strokeWidth={active ? 2.4 : 2} />
              )}
              <span className={`text-[9.5px] font-mono ${active ? 'text-signal-amber' : 'text-paper-500'}`}>{item.label.split(' ')[0]}</span>
            </button>
          );
        })}
        <button onClick={() => setTab('settings')} className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5">
          <SettingsIcon size={19} className={tab === 'settings' ? 'text-signal-amber' : 'text-paper-500'} strokeWidth={tab === 'settings' ? 2.4 : 2} />
          <span className={`text-[9.5px] font-mono ${tab === 'settings' ? 'text-signal-amber' : 'text-paper-500'}`}>Settings</span>
        </button>
      </nav>
    </div>
  );
}

export default function AppShell() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}
