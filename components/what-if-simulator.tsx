"use client";

import { useMemo, useState } from "react";
import { CreditCard, RotateCcw, ShoppingBag, Sun } from "lucide-react";
import { Card } from "./ui";
import { StatusBadge } from "./status-badge";
import { ForecastChart } from "./forecast-chart";
import { EMPTY_SCENARIO, runForecast, type Scenario } from "@/lib/forecast";
import {
  formatCurrency,
  formatDays,
  formatShortDate,
  relativeDayLabel,
} from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { ForecastInputs, ForecastResult } from "@/lib/types";

/**
 * Re-runs the exact same forecast engine used on the server, in the browser,
 * so scenarios update instantly and stay consistent with the baseline.
 */
export function WhatIfSimulator({
  inputs,
  baseline,
}: {
  inputs: ForecastInputs;
  baseline: ForecastResult;
}) {
  const medianShift = Math.round(inputs.medianShiftNet);
  const [extraShift, setExtraShift] = useState(false);
  const [shiftDay, setShiftDay] = useState(1);
  const [purchase, setPurchase] = useState(0);
  const [purchaseDay, setPurchaseDay] = useState(1);
  const [advance, setAdvance] = useState(0);

  const scenario: Scenario = useMemo(() => {
    const advanceFee = advance * inputs.typicalAdvanceFeeRate;
    return {
      ...EMPTY_SCENARIO,
      extraShift,
      extraShiftAmount: extraShift ? medianShift : 0,
      extraShiftDayIndex: shiftDay,
      purchaseAmount: purchase,
      purchaseDayIndex: purchaseDay,
      advanceAmount: advance,
      advanceFee,
      advanceDayIndex: 1,
      // Advances in this dataset are repaid within days, typically from the
      // next payout, so the repayment lands inside the same window.
      advanceRepayDayIndex: Math.min(inputs.horizonDays, 5),
    };
  }, [extraShift, medianShift, shiftDay, purchase, purchaseDay, advance, inputs]);

  const active = extraShift || purchase > 0 || advance > 0;
  const result = useMemo(
    () => (active ? runForecast(inputs, scenario) : baseline),
    [active, inputs, scenario, baseline],
  );

  const dayOptions = inputs.days.map((day, index) => ({
    value: index + 1,
    label: relativeDayLabel(inputs.anchorDate, day.date),
  }));

  const safeDaysLabel = (forecast: ForecastResult) =>
    forecast.survivesWindow ? `${inputs.horizonDays}+` : formatDays(forecast.safeDays);

  const delta = result.safeDays - baseline.safeDays;

  function reset() {
    setExtraShift(false);
    setPurchase(0);
    setAdvance(0);
    setShiftDay(1);
    setPurchaseDay(1);
  }

  return (
    <Card className="p-5">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="space-y-4">
          {/* Extra shift */}
          <div
            className={cn(
              "rounded-xl border p-3.5 transition-colors",
              extraShift
                ? "border-accent-500/40 bg-accent-500/5"
                : "border-ink-700/70 bg-ink-850/60",
            )}
          >
            <label className="flex cursor-pointer items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-medium text-mist-100">
                  <Sun className="h-4 w-4 text-watch-400" aria-hidden="true" />
                  Add one extra shift
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-mist-500">
                  Uses your recent median net shift pay of {formatCurrency(medianShift)}.
                </span>
              </span>
              <input
                type="checkbox"
                checked={extraShift}
                onChange={(event) => setExtraShift(event.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-400",
                  extraShift ? "bg-accent-500" : "bg-ink-600",
                )}
              >
                <span
                  className={cn(
                    "h-4 w-4 rounded-full bg-white shadow transition-transform",
                    extraShift ? "translate-x-4" : "translate-x-0",
                  )}
                />
              </span>
            </label>
            {extraShift ? (
              <div className="mt-3">
                <label
                  htmlFor="shift-day"
                  className="block text-[11px] font-medium uppercase tracking-wide text-mist-600"
                >
                  Day the pay lands
                </label>
                <select
                  id="shift-day"
                  value={shiftDay}
                  onChange={(event) => setShiftDay(Number(event.target.value))}
                  className="mt-1 w-full rounded-lg border border-ink-600 bg-ink-800 px-2.5 py-1.5 text-sm text-mist-100"
                >
                  {dayOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          {/* Optional purchase */}
          <div className="rounded-xl border border-ink-700/70 bg-ink-850/60 p-3.5">
            <label
              htmlFor="purchase-amount"
              className="flex items-center gap-1.5 text-sm font-medium text-mist-100"
            >
              <ShoppingBag className="h-4 w-4 text-accent-400" aria-hidden="true" />
              Optional purchase
            </label>
            <div className="mt-2 flex gap-2">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-mist-600">
                  $
                </span>
                <input
                  id="purchase-amount"
                  type="number"
                  min={0}
                  step={5}
                  value={purchase || ""}
                  placeholder="0"
                  onChange={(event) => setPurchase(Math.max(0, Number(event.target.value) || 0))}
                  className="tabular w-full rounded-lg border border-ink-600 bg-ink-800 py-1.5 pl-6 pr-2.5 text-sm text-mist-100 placeholder:text-mist-600"
                />
              </div>
              <select
                aria-label="Day of optional purchase"
                value={purchaseDay}
                onChange={(event) => setPurchaseDay(Number(event.target.value))}
                className="rounded-lg border border-ink-600 bg-ink-800 px-2.5 py-1.5 text-sm text-mist-100"
              >
                {dayOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Wage advance */}
          <div className="rounded-xl border border-ink-700/70 bg-ink-850/60 p-3.5">
            <label
              htmlFor="advance-amount"
              className="flex items-center gap-1.5 text-sm font-medium text-mist-100"
            >
              <CreditCard className="h-4 w-4 text-watch-400" aria-hidden="true" />
              Earned-wage advance
            </label>
            <div className="relative mt-2">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-mist-600">
                $
              </span>
              <input
                id="advance-amount"
                type="number"
                min={0}
                step={5}
                value={advance || ""}
                placeholder="0"
                onChange={(event) => setAdvance(Math.max(0, Number(event.target.value) || 0))}
                className="tabular w-full rounded-lg border border-ink-600 bg-ink-800 py-1.5 pl-6 pr-2.5 text-sm text-mist-100 placeholder:text-mist-600"
              />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-mist-500">
              {inputs.typicalAdvanceFeeRate > 0 ? (
                <>
                  Estimated fee{" "}
                  <span className="tabular text-mist-300">
                    {formatCurrency(advance * inputs.typicalAdvanceFeeRate, 2)}
                  </span>{" "}
                  at your historical {(inputs.typicalAdvanceFeeRate * 100).toFixed(1)}% rate.{" "}
                </>
              ) : (
                <>No advance history on file, so no fee is estimated. </>
              )}
              This is temporary cash, not extra income — it is repaid from a later payout inside
              this window.
            </p>
          </div>

          <button
            type="button"
            onClick={reset}
            disabled={!active}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-ink-600 px-3 py-2 text-xs font-medium text-mist-400 transition-colors enabled:hover:border-mist-600 enabled:hover:text-mist-100 disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset to current plan
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <PlanColumn
              title="Current plan"
              safeDays={safeDaysLabel(baseline)}
              forecast={baseline}
              anchorDate={inputs.anchorDate}
            />
            <PlanColumn
              title="Scenario"
              safeDays={safeDaysLabel(result)}
              forecast={result}
              anchorDate={inputs.anchorDate}
              highlight={active}
            />
          </div>

          <div
            className={cn(
              "rounded-xl border px-3.5 py-3 text-sm leading-relaxed",
              active
                ? delta > 0.05
                  ? "border-safe-500/30 bg-safe-950/30 text-safe-400"
                  : delta < -0.05
                    ? "border-risk-500/30 bg-risk-950/30 text-risk-400"
                    : "border-ink-700 bg-ink-850/60 text-mist-300"
                : "border-ink-700 bg-ink-850/60 text-mist-500",
            )}
            role="status"
            aria-live="polite"
          >
            {active ? scenarioSentence(baseline, result, inputs.horizonDays) : "Adjust a control to compare a scenario against your current plan."}
          </div>

          <ForecastChart
            days={baseline.days}
            scenarioDays={active ? result.days : undefined}
            safetyFloor={inputs.safetyFloor}
            startingBalance={inputs.startingBalance}
            anchorDate={inputs.anchorDate}
          />
        </div>
      </div>
    </Card>
  );
}

function PlanColumn({
  title,
  safeDays,
  forecast,
  anchorDate,
  highlight,
}: {
  title: string;
  safeDays: string;
  forecast: ForecastResult;
  anchorDate: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3.5",
        highlight ? "border-accent-500/40 bg-accent-500/[0.06]" : "border-ink-700/70 bg-ink-850/60",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-mist-600">{title}</p>
        <StatusBadge status={forecast.status} size="sm" />
      </div>
      <p className="tabular mt-2 text-3xl font-bold tracking-tight text-mist-100">
        {safeDays}
        <span className="ml-1 text-sm font-medium text-mist-500">safe days</span>
      </p>
      <dl className="mt-2.5 space-y-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-mist-600">Lowest balance</dt>
          <dd
            className={cn(
              "tabular font-medium",
              forecast.lowestBalance < forecast.safetyFloor ? "text-risk-400" : "text-mist-300",
            )}
          >
            {formatCurrency(forecast.lowestBalance)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-mist-600">Shortfall date</dt>
          <dd className="font-medium text-mist-300">
            {forecast.survivesWindow ? "None" : relativeDayLabel(anchorDate, forecast.shortfallDate!)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-mist-600">Shortfall amount</dt>
          <dd className="tabular font-medium text-mist-300">
            {forecast.survivesWindow ? "—" : formatCurrency(forecast.shortfallAmount ?? 0)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function scenarioSentence(
  baseline: ForecastResult,
  scenario: ForecastResult,
  horizon: number,
): string {
  const before = baseline.survivesWindow ? `${horizon}+` : formatDays(baseline.safeDays);
  const after = scenario.survivesWindow ? `${horizon}+` : formatDays(scenario.safeDays);

  if (baseline.survivesWindow && scenario.survivesWindow) {
    const shift = scenario.lowestBalance - baseline.lowestBalance;
    if (Math.abs(shift) < 1) return "This scenario barely changes your projected week.";
    return `Your buffer still covers the full ${horizon} days, and your lowest balance moves from ${formatCurrency(baseline.lowestBalance)} to ${formatCurrency(scenario.lowestBalance)}.`;
  }

  if (!baseline.survivesWindow && scenario.survivesWindow) {
    return `This clears the projected shortfall on ${formatShortDate(baseline.shortfallDate!)} and extends your buffer from ${before} to ${after} days.`;
  }

  if (baseline.survivesWindow && !scenario.survivesWindow) {
    return `This introduces a ${formatCurrency(scenario.shortfallAmount ?? 0)} shortfall on ${formatShortDate(scenario.shortfallDate!)}, cutting your buffer from ${before} to ${after} days.`;
  }

  const gapChange = (baseline.shortfallAmount ?? 0) - (scenario.shortfallAmount ?? 0);
  if (Math.abs(scenario.safeDays - baseline.safeDays) < 0.05 && Math.abs(gapChange) < 1) {
    return "This scenario barely changes your projected week.";
  }
  return `Your buffer moves from ${before} to ${after} days, and the projected shortfall ${gapChange > 0 ? "shrinks" : "grows"} from ${formatCurrency(baseline.shortfallAmount ?? 0)} to ${formatCurrency(scenario.shortfallAmount ?? 0)}.`;
}
