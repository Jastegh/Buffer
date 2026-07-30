import { AlertTriangle, ArrowDownRight, CalendarX2, Wallet } from "lucide-react";
import { Card, InfoTip, Metric } from "./ui";
import { StatusBadge } from "./status-badge";
import { JumpButton } from "./jump-button";
import {
  formatCurrency,
  formatDays,
  formatShortDate,
  relativeDayLabel,
} from "@/lib/formatters";
import { cn, STATUS_META } from "@/lib/utils";
import type { WorkerAnalysis } from "@/lib/analysis";

const CONFIDENCE_LABEL = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
} as const;

/**
 * The five-second answer: how long the worker is safe, when the money runs
 * short, why, and a direct route to the actions that fix it.
 */
export function SafetyCard({ analysis }: { analysis: WorkerAnalysis }) {
  const { forecast, coverage } = analysis;
  const meta = STATUS_META[forecast.status];
  const horizon = forecast.days.length;
  const safeDaysLabel = forecast.survivesWindow ? `${horizon}+` : formatDays(forecast.safeDays);

  return (
    <Card
      className={cn(
        "relative border-2 p-5 sm:p-7",
        meta.border,
        forecast.status === "at-risk" && "bg-gradient-to-br from-risk-950/40 via-ink-900 to-ink-900",
        forecast.status === "watch" && "bg-gradient-to-br from-watch-950/30 via-ink-900 to-ink-900",
        forecast.status === "safe" && "bg-gradient-to-br from-safe-950/30 via-ink-900 to-ink-900",
      )}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-8">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <StatusBadge status={forecast.status} size="lg" />
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-mist-500">
              {CONFIDENCE_LABEL[coverage.confidence]}
              <InfoTip label="What confidence means">
                Confidence reflects how much recent data backs this forecast — shifts,
                transactions, bills and history length. It is not a statement of certainty about
                the future.
                {coverage.confidenceReasons.length ? (
                  <span className="mt-2 block text-mist-500">
                    Limited by: {coverage.confidenceReasons.join(", ")}.
                  </span>
                ) : null}
              </InfoTip>
            </span>
          </div>

          <p className="mt-5 text-sm font-medium text-mist-500">You&rsquo;re safe for</p>
          <p
            className={cn(
              "tabular text-6xl font-bold leading-none tracking-tight sm:text-7xl",
              meta.text,
            )}
          >
            {safeDaysLabel}
            <span className="ml-2 text-2xl font-semibold text-mist-500 sm:text-3xl">days</span>
          </p>

          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-mist-300">
            {analysis.heroExplanation}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <JumpButton tab="plan" variant="primary">
              {forecast.survivesWindow ? "See how to extend it" : "See what I can do"}
            </JumpButton>
            <JumpButton tab="forecast" variant="ghost">
              View the week
            </JumpButton>
          </div>
        </div>

        <div className="flex flex-col justify-center gap-5 rounded-2xl border border-ink-700/60 bg-ink-950/30 p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            <Metric
              label="Current balance"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <Wallet className="h-4 w-4 text-mist-600" aria-hidden="true" />
                  {formatCurrency(forecast.startingBalance)}
                </span>
              }
              hint={
                analysis.balanceAsOf ? `As of ${formatShortDate(analysis.balanceAsOf)}` : undefined
              }
            />
            <Metric
              label="Next cash shortfall"
              tone={forecast.survivesWindow ? "safe" : "risk"}
              value={
                forecast.survivesWindow ? (
                  "None projected"
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarX2 className="h-4 w-4 opacity-70" aria-hidden="true" />
                    {relativeDayLabel(analysis.anchorDate, forecast.shortfallDate!)}
                  </span>
                )
              }
              hint={
                forecast.survivesWindow
                  ? `Through ${formatShortDate(forecast.days.at(-1)!.date)}`
                  : formatShortDate(forecast.shortfallDate!)
              }
            />
            <Metric
              label="Expected shortfall"
              tone={forecast.survivesWindow ? "default" : "risk"}
              value={
                forecast.survivesWindow ? (
                  formatCurrency(0)
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <ArrowDownRight className="h-4 w-4 opacity-70" aria-hidden="true" />
                    {formatCurrency(forecast.shortfallAmount ?? 0)}
                  </span>
                )
              }
              hint={`Below a ${formatCurrency(forecast.safetyFloor)} safety floor`}
            />
            <Metric
              label="Lowest projected balance"
              tone={
                forecast.lowestBalance < 0 ? "risk" : forecast.lowestBalance < 100 ? "watch" : "safe"
              }
              value={formatCurrency(forecast.lowestBalance)}
              hint={`On ${formatShortDate(forecast.lowestBalanceDate)}`}
            />
          </div>

          {forecast.status === "at-risk" ? (
            <p className="flex items-start gap-2 rounded-xl border border-risk-500/25 bg-risk-950/40 px-3 py-2.5 text-xs leading-relaxed text-risk-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Your balance is projected to go below {formatCurrency(forecast.safetyFloor)} within
                this window.
              </span>
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
