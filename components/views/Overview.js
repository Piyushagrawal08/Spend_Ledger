'use client';

import { useCallback, useMemo, useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import {
  TrendingUp, TrendingDown, Wallet, CalendarDays, Flame, ArrowRight, Sparkles,
  Coins, Minus, CalendarClock, ArrowDownLeft, SlidersHorizontal, X, Landmark,
} from 'lucide-react';
import Panel from '@/components/ui/Panel';
import Gauge from '@/components/ui/Gauge';
import MonthSwitcher from '@/components/ui/MonthSwitcher';
import MultiSelect from '@/components/ui/MultiSelect';
import { CategoryIcon } from '@/lib/icons';
import { useTheme } from '@/lib/ThemeContext';
import {
  formatINR, formatCompactINR, formatDateNice, sum, groupBy, getCategory,
  ledgerTotals, netSpend, netSpendByCategory, isCredit, isDebit, isIncome, getCreditSource,
  cycleCashSummary,
  cycleEndDate, cycleLengthDays, cycleRangeLabel,
  cycleDateAtOffset, elapsedDaysInCycle, daysLeftInCycle, isCycleOpen, filterCycle,
  shiftMonth, lastMonthKeys, monthShortLabel, monthLabel, pctChange,
  DEFAULT_CYCLE_RESET_DAY,
} from '@/lib/utils';

const UNCAT_ID = '__uncategorized__';
const TREND_MONTHS = 6;

export default function Overview({ store, monthKey, setMonthKey, goTo }) {
  const { transactions, categories, creditSources, budgetFor, budgetOriginFor, settings } = store;
  const { theme } = useTheme();
  const resetDay = settings?.cycleResetDay ?? DEFAULT_CYCLE_RESET_DAY;

  const chartColors = theme === 'dark'
    ? { grid: '#1F2C45', axis: '#8A93A6', tooltipBg: '#121A2B', tooltipBorder: '#22314A', tooltipLabel: '#E8ECF3', cursor: 'rgba(242,169,59,0.08)', muted: '#2C3A54' }
    : { grid: '#DEE2E9', axis: '#79839A', tooltipBg: '#FFFFFF', tooltipBorder: '#DEE2E9', tooltipLabel: '#1B2333', cursor: 'rgba(180,108,8,0.06)', muted: '#C8CEDA' };

  // Category options shared by both filters — "Uncategorized" only when it applies.
  const catOptions = useMemo(() => {
    const opts = categories.map((c) => ({ id: c.id, name: c.name, color: c.color }));
    if (transactions.some((t) => !t.categoryId && isDebit(t))) {
      opts.push({ id: UNCAT_ID, name: 'Uncategorized', color: '#8A93A6' });
    }
    return opts;
  }, [categories, transactions]);

  // ── The slicer ──────────────────────────────────────────────────────
  // One category filter for the whole screen. An empty array means "all", so
  // nothing has to special-case the unfiltered state. Every panel below reads
  // from the sliced transactions, so selecting a category moves the KPIs, both
  // charts, the comparison and the budget list together.
  const [slice, setSlice] = useState([]);
  const sliced = slice.length > 0;

  // Income is money that belongs to no category, so a category slice cannot
  // meaningfully include it — it drops out while a slice is active, and the
  // banner below says so rather than leaving you to wonder.
  const matchesSlice = useCallback(
    (t) => {
      if (!sliced) return true;
      if (isIncome(t)) return false;
      return slice.includes(t.categoryId || UNCAT_ID);
    },
    [slice, sliced]
  );

  const slicedCategories = useMemo(
    () => (sliced ? categories.filter((c) => slice.includes(c.id)) : categories),
    [categories, slice, sliced]
  );

  // Everything below is scoped to the *cycle*, not the calendar month.
  const cycleTx = useMemo(
    () => filterCycle(transactions, monthKey, resetDay),
    [transactions, monthKey, resetDay]
  );
  const monthTx = useMemo(() => cycleTx.filter(matchesSlice), [cycleTx, matchesSlice]);
  /** The unsliced cycle total, so the slice can report its share of spend. */
  const cycleNetSpend = useMemo(() => netSpend(cycleTx), [cycleTx]);

  // Every figure below is NET: debits less the refunds handed back against
  // them. Income (an untagged credit) never touches spend or budgets — it only
  // shows up in the money-in and net-flow numbers.
  const flow = useMemo(() => ledgerTotals(monthTx), [monthTx]);
  const totalSpent = flow.netSpend;
  // Budget follows the slice too, so "spent vs allocated" stays a fair pairing.
  // `budgetFor` already returns the effective figure, rollover included, so
  // this screen and the Budgets screen can never quote different numbers for
  // the same cycle. Kept separately only so the KPI can say where it came from.
  const totalBudget = sum(slicedCategories, (c) => budgetFor(monthKey, c.id));
  const remaining = totalBudget - totalSpent;
  const budgetRollover = settings?.carryForward
    ? sum(slicedCategories, (c) => budgetOriginFor(monthKey, c.id).rollover || 0)
    : 0;

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

  // ── Running cash balance ────────────────────────────────────────────
  // The one figure on this screen that is absolute rather than relative:
  // actual money, anchored on the opening balance from settings.
  //
  // It reads `transactions` — the WHOLE ledger — not `monthTx`, and that is
  // deliberate. Income carries no category, so the slicer's matcher drops
  // every credit while a slice is active; feeding it sliced entries would
  // silently turn the balance into a spend total. It also needs every entry
  // before this cycle to know what carried in, which `monthTx` cannot give.
  const openingBalance = settings?.openingBalance || 0;
  const cash = useMemo(
    () => cycleCashSummary(transactions, monthKey, resetDay, openingBalance),
    [transactions, monthKey, resetDay, openingBalance]
  );

  // ── Cycle-over-cycle ────────────────────────────────────────────────
  const prevMonthKey = shiftMonth(monthKey, -1);
  const prevMonthTx = useMemo(
    () => filterCycle(transactions, prevMonthKey, resetDay).filter(matchesSlice),
    [transactions, prevMonthKey, resetDay, matchesSlice]
  );
  const prevTotal = netSpend(prevMonthTx);
  const fullDelta = totalSpent - prevTotal;
  const fullPct = pctChange(totalSpent, prevTotal);

  // Like-for-like: the same number of days *into the cycle*, so a cycle still
  // running is only ever compared against the same stretch of the last one.
  // Cycles differ in length (28–31 days), so this counts by day offset from
  // each cycle's own start date, not by day-of-month.
  const prevSameSpan = useMemo(() => {
    const cutoff = cycleDateAtOffset(prevMonthKey, resetDay, elapsed); // exclusive
    return netSpend(prevMonthTx.filter((t) => t.date < cutoff));
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
    const now = netSpendByCategory(monthTx, UNCAT_ID);
    const before = netSpendByCategory(baseline, UNCAT_ID);
    const ids = new Set([...Object.keys(now), ...Object.keys(before)]);
    return [...ids]
      .map((id) => {
        const cat = id === UNCAT_ID
          ? { id: UNCAT_ID, name: 'Uncategorized', color: '#8A93A6', icon: 'MoreHorizontal' }
          : getCategory(categories, id);
        const current = now[id] || 0;
        const previous = before[id] || 0;
        return { ...cat, id, current, previous, delta: current - previous };
      })
      .filter((m) => m.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [monthTx, prevMonthTx, prevMonthKey, resetDay, elapsed, partialCycle, categories]);

  // ── Where it went ───────────────────────────────────────────────────
  const byCategory = useMemo(() => {
    const net = netSpendByCategory(monthTx, UNCAT_ID);
    const rows = slicedCategories.map((c) => ({
      ...c,
      spent: net[c.id] || 0,
      budget: budgetFor(monthKey, c.id),
    }));
    const uncat = net[UNCAT_ID] || 0;
    if (uncat > 0 && (!sliced || slice.includes(UNCAT_ID))) {
      rows.push({ id: UNCAT_ID, name: 'Uncategorized', color: '#8A93A6', icon: 'MoreHorizontal', spent: uncat, budget: 0 });
    }
    return rows
      .filter((c) => c.spent > 0 || c.budget > 0)
      .sort((a, b) => b.spent - a.spent);
  }, [monthTx, slicedCategories, sliced, slice, budgetFor, monthKey]);

  const pieData = byCategory.filter((c) => c.spent > 0).map((c) => ({ name: c.name, value: c.spent, color: c.color }));
  const pieTotal = sum(pieData, (d) => d.value);

  // ── Cycle-to-cycle trend ────────────────────────────────────────────
  const trendData = useMemo(
    () =>
      lastMonthKeys(monthKey, TREND_MONTHS).map((mk) => ({
        monthKey: mk,
        label: monthShortLabel(mk),
        amount: netSpend(filterCycle(transactions, mk, resetDay).filter(matchesSlice)),
      })),
    [transactions, monthKey, resetDay, matchesSlice]
  );

  // One bar per day of the cycle, labelled by its real calendar date.
  // Two bars a day: what went out, and what came back in. Charting the net
  // alone would hide a day that saw a big spend and a big refund both.
  const dailySeries = useMemo(() => {
    const grouped = groupBy(monthTx, (t) => t.date);
    return Array.from({ length: cycleDays }, (_, i) => {
      const date = cycleDateAtOffset(monthKey, resetDay, i);
      const items = grouped[date] || [];
      return {
        day: Number(date.slice(8, 10)),
        date,
        amount: sum(items.filter(isDebit), (t) => t.amount),
        credit: sum(items.filter(isCredit), (t) => t.amount),
      };
    });
  }, [monthTx, monthKey, resetDay, cycleDays]);

  const hasCredits = flow.credits > 0;

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

      {/* ── Carry-forward strip ───────────────────────────────────────
          Deliberately ABOVE the slicer. Every panel below the filter reads
          sliced entries; this one reads the whole ledger, because income has
          no category and a slice would drop every credit. Sitting above the
          control is the visual promise that the filter does not reach it. */}
      <div className="rounded-xl border border-ink-border bg-ink-850/50 px-4 py-3">
        <div className="flex items-center gap-2 mb-3">
          <Landmark size={12} className="text-signal-green shrink-0" />
          <span className="text-[10px] uppercase tracking-[0.16em] text-paper-500 font-mono shrink-0">
            carry-forward
          </span>
          {sliced ? (
            <span className="ml-auto text-[10px] font-mono text-paper-600 shrink-0">
              whole ledger · ignores the filter
            </span>
          ) : openingBalance === 0 ? (
            <button
              onClick={() => goTo('settings')}
              className="ml-auto text-[10px] font-mono text-paper-600 hover:text-signal-amber transition-colors text-right min-w-0 truncate"
            >
              net since tracking began · set an opening balance
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:flex sm:flex-wrap sm:items-end">
          <CashCell
            label={`Remaining from ${monthShortLabel(prevMonthKey)}`}
            value={formatINR(cash.opening)}
            tone={cash.opening < 0 ? 'text-signal-red' : 'text-paper-100'}
            strong
          />
          <CashOp symbol="+" />
          <CashCell label="Money in" value={formatINR(cash.credits)} tone="text-signal-green" />
          <CashOp symbol="−" />
          <CashCell label="Money out" value={formatINR(cash.debits)} tone="text-paper-300" />
          <CashOp symbol="=" />
          <CashCell
            label={`Balance of ${monthShortLabel(monthKey)}`}
            value={formatINR(cash.closing)}
            tone={cash.closing < 0 ? 'text-signal-red' : 'text-signal-green'}
            strong
          />
        </div>
      </div>

      {/* The slicer. One control, every panel below. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-border bg-ink-850/50 px-3.5 py-2.5">
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-paper-500 font-mono shrink-0">
          <SlidersHorizontal size={12} className={sliced ? 'text-signal-amber' : ''} />
          filter
        </span>

        <MultiSelect
          options={catOptions}
          selected={slice}
          onChange={setSlice}
          label="Categories"
          allLabel="All categories"
          align="left"
        />

        {/* Selected categories as removable chips, so what is on is legible
            without opening the dropdown. */}
        {slice.map((id) => {
          const opt = catOptions.find((o) => o.id === id);
          if (!opt) return null;
          return (
            <button
              key={id}
              onClick={() => setSlice(slice.filter((x) => x !== id))}
              className="flex items-center gap-1.5 rounded-lg border border-ink-border bg-ink-800 pl-2 pr-1.5 py-1 text-[11px] text-paper-300 hover:text-paper-100 transition-colors"
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: opt.color }} />
              <span className="max-w-[120px] truncate">{opt.name}</span>
              <X size={11} className="text-paper-500" />
            </button>
          );
        })}

        {sliced ? (
          <>
            <button
              onClick={() => setSlice([])}
              className="text-[11px] font-mono text-signal-amber hover:text-amber-300"
            >
              clear
            </button>
            <span className="ml-auto text-[11px] font-mono text-paper-500 min-w-0 truncate">
              {cycleNetSpend > 0 && (
                <>{Math.round((totalSpent / cycleNetSpend) * 100)}% of cycle spend · </>
              )}
              income excluded
            </span>
          </>
        ) : (
          <span className="ml-auto text-[11px] font-mono text-paper-600 hidden sm:inline">
            slices every panel on this screen
          </span>
        )}
      </div>

      {/* Two-sided summary — only worth the row once credits actually exist. */}
      {hasCredits && (
        <div className="grid grid-cols-3 gap-3 rounded-xl border border-ink-border bg-ink-850/50 px-4 py-3">
          <FlowCell label="Money out" value={formatINR(flow.debits)} tone="text-paper-100" />
          <FlowCell label="Money in" value={formatINR(flow.credits)} tone="text-signal-green" />
          <FlowCell
            label="Net flow"
            value={`${flow.netFlow >= 0 ? '+' : '−'}${formatINR(Math.abs(flow.netFlow))}`}
            tone={flow.netFlow >= 0 ? 'text-signal-green' : 'text-signal-red'}
          />
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi
          icon={Wallet}
          label={flow.refunds > 0 ? 'Net spent' : 'Total spent'}
          value={formatINR(totalSpent)}
          sub={
            flow.refunds > 0
              ? `${formatINR(flow.debits)} out less ${formatCompactINR(flow.refunds)} refunded`
              : totalBudget > 0
                ? budgetRollover !== 0
                  ? `of ${formatINR(totalBudget)} — incl. ${budgetRollover > 0 ? '+' : '−'}${formatCompactINR(Math.abs(budgetRollover))} rolled over`
                  : `of ${formatINR(totalBudget)} allocated`
                : 'no budget set'
          }
          accent={pct > 100 ? 'red' : 'amber'}
        />
        <Kpi
          icon={ArrowDownLeft}
          label="Money in"
          value={formatINR(flow.credits)}
          sub={
            flow.credits === 0
              ? 'nothing credited this cycle'
              : flow.refunds > 0 && flow.income > 0
                ? `${formatCompactINR(flow.income)} income · ${formatCompactINR(flow.refunds)} refunds`
                : flow.refunds > 0
                  ? 'all of it refunds to categories'
                  : 'income, outside the budgets'
          }
          accent="green"
        />
        <Kpi
          icon={TrendingUp}
          // Renamed off "Remaining balance" when the carry-forward strip landed:
          // that strip owns the word "balance" for actual cash, and two numbers
          // on one screen called balance meaning different things is how a
          // budget figure gets mistaken for money in the bank.
          label="Budget left"
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
          eyebrow={sliced ? `${byCategory.length} of ${categories.length} categories` : 'category split'}
          className="lg:col-span-2"
        >
          {pieData.length === 0 ? (
            <EmptyChart label={sliced ? 'No spends in the selected categories' : 'No spends logged yet this cycle'} />
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
                  {sliced && cycleNetSpend > 0 && (
                    <span className="font-mono text-[9px] text-paper-500 mt-0.5">
                      {Math.round((pieTotal / cycleNetSpend) * 100)}% of spend
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
        <Panel
          title="Daily rhythm"
          eyebrow={`${cycleRangeLabel(monthKey, resetDay)} · ${cycleDays} days`}
          className="lg:col-span-3"
          action={
            hasCredits ? (
              <div className="flex items-center gap-3 text-[10px] font-mono text-paper-500">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm" style={{ background: '#F2A93B' }} /> out
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm" style={{ background: '#3DDC97' }} /> in
                </span>
              </div>
            ) : null
          }
        >
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
                <Bar dataKey="amount" name="Out" radius={[3, 3, 0, 0]} fill="#F2A93B" />
                {hasCredits && <Bar dataKey="credit" name="In" radius={[3, 3, 0, 0]} fill="#3DDC97" />}
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
        >
          {!trendHasData ? (
            <EmptyChart label={sliced ? 'Nothing spent in these categories yet' : 'Not enough history yet'} />
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
          eyebrow={sliced ? 'allocation vs actual · sliced' : 'allocation vs actual'}
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
                  const isIn = isCredit(t);
                  const cat = t.categoryId ? getCategory(categories, t.categoryId) : null;
                  const src = isIn ? getCreditSource(creditSources, t) : null;
                  const icon = isIn ? src.icon : cat?.icon;
                  const tint = isIn ? src.color : cat?.color;
                  return (
                    <div key={t.id} className="flex items-center gap-2.5 text-xs">
                      <span className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${tint}22` }}>
                        <CategoryIcon name={icon} size={12} style={{ color: tint }} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-paper-100 truncate">{t.note || (isIn ? src.name : cat?.name)}</div>
                        <div className="text-paper-500 font-mono text-[10px]">{formatDateNice(t.date)}</div>
                      </div>
                      <span className={`font-mono ${isIn ? 'text-signal-green' : 'text-paper-100'}`}>
                        {isIn ? '+' : '−'}{formatINR(t.amount)}
                      </span>
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

function FlowCell({ label, value, tone }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-paper-500 font-mono truncate">{label}</div>
      <div className={`font-mono text-sm font-medium mt-0.5 truncate ${tone}`}>{value}</div>
    </div>
  );
}

/**
 * One term of the carry-forward arithmetic. `strong` marks the two figures
 * that are the point of the strip — what carried in, and what it closes on —
 * so the connective money in/out terms stay visibly subordinate.
 */
function CashCell({ label, value, tone, strong }) {
  return (
    <div className="min-w-0 sm:flex-1">
      <div className="text-[10px] uppercase tracking-wide text-paper-500 font-mono truncate">{label}</div>
      <div
        className={`font-mono mt-0.5 truncate ${tone} ${
          strong ? 'text-base sm:text-lg font-semibold' : 'text-sm font-medium'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/** The operator between two terms. Hidden on mobile, where the strip is a 2x2
    grid and the symbols would land in meaningless places. */
function CashOp({ symbol }) {
  return (
    <div className="hidden sm:block shrink-0 pb-1 font-mono text-sm text-paper-600" aria-hidden="true">
      {symbol}
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
