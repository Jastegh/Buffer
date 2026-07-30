import type { WorkerBundle } from "./data";
import { addDaysKey, fromKey, toKey } from "./formatters";
import { runForecast } from "./forecast";
import type {
  Confidence,
  DataCoverage,
  ForecastInputs,
  ForecastResult,
  Obligation,
  Transaction,
} from "./types";

export const HORIZON_DAYS = 7;
export const SAFETY_FLOOR = 0;

/* ------------------------------------------------------------------ stats */

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - avg) ** 2)));
}

/** Trims the top and bottom 10% so one huge shift cannot distort the forecast. */
export function trimmedMedian(values: number[]): number {
  if (values.length < 5) return median(values);
  const sorted = [...values].sort((a, b) => a - b);
  const cut = Math.floor(sorted.length * 0.1);
  return median(sorted.slice(cut, sorted.length - cut));
}

/* ---------------------------------------------------------- analysis date */

export type AnalysisDate = {
  key: string;
  method: string;
};

/**
 * The demo's "today". Never the machine clock — these are synthetic 2026 dates.
 *
 * Priority: the worker's last day of real activity (a shift worked or money
 * spent), then their last observed transaction, then the dataset maximum.
 * Income credits *after* that day are payouts for shifts already worked, so
 * they legitimately land inside the forecast window as confirmed income.
 */
export function resolveAnalysisDate(bundle: WorkerBundle, datasetMaxKey?: string): AnalysisDate {
  const lastShift = bundle.earnings.at(-1)?.shiftDate;
  const debits = bundle.transactions.filter((t) => t.direction === "debit");
  const lastDebit = debits.at(-1)?.date;

  const candidates: { date: Date; label: string }[] = [];
  if (lastShift) candidates.push({ date: lastShift, label: "last shift worked" });
  if (lastDebit) candidates.push({ date: lastDebit, label: "last spending activity" });

  if (candidates.length) {
    const best = candidates.reduce((a, b) => (a.date >= b.date ? a : b));
    const labels = candidates
      .filter((c) => toKey(c.date) === toKey(best.date))
      .map((c) => c.label);
    return { key: toKey(best.date), method: labels.join(" and ") };
  }

  const lastTxn = bundle.transactions.at(-1)?.date;
  if (lastTxn) return { key: toKey(lastTxn), method: "last recorded transaction" };

  const lastWeek = bundle.weekly.at(-1)?.weekStart;
  if (lastWeek) return { key: addDaysKey(toKey(lastWeek), 6), method: "last summarized week" };

  if (datasetMaxKey) return { key: datasetMaxKey, method: "latest date in the dataset" };
  return { key: toKey(new Date()), method: "system date (no dated records found)" };
}

/* -------------------------------------------------------- current balance */

export type BalanceResult = {
  balance: number;
  method: string;
  asOf?: string;
  validation?: { weeklyEndingBalance: number; matches: boolean };
};

/**
 * Current available balance.
 *
 * 1. Running balance on the newest transaction at or before the analysis date.
 * 2. Latest weekly ending balance.
 * 3. Net of credits and debits.
 *
 * (1) is preferred and is cross-validated against (2): in this dataset the
 * weekly `ending_balance_cad` equals the running balance of the last
 * transaction of that week for every row checked, so the two agree.
 * Summing credits and debits is *not* used when a running balance exists,
 * because the ledger's net flow does not reconcile with its own balance column.
 */
