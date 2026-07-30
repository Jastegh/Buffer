import { cn, STATUS_META } from "@/lib/utils";
import type { ForecastStatus } from "@/lib/types";

/**
 * Status is always spelled out in text next to the colour, so it never relies
 * on colour alone.
 */
export function StatusBadge({
  status,
  size = "md",
  className,
}: {
  status: ForecastStatus;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const meta = STATUS_META[status];
  const sizing = {
    sm: "px-2 py-0.5 text-[11px]",
    md: "px-2.5 py-1 text-xs",
    lg: "px-3 py-1.5 text-sm",
  }[size];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border font-semibold uppercase tracking-wider",
        meta.bg,
        meta.border,
        meta.text,
        sizing,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} aria-hidden="true" />
      {meta.label}
    </span>
  );
}
