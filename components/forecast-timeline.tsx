import { Banknote, Receipt, ShoppingBasket, Sparkles } from "lucide-react";
import { StatusBadge } from "./status-badge";
import {
  formatCurrency,
  formatShortDate,
  relativeDayLabel,
} from "@/lib/formatters";
import { cn, STATUS_META } from "@/lib/utils";
import type { DailyForecast } from "@/lib/types";

const KIND_ICON = {
  income: Banknote,
  obligation: Receipt,
  essentials: ShoppingBasket,
  scenario: Sparkles,
} as const;

/** Day-by-day breakdown of what moves the balance. */
export function ForecastTimeline({
  days,
  anchorDate,
  safetyFloor,
}: {
  days: DailyForecast[];
  anchorDate: string;
  safetyFloor: number;
}) {
  return (
    <ol className="space-y-2">
      {days.map((day) => {
        const meta = STATUS_META[day.status];
        return (
          <li
            key={day.date}
            className={cn(
              "rounded-xl border bg-ink-850/60 p-3 transition-colors sm:p-4",
              day.endingBalance < safetyFloor
                ? "border-risk-500/30 bg-risk-950/20"
                : "border-ink-700/70",
            )}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className="flex items-baseline gap-2">
                <p className="text-sm font-semibold text-mist-100">
                  {relativeDayLabel(anchorDate, day.date)}
                </p>
                <p className="text-xs text-mist-600">{formatShortDate(day.date)}</p>
              </div>
              <StatusBadge status={day.status} size="sm" />
            </div>

            <ul className="mt-2 space-y-1">
              {day.events.length === 0 ? (
                <li className="text-xs text-mist-600">No expected movement.</li>
              ) : (
                day.events.map((event, index) => {
                  const Icon = KIND_ICON[event.kind];
                  return (
                    <li
                      key={`${day.date}-${index}`}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 text-mist-500">
                        <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
                        <span className="truncate">{event.label}</span>
                        {event.confirmed ? (
                          <span className="shrink-0 rounded bg-ink-700 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-mist-400">
                            Confirmed
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          "tabular shrink-0 font-medium",
                          event.amount >= 0 ? "text-safe-400" : "text-mist-300",
                        )}
                      >
                        {event.amount >= 0 ? "+" : "−"}
                        {formatCurrency(Math.abs(event.amount))}
                      </span>
                    </li>
                  );
                })
              )}
            </ul>

            <div className="mt-2.5 flex items-center justify-between border-t border-ink-700/60 pt-2 text-xs">
              <span className="text-mist-600">Projected balance</span>
              <span className={cn("tabular text-sm font-semibold", meta.text)}>
                {formatCurrency(day.endingBalance)}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
