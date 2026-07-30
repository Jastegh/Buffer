"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarRange, ListChecks, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type TabId = "forecast" | "plan" | "patterns";

const TABS: { id: TabId; label: string; hint: string; icon: typeof CalendarRange }[] = [
  { id: "forecast", label: "Why & when", hint: "The week ahead, day by day", icon: CalendarRange },
  { id: "plan", label: "What to do", hint: "Actions and what-if scenarios", icon: ListChecks },
  { id: "patterns", label: "Patterns", hint: "What your history shows", icon: Sparkles },
];

/**
 * Splits the dashboard into three focused views instead of one long scroll.
 * Panels are rendered on the server and passed in as nodes, so switching tabs
 * costs nothing and no analytics work moves to the browser.
 */
export function DashboardTabs({
  forecast,
  plan,
  patterns,
  badges,
}: {
  forecast: React.ReactNode;
  plan: React.ReactNode;
  patterns: React.ReactNode;
  badges?: Partial<Record<TabId, string>>;
}) {
  const [active, setActive] = useState<TabId>("forecast");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const activate = useCallback((id: TabId, focus = false) => {
    setActive(id);
    if (focus) tabRefs.current[id]?.focus();
  }, []);

  // Deep links like /?tab=plan, and the hero's "See what I can do" button.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested && TABS.some((tab) => tab.id === requested)) setActive(requested as TabId);

    function onJump(event: Event) {
      const id = (event as CustomEvent<TabId>).detail;
      if (TABS.some((tab) => tab.id === id)) {
        setActive(id);
        document.getElementById("tab-nav")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    window.addEventListener("buffer:tab", onJump);
    return () => window.removeEventListener("buffer:tab", onJump);
  }, []);

  function onKeyDown(event: React.KeyboardEvent) {
    const index = TABS.findIndex((tab) => tab.id === active);
    if (event.key === "ArrowRight") {
      event.preventDefault();
      activate(TABS[(index + 1) % TABS.length].id, true);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      activate(TABS[(index - 1 + TABS.length) % TABS.length].id, true);
    } else if (event.key === "Home") {
      event.preventDefault();
      activate(TABS[0].id, true);
    } else if (event.key === "End") {
      event.preventDefault();
      activate(TABS[TABS.length - 1].id, true);
    }
  }

  return (
    <>
      <div
        id="tab-nav"
        className="sticky top-[var(--header-h)] z-30 -mx-4 border-b border-ink-700/60 bg-ink-950/90 px-4 backdrop-blur sm:-mx-6 sm:px-6"
      >
        <div
          role="tablist"
          aria-label="Dashboard sections"
          onKeyDown={onKeyDown}
          className="mx-auto flex max-w-7xl gap-1 overflow-x-auto"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const selected = tab.id === active;
            return (
              <button
                key={tab.id}
                ref={(node) => {
                  tabRefs.current[tab.id] = node;
                }}
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => activate(tab.id)}
                className={cn(
                  "group relative flex shrink-0 items-center gap-2 px-3 py-3 text-sm font-medium transition-colors sm:px-4",
                  selected ? "text-mist-100" : "text-mist-500 hover:text-mist-200",
                )}
              >
                <Icon
                  className={cn("h-4 w-4", selected ? "text-accent-400" : "text-mist-600")}
                  aria-hidden="true"
                />
                <span className="whitespace-nowrap">{tab.label}</span>
                {badges?.[tab.id] ? (
                  <span
                    className={cn(
                      "tabular rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      selected ? "bg-accent-500/15 text-accent-400" : "bg-ink-800 text-mist-500",
                    )}
                  >
                    {badges[tab.id]}
                  </span>
                ) : null}
                <span
                  className={cn(
                    "absolute inset-x-2 bottom-0 h-0.5 rounded-full transition-colors",
                    selected ? "bg-accent-400" : "bg-transparent",
                  )}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-6">
        <TabPanel id="forecast" active={active}>
          {forecast}
        </TabPanel>
        <TabPanel id="plan" active={active}>
          {plan}
        </TabPanel>
        <TabPanel id="patterns" active={active}>
          {patterns}
        </TabPanel>
      </div>
    </>
  );
}

function TabPanel({
  id,
  active,
  children,
}: {
  id: TabId;
  active: TabId;
  children: React.ReactNode;
}) {
  const selected = id === active;
  return (
    <div
      role="tabpanel"
      id={`panel-${id}`}
      aria-labelledby={`tab-${id}`}
      hidden={!selected}
      tabIndex={0}
      className={cn(selected && "animate-in")}
    >
      {selected ? children : null}
    </div>
  );
}

/** Lets a button anywhere on the page jump to a tab. */
export function jumpToTab(id: TabId) {
  window.dispatchEvent(new CustomEvent("buffer:tab", { detail: id }));
}