export function resolveCurrentBalance(bundle: WorkerBundle, anchorKey: string): BalanceResult {
  const anchor = fromKey(anchorKey);
  const upTo = bundle.transactions.filter(
    (t) => t.date <= new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), 23, 59, 59),
  );
  const withBalance = upTo.filter((t) => t.runningBalance !== undefined);

  // Validate against the last *complete* week, so a partially elapsed week
  // (whose ending balance reflects days after the anchor) is not compared.
  const weeklyEnding = bundle.weekly
    .filter(
      (w) =>
        w.endingBalance !== undefined &&
        fromKey(addDaysKey(toKey(w.weekStart), 6)) <= anchor,
    )
    .at(-1);

  if (withBalance.length) {
    const latest = withBalance.at(-1)!;
    const balance = latest.runningBalance!;

    // Cross-check the ledger against weekly_cashflow_summary: the running
    // balance of the last transaction of a completed week should equal that
    // week's reported ending balance.
    let validation: BalanceResult["validation"];
    if (weeklyEnding?.endingBalance !== undefined) {
      const weekEnd = endOfDay(fromKey(addDaysKey(toKey(weeklyEnding.weekStart), 6)));
      const lastOfWeek = withBalance.filter((t) => t.date <= weekEnd).at(-1);
      if (lastOfWeek?.runningBalance !== undefined) {
        validation = {
          weeklyEndingBalance: weeklyEnding.endingBalance,
          matches: Math.abs(weeklyEnding.endingBalance - lastOfWeek.runningBalance) < 1,
        };
      }
    }

    return {
      balance,
      method: "Running balance on the most recent transaction",
      asOf: toKey(latest.date),
      validation,
    };
  }

  if (weeklyEnding?.endingBalance !== undefined) {
    return {
      balance: weeklyEnding.endingBalance,
      method: "Latest weekly ending balance (no running balance in the ledger)",
      asOf: toKey(weeklyEnding.weekStart),
    };
  }

  if (upTo.length) {
    const net = upTo.reduce((sum, t) => sum + (t.direction === "credit" ? t.amount : -t.amount), 0);
    return { balance: net, method: "Net of all recorded credits and debits" };
  }

  return { balance: 0, method: "No transaction history available" };
}

/* ------------------------------------------------------------ income model */

export type IncomeModel = {
  /** Expected payout arriving on each weekday (0 = Sunday). */
  byWeekday: number[];
  workProbabilityByWeekday: number[];
  medianPayoutByWeekday: number[];
  medianShiftNet: number;
  weeksObserved: number;
  payoutLagDays: number;
};

const LOOKBACK_DAYS = 56; // eight weeks

/**
 * Expected income is modelled on *payout arrival*, not shift date, because the
 * balance only moves when the money lands.
 *
 * expected(weekday) = P(a payout arrives on that weekday) × median payout size
 *
 * Modelling arrivals directly means the payout lag is already baked in and the
 * worker is never assumed to work (or be paid) every day.
 */
