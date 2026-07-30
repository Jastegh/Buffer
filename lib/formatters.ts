/** Client-safe formatting and calendar helpers. No Node APIs in this module. */

// The dataset is Alberta-weighted and every money column is suffixed `_cad`.
export const CURRENCY = "CAD";
export const LOCALE = "en-CA";

const currency0 = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
  maximumFractionDigits: 0,
});

const currency2 = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number | undefined, decimals: 0 | 2 = 0): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return decimals === 0 ? currency0.format(value) : currency2.format(value);
}

/** Always shows a leading + or − so forecast rows read as movements. */
export function formatSigned(value: number, decimals: 0 | 2 = 0): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatCurrency(Math.abs(value), decimals)}`;
}

export function formatDays(value: number): string {
  return value.toFixed(1);
}

export function formatPercent(value: number, decimals = 0): string {
  return `${value >= 0 ? "" : "−"}${Math.abs(value).toFixed(decimals)}%`;
}

/** "2026-07-02" -> a local Date at midnight (never UTC-shifted). */
export function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function toKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

export function addDaysKey(key: string, days: number): string {
  return toKey(addDays(fromKey(key), days));
}

export function daysBetween(a: Date, b: Date): number {
  const ms = fromKey(toKey(b)).getTime() - fromKey(toKey(a)).getTime();
  return Math.round(ms / 86_400_000);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function weekdayName(input: Date | string): string {
  const date = typeof input === "string" ? fromKey(input) : input;
  return WEEKDAYS[date.getDay()];
}

/** "Thu, Jul 30" */
export function formatShortDate(input: Date | string): string {
  const date = typeof input === "string" ? fromKey(input) : input;
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

/** "Jul 30, 2026" */
export function formatLongDate(input: Date | string): string {
  const date = typeof input === "string" ? fromKey(input) : input;
  return new Intl.DateTimeFormat(LOCALE, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/** "Jul 30" */
export function formatTinyDate(input: Date | string): string {
  const date = typeof input === "string" ? fromKey(input) : input;
  return new Intl.DateTimeFormat(LOCALE, { month: "short", day: "numeric" }).format(date);
}

/** Forecast rows read better as "Tomorrow" / "Thursday" than as a bare date. */
export function relativeDayLabel(anchorKey: string, dayKey: string): string {
  const delta = daysBetween(fromKey(anchorKey), fromKey(dayKey));
  if (delta === 1) return "Tomorrow";
  if (delta <= 7) return weekdayName(dayKey);
  return formatShortDate(dayKey);
}

/** Same as above but cased for the middle of a sentence: "tomorrow", "Thursday". */
export function relativeDayWord(anchorKey: string, dayKey: string): string {
  const delta = daysBetween(fromKey(anchorKey), fromKey(dayKey));
  if (delta === 1) return "tomorrow";
  if (delta <= 7) return weekdayName(dayKey);
  return formatShortDate(dayKey);
}

/**
 * A day reference with the right preposition attached, so generated sentences
 * never read "on Tomorrow".
 */
export function relativeDayPhrase(anchorKey: string, dayKey: string): string {
  const delta = daysBetween(fromKey(anchorKey), fromKey(dayKey));
  if (delta === 1) return "tomorrow";
  if (delta <= 7) return `on ${weekdayName(dayKey)}`;
  return `on ${formatShortDate(dayKey)}`;
}

export function titleCase(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** "food_out" -> "eating out", used inside generated sentences. */
export function categoryLabel(category: string | undefined): string {
  if (!category) return "other spending";
  const map: Record<string, string> = {
    food_out: "eating out",
    groceries: "groceries",
    transit: "transit",
    childcare: "childcare",
    debt_payment: "loan payments",
    personal_care: "personal care",
    cash_withdrawal: "cash withdrawals",
    entertainment: "entertainment",
    remittance: "money sent home",
    healthcare: "healthcare",
    housing: "housing",
    utilities: "utilities",
    phone: "phone",
    clothing: "clothing",
    misc: "everyday extras",
  };
  return map[category] ?? category.replace(/_/g, " ");
}
