"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Search, Sparkles } from "lucide-react";
import type { WorkerOption } from "@/lib/types";
import { cn } from "@/lib/utils";
import { titleCase } from "@/lib/formatters";

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
  const [pending, setPending] = useState<string | undefined>();
  const containerRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? workers.filter(
          (worker) =>
            worker.id.toLowerCase().includes(needle) ||
            worker.occupation?.toLowerCase().includes(needle) ||
            worker.city?.toLowerCase().includes(needle) ||
            worker.payType?.toLowerCase().includes(needle),
        )
      : workers;
    return matches.slice(0, 40);
  }, [workers, query]);

  function select(id: string) {
    setPending(id);
    setOpen(false);
    setQuery("");
    router.push(id === bestDemoId ? "/" : `/?worker=${id}`);
  }

  const selected = workers.find((worker) => worker.id === selectedId);

  return (
    <div
      className="relative"
      ref={containerRef}
      onBlur={(event) => {
        if (!containerRef.current?.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-haspopup="listbox"
          className="flex items-center gap-2 rounded-xl border border-ink-600 bg-ink-800/80 px-3 py-2 text-sm font-medium text-mist-100 transition-colors hover:border-mist-600"
        >
          <span className="tabular">{selectedId}</span>
          <span className="hidden text-mist-500 sm:inline">
            · {titleCase(selected?.occupation) || "Worker"}
          </span>
          <ChevronDown className="h-4 w-4 text-mist-500" aria-hidden="true" />
        </button>

        {bestDemoId && selectedId !== bestDemoId ? (
          <button
            type="button"
            onClick={() => select(bestDemoId)}
            className="flex items-center gap-1.5 rounded-xl border border-accent-500/40 bg-accent-500/10 px-3 py-2 text-sm font-medium text-accent-400 transition-colors hover:bg-accent-500/20"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Best demo profile
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-ink-600 bg-ink-850 shadow-2xl">
          <div className="flex items-center gap-2 border-b border-ink-700 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-mist-600" aria-hidden="true" />
            <label htmlFor="worker-search" className="sr-only">
              Search workers by ID, occupation, or city
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
          <ul role="listbox" aria-label="Workers" className="max-h-72 overflow-y-auto py-1">
            {results.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-mist-500">No workers match that search.</li>
            ) : (
              results.map((worker) => {
                const active = worker.id === selectedId;
                return (
                  <li key={worker.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => select(worker.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-ink-800",
                        active && "bg-ink-800",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="tabular block font-medium text-mist-100">
                          {worker.id}
                          {worker.id === bestDemoId ? (
                            <span className="ml-2 rounded bg-accent-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-400">
                              Best demo
                            </span>
                          ) : null}
                        </span>
                        <span className="block truncate text-xs text-mist-500">
                          {titleCase(worker.occupation)} · {titleCase(worker.payType)} pay · {worker.city}
                        </span>
                      </span>
                      {active ? <Check className="h-4 w-4 shrink-0 text-accent-400" aria-hidden="true" /> : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          {workers.length > results.length ? (
            <p className="border-t border-ink-700 px-3 py-2 text-[11px] text-mist-600">
              Showing {results.length} of {workers.length}. Keep typing to narrow the list.
            </p>
          ) : null}
        </div>
      ) : null}

      {pending ? <span className="sr-only" role="status">Loading worker {pending}</span> : null}
    </div>
  );
}