export function buildIncomeModel(bundle: WorkerBundle, anchorKey: string): IncomeModel {
  const anchor = fromKey(anchorKey);
  const start = fromKey(addDaysKey(anchorKey, -LOOKBACK_DAYS));

  const credits = bundle.transactions.filter(
    (t) => t.direction === "credit" && t.date > start && t.date <= endOfDay(anchor),
  );

  const amountsByWeekday: number[][] = Array.from({ length: 7 }, () => []);
  const daysWithPayoutByWeekday = Array.from({ length: 7 }, () => new Set<string>());
  for (const credit of credits) {
    const wd = credit.date.getDay();
    amountsByWeekday[wd].push(credit.amount);
    daysWithPayoutByWeekday[wd].add(toKey(credit.date));
  }

  const calendarDaysByWeekday = Array.from({ length: 7 }, () => 0);
  for (let i = 1; i <= LOOKBACK_DAYS; i += 1) {
    calendarDaysByWeekday[fromKey(addDaysKey(anchorKey, -LOOKBACK_DAYS + i)).getDay()] += 1;
  }

  const overallMedian = trimmedMedian(credits.map((c) => c.amount));
  const overallProbability =
    credits.length && LOOKBACK_DAYS
      ? new Set(credits.map((c) => toKey(c.date))).size / LOOKBACK_DAYS
      : 0;

  const workProbabilityByWeekday: number[] = [];
  const medianPayoutByWeekday: number[] = [];
  const byWeekday: number[] = [];

  for (let wd = 0; wd < 7; wd += 1) {
    const observations = amountsByWeekday[wd];
    const calendarDays = calendarDaysByWeekday[wd] || 1;
    // Sparse weekday history falls back to the worker's overall recent pattern.
    const sparse = observations.length < 3;
    const probability = sparse
      ? overallProbability
      : daysWithPayoutByWeekday[wd].size / calendarDays;
    const size = sparse ? overallMedian : trimmedMedian(observations);
    // A weekday can carry more than one payout; scale by payouts per paid day.
    const perPaidDay = daysWithPayoutByWeekday[wd].size
      ? observations.length / daysWithPayoutByWeekday[wd].size
      : 1;
    workProbabilityByWeekday.push(probability);
    medianPayoutByWeekday.push(size);
    byWeekday.push(probability * size * (sparse ? 1 : perPaidDay));
  }

  const recentEarnings = bundle.earnings.filter(
    (e) => e.shiftDate > start && e.shiftDate <= endOfDay(anchor),
  );
  const lags = recentEarnings.map((e) =>
    Math.max(0, Math.round((e.payoutDate.getTime() - e.shiftDate.getTime()) / 86_400_000)),
  );

  return {
    byWeekday,
    workProbabilityByWeekday,
    medianPayoutByWeekday,
    medianShiftNet: trimmedMedian(recentEarnings.map((e) => e.netPay)) || overallMedian,
    weeksObserved: LOOKBACK_DAYS / 7,
    payoutLagDays: lags.length ? median(lags) : 0,
  };
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

/* -------------------------------------------------------- spending model */

export type SpendingModel = {
  essentialPerDay: number;
  discretionaryPerDay: number;
  observationDays: number;
  topEssentialCategories: { category: string; total: number }[];
  topDiscretionaryCategories: { category: string; total: number }[];
};

const SPEND_LOOKBACK_DAYS = 42; // six weeks

/**
 * Everyday essential spending, excluding debits that settle a recurring
 * obligation — those are projected separately and would otherwise be
 * counted twice.
 */
export function buildSpendingModel(bundle: WorkerBundle, anchorKey: string): SpendingModel {
  const anchor = endOfDay(fromKey(anchorKey));
  const start = fromKey(addDaysKey(anchorKey, -SPEND_LOOKBACK_DAYS));
  const debits = bundle.transactions.filter(
    (t) => t.direction === "debit" && t.date > start && t.date <= anchor && !t.obligationId,
  );

  const essential = debits.filter((t) => isEssential(t));
  const discretionary = debits.filter((t) => !isEssential(t));

  const observedDays = Math.min(
    SPEND_LOOKBACK_DAYS,
    Math.max(1, daysOfHistory(bundle, anchorKey)),
  );

  return {
    essentialPerDay: essential.reduce((sum, t) => sum + t.amount, 0) / observedDays,
    discretionaryPerDay: discretionary.reduce((sum, t) => sum + t.amount, 0) / observedDays,
    observationDays: observedDays,
    topEssentialCategories: topCategories(essential),
    topDiscretionaryCategories: topCategories(discretionary),
  };
}

const ESSENTIAL_CATEGORIES = new Set([
  "groceries",
  "food_essentials",
  "transportation",
  "transit",
  "fuel",
  "rent",
  "housing",
  "utilities",
  "childcare",
  "phone",
  "healthcare",
  "debt_payment",
  "remittance",
]);

/** Uses the dataset's own flag when present, otherwise infers conservatively. */
export function isEssential(txn: Transaction): boolean {
  if (txn.essential !== undefined) return txn.essential;
  return txn.category ? ESSENTIAL_CATEGORIES.has(txn.category) : false;
}

function topCategories(transactions: Transaction[]) {
  const totals = new Map<string, number>();
  for (const txn of transactions) {
    const key = txn.category ?? "other";
    totals.set(key, (totals.get(key) ?? 0) + txn.amount);
  }
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 4);
}

function daysOfHistory(bundle: WorkerBundle, anchorKey: string): number {
  const first = bundle.transactions[0]?.date;
  if (!first) return 0;
  return Math.round((fromKey(anchorKey).getTime() - first.getTime()) / 86_400_000) + 1;
}

/* ------------------------------------------------------ obligation mapping */

export type ProjectedObligation = {
  obligation: Obligation;
  date: string;
  amount: number;
};

