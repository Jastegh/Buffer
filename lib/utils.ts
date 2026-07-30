import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import type { ForecastStatus } from "./types";

/**
 * Status styling as Tailwind classes only, so it follows the active theme.
 * Chart colours, which cannot be classes, live in components/theme-provider.
 */
export const STATUS_META: Record<
  ForecastStatus,
  { label: string; text: string; bg: string; border: string; dot: string }
> = {
  safe: {
    label: "Safe",
    text: "text-safe-400",
    bg: "bg-safe-950",
    border: "border-safe-500/30",
    dot: "bg-safe-400",
  },
  watch: {
    label: "Watch",
    text: "text-watch-400",
    bg: "bg-watch-950",
    border: "border-watch-500/30",
    dot: "bg-watch-400",
  },
  "at-risk": {
    label: "At Risk",
    text: "text-risk-400",
    bg: "bg-risk-950",
    border: "border-risk-500/30",
    dot: "bg-risk-400",
  },
};
