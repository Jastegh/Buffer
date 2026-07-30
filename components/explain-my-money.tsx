import { InsightCard } from "./insight-card";
import { EmptyState } from "./ui";
import type { Insight } from "@/lib/types";

/**
 * Patterns rather than totals. Each card only renders when the underlying
 * analysis had enough records to support it.
 */
export function ExplainMyMoney({ insights }: { insights: Insight[] }) {
  if (!insights.length) {
    return (
      <EmptyState
        title="Not enough history for reliable patterns yet"
        body="Buffer only shows a pattern when there are enough records behind it. As more shifts and transactions are recorded for this worker, insights will appear here."
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {insights.map((insight) => (
        <InsightCard key={insight.id} insight={insight} />
      ))}
    </div>
  );
}
