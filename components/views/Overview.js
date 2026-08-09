'use client';

import { useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { TrendingUp, Wallet, CalendarDays, Flame, ArrowRight, Sparkles } from 'lucide-react';
import Panel from '@/components/ui/Panel';
import Gauge from '@/components/ui/Gauge';
import MonthSwitcher from '@/components/ui/MonthSwitcher';
import { CategoryIcon } from '@/lib/icons';
import { useTheme } from '@/lib/ThemeContext';
import {
  formatINR, formatCompactINR, formatDateNice, sum, groupBy, getCategory,
  daysInMonth, elapsedDaysInMonth, isCurrentMonth, dayOfMonth,
} from '@/lib/utils';

export default function Overview({ store, monthKey, setMonthKey, goTo }) {
  const { transactions, categories, budgetFor } = store;
  const { theme } = useTheme();
  const chartColors = theme === 'dark'
    ? { grid: '#1F2C45', axis: '#8A93A6', tooltipBg: '#121A2B', tooltipBorder: '#22314A', tooltipLabel: '#E8ECF3', cursor: 'rgba(242,169,59,0.08)' }
    : { grid: '#DEE2E9', axis: '#79839A', tooltipBg: '#FFFFFF', tooltipBorder: '#DEE2E9', tooltipLabel: '#1B2333', cursor: 'rgba(180,108,8,0.06)' };

  const monthTx = useMemo(
    () => transactions.filter((t) => t.date.startsWith(monthKey)),
    [transactions, monthKey]
  );

  const totalSpent = sum(monthTx, (t) => t.amount);
  const totalBudget = sum(categories, (c) => budgetFor(monthKey, c.id));
  const remaining = totalBudget - totalSpent;
  const daysTotal = daysInMonth(monthKey);
  const daysElapsed = Math.max(elapsedDaysInMonth(monthKey), 1);
  const daysLeft = Math.max(daysTotal - daysElapsed, 0);
  const dailyAvg = totalSpent / daysElapsed;
  const projected = isCurrentMonth(monthKey) ? dailyAvg * daysTotal : totalSpent;
  const pct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  const byCategory = useMemo(() => {
    const grouped = groupBy(monthTx, (t) => t.categoryId);
    return categories
      .map((c) => ({
        ...c,
        spent: sum(grouped[c.id] || [], (t) => t.amount),
        budget: budgetFor(monthKey, c.id),
      }))
      .filter((c) => c.spent > 0 || c.budget > 0)
      .sort((a, b) => b.spent - a.spent);
  }, [monthTx, categories, budgetFor, monthKey]);

  const pieData = byCategory.filter((c) => c.spent > 0).map((c) => ({ name: c.name, value: c.spent, color: c.color }));

  const dailySeries = useMemo(() => {
    const grouped = groupBy(monthTx, (t) => dayOfMonth(t.date));
    return Array.from({ length: daysTotal }, (_, i) => {
      const d = i + 1;
      return { day: d, amount: sum(grouped[d] || [], (t) => t.amount) };
    });
  }, [monthTx, daysTotal]);

  const topCategory = byCategory[0];
  const recent = monthTx.slice(0, 5);

  return (
    <div className="space-y-5 animate-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-paper-500 font-mono mb-1">overview</div>
          <h1 className="font-display text-2xl font-semibold text-paper-100">Monthly cockpit</h1>
        </div>
        <MonthSwitcher monthKey={monthKey} onChange={setMonthKey} />
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          icon={Wallet}
          label="Total spent"
          value={formatINR(totalSpent)}
          sub={totalBudget > 0 ? `of ${formatINR(totalBudget)} allocated` : 'no budget set'}
          accent={pct > 100 ? 'red' : 'amber'}
        />
        <Kpi
          icon={TrendingUp}
          label="Remaining balance"
          value={formatINR(remaining)}
          sub={remaining < 0 ? 'over allocated budget' : `${daysLeft} day(s) left`}
          accent={remaining < 0 ? 'red' : 'green'}
        />
        <Kpi
          icon={Flame}
          label="Daily average"
          value={formatINR(dailyAvg)}
          sub={`across ${daysElapsed} day(s)`}
          accent="blue"
        />
        <Kpi
          icon={CalendarDays}
          label={isCurrentMonth(monthKey) ? 'Projected month-end' : 'Days in month'}
          value={isCurrentMonth(monthKey) ? formatINR(projected) : String(daysTotal)}
          sub={isCurrentMonth(monthKey) ? (projected > totalBudget && totalBudget > 0 ? 'trending over budget' : 'trending on track') : 'closed month'}
          accent={isCurrentMonth(monthKey) && projected > totalBudget && totalBudget > 0 ? 'red' : 'violet'}
        />
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        {/* Category breakdown */}
        <Panel title="Where it went" eyebrow="category split" className="lg:col-span-2">
          {pieData.length === 0 ? (
            <EmptyChart label="No spends logged yet this month" />
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-[130px] h-[130px] shrink-0 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" innerRadius={38} outerRadius={62} paddingAngle={2} stroke="none">
                      {pieData.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: chartColors.tooltipBg, border: `1px solid ${chartColors.tooltipBorder}`, borderRadius: 10, fontSize: 12 }}
                      formatter={(v) => formatINR(v)}
                      labelStyle={{ color: chartColors.tooltipLabel }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="font-mono text-[13px] text-paper-100 font-semibold">{formatCompactINR(totalSpent)}</span>
                </div>
              </div>
              <div className="flex-1 space-y-1.5 min-w-0">
                {pieData.slice(0, 6).map((d) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="text-paper-300 truncate flex-1">{d.name}</span>
                    <span className="text-paper-100 font-mono">{formatCompactINR(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>

        {/* Daily trend */}
        <Panel title="Daily rhythm" eyebrow={`${daysTotal}-day trend`} className="lg:col-span-3">
          {monthTx.length === 0 ? (
            <EmptyChart label="Log a spend to see your daily trend" />
          ) : (
            <ResponsiveContainer width="100%" height={168}>
              <BarChart data={dailySeries} barCategoryGap={2}>
                <CartesianGrid strokeDasharray="3 6" stroke={chartColors.grid} vertical={false} />
                <XAxis dataKey="day" tick={{ fill: chartColors.axis, fontSize: 10 }} axisLine={{ stroke: chartColors.tooltipBorder }} tickLine={false} interval={2} />
                <YAxis tick={{ fill: chartColors.axis, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompactINR(v)} width={44} />
                <Tooltip
                  cursor={{ fill: chartColors.cursor }}
                  contentStyle={{ background: chartColors.tooltipBg, border: `1px solid ${chartColors.tooltipBorder}`, borderRadius: 10, fontSize: 12 }}
                  formatter={(v) => formatINR(v)}
                  labelFormatter={(d) => `Day ${d}`}
                />
                <Bar dataKey="amount" radius={[3, 3, 0, 0]} fill="#F2A93B" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        {/* Budget gauges */}
        <Panel
          title="Budget status"
          eyebrow="allocation vs actual"
          className="lg:col-span-3"
          action={
            <button onClick={() => goTo('budgets')} className="text-[11px] text-signal-amber hover:text-amber-300 flex items-center gap-1 font-mono">
              manage <ArrowRight size={12} />
            </button>
          }
        >
          {byCategory.length === 0 ? (
            <EmptyChart label="Set up category budgets to track progress" />
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {byCategory.slice(0, 6).map((c) => {
                const pct = c.budget > 0 ? (c.spent / c.budget) * 100 : c.spent > 0 ? 100 : 0;
                return (
                  <div key={c.id} className="flex items-center gap-3 rounded-xl border border-ink-border bg-ink-850/60 px-3 py-2.5">
                    <Gauge percent={pct} size={44} stroke={5} color={c.color} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-xs text-paper-100 font-medium truncate">
                        <CategoryIcon name={c.icon} size={12} style={{ color: c.color }} />
                        <span className="truncate">{c.name}</span>
                      </div>
                      <div className="text-[11px] font-mono text-paper-500 mt-0.5">
                        {formatCompactINR(c.spent)} <span className="text-paper-600">/ {formatCompactINR(c.budget)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {/* Recent transactions + insight */}
        <div className="lg:col-span-2 space-y-5">
          <Panel
            title="Recent entries"
            eyebrow="latest first"
            action={
              <button onClick={() => goTo('transactions')} className="text-[11px] text-signal-amber hover:text-amber-300 flex items-center gap-1 font-mono">
                ledger <ArrowRight size={12} />
              </button>
            }
          >
            {recent.length === 0 ? (
              <EmptyChart label="Nothing logged yet" small />
            ) : (
              <div className="space-y-2">
                {recent.map((t) => {
                  const cat = getCategory(categories, t.categoryId);
                  return (
                    <div key={t.id} className="flex items-center gap-2.5 text-xs">
                      <span className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${cat?.color}22` }}>
                        <CategoryIcon name={cat?.icon} size={12} style={{ color: cat?.color }} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-paper-100 truncate">{t.note || cat?.name}</div>
                        <div className="text-paper-500 font-mono text-[10px]">{formatDateNice(t.date)}</div>
                      </div>
                      <span className="font-mono text-paper-100">{formatINR(t.amount)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          {topCategory && (
            <Panel className="border-signal-amber/20">
              <div className="flex items-start gap-2.5">
                <Sparkles size={15} className="text-signal-amber mt-0.5 shrink-0" />
                <p className="text-xs text-paper-300 leading-relaxed">
                  <span className="text-paper-100 font-medium">{topCategory.name}</span> is your top spend this month at{' '}
                  <span className="font-mono text-paper-100">{formatINR(topCategory.spent)}</span>
                  {topCategory.budget > 0 && topCategory.spent > topCategory.budget && (
                    <> — <span className="text-signal-red">{formatINR(topCategory.spent - topCategory.budget)} over</span> its allocation.</>
                  )}
                </p>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, accent }) {
  const colors = {
    amber: 'text-signal-amber',
    green: 'text-signal-green',
    red: 'text-signal-red',
    blue: 'text-signal-blue',
    violet: 'text-signal-violet',
  };
  return (
    <Panel noPad>
      <div className="p-4">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] uppercase tracking-wide text-paper-500 font-mono">{label}</span>
          <Icon size={14} className={colors[accent]} />
        </div>
        <div className="font-display text-lg sm:text-xl font-semibold text-paper-100 truncate">{value}</div>
        <div className="text-[11px] text-paper-500 mt-1 truncate">{sub}</div>
      </div>
    </Panel>
  );
}

function EmptyChart({ label, small }) {
  return (
    <div className={`flex items-center justify-center text-center text-paper-500 text-xs font-mono ${small ? 'h-16' : 'h-40'}`}>
      {label}
    </div>
  );
}
