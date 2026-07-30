import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

export type RawRow = Record<string, string>;

/** "Worker ID" -> "worker_id", "Net-Pay" -> "net_pay" */
export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

const warned = new Set<string>();

export function warnOnce(message: string) {
  if (process.env.NODE_ENV === "production") return;
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`[buffer/data] ${message}`);
}

/**
 * Reads a CSV from `public/data`. Returns an empty array (and warns) when the
 * file is missing or unparseable so that one bad dataset cannot take the page down.
 */
export function readCsv(fileName: string): RawRow[] {
  const filePath = path.join(process.cwd(), "public", "data", fileName);
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    warnOnce(`Missing dataset: ${fileName}. Continuing without it.`);
    return [];
  }
  if (!text.trim()) {
    warnOnce(`Empty dataset: ${fileName}.`);
    return [];
  }
  const parsed = Papa.parse<RawRow>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normalizeHeader,
  });
  if (parsed.errors.length) {
    warnOnce(
      `${fileName}: ${parsed.errors.length} parse warning(s), first: ${parsed.errors[0]?.message}`,
    );
  }
  return (parsed.data ?? []).filter((row) => row && typeof row === "object");
}

/** Returns the first alias present in the row, so schema drift degrades gracefully. */
export function pick(row: RawRow, aliases: readonly string[]): string | undefined {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return undefined;
}

export function resolveColumn(
  row: RawRow | undefined,
  aliases: readonly string[],
): string | undefined {
  if (!row) return undefined;
  return aliases.find((alias) => alias in row);
}

/** Handles "$1,234.50", "(45.00)", "-12", "" and other spreadsheet artefacts. */
export function parseMoney(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const raw = value.trim();
  if (!raw) return undefined;
  const negative = /^\(.*\)$/.test(raw);
  const cleaned = raw.replace(/[()$,\s]/g, "").replace(/[A-Za-z]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return undefined;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return undefined;
  return negative ? -num : num;
}

export function parseNumber(value: string | undefined): number | undefined {
  const num = parseMoney(value);
  return num;
}

export function parseBool(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const raw = value.trim().toLowerCase();
  if (!raw) return undefined;
  if (["1", "true", "yes", "y", "t"].includes(raw)) return true;
  if (["0", "false", "no", "n", "f"].includes(raw)) return false;
  return undefined;
}

/**
 * Parses ISO dates and timestamps as *local calendar days* so a
 * "2026-06-30T23:32:00" record never slips into the next day via UTC shifting.
 */
export function parseDate(value: string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  const raw = value.trim();
  if (!raw) return undefined;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    const [, y, m, d, hh, mm, ss] = iso;
    const date = new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh ?? 0),
      Number(mm ?? 0),
      Number(ss ?? 0),
    );
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? undefined : fallback;
}
