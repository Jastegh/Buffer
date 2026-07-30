"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { WorkerSelector } from "./worker-selector";
import { ThemeToggle } from "./theme-toggle";
import { formatDays } from "@/lib/formatters";
import { cn, STATUS_META } from "@/lib/utils";
import type { ForecastStatus, WorkerOption } from "@/lib/types";

/**
 * Sticky, and deliberately given its own z-index so overlays inside it (the
 * profile switcher) sit above the page content rather than behind it.
 */
export function Header({
  workers,
  selectedId,
  bestDemoId,
  status,
  safeDays,
  survivesWindow,
  horizonDays,
}: {
  workers: WorkerOption[];
  selectedId: string;
  bestDemoId?: string;
  status: ForecastStatus;
  safeDays: number;
  survivesWindow: boolean;
  horizonDays: number;
}) {
  const [scrolled, setScrolled] = useState(false);

  // Once the hero scrolls away, the header carries the headline number so the
  // answer is never more than a glance away.
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 220);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const meta = STATUS_META[status];
  const daysLabel = survivesWindow ? `${horizonDays}+` : formatDays(safeDays);

  return (
    <header className="sticky top-0 z-50 border-b border-ink-700/60 bg-ink-950/85 backdrop-blur">
      <div className="mx-auto flex h-[calc(var(--header-h)-1px)] max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-accent-400 to-accent-500 text-white">
            <ShieldCheck className="h-4.5 w-4.5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold leading-tight tracking-tight text-mist-100">
              Buffer
            </p>
            <p className="hidden truncate text-xs leading-tight text-mist-500 sm:block">
              Know how long you&rsquo;re safe—not just what you spent.
            </p>
          </div>

          <div
            className={cn(
              "ml-2 hidden items-center gap-2 rounded-full border px-2.5 py-1 transition-all duration-200 md:flex",
              meta.bg,
              meta.border,
              scrolled ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-1 opacity-0",
            )}
            aria-hidden={!scrolled}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
            <span className={cn("tabular text-xs font-semibold", meta.text)}>
              {daysLabel} safe days
            </span>
            <span className={cn("text-[11px] font-medium uppercase tracking-wide", meta.text)}>
              · {meta.label}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <WorkerSelector workers={workers} selectedId={selectedId} bestDemoId={bestDemoId} />
        </div>
      </div>
    </header>
  );
}
