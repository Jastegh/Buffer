import {
  parseBool,
  parseDate,
  parseMoney,
  parseNumber,
  pick,
  resolveColumn,
  warnOnce,
  type RawRow,
} from "./csv";
import type {
  Earning,
  Obligation,
  Transaction,
  WageAdvance,
  WeeklyCashflow,
  Worker,
} from "./types";

/**
 * Column aliases. The first entry of each list is the column actually present in
 * the shipped dataset; the rest let the app survive a differently-named export.
 */
export const ALIASES = {
  workerId: ["worker_id", "workerid", "worker", "profile_id", "person_id", "id"],
  netPay: ["net_pay_cad", "net_pay", "net", "payout_amount", "take_home_pay", "earnings_net"],
  grossPay: ["gross_pay_cad", "gross_pay", "gross"],
  tips: ["tips_cad", "tips", "tip_amount"],
  deductions: ["deductions_cad", "deductions"],
  shiftDate: ["work_date", "shift_date", "date", "earned_date"],
  payoutDate: ["payout_date", "paid_date", "deposit_date"],
  amount: ["amount_cad", "amount", "value", "amount_usd"],
  fee: ["fee_cad", "fee", "fees"],
  txnDate: ["txn_ts", "transaction_date", "date", "posted_at", "timestamp"],
  advanceDate: ["requested_at", "advance_date", "date", "requested_on"],
  repaidDate: ["repaid_at", "repayment_date", "repaid_on"],
  dueDay: ["due_day_of_month", "due_day", "day_of_month"],
  dueDate: ["due_date", "next_due_date"],
  weekStart: ["week_start", "week_starting", "week_ending", "week"],
  runningBalance: ["running_balance_cad", "running_balance", "balance", "balance_after"],
  endingBalance: ["ending_balance_cad", "ending_balance", "end_balance", "closing_balance"],
} as const;

function requireColumn(rows: RawRow[], aliases: readonly string[], file: string, field: string) {
  if (!rows.length) return;
  if (!resolveColumn(rows[0], aliases)) {
    warnOnce(`${file}: no column found for "${field}" (tried ${aliases.join(", ")}).`);
  }
}

export function mapWorkers(rows: RawRow[]): Worker[] {
  requireColumn(rows, ALIASES.workerId, "workers.csv", "worker id");
  const workers: Worker[] = [];
  for (const row of rows) {
    const id = pick(row, ALIASES.workerId);
    if (!id) continue;
    workers.push({
      id,
      city: pick(row, ["city"]),
      province: pick(row, ["province", "state", "region"]),
      occupation: pick(row, ["occupation", "job_title", "role"]),
      payType: pick(row, ["pay_type", "paytype", "pay_frequency"]),
      typicalDailyNet: parseMoney(pick(row, ["typical_daily_net_cad", "typical_daily_net"])),
      incomeVolatility: parseNumber(pick(row, ["income_volatility", "volatility"])),
      tipShare: parseNumber(pick(row, ["tip_share"])),
      householdSize: parseNumber(pick(row, ["household_size"])),
      dependents: parseNumber(pick(row, ["dependents", "num_dependents"])),
      hasBankAccount: parseBool(pick(row, ["has_bank_account", "banking_access"])),
      usesPrepaidCard: parseBool(pick(row, ["uses_prepaid_card"])),
      primaryEmployerId: pick(row, ["primary_employer_id", "employer_id"]),
      tenureMonths: parseNumber(pick(row, ["tenure_months"])),
      hasSideGig: parseBool(pick(row, ["has_side_gig"])),
      commuteMode: pick(row, ["commute_mode"]),
      rentBurdenBand: pick(row, ["rent_burden_band", "rent_burden"]),
    });
  }
  return workers;
}

export function mapEarnings(rows: RawRow[]): Earning[] {
  requireColumn(rows, ALIASES.workerId, "daily_earnings.csv", "worker id");
  requireColumn(rows, ALIASES.netPay, "daily_earnings.csv", "net pay");
  requireColumn(rows, ALIASES.shiftDate, "daily_earnings.csv", "shift date");
  const earnings: Earning[] = [];
  for (const row of rows) {
    const workerId = pick(row, ALIASES.workerId);
    const shiftDate = parseDate(pick(row, ALIASES.shiftDate));
    const netPay = parseMoney(pick(row, ALIASES.netPay));
    if (!workerId || !shiftDate || netPay === undefined) continue;
    // The dataset has no payout-date column; it is refined later from the linked
    // income credit in transactions.csv. Same-day pay defaults to the shift date.
    const payoutDate = parseDate(pick(row, ALIASES.payoutDate)) ?? shiftDate;
    earnings.push({
      id: pick(row, ["earnings_id", "id"]),
      workerId,
      shiftDate,
      payoutDate,
      employerId: pick(row, ["employer_id"]),
      shiftType: pick(row, ["shift_type"]),
      hoursWorked: parseNumber(pick(row, ["hours_worked", "hours"])),
      grossPay: parseMoney(pick(row, ALIASES.grossPay)),
      tips: parseMoney(pick(row, ALIASES.tips)),
      deductions: parseMoney(pick(row, ALIASES.deductions)),
      netPay,
      paidSameDay: parseBool(pick(row, ["paid_same_day"])),
      payMethod: pick(row, ["pay_method"]),
    });
  }
  return earnings;
}

