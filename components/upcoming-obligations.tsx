import { Banknote, Receipt } from "lucide-react";
import { EmptyState } from "./ui";
import { formatCurrency, formatShortDate, relativeDayLabel, titleCase } from "@/lib/formatters";
import type { UpcomingObligation, UpcomingPayout } from "@/lib/analysis";

/** Money already committed, and money already earned but not yet landed. */
export function UpcomingObligations({
  obligations,
  payouts,
  anchorDate,
  essentialPerDay,
  horizonDays,
}: {
  obligations: UpcomingObligation[];
  payouts: UpcomingPayout[];
  anchorDate: string;
  essentialPerDay: number;
  horizonDays: number;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-mist-600">
          Bills due in this window
        </p>
        {obligations.length === 0 ? (
          <EmptyState
            title="No recurring bills fall in this window"
            body="Your next scheduled obligation lands outside the forecast horizon."
          />
        ) : (
          <ul className="space-y-1.5">
            {obligations.map((obligation, index) => (
              <li
                key={`${obligation.id ?? obligation.name}-${index}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-ink-700/70 bg-ink-850/60 px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Receipt className="h-3.5 w-3.5 shrink-0 text-mist-600" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-mist-100">{obligation.name}</span>
                    <span className="block text-[11px] text-mist-600">
                      {relativeDayLabel(anchorDate, obligation.date)} ·{" "}
                      {formatShortDate(obligation.date)} · {titleCase(obligation.category)}
                      {obligation.autopay ? " · Autopay" : ""}
                    </span>
                  </span>
                </span>
                <span className="tabular shrink-0 text-sm font-semibold text-mist-100">
                  −{formatCurrency(obligation.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-mist-600">
          Payouts already earned
        </p>
        {payouts.length === 0 ? (
          <EmptyState
            title="No confirmed payouts pending"
            body="Every shift you have worked has already been paid, so income in this window is estimated from your recent pattern."
          />
        ) : (
          <ul className="space-y-1.5">
            {payouts.map((payout, index) => (
              <li
                key={`${payout.date}-${index}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-safe-500/20 bg-safe-950/30 px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Banknote className="h-3.5 w-3.5 shrink-0 text-safe-400" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-mist-100">
                      Shift worked {formatShortDate(payout.shiftDate)}
                    </span>
                    <span className="block text-[11px] text-mist-600">
                      Lands {relativeDayLabel(anchorDate, payout.date)} ·{" "}
                      {formatShortDate(payout.date)}
                    </span>
                  </span>
                </span>
                <span className="tabular shrink-0 text-sm font-semibold text-safe-400">
                  +{formatCurrency(payout.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-ink-700/70 bg-ink-850/40 px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-mist-600">
          Projected essential spending
        </p>
        <p className="tabular mt-1 text-sm text-mist-100">
          {formatCurrency(essentialPerDay)} a day
          <span className="text-mist-500">
            {" "}
            · {formatCurrency(essentialPerDay * horizonDays)} over {horizonDays} days
          </span>
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-mist-600">
          Estimated from your recent non-bill essential spending, so scheduled obligations are not
          counted twice.
        </p>
      </div>
    </div>
  );
}
