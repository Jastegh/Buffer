import "server-only";

import {
  buildCoverage,
  buildForecastInputs,
  HORIZON_DAYS,
  resolveAnalysisDate,
  SAFETY_FLOOR,
} from "./calculations";
import { loadDataset, type WorkerBundle } from "./data";
import { bestDemoWorkerId, rankWorkers } from "./demo-worker";
import { runForecast } from "./forecast";
import {
  buildRecommendations,
  explainMyMoney,
  heroExplanation,
  moneyNarrative,
  shortfallDrivers,
  type MoneyNarrative,
} from "./insights";
import { toKey } from "./formatters";
import type {
  DataCoverage,
  ForecastInputs,
  ForecastResult,
  Insight,
  Recommendation,
  WorkerOption,
} from "./types";

export type UpcomingObligation = {
  id?: string;
  name: string;
  category: string;
  amount: number;
  date: string;
  autopay?: boolean;
  essential?: boolean;
};

export type UpcomingPayout = {
  date: string;
  amount: number;
  shiftDate: string;
};

export type AdvanceSummary = {
  count: number;
  totalAmount: number;
  totalFees: number;
  averageAmount: number;
  feeRate: number;
  outstanding: number;
  lastDate?: string;
};

export type WorkerAnalysis = {
  worker: {
    id: string;
    occupation?: string;
    payType?: string;
    city?: string;
    province?: string;
    dependents?: number;
    householdSize?: number;
    incomeVolatility?: number;
    rentBurdenBand?: string;
  };
  anchorDate: string;
  anchorMethod: string;
  isBestDemo: boolean;
  balanceMethod: string;
  balanceAsOf?: string;
  balanceValidated: boolean;
  forecast: ForecastResult;
  inputs: ForecastInputs;
  coverage: DataCoverage;
  heroExplanation: string;
  narrative: MoneyNarrative;
  recommendations: Recommendation[];
  insights: Insight[];
  drivers: { label: string; amount: number; kind: string }[];
  upcomingObligations: UpcomingObligation[];
  upcomingPayouts: UpcomingPayout[];
  advances?: AdvanceSummary;
  spending: {
    essentialPerDay: number;
    discretionaryPerDay: number;
    topDiscretionaryCategories: { category: string; total: number }[];
  };
  income: {
    medianShiftNet: number;
    payoutLagDays: number;
    expectedByWeekday: number[];
  };
  datasetsJoined: string[];
  datasetsMissing: string[];
};

function summarizeAdvances(bundle: WorkerBundle): AdvanceSummary | undefined {
  if (!bundle.advances.length) return undefined;
  const totalAmount = bundle.advances.reduce((sum, a) => sum + a.amount, 0);
  const totalFees = bundle.advances.reduce((sum, a) => sum + (a.fee ?? 0), 0);
  return {
    count: bundle.advances.length,
    totalAmount,
    totalFees,
    averageAmount: totalAmount / bundle.advances.length,
    feeRate: totalAmount > 0 ? totalFees / totalAmount : 0,
    outstanding: bundle.advances.filter((a) => a.repaymentStatus === "outstanding").length,
    lastDate: bundle.advances.at(-1) ? toKey(bundle.advances.at(-1)!.date) : undefined,
  };
}

/** Builds the complete, serializable analysis a page needs for one worker. */
export function analyzeWorker(workerId: string): WorkerAnalysis | undefined {
  const dataset = loadDataset();
  const bundle = dataset.byWorker.get(workerId);
  if (!bundle) return undefined;

  const datasetMaxKey = dataset.maxDate ? toKey(dataset.maxDate) : undefined;
  const anchor = resolveAnalysisDate(bundle, datasetMaxKey);
  const { inputs, income, spending, balance, projectedObligations, confirmedPayouts } =
    buildForecastInputs(bundle, anchor.key, {
      horizonDays: HORIZON_DAYS,
      safetyFloor: SAFETY_FLOOR,
    });

  const forecast = runForecast(inputs);
  const context = {
    bundle,
    anchorKey: anchor.key,
    forecast,
    income,
    spending,
    projectedObligations,
  };

  const datasetsJoined: string[] = [];
  const datasetsMissing: string[] = [];
  const push = (label: string, ok: boolean) =>
    ok ? datasetsJoined.push(label) : datasetsMissing.push(label);
  push("workers", true);
  push("daily_earnings", bundle.earnings.length > 0);
  push("recurring_obligations", bundle.obligations.length > 0);
  push("transactions", bundle.transactions.length > 0);
  push("earned_wage_advances", bundle.advances.length > 0);
  push("weekly_cashflow_summary", bundle.weekly.length > 0);

  return {
    worker: {
      id: bundle.worker.id,
      occupation: bundle.worker.occupation,
      payType: bundle.worker.payType,
      city: bundle.worker.city,
      province: bundle.worker.province,
      dependents: bundle.worker.dependents,
      householdSize: bundle.worker.householdSize,
      incomeVolatility: bundle.worker.incomeVolatility,
      rentBurdenBand: bundle.worker.rentBurdenBand,
    },
    anchorDate: anchor.key,
    anchorMethod: anchor.method,
    isBestDemo: bestDemoWorkerId() === workerId,
    balanceMethod: balance.method,
    balanceAsOf: balance.asOf,
    balanceValidated: balance.validation?.matches ?? false,
    forecast,
    inputs,
    coverage: buildCoverage(bundle, anchor.key),
    heroExplanation: heroExplanation(context),
    narrative: moneyNarrative(context),
    recommendations: buildRecommendations(context),
    insights: explainMyMoney(context),
    drivers: shortfallDrivers(context).slice(0, 4),
    upcomingObligations: projectedObligations.map((p) => ({
      id: p.obligation.id,
      name: p.obligation.name,
      category: p.obligation.category,
      amount: p.amount,
      date: p.date,
      autopay: p.obligation.autopay,
      essential: p.obligation.essential,
    })),
    upcomingPayouts: confirmedPayouts,
    advances: summarizeAdvances(bundle),
    spending: {
      essentialPerDay: spending.essentialPerDay,
      discretionaryPerDay: spending.discretionaryPerDay,
      topDiscretionaryCategories: spending.topDiscretionaryCategories,
    },
    income: {
      medianShiftNet: income.medianShiftNet,
      payoutLagDays: income.payoutLagDays,
      expectedByWeekday: income.byWeekday,
    },
    datasetsJoined,
    datasetsMissing,
  };
}

/**
 * Small list for the demo profile switcher. The forecast status comes from the
 * ranking pass, which already runs a forecast for every worker, so previewing
 * each outcome costs nothing extra. The raw ledger never leaves the server.
 */
export function workerOptions(): WorkerOption[] {
  const dataset = loadDataset();
  const ranked = new Map(rankWorkers().map((entry) => [entry.id, entry]));
  return dataset.workers.map((worker) => {
    const rank = ranked.get(worker.id);
    return {
      id: worker.id,
      occupation: worker.occupation,
      payType: worker.payType,
      city: worker.city,
      status: rank?.status,
      safeDays: rank?.safeDays,
      survivesWindow: rank?.survivesWindow,
    };
  });
}

export function resolveWorkerId(requested?: string): string | undefined {
  const dataset = loadDataset();
  if (requested && dataset.byWorker.has(requested)) return requested;
  return bestDemoWorkerId() ?? dataset.workers[0]?.id;
}

export function demoWorkerRanking() {
  return rankWorkers().slice(0, 5);
}