/**
 * Places recurring obligations onto forecast days.
 *
 * Monthly bills use `due_day_of_month` (clamped to the length of the month).
 * Biweekly bills step forward 14 days from the last observed payment in the
 * ledger. A bill already settled on that date before the anchor is skipped so
 * it is never charged twice.
 */
export function projectObligations(
  bundle: WorkerBundle,
  anchorKey: string,
  horizonDays: number,
): ProjectedObligation[] {
  const projected: ProjectedObligation[] = [];
  const paymentsByObligation = new Map<string, Date[]>();
  for (const txn of bundle.transactions) {
    if (!txn.obligationId) continue;
    const list = paymentsByObligation.get(txn.obligationId) ?? [];
    list.push(txn.date);
    paymentsByObligation.set(txn.obligationId, list);
  }

  const windowKeys = Array.from({ length: horizonDays }, (_, i) => addDaysKey(anchorKey, i + 1));

  for (const obligation of bundle.obligations) {
    const payments = (obligation.id ? paymentsByObligation.get(obligation.id) : undefined) ?? [];
    const paidKeys = new Set(payments.map(toKey));
    const frequency = (obligation.frequency ?? "monthly").toLowerCase();

    if (obligation.dueDate) {
      const key = toKey(obligation.dueDate);
      if (windowKeys.includes(key) && !paidKeys.has(key)) {
        projected.push({ obligation, date: key, amount: obligation.amount });
      }
      continue;
    }

    if (frequency.includes("week")) {
      const step = frequency.includes("bi") || frequency.includes("two") ? 14 : 7;
      const last = payments.sort((a, b) => a.getTime() - b.getTime()).at(-1);
      if (last) {
        let cursor = toKey(last);
        for (let guard = 0; guard < 60; guard += 1) {
          cursor = addDaysKey(cursor, step);
          if (cursor > windowKeys[windowKeys.length - 1]) break;
          if (windowKeys.includes(cursor) && !paidKeys.has(cursor)) {
            projected.push({ obligation, date: cursor, amount: obligation.amount });
          }
        }
      } else if (obligation.dueDay) {
        pushMonthly(projected, obligation, windowKeys, paidKeys);
      }
      continue;
    }

    pushMonthly(projected, obligation, windowKeys, paidKeys);
  }

  return projected.sort((a, b) => a.date.localeCompare(b.date));
}

function pushMonthly(
  projected: ProjectedObligation[],
  obligation: Obligation,
  windowKeys: string[],
  paidKeys: Set<string>,
) {
  if (!obligation.dueDay) return;
  for (const key of windowKeys) {
    const date = fromKey(key);
    const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const dueDay = Math.min(Math.round(obligation.dueDay), lastDayOfMonth);
    if (date.getDate() === dueDay && !paidKeys.has(key)) {
      projected.push({ obligation, date: key, amount: obligation.amount });
    }
  }
}

/* ------------------------------------------------------ forecast assembly */

export type ConfirmedPayout = {
  date: string;
  amount: number;
  shiftDate: string;
};

/** Shifts already worked whose money has not landed yet: real, not estimated. */
export function findConfirmedPayouts(
  bundle: WorkerBundle,
  anchorKey: string,
  horizonDays: number,
): ConfirmedPayout[] {
  const anchor = endOfDay(fromKey(anchorKey));
  const end = endOfDay(fromKey(addDaysKey(anchorKey, horizonDays)));
  return bundle.earnings
    .filter((e) => e.payoutDate > anchor && e.payoutDate <= end && e.shiftDate <= anchor)
    .map((e) => ({
      date: toKey(e.payoutDate),
      amount: e.netPay,
      shiftDate: toKey(e.shiftDate),
    }));
}

