'use client';

import { useMemo, useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import {
  TrendingUp, TrendingDown, Wallet, CalendarDays, Flame, ArrowRight, Sparkles,
  Coins, Minus, CalendarClock,
} from 'lucide-react';
import Panel from '@/components/ui/Panel';
import Gauge from '@/components/ui/Gauge';
import MonthSwitcher from '@/components/ui/MonthSwitcher';
import MultiSelect from '@/components/ui/MultiSelect';
import { CategoryIcon } from '@/lib/icons';
import { useTheme } from '@/lib/ThemeContext';
import {
  formatINR, formatCompactINR, formatDateNice, sum, groupBy, getCategory,
  cycleEndDate, cycleLengthDays, cycleRangeLabel,
  cycleDateAtOffset, elapsedDaysInCycle, daysLeftInCycle, isCycleOpen, filterCycle,
  shiftMonth, lastMonthKeys, monthShortLabel, monthLabel, pctChange,
  DEFAULT_CYCLE_RESET_DAY,
} from '@/lib/utils';

const UNCAT_ID = '__uncategorized__';
const TREND_MONTHS = 6;

export default function Overview({ store, monthKey, setMonthKey, goTo }) {
  const { transactions, categories, budgetFor, settings } = store;
  const { theme } = useTheme();
  const resetDay = settings?.cycleResetDay ?? DEFAULT_CYCLE_RESET_DAY;

  const chartColors = theme === 'dark'
    ? { grid: '#1F2C45', axis: '#8A93A6', tooltipBg: '#121A2B', tooltipBorder: '#22314A', tooltipLabel: '#E8ECF3', cursor: 'rgba(242,169,59,0.08)', muted: '#2C3A54' }
    : { grid: '#DEE2E9', axis: '#79839A', tooltipBg: '#FFFFFF', tooltipBorder: '#DEE2E9', tooltipLabel: '#1B2333', cursor: 'rgba(180,108,8,0.06)', muted: '#C8CEDA' };

  // Category options shared by both filters — "Uncategorized" only when it applies.
  const catOptions = useMemo(() => {
    const opts = categories.map((c) => ({ id: c.id, name: c.name, color: c.color }));
    if (transactions.some((t) => !t.categoryId)) {
      opts.push({ id: UNCAT_ID, name: 'Uncategorized', color: '#8A93A6' });
    }
    return opts;
  }, [categories, transactions]);

  const [splitFilter, setSplitFilter] = useState([]);   // "Where it went"
  const [trendFilter, setTrendFilter] = useState([]);   // "Month on month"

  // Everything below is scoped to the *cycle*, not the calendar month.
  const monthTx = useMemo(
    () => filterCycle(transactions, monthKey, resetDay),
    [transactions, monthKey, resetDay]
  );

  const totalSpent = sum(monthTx, (t) => t.amount);
  const totalBudget = sum(categories, (c) => budgetFor(monthKey, c.id));
  const remaining = totalBudget - totalSpent;

  // ── Cycle maths ─────────────────────────────────────────────────────
  // The window is [resetDay of this month, resetDay of next month), so every
  // figure below counts days of the cycle rather than days of the month.
  const cycleDays = cycleLengthDays(monthKey, resetDay);
  const cycleEnd = cycleEndDate(monthKey, resetDay);
  const cycleOpen = isCycleOpen(monthKey, resetDay);
  const elapsed = elapsedDaysInCycle(monthKey, resetDay);
  const daysElapsed = Math.max(elapsed, 1);
  const daysLeft = daysLeftInCycle(monthKey, resetDay);
  const dailyAvg = totalSpent / daysElapsed;
  // What is still spendable per day without breaking the allocation.
  const leftPerDay = daysLeft > 0 ? remaining / daysLeft : null;
  const projected = cycleOpen ? dailyAvg * cycleDays : totalSpent;
  const pct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  // ── Cycle-over-cycle ────────────────────────────────────────────────
  const prevMonthKey = shiftMonth(monthKey, -1);
  const prevMonthTx = useMemo(
    () => filterCycle(transactions, prevMonthKey, resetDay),
    [transactions, prevMonthKey, resetDay]
  );
  const prevTotal = sum(prevMonthTx, (t) => t.amount);
  const fullDelta = totalSpent - prevTotal;
  const fullPct = pctChange(totalSpent, prevTotal);

  // Like-for-like: the same number of days *into the cycle*, so a cycle still
  // running is only ever compared against the same stretch of the last one.
  // Cycles differ in length (28–31 days), so this counts by day offset from
  // each cycle's own start date, not by day-of-month.
  const prevSameSpan = useMemo(() => {
    const cutoff = cycleDateAtOffset(prevMonthKey, resetDay, elapsed); // exclusive
    return sum(prevMonthTx.filter((t) => t.date < cutoff), (t) => t.amount);
  }, [prevMonthTx, prevMonthKey, resetDay, elapsed]);
  const prevSameSpanDate = cycleDateAtOffset(prevMonthKey, resetDay, Math.max(elapsed - 1, 0));
  const paceDelta = totalSpent - prevSameSpan;
  const pacePct = pctChange(totalSpent, prevSameSpan);
  const partialCycle = cycleOpen && elapsed < cycleDays;

  // While a cycle is mid-flight the headline is the like-for-like number —
  // comparing 26 days against a full 31 would always read as an improvement.
  const momDelta = partialCycle ? paceDelta : fullDelta;
  const momPct = partialCycle ? pacePct : fullPct;
  const momBaseline = partialCycle ? prevSameSpan : prevTotal;

  const movers = useMemo(() => {
    // Movers follow the same like-for-like rule as the headline.
    const cutoff = cycleDateAtOffset(prevMonthKey, resetDay, elapsed);
    const baseline = partialCycle ? prevMonthTx.filter((t) => t.date < cutoff) : prevMonthTx;
    const now = groupBy(monthTx, (t) => t.categoryId || UNCAT_ID);
    const before = groupBy(baseline, (t) => t.categoryId || UNCAT_ID);
    const ids = new Set([...Object.keys(now), ...Object.keys(before)]);
    return [...ids]
      .map((id) => {
        const cat = id === UNCAT_ID
          ? { id: UNCAT_ID, name: 'Uncategorized', color: '#8A93A6', icon: 'MoreHorizontal' }
          : getCategory(categories, id);
        const current = sum(now[id] || [], (t) => t.amount);
        const previous = sum(before[id] || [], (t) => t.amount);
        return { ...cat, id, current, previous, delta: current - previous };
      })
      .filter((m) => m.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [monthTx, prevMonthTx, prevMonthKey, resetDay, elapsed, partialCycle, categories]);

  // ── "Where it went" (multi-select filtered) ─────────────────────────
  const byCategory = useMemo(() => {
    const grouped = groupBy(monthTx, (t) => t.categoryId || UNCAT_ID);
    const rows = categories.map((c) => ({
      ...c,
      spent: sum(grouped[c.id] || [], (t) => t.amount),
      budget: budgetFor(monthKey, c.id),
    }));
    const uncat = sum(grouped[UNCAT_ID] || [], (t) => t.amount);
    if (uncat > 0) {
      rows.push({ id: UNCAT_ID, name: 'Uncategorized', color: '#8A93A6', icon: 'MoreHorizontal', spent: uncat, budget: 0 });
    }
    return rows
      .filter((c) => c.spent > 0 || c.budget > 0)
      .sort((a, b) => b.spent - a.spent);
  }, [monthTx, categories, budgetFor, monthKey]);

  const splitRows = useMemo(
    () => byCategory.filter((c) => splitFilter.length === 0 || splitFilter.includes(c.id)),
    [byCategory, splitFilter]
  );
  const pieData = splitRows.filter((c) => c.spent > 0).map((c) => ({ name: c.name, value: c.spent, color: c.color }));
  const pieTotal = sum(pieData, (d) => d.value);

  // ── Month-to-month trend (multi-select filtered) ────────────────────
  const trendData = useMemo(() => {
    const matches = (t) => trendFilter.length === 0 || trendFilter.includes(t.categoryId || UNCAT_ID);
    return lastMonthKeys(monthKey, TREND_MONTHS).map((mk) => ({
      monthKey: mk,
      label: monthShortLabel(mk),
      amount: sum(filterCycle(transactions, mk, resetDay).filter(matches), (t) => t.amount),
    }));
  }, [transactions, monthKey, trendFilter, resetDay]);

  // One bar per day of the cycle, labelled by its real calendar date.
  const dailySeries = useMemo(() => {
    const grouped = groupBy(monthTx, (t) => t.date);
    return Array.from({ length: cycleDays }, (_, i) => {
      const date = cycleDateAtOffset(monthKey, resetDay, i);
      return { day: Number(date.slice(8, 10)), date, amount: sum(grouped[date] || [], (t) => t.amount) };
    });
  }, [monthTx, monthKey, resetDay, cycleDays]);

  const trendAvg = trendData.length ? sum(trendData, (d) => d.amount) / trendData.length : 0;
  const trendHasData = trendData.some((d) => d.amount > 0);

  const topCategory = byCategory[0];
  const recent = monthTx.slice(0, 5);

  return (
    <div className="space-y-5 animate-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-paper-500 font-mono mb-1">overview</div>
          <h1 className="font-display text-2xl font-semibold text-paper-100">Monthly cockpit</h1>
        </div>
        <MonthSwitcher monthKey={monthKey} onChange={setMonthKey} resetDay={resetDay} />
      </div>

      {/* Cycle banner */}
      <div className="flex items-center gap-2 rounded-xl border border-ink-border bg-ink-850/50 px-3.5 py-2 text-[11px] font-mono text-paper-500">
        <CalendarClock size={12} className="text-signal-blue shrink-0" />
        <span className="min-w-0 truncate">
          {monthLabel(monthKey)} cycle ·{' '}
          <span className="text-paper-100">{cycleRangeLabel(monthKey, resetDay)}</span> ({cycleDays} days) ·
          resets <span className="text-paper-100">{formatDateNice(cycleEnd)}</span>
          {cycleOpen && <> · <span className="text-paper-100">day {elapsed} of {cycleDays}, {daysLeft} left</span></>}
        </span>
        <button onClick={() => goTo('settings')} className="ml-auto text-signal-amber hover:text-amber-300 shrink-0">
          change
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
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
          sub={remaining < 0 ? 'over allocated budget' : cycleOpen ? `${daysLeft} day(s) to reset` : 'cycle closed'}
          accent={remaining < 0 ? 'red' : 'green'}
        />
        <Kpi
          icon={Flame}
          label="Daily average"
          value={formatINR(dailyAvg)}
          sub={`across ${daysElapsed} day(s) of this cycle`}
          accent="blue"
        />
        <Kpi
          icon={Coins}
          label="Avg left / day"
          value={leftPerDay === null ? '—' : formatINR(Math.max(leftPerDay, 0))}
          sub={
            leftPerDay === null
              ? 'cycle already reset'
              : leftPerDay < 0
                ? `${formatINR(Math.abs(remaining))} over with ${daysLeft} day(s) to go`
                : `over the next ${daysLeft} day(s)`
          }
          accent={leftPerDay === null ? 'violet' : leftPerDay < 0 ? 'red' : leftPerDay < dailyAvg ? 'amber' : 'green'}
        />
        <Kpi
          icon={CalendarDays}
          label={cycleOpen ? 'Projected at reset' : 'Cycle total'}
          value={cycleOpen ? formatINR(projected) : formatINR(totalSpent)}
          sub={
            cycleOpen
              ? `${formatDateNice(cycleEnd)} · ${projected > totalBudget && totalBudget > 0 ? 'trending over budget' : 'trending on track'}`
              : `closed · ${cycleDays} day cycle`
          }
          accent={cycleOpen && projected > totalBudget && totalBudget > 0 ? 'red' : 'violet'}
        />
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        {/* Category breakdown */}
        <Panel
          title="Where it went"
          eyebrow={splitFilter.length > 0 ? `${splitFilter.length} of ${byCategory.length} categories` : 'category split'}
          className="lg:col-span-2"
          action={
            <MultiSelect
              options={catOptions}
              selected={splitFilter}
              onChange={setSplitFilter}
              label="Categories"
              allLabel="All categories"
            />
          }
        >
          {pieData.length === 0 ? (
            <EmptyChart label={splitFilter.length > 0 ? 'No spends in the selected categories' : 'No spends logged yet this cycle'} />
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
                  <span className="font-mono text-[13px] text-paper-100 font-semibold">{formatCompactINR(pieTotal)}</span>
                  {splitFilter.length > 0 && totalSpent > 0 && (
                    <span className="font-mono text-[9px] text-paper-500 mt-0.5">
                      {Math.round((pieTotal / totalSpent) * 100)}% of spend
                    </span>
                  )}
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
                {pieData.length > 6 && (
                  <div className="text-[10px] font-mono text-paper-600 pt-0.5">+{pieData.length - 6} more</div>
                )}
              </div>
            </div>
          )}
        </Panel>

        {/* Daily trend */}
        <Panel title="Daily rhythm" eyebrow={`${cycleRangeLabel(monthKey, resetDay)} · ${cycleDays} days`} className="lg:col-span-3">
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
                  labelFormatter={(_d, payload) => (payload?.[0] ? formatDateNice(payload[0].payload.date) : '')}
                />
                <Bar dataKey="amount" radius={[3, 3, 0, 0]} fill="#F2A93B" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        {/* Month-to-month spending */}
        <Panel
          title="Cycle on cycle"
          eyebrow={`last ${TREND_MONTHS} cycles`}
          className="lg:col-span-3"
          action={
            <MultiSelect
              options={catOptions}
              selected={trendFilter}
              onChange={setTrendFilter}
              label="Categories"
              allLabel="All categories"
            />
          }
        >
          {!trendHasData ? (
            <EmptyChart label={trendFilter.length > 0 ? 'Nothing spent in these categories yet' : 'Not enough history yet'} />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={172}>
                <BarChart data={trendData} barCategoryGap="28%">
                  <CartesianGrid strokeDasharray="3 6" stroke={chartColors.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: chartColors.axis, fontSize: 10 }} axisLine={{ stroke: chartColors.tooltipBorder }} tickLine={false} />
                  <YAxis tick={{ fill: chartColors.axis, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompactINR(v)} width={44} />
                  <Tooltip
                    cursor={{ fill: chartColors.cursor }}
                    contentStyle={{ background: chartColors.tooltipBg, border: `1px solid ${chartColors.tooltipBorder}`, borderRadius: 10, fontSize: 12 }}
                    formatter={(v) => formatINR(v)}
                  />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                    {trendData.map((d) => (
                      <Cell
                        key={d.monthKey}
                        fill={d.monthKey === monthKey ? '#F2A93B' : chartColors.muted}
                        cursor="pointer"
                        onClick={() => setMonthKey(d.monthKey)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-between text-[10px] font-mono text-paper-500 mt-2 pt-2 border-t border-ink-border">
                <span>{TREND_MONTHS}-cycle average {formatINR(trendAvg)}</span>
                <span className="hidden sm:inline">tap a bar to jump to that cycle</span>
              </div>
            </>
          )}
        </Panel>

        {/* Versus last month */}
        <Panel
          title="Versus last cycle"
          eyebrow={partialCycle ? `same ${elapsed} day(s) of ${monthShortLabel(prevMonthKey)}` : monthShortLabel(prevMonthKey)}
          className="lg:col-span-2"
        >
          {prevTotal === 0 && totalSpent === 0 ? (
            <EmptyChart label="No spend to compare yet" />
          ) : (
            <div className="space-y-3">
              <DeltaHeadline
                delta={momDelta}
                pctVal={momPct}
                baseline={momBaseline}
                partial={partialCycle}
                days={elapsed}
              />

              {partialCycle && (
                <div className="rounded-xl border border-ink-border bg-ink-850/60 px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-wide text-paper-500 font-mono mb-1">
                    matched to {formatDateNice(prevSameSpanDate)} last cycle
                  </div>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-mono text-sm text-paper-300">
                      {formatINR(totalSpent)} <span className="text-paper-600">vs</span> {formatINR(prevSameSpan)}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-paper-500 mt-1.5 pt-1.5 border-t border-ink-border">
                    that whole cycle finished at {formatCompactINR(prevTotal)}
                    {fullPct !== null && <> · you are at {formatCompactINR(totalSpent)} so far</>}
                  </div>
                </div>
              )}

              {movers.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-paper-500 font-mono mb-1.5">
                    biggest movers{partialCycle ? ' · like-for-like' : ''}
                  </div>
                  <div className="space-y-1.5">
                    {movers.slice(0, 4).map((m) => (
                      <div key={m.id} className="flex items-center gap-2 text-xs">
                        <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: `${m.color}22` }}>
                          <CategoryIcon name={m.icon} size={11} style={{ color: m.color }} />
                        </span>
                        <span className="text-paper-300 truncate flex-1">{m.name}</span>
                        <span className={`font-mono ${m.delta > 0 ? 'text-signal-red' : 'text-signal-green'}`}>
                          {m.delta > 0 ? '+' : '−'}{formatCompactINR(Math.abs(m.delta))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
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
                const catPct = c.budget > 0 ? (c.spent / c.budget) * 100 : c.spent > 0 ? 100 : 0;
                return (
                  <div key={c.id} className="flex items-center gap-3 rounded-xl border border-ink-border bg-ink-850/60 px-3 py-2.5">
                    <Gauge percent={catPct} size={44} stroke={5} color={c.color} />
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
                  <span className="text-paper-100 font-medium">{topCategory.name}</span> is your top spend this cycle at{' '}
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

function DeltaHeadline({ delta, pctVal, baseline, partial, days }) {
  const up = delta > 0;
  const flat = delta === 0;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const tone = flat ? 'text-paper-300' : up ? 'text-signal-red' : 'text-signal-green';
  return (
    <div className="flex items-start gap-2.5">
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${flat ? 'bg-ink-700' : up ? 'bg-signal-red/12' : 'bg-signal-green/12'}`}>
        <Icon size={17} className={tone} strokeWidth={2.2} />
      </span>
      <div className="min-w-0">
        <div className={`font-display text-xl font-semibold ${tone}`}>
          {flat ? 'No change' : `${up ? '+' : '−'}${formatINR(Math.abs(delta))}`}
        </div>
        <div className="text-[11px] text-paper-500 font-mono mt-0.5">
          {pctVal === null
            ? `nothing spent in ${partial ? `the first ${days} day(s) of ` : ''}the last cycle`
            : flat
              ? `same as ${formatCompactINR(baseline)}${partial ? ` by day ${days}` : ''} last cycle`
              : `${pctVal > 0 ? '+' : ''}${pctVal.toFixed(0)}% ${up ? 'more' : 'less'} than ${formatCompactINR(baseline)}${partial ? ` by day ${days}` : ''}`}
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
        <div className="flex items-center justify-between mb-2.5 gap-1">
          <span className="text-[10px] uppercase tracking-wide text-paper-500 font-mono truncate">{label}</span>
          <Icon size={14} className={`${colors[accent]} shrink-0`} />
        </div>
        <div className="font-display text-base sm:text-lg xl:text-xl font-semibold text-paper-100 truncate">{value}</div>
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
