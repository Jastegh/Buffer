/** Dev-only: runs the full analysis for every worker and reports anomalies. */
import { analyzeWorker } from "../lib/analysis";
import { loadDataset } from "../lib/data";
import { EMPTY_SCENARIO, runForecast } from "../lib/forecast";

const dataset = loadDataset();
const problems: string[] = [];
let atRisk = 0;
let watch = 0;
let safe = 0;
let insightTotal = 0;
let noInsights = 0;

for (const worker of dataset.workers) {
  let analysis;
  try {
    analysis = analyzeWorker(worker.id);
  } catch (error) {
    problems.push(`${worker.id}: threw ${(error as Error).message}`);
    continue;
  }
  if (!analysis) {
    problems.push(`${worker.id}: no analysis returned`);
    continue;
  }

  const f = analysis.forecast;
  const numbers = [f.safeDays, f.startingBalance, f.lowestBalance, ...f.days.map((d) => d.endingBalance)];
  if (numbers.some((n) => !Number.isFinite(n))) problems.push(`${worker.id}: non-finite number`);
  if (f.safeDays < 0 || f.safeDays > f.days.length) problems.push(`${worker.id}: safeDays ${f.safeDays}`);
  if (!f.survivesWindow && !f.shortfallDate) problems.push(`${worker.id}: breach without a date`);
  if (f.days.length !== 7) problems.push(`${worker.id}: ${f.days.length} forecast days`);

  // Narrative text must never contain unresolved values.
  const text = [analysis.heroExplanation, ...Object.values(analysis.narrative),
    ...analysis.recommendations.flatMap((r) => [r.action, r.impact, r.why]),
    ...analysis.insights.flatMap((i) => [i.title, i.body, i.metricValue, i.recommendation ?? ""])].join(" ");
  if (/undefined|NaN|Infinity|\$NaN|null/.test(text)) problems.push(`${worker.id}: bad text -> ${text.match(/.{0,60}(undefined|NaN|Infinity|null).{0,60}/)?.[0]}`);

  // The client simulator must run without throwing.
  try {
    runForecast(analysis.inputs, { ...EMPTY_SCENARIO, extraShift: true, extraShiftAmount: 150, purchaseAmount: 40, advanceAmount: 100, advanceFee: 5 });
  } catch (error) {
    problems.push(`${worker.id}: scenario threw ${(error as Error).message}`);
  }

  if (f.status === "at-risk") atRisk += 1;
  else if (f.status === "watch") watch += 1;
  else safe += 1;
  insightTotal += analysis.insights.length;
  if (analysis.insights.length < 3) noInsights += 1;
}

console.log(`workers checked: ${dataset.workers.length}`);
console.log(`status split -> at-risk ${atRisk}, watch ${watch}, safe ${safe}`);
console.log(`avg insights: ${(insightTotal / dataset.workers.length).toFixed(2)}, workers with <3 insights: ${noInsights}`);
console.log(problems.length ? `PROBLEMS (${problems.length}):\n` + problems.slice(0, 25).join("\n") : "no problems found");
