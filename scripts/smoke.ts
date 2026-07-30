/** Dev-only sanity check: prints the analysis for the auto-selected demo worker. */
import { analyzeWorker, demoWorkerRanking, resolveWorkerId } from "../lib/analysis";
import { loadDataset } from "../lib/data";
import { formatCurrency, formatShortDate } from "../lib/formatters";

const dataset = loadDataset();
console.log("counts:", dataset.counts);
console.log("top demo workers:", demoWorkerRanking().map((r) => `${r.id}:${r.score.toFixed(0)}`).join(", "));

const id = resolveWorkerId();
const analysis = analyzeWorker(id!)!;
console.log("\nworker", analysis.worker.id, analysis.worker.occupation, analysis.worker.payType);
console.log("anchor", analysis.anchorDate, "|", analysis.anchorMethod);
console.log("balance", formatCurrency(analysis.forecast.startingBalance), "|", analysis.balanceMethod, "| validated:", analysis.balanceValidated);
console.log("safeDays", analysis.forecast.safeDays.toFixed(2), "status", analysis.forecast.status, "confidence", analysis.coverage.confidence);
console.log("shortfall", analysis.forecast.shortfallDate, formatCurrency(analysis.forecast.shortfallAmount ?? 0));
console.log("lowest", formatCurrency(analysis.forecast.lowestBalance), analysis.forecast.lowestBalanceDate);
console.log("\nHERO:", analysis.heroExplanation);
console.log("\nNARRATIVE:", JSON.stringify(analysis.narrative, null, 2));
console.log("\nDAYS:");
for (const day of analysis.forecast.days) {
  console.log(
    ` ${formatShortDate(day.date)} start=${formatCurrency(day.startingBalance)} inc=${formatCurrency(day.expectedIncome)}(conf ${formatCurrency(day.confirmedIncome)}) obl=${formatCurrency(day.obligations)} ess=${formatCurrency(day.expectedEssentialSpending)} end=${formatCurrency(day.endingBalance)} ${day.status}`,
  );
}
console.log("\nRECS:");
for (const r of analysis.recommendations) console.log(` - ${r.action}\n   ${r.impact}\n   ${r.why}`);
console.log("\nINSIGHTS:");
for (const i of analysis.insights) console.log(` - [${i.metricValue}] ${i.title}\n   ${i.body}\n   ${i.recommendation ?? ""}`);
console.log("\nupcoming obligations:", analysis.upcomingObligations);
console.log("upcoming payouts:", analysis.upcomingPayouts);
console.log("advances:", analysis.advances);

// A second worker to prove switching does not crash.
const other = dataset.workers[42]?.id;
if (other) {
  const second = analyzeWorker(other)!;
  console.log("\nsecond worker", other, second.forecast.safeDays.toFixed(1), second.forecast.status, second.insights.length, "insights");
}
