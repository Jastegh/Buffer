import { cn } from "@/lib/utils";

/** Large rounded card used across the dashboard. */
export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-ink-700/70 bg-ink-900/80 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow ? (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-mist-600">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-lg font-semibold tracking-tight text-mist-100 sm:text-xl">{title}</h2>
        {description ? <p className="mt-1 text-sm text-mist-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Metric({
  label,
  value,
  hint,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "safe" | "watch" | "risk";
  className?: string;
}) {
  const toneClass = {
    default: "text-mist-100",
    safe: "text-safe-400",
    watch: "text-watch-400",
    risk: "text-risk-400",
  }[tone];

  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-mist-600">{label}</p>
      <p className={cn("tabular mt-1 text-xl font-semibold tracking-tight sm:text-2xl", toneClass)}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs leading-relaxed text-mist-500">{hint}</p> : null}
    </div>
  );
}

/** Keyboard- and screen-reader-accessible tooltip built on native title + visible popup. */
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-ink-600 text-[10px] font-semibold text-mist-500 transition-colors hover:border-mist-500 hover:text-mist-300"
      >
        ?
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-60 -translate-x-1/2 rounded-lg border border-ink-600 bg-ink-800 p-3 text-xs font-normal leading-relaxed text-mist-300 opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {children}
      </span>
    </span>
  );
}

export function Pill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-ink-600 bg-ink-800/70 px-2.5 py-1 text-xs font-medium text-mist-300",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-ink-600 bg-ink-850/50 p-5 text-center">
      <p className="text-sm font-medium text-mist-300">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-mist-500">{body}</p>
    </div>
  );
}
