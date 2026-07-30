/**
 * Normalized domain models for Buffer.
 *
 * Every model is derived from the CSV files in `public/data` through
 * `lib/mappings.ts`. Raw CSV records are never mutated; mappers always
 * produce new objects and leave unmappable fields `undefined` rather than
 * inventing values.
 */

export type Worker = {
  id: string;
  city?: string;
  province?: string;
  occupation?: string;
  payType?: string;
  typicalDailyNet?: number;
  incomeVolatility?: number;
  tipShare?: number;
  householdSize?: number;
  dependents?: number;
  hasBankAccount?: boolean;
  usesPrepaidCard?: boolean;
  primaryEmployerId?: string;
  tenureMonths?: number;
  hasSideGig?: boolean;
  commuteMode?: string;
  rentBurdenBand?: string;
};

export type Earning = {
  id?: string;
  workerId: string;
  shiftDate: Date;
  /** Date the money actually lands. Resolved from the linked income credit when available. */
  payoutDate: Date;
  employerId?: string;
  shiftType?: string;
  hoursWorked?: number;
  grossPay?: number;
  tips?: number;
  deductions?: number;
  netPay: number;
  paidSameDay?: boolean;
  payMethod?: string;
};

export type Obligation = {
  id?: string;
  workerId: string;
  name: string;
  category: string;
  amount: number;
  dueDate?: Date;
  dueDay?: number;
  frequency?: string;
  recurring: boolean;
  autopay?: boolean;
  essential?: boolean;
};

export type Transaction = {
  id?: string;
  workerId: string;
  date: Date;
  amount: number;
  direction: "credit" | "debit";
  category?: string;
  merchantType?: string;
  channel?: string;
  essential?: boolean;
  runningBalance?: number;
  /** Obligation this debit settled, parsed from the `notes` column. */
  obligationId?: string;
  /** Earning this credit paid out, parsed from the `notes` column. */
  earningsId?: string;
};

export type WageAdvance = {
  id?: string;
  workerId: string;
  date: Date;
  amount: number;
  fee?: number;
  reason?: string;
  repaymentStatus?: string;
  repaymentSource?: string;
  repaymentDate?: Date;
};

export type WeeklyCashflow = {
  workerId: string;
  weekStart: Date;
  income?: number;
  expense?: number;
  essentialSpend?: number;
  netCashflow?: number;
  advancesCount?: number;
  advances?: number;
  advanceFees?: number;
  endingBalance?: number;
  bufferDays?: number;
  negativeBalance?: boolean;
};

export type ForecastStatus = "safe" | "watch" | "at-risk";

export type ForecastEvent = {
  label: string;
  amount: number;
  kind: "income" | "obligation" | "essentials" | "scenario";
  /** True when the value comes from an observed record rather than an estimate. */
  confirmed?: boolean;
};

export type DailyForecast = {
  date: string;
  startingBalance: number;
  expectedIncome: number;
  /** Portion of `expectedIncome` already confirmed by a scheduled payout. */
  confirmedIncome: number;
  obligations: number;
  expectedEssentialSpending: number;
  scenarioAdjustment: number;
  endingBalance: number;
  status: ForecastStatus;
  events: ForecastEvent[];
};

export type ForecastResult = {
  days: DailyForecast[];
  startingBalance: number;
  safeDays: number;
  /** True when the balance never breaches the floor inside the window. */
  survivesWindow: boolean;
  shortfallDate?: string;
  shortfallAmount?: number;
  lowestBalance: number;
  lowestBalanceDate: string;
  totalExpectedIncome: number;
  totalObligations: number;
  totalEssentials: number;
  status: ForecastStatus;
  safetyFloor: number;
};

export type Confidence = "high" | "medium" | "low";

export type DataCoverage = {
  earnings: number;
  transactions: number;
  obligations: number;
  advances: number;
  weeks: number;
  historyDays: number;
  confidence: Confidence;
  confidenceReasons: string[];
};

export type Insight = {
  id: string;
  title: string;
  body: string;
  metricLabel: string;
  metricValue: string;
  recommendation?: string;
  trend?: "up" | "down" | "flat";
  tone: "positive" | "neutral" | "caution";
};

export type Recommendation = {
  id: string;
  action: string;
  impact: string;
  why: string;
  emphasis: "primary" | "secondary";
};

/** Everything the client needs to re-run the forecast for what-if scenarios. */
export type ForecastInputs = {
  anchorDate: string;
  startingBalance: number;
  safetyFloor: number;
  horizonDays: number;
  /** Per-day baseline: expected income, confirmed income, obligations, essentials. */
  days: {
    date: string;
    expectedIncome: number;
    confirmedIncome: number;
    /** Historic likelihood of a payout arriving on this weekday, 0–1. */
    incomeProbability: number;
    obligations: number;
    obligationLabels: { label: string; amount: number }[];
    essentials: number;
  }[];
  medianShiftNet: number;
  typicalAdvanceFeeRate: number;
  /** Largest advance the worker has taken before, used to keep advice realistic. */
  maxHistoricAdvance: number;
};

export type WorkerOption = {
  id: string;
  occupation?: string;
  payType?: string;
  city?: string;
};
