import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { analyzeWorker, resolveWorkerId, workerOptions } from "@/lib/analysis";
import { bestDemoWorkerId } from "@/lib/demo-worker";
import { loadDataset } from "@/lib/data";
import { Card, SectionHeading } from "@/components/ui";
import { DataQualityBadge } from "@/components/data-quality-badge";
import { ExplainMyMoney } from "@/components/explain-my-money";
import { ForecastChart } from "@/components/forecast-chart";
import { ForecastTimeline } from "@/components/forecast-timeline";
import { Header } from "@/components/header";
import { MoneyNarrative } from "@/components/money-narrative";
import { Recommendations } from "@/components/recommendations";
import { SafetyCard } from "@/components/safety-card";
import { UpcomingObligations } from "@/components/upcoming-obligations";
import { WhatIfSimulator } from "@/components/what-if-simulator";
import { formatCurrency, formatShortDate } from "@/lib/formatters";

// Rendered per request so `?worker=` selects a profile on the server; the
// parsed datasets stay cached in module scope, so this stays fast.
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ worker?: string }>;
}) {
  const { worker: requested } = await searchParams;
  const dataset = loadDataset();

  if (!dataset.workers.length) {
    return <FatalState />;
  }

  const workerId = resolveWorkerId(requested);
  const analysis = workerId ? analyzeWorker(workerId) : undefined;

  if (!analysis) {
    return <FatalState workerId={requested} />;
  }

  const { forecast, inputs } = analysis;
  const horizon = forecast.days.length;

  return (
    <div className="min-h-screen">
      <Header analysis={analysis} workers={workerOptions()} bestDemoId={bestDemoWorkerId()} />

      <main id="main" className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
        <section aria-label="Your financial safety window">
          <SafetyCard analysis={analysis} />
          <div className="mt-3">
            <DataQualityBadge analysis={analysis} />
          </div>
        </section>

        <section aria-label={`${horizon}-day balance forecast`}>
          <SectionHeading
            eyebrow={`${horizon}-day outlook`}
            title="Your projected balance, day by day"
            description={`Starting from ${formatCurrency(forecast.startingBalance)} on ${formatShortDate(analysis.anchorDate)}. Confirmed items come from records; the rest are estimated from your recent pattern.`}
          />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <Card className="p-4 sm:p-5">
                <ForecastChart
                  days={forecast.days}
                  safetyFloor={forecast.safetyFloor}
                  startingBalance={forecast.startingBalance}
                  anchorDate={analysis.anchorDate}
                />
              </Card>
              <Card className="p-4 sm:p-5">
                <h3 className="mb-3 text-sm font-semibold text-mist-100">Committed and expected</h3>
                <UpcomingObligations
                  obligations={analysis.upcomingObligations}
                  payouts={analysis.upcomingPayouts}
                  anchorDate={analysis.anchorDate}
                  essentialPerDay={analysis.spending.essentialPerDay}
                  horizonDays={horizon}
                />
              </Card>
            </div>

            <Card className="p-4 sm:p-5">
              <h3 className="mb-3 text-sm font-semibold text-mist-100">Daily timeline</h3>
              <ForecastTimeline
                days={forecast.days}
                anchorDate={analysis.anchorDate}
                safetyFloor={forecast.safetyFloor}
              />
            </Card>
          </div>
        </section>

        <section
          aria-label="Narrative explanation and recommended actions"
          className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
        >
          <MoneyNarrative narrative={analysis.narrative} />
          <div>
            <SectionHeading
              eyebrow="Smallest useful actions"
              title="What you could do today"
              description="Ranked by how much of the gap each one closes. Estimates, not financial advice."
            />
            <Recommendations recommendations={analysis.recommendations} />
          </div>
        </section>

        <section aria-label="What-if simulator">
          <SectionHeading
            eyebrow="What-if simulator"
            title="Test a decision before you make it"
            description="Runs the same forecast engine in your browser, so the comparison stays consistent with the numbers above."
          />
          <WhatIfSimulator inputs={inputs} baseline={forecast} />
        </section>

        <section aria-label="Explain My Money">
          <SectionHeading
            eyebrow="Patterns, not totals"
            title="Explain My Money"
            description="Each card appears only when there are enough records behind it."
          />
          <ExplainMyMoney insights={analysis.insights} />
        </section>

        <footer className="space-y-2 border-t border-ink-800 pt-6 text-xs leading-relaxed text-mist-600">
          <p>
            Forecasts are estimates based on recent activity and are not financial advice. Buffer
            projects a {horizon}-day window from {formatShortDate(analysis.anchorDate)} using{" "}
            {analysis.datasetsJoined.length} joined datasets for worker {analysis.worker.id}.
          </p>
          <p>
            Current balance method: {analysis.balanceMethod.toLowerCase()}
            {analysis.balanceValidated
              ? ", cross-checked against the weekly cashflow summary"
              : ""}
            . Expected income is a probability-weighted estimate by weekday; essential spending is a
            recent daily average excluding scheduled bills. Identifiers are anonymous and no
            personal names are used.
          </p>
        </footer>
      </main>
    </div>
  );
}

function FatalState({ workerId }: { workerId?: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-3 px-6 text-center">
      <AlertTriangle className="h-8 w-8 text-watch-400" aria-hidden="true" />
      <h1 className="text-xl font-semibold text-mist-100">
        {workerId ? `No records found for ${workerId}` : "No worker data could be loaded"}
      </h1>
      <p className="text-sm leading-relaxed text-mist-500">
        Buffer reads its CSV files from <code className="text-mist-300">public/data</code>. Check
        that <code className="text-mist-300">workers.csv</code> and{" "}
        <code className="text-mist-300">transactions.csv</code> are present and contain a{" "}
        <code className="text-mist-300">worker_id</code> column.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-lg border border-ink-600 px-4 py-2 text-sm text-mist-200 hover:border-mist-600"
      >
        Back to the demo profile
      </Link>
    </main>
  );
}
