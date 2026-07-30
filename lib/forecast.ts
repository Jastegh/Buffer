import { addDaysKey, fromKey } from "./formatters";
import type {
  DailyForecast,
  ForecastEvent,
  ForecastInputs,
  ForecastResult,
  ForecastStatus,
} from "./types";

/**
 * Pure forecast engine. Deliberately free of Node and React imports so the
 * server render and the client-side what-if simulator run identical maths.
 */

export type Scenario = {
  /** Adds one extra average shift's net pay. */
  extraShift: boolean;
  extraShiftAmount: number;
  extraShiftDayIndex: number;
  /** A discretionary purchase the worker is considering. */
  purchaseAmount: number;
  purchaseDayIndex: number;
  /** Earned-wage advance: temporary cash today, repaid from a later payout. */
  advanceAmount: number;
  advanceFee: number;
  advanceDayIndex: number;
  advanceRepayDayIndex: number;
};

export const EMPTY_SCENARIO: Scenario = {
  extraShift: false,
  extraShiftAmount: 0,
  extraShiftDayIndex: 1,
  purchaseAmount: 0,
  purchaseDayIndex: 1,
  advanceAmount: 0,
  advanceFee: 0,
  advanceDayIndex: 1,
  advanceRepayDayIndex: 5,
};

const WEEKDAY_PLURAL = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
];

function weekdayPlural(dateKey: string): string {
  return WEEKDAY_PLURAL[fromKey(dateKey).getDay()];
}

function statusForBalance(balance: number, floor: number, cushion: number): ForecastStatus {
  if (balance < floor) return "at-risk";
  if (balance < floor + cushion) return "watch";
  return "safe";
}

/**
 * Runs the day-by-day balance projection.
 *
 * Ending balance = starting balance + expected income − scheduled obligations
 *                  − expected essential spending + scenario adjustments.
 */