export function mapObligations(rows: RawRow[]): Obligation[] {
  requireColumn(rows, ALIASES.workerId, "recurring_obligations.csv", "worker id");
  const obligations: Obligation[] = [];
  for (const row of rows) {
    const workerId = pick(row, ALIASES.workerId);
    const amount = parseMoney(pick(row, ALIASES.amount));
    if (!workerId || amount === undefined) continue;
    const frequency = pick(row, ["frequency", "cadence", "recurrence"]);
    obligations.push({
      id: pick(row, ["obligation_id", "id"]),
      workerId,
      name: pick(row, ["name", "label", "description"]) ?? "Recurring bill",
      category: pick(row, ["category", "type"]) ?? "other",
      amount,
      dueDate: parseDate(pick(row, ALIASES.dueDate)),
      dueDay: parseNumber(pick(row, ALIASES.dueDay)),
      frequency,
      recurring: frequency ? frequency.toLowerCase() !== "one_time" : true,
      autopay: parseBool(pick(row, ["autopay", "auto_pay"])),
      essential: parseBool(pick(row, ["essential", "is_essential"])),
    });
  }
  return obligations;
}

const NOTE_OBLIGATION = /obligation_id\s*=\s*([\w-]+)/i;
const NOTE_EARNINGS = /(?:linked_)?earnings_id\s*=\s*([\w-]+)/i;

export function mapTransactions(rows: RawRow[]): Transaction[] {
  requireColumn(rows, ALIASES.workerId, "transactions.csv", "worker id");
  requireColumn(rows, ALIASES.txnDate, "transactions.csv", "transaction date");
  const transactions: Transaction[] = [];
  for (const row of rows) {
    const workerId = pick(row, ALIASES.workerId);
    const date = parseDate(pick(row, ALIASES.txnDate));
    const amount = parseMoney(pick(row, ALIASES.amount));
    if (!workerId || !date || amount === undefined) continue;
    const rawDirection = (pick(row, ["direction", "type", "flow"]) ?? "").toLowerCase();
    let direction: "credit" | "debit";
    if (rawDirection.startsWith("c") || rawDirection === "in" || rawDirection === "deposit") {
      direction = "credit";
    } else if (rawDirection) {
      direction = "debit";
    } else {
      // No direction column: fall back to the sign of the amount.
      direction = amount >= 0 ? "credit" : "debit";
    }
    const notes = pick(row, ["notes", "memo", "description"]) ?? "";
    transactions.push({
      id: pick(row, ["txn_id", "transaction_id", "id"]),
      workerId,
      date,
      amount: Math.abs(amount),
      direction,
      category: pick(row, ["category"]),
      merchantType: pick(row, ["merchant_type", "merchant"]),
      channel: pick(row, ["channel", "method"]),
      essential: parseBool(pick(row, ["is_essential", "essential"])),
      runningBalance: parseMoney(pick(row, ALIASES.runningBalance)),
      obligationId: notes.match(NOTE_OBLIGATION)?.[1],
      earningsId: notes.match(NOTE_EARNINGS)?.[1],
    });
  }
  return transactions;
}

export function mapAdvances(rows: RawRow[]): WageAdvance[] {
  const advances: WageAdvance[] = [];
  for (const row of rows) {
    const workerId = pick(row, ALIASES.workerId);
    const date = parseDate(pick(row, ALIASES.advanceDate));
    const amount = parseMoney(pick(row, ALIASES.amount));
    if (!workerId || !date || amount === undefined) continue;
    advances.push({
      id: pick(row, ["advance_id", "id"]),
      workerId,
      date,
      amount,
      fee: parseMoney(pick(row, ALIASES.fee)),
      reason: pick(row, ["reason_code", "reason"]),
      repaymentStatus: pick(row, ["status", "repayment_status"]),
      repaymentSource: pick(row, ["repayment_source"]),
      repaymentDate: parseDate(pick(row, ALIASES.repaidDate)),
    });
  }
  return advances;
}

export function mapWeekly(rows: RawRow[]): WeeklyCashflow[] {
  const weekly: WeeklyCashflow[] = [];
  for (const row of rows) {
    const workerId = pick(row, ALIASES.workerId);
    const weekStart = parseDate(pick(row, ALIASES.weekStart));
    if (!workerId || !weekStart) continue;
    weekly.push({
      workerId,
      weekStart,
      income: parseMoney(pick(row, ["income_cad", "income"])),
      expense: parseMoney(pick(row, ["expense_cad", "expense"])),
      essentialSpend: parseMoney(pick(row, ["essential_expense_cad", "essential_expense"])),
      netCashflow: parseMoney(pick(row, ["net_cashflow_cad", "net_cashflow"])),
      advancesCount: parseNumber(pick(row, ["advances_count"])),
      advances: parseMoney(pick(row, ["advances_amount_cad", "advances_amount"])),
      advanceFees: parseMoney(pick(row, ["advance_fees_cad", "advance_fees"])),
      endingBalance: parseMoney(pick(row, ALIASES.endingBalance)),
      bufferDays: parseNumber(pick(row, ["buffer_days_estimate", "buffer_days"])),
      negativeBalance: parseBool(pick(row, ["negative_balance_flag"])),
    });
  }
  return weekly;
}
