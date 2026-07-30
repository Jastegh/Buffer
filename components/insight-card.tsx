import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "./ui";
import { cn } from "@/lib/utils";
import type { Insight } from "@/lib/types";

const TONE = {
  positive: { accent: "text-safe-400", chip: "bg-safe-950 border-safe-500/25 text-safe-400" },
  caution: { accent: "text-watch-400", chip: "bg-watch-950 border-watch-500/25 text-watch-400" },
  neutral: { accent: "text-accent-400", chip: "bg-ink-800 border-ink-600 text-mist-300" },
} as const;

const TREND_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus } as const;

export function InsightCard({ insight }: { insight: Insight }) {
  const tone = TONE[insight.tone];
  const TrendIcon = insight.trend ? TREND_ICON[insight.trend] : undefined;

  return (
    <Card className="flex h-full flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold leading-snug text-mist-100">{insight.title}</h3>
        {TrendIcon ? (
          <TrendIcon className={cn("h-4 w-4 shrink-0", tone.accent)} aria-hidden="true" />
        ) : null}
      </div>

      <div
        className={cn(
          "mt-2.5 inline-flex w-fit items-baseline gap-2 rounded-lg border px-2.5 py-1.5",
          tone.chip,
        )}
      >
        <span className="tabular text-base font-bold leading-none">{insight.metricValue}</span>
        <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">
          {insight.metricLabel}
        </span>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-mist-400">{insight.body}</p>

      {insight.recommendation ? (
        <p className="mt-3 border-t border-ink-700/60 pt-2.5 text-xs leading-relaxed text-mist-300">
          <span className="font-medium text-mist-100">Try this: </span>
          {insight.recommendation}
        </p>
      ) : null}
    </Card>
  );
}
