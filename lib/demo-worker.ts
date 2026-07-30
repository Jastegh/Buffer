import "server-only";

import { buildForecastInputs, resolveAnalysisDate } from "./calculations";
import { loadDataset, type WorkerBundle } from "./data";
import { runForecast } from "./forecast";
import type { ForecastStatus } from "./types";

export type RankedWorker = {
  id: string;
  score: number;
  reasons: string[];
  status: ForecastStatus;
  safeDays: number;
  survivesWindow: boolean;
};

/**
 * Deterministically picks the strongest demonstration profile.
 *
 * A good demo worker has rich joined data across all six files *and* a
 * genuinely interesting near-term risk — a shortfall that arrives partway
 * through the window, not one that has already happened.
 */
function scoreWorker(bundle: WorkerBundle, datasetMaxKey?: string): RankedWorker {
  const reasons: string[] = [];
  let score = 0;

  const anchor = resolveAnalysisDate(bundle, datasetMaxKey);
  const { inputs } = buildForecastInputs(bundle, anchor.key);
  const forecast = runForecast(inputs);

  // Data richness across the joined datasets.
  score += Math.min(bundle.earnings.length, 60) * 0.5;
  score += Math.min(bundle.transactions.length, 200) * 0.15;
  score += bundle.obligations.length * 8;
  score += Math.min(bundle.advances.length, 8) * 10;
  if (bundle.weekly.length >= 8) score += 8;
  if (bundle.advances.length > 0) reasons.push(`${bundle.advances.length} wage advances on file`);

  // Date coverage.
  const historyDays = bundle.transactions.length
    ? (bundle.transactions.at(-1)!.date.getTime() - bundle.transactions[0]!.date.getTime()) /
      86_400_000
    : 0;
  if (historyDays >= 60) score += 12;
  else if (historyDays < 21) score -= 25;

  // A shortfall that lands mid-window tells the clearest story.
  if (!forecast.survivesWindow) {
    const dayIndex = forecast.days.findIndex((d) => d.date === forecast.shortfallDate) + 1;
    if (dayIndex >= 2 && dayIndex <= 6) {
      score += 60;
      reasons.push("projected shortfall inside the forecast window");
    } else {
      score += 25;
      reasons.push("projected shortfall at the edge of the window");
    }
  } else if (forecast.lowestBalance < 500) {
    score += 30;
    reasons.push("balance runs close to zero");
  }

  // Start from a plausible, positive balance.
  if (inputs.startingBalance > 200) score += 25;
  if (inputs.startingBalance < 0) score -= 40;

  // Bill collisions make the cause of a shortfall explainable.
  const dueDays = inputs.days.filter((d) => d.obligations > 0).map((d) => d.date);
  if (dueDays.length >= 2) {
    score += 20;
    reasons.push("multiple bills land in the same week");
  }

  // Irregular income is the core audience for Buffer.
  score += (bundle.worker.incomeVolatility ?? 0) * 30;

  // Workers whose everyday spending is almost entirely bills give a flat, dull timeline.
  const essentialsPerDay = inputs.days[0]?.essentials ?? 0;
  if (essentialsPerDay < 10) score -= 30;

  return {
    id: bundle.worker.id,
    score,
    reasons,
    status: forecast.status,
    safeDays: forecast.safeDays,
    survivesWindow: forecast.survivesWindow,
  };
}

let ranked: RankedWorker[] | undefined;

export function rankWorkers(): RankedWorker[] {
  if (ranked) return ranked;
  const dataset = loadDataset();
  const datasetMaxKey = dataset.maxDate
    ? `${dataset.maxDate.getFullYear()}-${String(dataset.maxDate.getMonth() + 1).padStart(2, "0")}-${String(dataset.maxDate.getDate()).padStart(2, "0")}`
    : undefined;

  ranked = [...dataset.byWorker.values()]
    .filter((bundle) => bundle.transactions.length > 0 || bundle.earnings.length > 0)
    .map((bundle) => scoreWorker(bundle, datasetMaxKey))
    // Ties break on id so the demo profile is stable across restarts.
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  return ranked;
}

export function bestDemoWorkerId(): string | undefined {
  return rankWorkers()[0]?.id;
}