export function buildForecastInputs(
  bundle: WorkerBundle,
  anchorKey: string,
  options?: { horizonDays?: number; safetyFloor?: number },
): {
  inputs: ForecastInputs;
  income: IncomeModel;
  spending: SpendingModel;
  balance: BalanceResult;
  projectedObligations: ProjectedObligation[];
  confirmedPayouts: ConfirmedPayout[];
} {
  const horizonDays = options?.horizonDays ?? HORIZON_DAYS;
  const safetyFloor = options?.safetyFloor ?? SAFETY_FLOOR;

  const balance = resolveCurrentBalance(bundle, anchorKey);
  const income = buildIncomeModel(bundle, anchorKey);
  const spending = buildSpendingModel(bundle, anchorKey);
  const projectedObligations = projectObligations(bundle, anchorKey, horizonDays);
  const confirmedPayouts = findConfirmedPayouts(bundle, anchorKey, horizonDays);

  const confirmedByDate = new Map<string, number>();
  for (const payout of confirmedPayouts) {
    confirmedByDate.set(payout.date, (confirmedByDate.get(payout.date) ?? 0) + payout.amount);
  }

  const days = Array.from({ length: horizonDays }, (_, i) => {
    const date = addDaysKey(anchorKey, i + 1);
    const weekday = fromKey(date).getDay();
    const confirmed = confirmedByDate.get(date) ?? 0;
    // An observed payout replaces the estimate for that day rather than adding
    // to it, so already-worked shifts are never counted twice.
    const expectedIncome = Math.max(confirmed, income.byWeekday[weekday] ?? 0);
    const dayObligations = projectedObligations.filter((p) => p.date === date);
    return {
      date,
      expectedIncome,
      confirmedIncome: confirmed,
      incomeProbability: confirmed > 0 ? 1 : (income.workProbabilityByWeekday[weekday] ?? 0),
      obligations: dayObligations.reduce((sum, p) => sum + p.amount, 0),
      obligationLabels: dayObligations.map((p) => ({ label: p.obligation.name, amount: p.amount })),
      essentials: spending.essentialPerDay,
    };
  });

  const advanceFees = bundle.advances.filter((a) => a.fee !== undefined && a.amount > 0);
  const typicalAdvanceFeeRate = advanceFees.length
    ? median(advanceFees.map((a) => (a.fee ?? 0) / a.amount))
    : 0;

  return {
    inputs: {
      anchorDate: anchorKey,
      startingBalance: balance.balance,
      safetyFloor,
      horizonDays,
      days,
      medianShiftNet: income.medianShiftNet,
      typicalAdvanceFeeRate,
      maxHistoricAdvance: bundle.advances.length
        ? Math.max(...bundle.advances.map((a) => a.amount))
        : 0,
    },
    income,
    spending,
    balance,
    projectedObligations,
    confirmedPayouts,
  };
}

/* -------------------------------------------------------------- coverage */

export function buildCoverage(bundle: WorkerBundle, anchorKey: string): DataCoverage {
  const historyDays = daysOfHistory(bundle, anchorKey);
  const recentStart = fromKey(addDaysKey(anchorKey, -28));
  const recentEarnings = bundle.earnings.filter((e) => e.shiftDate > recentStart).length;
  const recentTransactions = bundle.transactions.filter((t) => t.date > recentStart).length;

  const reasons: string[] = [];
  let score = 0;
  if (recentEarnings >= 10) score += 2;
  else if (recentEarnings >= 4) score += 1;
  else reasons.push("few recent shifts");

  if (recentTransactions >= 25) score += 2;
  else if (recentTransactions >= 10) score += 1;
  else reasons.push("thin recent transaction history");

  if (bundle.obligations.length >= 2) score += 1;
  else reasons.push("few recurring bills on file");

  if (historyDays >= 60) score += 1;
  else if (historyDays < 30) reasons.push("short history window");

  const confidence: Confidence = score >= 5 ? "high" : score >= 3 ? "medium" : "low";

  return {
    earnings: bundle.earnings.length,
    transactions: bundle.transactions.length,
    obligations: bundle.obligations.length,
    advances: bundle.advances.length,
    weeks: bundle.weekly.length,
    historyDays,
    confidence,
    confidenceReasons: reasons,
  };
}

export function forecastFor(bundle: WorkerBundle, anchorKey: string): ForecastResult {
  return runForecast(buildForecastInputs(bundle, anchorKey).inputs);
}
