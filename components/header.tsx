import { CalendarClock, Database, ShieldCheck } from "lucide-react";
import { WorkerSelector } from "./worker-selector";
import { Pill } from "./ui";
import { formatLongDate, titleCase } from "@/lib/formatters";
import type { WorkerAnalysis } from "@/lib/analysis";
import type { WorkerOption } from "@/lib/types";

export function Header({
  analysis,
  workers,
  bestDemoId,
}: {
  analysis: WorkerAnalysis;
  workers: WorkerOption[];
  bestDemoId?: string;
}) {
  const { worker } = analysis;
  return (
    <header className="border-b border-ink-800 bg-ink-950/90 backdrop-blur supports-[backdrop-filter]:bg-ink-950/70">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:py-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-accent-400 to-accent-500 text-ink-950">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-mist-100">Buffer</h1>
              <Pill className="border-accent-500/30 bg-accent-500/10 text-accent-400">
                <Database className="h-3 w-3" aria-hidden="true" />
                Demo data
              </Pill>
            </div>
            <p className="mt-0.5 text-sm text-mist-500">
              Know how long you&rsquo;re safe—not just what you spent.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs text-mist-500">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
              Forecast anchored to {formatLongDate(analysis.anchorDate)}
            </p>
            <p className="truncate text-xs text-mist-600">
              {titleCase(worker.occupation)} · {titleCase(worker.payType)} pay
              {worker.city ? ` · ${worker.city}, ${worker.province ?? ""}` : ""}
            </p>
          </div>
          <WorkerSelector workers={workers} selectedId={worker.id} bestDemoId={bestDemoId} />
        </div>
      </div>
    </header>
  );
}
