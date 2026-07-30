import { CheckCircle2, Database } from "lucide-react";
import { InfoTip, Pill } from "./ui";
import { formatLongDate } from "@/lib/formatters";
import type { WorkerAnalysis } from "@/lib/analysis";

/** Compact, honest statement of exactly what the forecast is built from. */
export function DataQualityBadge({ analysis }: { analysis: WorkerAnalysis }) {
  const { coverage } = analysis;
  const parts = [
    `${coverage.earnings} shifts`,
    `${coverage.transactions} transactions`,
    `${coverage.obligations} recurring bills`,
    coverage.advances > 0 ? `${coverage.advances} wage advances` : null,
    coverage.weeks > 0 ? `${coverage.weeks} weekly summaries` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-mist-500">
      <Pill>
        <Database className="h-3 w-3" aria-hidden="true" />
        Forecast based on {parts.join(", ")}
      </Pill>
      <Pill>
        Anchored to {formatLongDate(analysis.anchorDate)}
        <InfoTip label="How the analysis date is chosen">
          These are historical records, so &ldquo;today&rdquo; is taken from the data rather than
          your computer&rsquo;s clock. It is the worker&rsquo;s {analysis.anchorMethod}. Income
          credits dated after it are payouts for shifts already worked, so they appear in the
          forecast as confirmed income.
        </InfoTip>
      </Pill>
      {analysis.balanceValidated ? (
        <Pill className="border-safe-500/25 bg-safe-950/50 text-safe-400">
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          Balance cross-checked against weekly summary
        </Pill>
      ) : null}
      {analysis.datasetsMissing.length ? (
        <Pill className="border-watch-500/25 bg-watch-950/40 text-watch-400">
          No records for this worker in: {analysis.datasetsMissing.join(", ")}
        </Pill>
      ) : null}
    </div>
  );
}
