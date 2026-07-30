"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, Search, Sparkles, X } from "lucide-react";
import type { ForecastStatus, WorkerOption } from "@/lib/types";
import { cn, STATUS_META } from "@/lib/utils";
import { formatDays, titleCase } from "@/lib/formatters";

type Filter = "all" | "at-risk" | "safe";

/**
 * Buffer is a personal app — in real use a worker only ever sees their own
 * numbers. This switcher exists so the sample data can be explored, so it is
 * labelled as a demo control rather than dressed up as a product feature.
 */
export function WorkerSelector({
  workers,
  selectedId,
  bestDemoId,
}: {
  workers: WorkerOption[];
  selectedId: string;
  bestDemoId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [pendingId, setPendingId] = useState<string | undefined>();
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return workers
      .filter((worker) => {
        if (filter === "at-risk" && worker.status !== "at-risk") return false;
        if (filter === "safe" && worker.status !== "safe") return false;
        if (!needle) return true;
        return (
          worker.id.toLowerCase().includes(needle) ||
          worker.occupation?.toLowerCase().includes(needle) ||
          worker.city?.toLowerCase().includes(needle) ||
          worker.payType?.toLowerCase().includes(needle)
        );
      })
      .slice(0, 60);
  }, [workers, query, filter]);

  // Keep the highlighted row valid as the list narrows.
  useEffect(() => setActiveIndex(0), [query, filter]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function select(id: string) {
    setOpen(false);
    setQuery("");
    if (id === selectedId) return;
    setPendingId(id);
    router.push(id === bestDemoId ? "/" : `/?worker=${id}`);
  }

  // Clear the loading state once the server has swapped the profile in.
  useEffect(() => {
    if (pendingId && pendingId === selectedId) setPendingId(undefined);
  }, [pendingId, selectedId]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault();
      select(results[activeIndex].id);
    }
  }

  const selected = workers.find((worker) => worker.id === selectedId);
  const atRiskCount = workers.filter((worker) => worker.status === "at-risk").length;

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center gap-2 rounded-xl border border-ink-600 bg-ink-800/70 py-1.5 pl-2.5 pr-2 text-left transition-colors hover:border-mist-600"
      >
        <span className="rounded-md bg-ink-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-mist-500">
          Demo
        </span>
        <span className="min-w-0">
          <span className="tabular block text-sm font-medium leading-tight text-mist-100">
            {pendingId ?? selectedId}
          </span>
          <span className="hidden text-[11px] leading-tight text-mist-500 sm:block">
            {titleCase(selected?.occupation) || "Profile"}
          </span>
        </span>
        {pendingId ? (
          <Loader2 className="h-4 w-4 animate-spin text-accent-400" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4 text-mist-500" aria-hidden="true" />
        )}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Switch demo profile"
          onKeyDown={onKeyDown}
          className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-ink-600 bg-ink-850 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3 border-b border-ink-700 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-mist-100">Switch demo profile</p>
              <p className="mt-0.5 text-xs leading-relaxed text-mist-500">
                In real use you would only see your own numbers. This switcher lets you explore
                how the forecast behaves across {workers.length} sample profiles.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
              }}
              aria-label="Close profile switcher"
              className="shrink-0 rounded-lg p-1 text-mist-500 transition-colors hover:bg-ink-800 hover:text-mist-100"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center gap-2 border-b border-ink-700 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-mist-600" aria-hidden="true" />
            <label htmlFor="worker-search" className="sr-only">
              Search profiles by ID, occupation, or city
            </label>
            <input
              id="worker-search"
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search ID, occupation, city…"
              className="w-full bg-transparent py-1 text-sm text-mist-100 placeholder:text-mist-600 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 border-b border-ink-700 px-3 py-2">
            {(
              [
                ["all", `All ${workers.length}`],
                ["at-risk", `At risk ${atRiskCount}`],
                ["safe", "Safe"],
              ] as [Filter, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={cn(
                  "rounded-lg px-2 py-1 text-xs font-medium transition-colors",
                  filter === value
                    ? "bg-accent-500/15 text-accent-400"
                    : "text-mist-500 hover:bg-ink-800 hover:text-mist-200",
                )}
              >
                {label}
              </button>
            ))}
            {bestDemoId ? (
              <button
                type="button"
                onClick={() => select(bestDemoId)}
                className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-accent-400 transition-colors hover:bg-accent-500/10"
              >
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                Best demo
              </button>
            ) : null}
          </div>

          <ul
            ref={listRef}
            role="listbox"
            aria-label="Demo profiles"
            className="max-h-72 overflow-y-auto py-1"
          >
            {results.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-mist-500">
                No profiles match that search.
              </li>
            ) : (
              results.map((worker, index) => {
                const active = worker.id === selectedId;
                const highlighted = index === activeIndex;
                return (
                  <li key={worker.id}>
                    <button
                      type="button"
                      role="option"
                      data-index={index}
                      aria-selected={active}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => select(worker.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors",
                        highlighted && "bg-ink-800",
                        active && "bg-accent-500/10",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="tabular flex items-center gap-2 text-sm font-medium text-mist-100">
                          {worker.id}
                          {worker.id === bestDemoId ? (
                            <span className="rounded bg-accent-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-400">
                              Best demo
                            </span>
                          ) : null}
                        </span>
                        <span className="block truncate text-xs text-mist-500">
                          {titleCase(worker.occupation)} · {titleCase(worker.payType)} pay ·{" "}
                          {worker.city}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <BufferPreview worker={worker} />
                        {active ? (
                          <Check className="h-4 w-4 text-accent-400" aria-hidden="true" />
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <p className="border-t border-ink-700 px-4 py-2 text-[11px] text-mist-600">
            {results.length === workers.length
              ? "Use ↑ ↓ to browse, Enter to open."
              : `${results.length} of ${workers.length} profiles · ↑ ↓ to browse, Enter to open.`}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Shows each profile's outcome so switching is a choice, not a guess. */
function BufferPreview({ worker }: { worker: WorkerOption }) {
  if (!worker.status) return null;
  const meta = STATUS_META[worker.status as ForecastStatus];
  const label = worker.survivesWindow ? "7+ days" : `${formatDays(worker.safeDays ?? 0)} days`;
  return (
    <span
      className={cn(
        "tabular inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        meta.bg,
        meta.border,
        meta.text,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} aria-hidden="true" />
      {label}
    </span>
  );
}