export function runForecast(inputs: ForecastInputs, scenario?: Scenario): ForecastResult {
  const floor = inputs.safetyFloor;
  const s = scenario;
  const days: DailyForecast[] = [];

  // "Narrow margin" means less than about two days of everyday spending sits
  // between the projected low point and the safety floor.
  const avgEssentials =
    inputs.days.reduce((sum, day) => sum + day.essentials, 0) / Math.max(inputs.days.length, 1);
  const cushion = Math.max(50, avgEssentials * 2);

  let balance = inputs.startingBalance;
  let lowestBalance = inputs.startingBalance;
  let lowestBalanceDate = inputs.anchorDate;
  let shortfallDate: string | undefined;
  let shortfallAmount: number | undefined;
  let safeDays = inputs.horizonDays;
  let breached = false;
  let previousBalance = inputs.startingBalance;

  inputs.days.forEach((day, index) => {
    const dayNumber = index + 1;
    const startingBalance = balance;
    const events: ForecastEvent[] = [];

    const expectedIncome = day.expectedIncome;
    if (day.confirmedIncome > 0) {
      events.push({
        label: "Payout for a shift you already worked",
        amount: day.confirmedIncome,
        kind: "income",
        confirmed: true,
      });
      const estimated = day.expectedIncome - day.confirmedIncome;
      if (estimated > 0.5) {
        events.push({ label: "Estimated additional shift pay", amount: estimated, kind: "income" });
      }
    } else if (expectedIncome > 0.5) {
      const odds = Math.round(day.incomeProbability * 100);
      events.push({
        label:
          odds > 0
            ? `Estimated shift pay (${odds}% of recent ${weekdayPlural(day.date)} paid)`
            : "Estimated shift pay",
        amount: expectedIncome,
        kind: "income",
      });
    }

    for (const obligation of day.obligationLabels) {
      events.push({ label: obligation.label, amount: -obligation.amount, kind: "obligation", confirmed: true });
    }
    if (day.essentials > 0.5) {
      events.push({ label: "Estimated everyday essentials", amount: -day.essentials, kind: "essentials" });
    }

    let scenarioAdjustment = 0;
    if (s) {
      if (s.extraShift && s.extraShiftAmount > 0 && dayNumber === s.extraShiftDayIndex) {
        scenarioAdjustment += s.extraShiftAmount;
        events.push({ label: "Extra shift (scenario)", amount: s.extraShiftAmount, kind: "scenario" });
      }
      if (s.purchaseAmount > 0 && dayNumber === s.purchaseDayIndex) {
        scenarioAdjustment -= s.purchaseAmount;
        events.push({ label: "Optional purchase (scenario)", amount: -s.purchaseAmount, kind: "scenario" });
      }
      if (s.advanceAmount > 0 && dayNumber === s.advanceDayIndex) {
        scenarioAdjustment += s.advanceAmount - s.advanceFee;
        events.push({
          label: "Wage advance received (scenario)",
          amount: s.advanceAmount - s.advanceFee,
          kind: "scenario",
        });
      }
      // An advance is borrowed pay, not new income: it is repaid inside the window.
      if (s.advanceAmount > 0 && dayNumber === s.advanceRepayDayIndex) {
        scenarioAdjustment -= s.advanceAmount;
        events.push({ label: "Advance repaid (scenario)", amount: -s.advanceAmount, kind: "scenario" });
      }
    }

    const endingBalance =
      startingBalance + expectedIncome - day.obligations - day.essentials + scenarioAdjustment;

    balance = endingBalance;

    if (endingBalance < lowestBalance) {
      lowestBalance = endingBalance;
      lowestBalanceDate = day.date;
    }

    if (!breached && endingBalance < floor) {
      breached = true;
      shortfallDate = day.date;
      shortfallAmount = floor - endingBalance;
      // Interpolate the crossing inside the day so the buffer reads as e.g. 1.6 days.
      const drop = previousBalance - endingBalance;
      const fraction = drop > 0 ? Math.max(0, Math.min(1, (previousBalance - floor) / drop)) : 0;
      safeDays = Math.max(0, index + fraction);
    }

    previousBalance = endingBalance;

    days.push({
      date: day.date,
      startingBalance,
      expectedIncome,
      confirmedIncome: day.confirmedIncome,
      obligations: day.obligations,
      expectedEssentialSpending: day.essentials,
      scenarioAdjustment,
      endingBalance,
      status: statusForBalance(endingBalance, floor, cushion),
      events,
    });
  });

  const totalExpectedIncome = days.reduce((sum, d) => sum + d.expectedIncome, 0);
  const totalObligations = days.reduce((sum, d) => sum + d.obligations, 0);
  const totalEssentials = days.reduce((sum, d) => sum + d.expectedEssentialSpending, 0);

  // Ordered so a shortfall arriving later in the window reads as "watch"
  // rather than being collapsed into "at risk" alongside an imminent one.
  let status: ForecastStatus;
  if (safeDays < 2) status = "at-risk";
  else if (breached && safeDays <= 5) status = "watch";
  else if (lowestBalance < floor) status = "at-risk";
  else if (lowestBalance < floor + cushion) status = "watch";
  else status = "safe";

  return {
    days,
    startingBalance: inputs.startingBalance,
    safeDays,
    survivesWindow: !breached,
    shortfallDate,
    shortfallAmount,
    lowestBalance,
    lowestBalanceDate,
    totalExpectedIncome,
    totalObligations,
    totalEssentials,
    status,
    safetyFloor: floor,
  };
}

/** Convenience for building an empty window when a worker has no usable history. */
export function emptyInputs(anchorDate: string, horizonDays = 7): ForecastInputs {
  return {
    anchorDate,
    startingBalance: 0,
    safetyFloor: 0,
    horizonDays,
    days: Array.from({ length: horizonDays }, (_, i) => ({
      date: addDaysKey(anchorDate, i + 1),
      expectedIncome: 0,
      confirmedIncome: 0,
      incomeProbability: 0,
      obligations: 0,
      obligationLabels: [],
      essentials: 0,
    })),
    medianShiftNet: 0,
    typicalAdvanceFeeRate: 0,
    maxHistoricAdvance: 0,
  };
}
