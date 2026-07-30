import { ArrowRight, CircleCheck } from "lucide-react";
import { Card, EmptyState } from "./ui";
import { cn } from "@/lib/utils";
import type { Recommendation } from "@/lib/types";

const RANK_LABEL = ["Start here", "Next best option", "Also worth considering"];

/** Two or three ranked actions, each with its calculated impact. */
export function Recommendations({ recommendations }: { recommendations: Recommendation[] }) {
  if (!recommendations.length) {
    return (
      <EmptyState
        title="No specific action needed right now"
        body="Your projected balance stays above the safety floor across the window, and there is not enough spending history to suggest a more precise step."
      />
    );
  }

  // Each li is a flex row so its card stretches to match the tallest sibling.
  return (
    <ol className="grid gap-3 md:grid-cols-3">
      {recommendations.map((recommendation, index) => (
        <li key={recommendation.id} className="flex">
          <Card
            className={cn(
              "flex w-full flex-col p-4",
              index === 0 && "border-accent-500/30 bg-accent-500/[0.04]",
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "tabular flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold",
                  index === 0 ? "bg-accent-500/20 text-accent-400" : "bg-ink-700 text-mist-500",
                )}
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-mist-600">
                {RANK_LABEL[index] ?? "Also worth considering"}
              </span>
            </div>

            <p className="mt-2.5 text-sm font-semibold leading-snug text-mist-100">
              {recommendation.action}
            </p>

            <p className="mb-2.5 mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-safe-400">
              <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {recommendation.impact}
            </p>

            <p className="mt-auto flex items-start gap-1.5 border-t border-ink-700/60 pt-2.5 text-xs leading-relaxed text-mist-500">
              <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
              {recommendation.why}
            </p>
          </Card>
        </li>
      ))}
    </ol>
  );
}
