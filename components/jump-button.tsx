"use client";

import { ArrowRight } from "lucide-react";
import { jumpToTab, type TabId } from "./dashboard-tabs";
import { cn } from "@/lib/utils";

/** Moves the reader to another section instead of making them hunt by scrolling. */
export function JumpButton({
  tab,
  children,
  variant = "primary",
}: {
  tab: TabId;
  children: React.ReactNode;
  variant?: "primary" | "ghost";
}) {
  return (
    <button
      type="button"
      onClick={() => jumpToTab(tab)}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors",
        variant === "primary"
          ? "bg-accent-500 text-white hover:bg-accent-400"
          : "border border-ink-600 text-mist-300 hover:border-mist-600 hover:text-mist-100",
      )}
    >
      {children}
      <ArrowRight
        className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </button>
  );
}
