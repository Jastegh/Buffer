import "server-only";

import { readCsv, warnOnce } from "./csv";
import {
  mapAdvances,
  mapEarnings,
  mapObligations,
  mapTransactions,
  mapWeekly,
  mapWorkers,
} from "./mappings";
import { toKey } from "./formatters";
import type {
  Earning,
  Obligation,
  Transaction,
  WageAdvance,
  WeeklyCashflow,
  Worker,
} from "./types";

export const FILES = {
  workers: "workers.csv",
  earnings: "daily_earnings.csv",
  obligations: "recurring_obligations.csv",
  transactions: "transactions.csv",
  advances: "earned_wage_advances.csv",
  weekly: "weekly_cashflow_summary.csv",
} as const;

export type WorkerBundle = {
  worker: Worker;
  earnings: Earning[];
  obligations: Obligation[];
  transactions: Transaction[];
  advances: WageAdvance[];
  weekly: WeeklyCashflow[];
};

export type Dataset = {
  workers: Worker[];
  byWorker: Map<string, WorkerBundle>;
  available: Record<keyof typeof FILES, boolean>;
  counts: Record<keyof typeof FILES, number>;
  maxDate?: Date;
};

function groupBy<T extends { workerId: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = map.get(row.workerId);
    if (bucket) bucket.push(row);
    else map.set(row.workerId, [row]);
  }
  return map;
}

let cache: Dataset | undefined;

/**
 * Loads, normalizes and joins all six datasets once per server process.
 * Everything downstream reads from the returned in-memory index, so the
 * 31k-row transaction ledger is never shipped to the browser.
 */
export function loadDataset(): Dataset {
  if (cache) return cache;

  const rawWorkers = readCsv(FILES.workers);
  const rawEarnings = readCsv(FILES.earnings);
  const rawObligations = readCsv(FILES.obligations);
  const rawTransactions = readCsv(FILES.transactions);
  const rawAdvances = readCsv(FILES.advances);
  const rawWeekly = readCsv(FILES.weekly);

  const earnings = mapEarnings(rawEarnings);
  const transactions = mapTransactions(rawTransactions);
  const obligations = mapObligations(rawObligations);
  const advances = mapAdvances(rawAdvances);
  const weekly = mapWeekly(rawWeekly);

  // daily_earnings has no payout column, but every income credit carries
  // `linked_earnings_id`, so the credit date *is* the observed payout date.
  const payoutByEarningId = new Map<string, Date>();
  for (const txn of transactions) {
    if (txn.direction === "credit" && txn.earningsId) {
      const existing = payoutByEarningId.get(txn.earningsId);
      if (!existing || txn.date < existing) payoutByEarningId.set(txn.earningsId, txn.date);
    }
  }
  const joinedEarnings = earnings.map((earning) => {
    const payout = earning.id ? payoutByEarningId.get(earning.id) : undefined;
    return payout ? { ...earning, payoutDate: payout } : earning;
  });

  let workers = mapWorkers(rawWorkers);

  const earningsByWorker = groupBy(joinedEarnings);
  const obligationsByWorker = groupBy(obligations);
  const transactionsByWorker = groupBy(transactions);
  const advancesByWorker = groupBy(advances);
  const weeklyByWorker = groupBy(weekly);

  // If workers.csv is unusable, fall back to identifiers seen in the ledger so
  // the app still runs instead of rendering an empty shell.
  if (!workers.length) {
    const ids = new Set<string>([...transactionsByWorker.keys(), ...earningsByWorker.keys()]);
    if (ids.size) {
      warnOnce("workers.csv produced no rows; deriving worker list from transactions/earnings.");
      workers = [...ids].sort().map((id) => ({ id }));
    }
  }

  const byWorker = new Map<string, WorkerBundle>();
  for (const worker of workers) {
    const workerTransactions = (transactionsByWorker.get(worker.id) ?? [])
      .slice()
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    byWorker.set(worker.id, {
      worker,
      earnings: (earningsByWorker.get(worker.id) ?? [])
        .slice()
        .sort((a, b) => a.shiftDate.getTime() - b.shiftDate.getTime()),
      obligations: obligationsByWorker.get(worker.id) ?? [],
      transactions: workerTransactions,
      advances: (advancesByWorker.get(worker.id) ?? [])
        .slice()
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
      weekly: (weeklyByWorker.get(worker.id) ?? [])
        .slice()
        .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime()),
    });
  }

  let maxDate: Date | undefined;
  for (const date of [
    ...transactions.map((t) => t.date),
    ...joinedEarnings.map((e) => e.shiftDate),
  ]) {
    if (!maxDate || date > maxDate) maxDate = date;
  }

  cache = {
    workers,
    byWorker,
    available: {
      workers: rawWorkers.length > 0,
      earnings: rawEarnings.length > 0,
      obligations: rawObligations.length > 0,
      transactions: rawTransactions.length > 0,
      advances: rawAdvances.length > 0,
      weekly: rawWeekly.length > 0,
    },
    counts: {
      workers: workers.length,
      earnings: joinedEarnings.length,
      obligations: obligations.length,
      transactions: transactions.length,
      advances: advances.length,
      weekly: weekly.length,
    },
    maxDate,
  };
  return cache;
}

export function getWorkerBundle(workerId: string): WorkerBundle | undefined {
  return loadDataset().byWorker.get(workerId);
}

/** Global fallback anchor: the newest date seen anywhere in the data. */
export function datasetMaxDateKey(): string | undefined {
  const { maxDate } = loadDataset();
  return maxDate ? toKey(maxDate) : undefined;
}
