# Buffer

**Know how long you're safe—not just what you spent.**

Buffer is a cashflow safety dashboard for people who earn daily, per shift, or on an
irregular schedule. Traditional budgeting apps answer *"where did my money go?"*.
Buffer answers a more urgent question: **how many days until the money runs short,
and what can I do about it today?**

The dashboard answers five things above the fold:

1. **How many financially safe days do I have?** — a single buffer figure, e.g. `1.6 days`
2. **When could my next cash shortfall occur?** — a specific date
3. **What is likely to cause it?** — the actual bills and spending that drive it
4. **What is the smallest useful action I can take today?** — ranked, with calculated impact
5. **What financial pattern am I currently missing?** — the *Explain My Money* section

## Setup

```bash
npm install
npm run dev        # http://localhost:3000
```

Other commands:

```bash
npm run build      # production build
npm run start      # serve the production build
npm run lint       # ESLint
```

**No API key, database, or account is required.** Every number and every sentence in
the UI is computed from the CSV files in `public/data`.

## Datasets

All six files in `public/data` are read on the server and joined on `worker_id`
(220 workers, format `W-0001`). A full schema inspection is in
[`DATA_REPORT.md`](./DATA_REPORT.md).

| File | Rows | What Buffer uses it for |
| --- | --- | --- |
| `workers.csv` | 220 | Identity, occupation, pay type, household context, income volatility |
| `daily_earnings.csv` | 12,204 | Shift history, median shift pay, weekday earning patterns, payout lag |
| `recurring_obligations.csv` | 849 | Upcoming bills, due-day collisions, projected outflows |
| `transactions.csv` | 31,726 | Current balance, essential vs discretionary spending, category patterns |
| `earned_wage_advances.csv` | 535 | Advance frequency, fees, timing relative to bills, smallest useful advance |
| `weekly_cashflow_summary.csv` | 3,072 | Trend analysis, balance cross-validation, fallback aggregates |

### How the datasets are joined

Every file carries `worker_id`, and there are **no orphaned identifiers** — all 220
workers join across five files, and 128 of them also appear in the advances file.

Two further joins are hidden inside the `notes` column of `transactions.csv`:

- `linked_earnings_id=E-…` → `daily_earnings.earnings_id`
- `obligation_id=O-…` → `recurring_obligations.obligation_id`

Both matter. The first recovers the **payout date** (see below); the second lets Buffer
tell which bills have already been paid, so nothing is charged twice.

## How the numbers are calculated

### Analysis date ("today")

The data runs from April to early July **2026**, so anchoring the forecast to the
machine clock would render an empty dashboard. Buffer resolves the anchor from the data,
per worker, in this order:

1. The latest date with genuine activity — a shift worked or money spent
2. The latest recorded transaction
3. The end of the last summarized week
4. The dataset maximum

For most workers this lands on 2026-06-30, and the header states it plainly:
*"Forecast anchored to Jun 29, 2026"*.

This has a deliberate benefit. Income credits dated *after* the anchor are payouts for
shifts already worked, so they enter the forecast as **confirmed** income rather than
estimates — which is exactly the reality of earned-but-unpaid wages. It also places the
7-day window across a month boundary, where rent and other day-of-month bills land.

### Current balance

Priority order, documented in `lib/calculations.ts`:

1. **`running_balance_cad` of the newest transaction at or before the anchor** ← used
2. The latest weekly `ending_balance_cad`
3. The net of all credits and debits

Method (1) is chosen and is **cross-validated against method (2)**: for all 557
week/worker combinations checked, the weekly `ending_balance_cad` exactly equals the
running balance of that week's last transaction. When the two agree, the UI shows a
"Balance cross-checked against weekly summary" badge.

Summing credits and debits is deliberately *not* used when a running balance exists. The
ledger's net flow does not reconcile with its own balance column (the balance column is
only internally consistent in `txn_id` order, not timestamp order — see `DATA_REPORT.md` §4b).

### Forecast

A 7-day projection where, for each day:

```
ending balance = starting balance
               + expected income
               − scheduled obligations
               − expected essential spending
               + scenario adjustments
```

- **Expected income** is modelled on *payout arrival*, not shift date, because the balance
  only moves when money lands:
  `expected(weekday) = P(a payout arrived on that weekday in the last 8 weeks) × trimmed-median payout size`.
  This never assumes the worker is paid every day, and because it models arrivals it
  already accounts for the payout lag. A trimmed median keeps one unusually large shift
  from distorting the week. Where a **confirmed** payout exists for a day, it *replaces*
  the estimate rather than adding to it.
- **Obligations** are placed by `due_day_of_month` (clamped to month length) for monthly
  bills, and by stepping 14 days from the last observed payment for biweekly ones. A bill
  already settled before the anchor is skipped.
- **Essential spending** is a daily average over the last 6 weeks, using the dataset's
  `is_essential` flag and **excluding** debits tagged with an `obligation_id`, so scheduled
  bills are not counted twice.
- **Safety floor** is $0. Buffer days are the days before the projected balance first drops
  below it, interpolated within the crossing day so the figure reads as e.g. `1.6 days`.
  When no shortfall occurs, the UI shows `7+`.
- **Confidence** (High / Medium / Low) is a transparent heuristic over recent shift count,
  recent transaction count, whether bills are on file, and history length. The tooltip
  states that it reflects data coverage, not certainty about the future.

Status thresholds: **At Risk** under 2 safe days or a projected negative balance;
**Watch** for a shortfall arriving 2–5 days out or a low point within two days of
everyday spending above the floor; **Safe** otherwise. Status is always spelled out in
text next to the colour.

### Explain My Money

`lib/insights.ts` generates up to five pattern cards, and each one is **gated on having
enough evidence** — a card simply does not render if the sample is too small:

| Insight | What it compares | Minimum evidence |
| --- | --- | --- |
| Payout-day spending | Discretionary spending in the 48h after an above-average payout vs all other days | 8 payouts, 10 discretionary txns, ≥12% difference |
| Income up, balance flat | Last 4 weeks of income vs ending balance vs spending | 6 weekly rows, ≥8% income change |
| Bill collision | Recurring bills due within 3 days of each other | 2+ bills with due days |
| Advance pattern | Advance count, fees, and proximity to bill dates | 2+ advances |
| Essentials trend | Last 3 weeks vs the 3 weeks before | 8 txns in each period, ≥10% change |
| Income volatility | Standard deviation of weekly income | 5 weeks, ≥15% variation |
| Weekday pattern | Best vs slowest earning weekday, heaviest optional-spending day | 4 weekdays with income, 1.3× spread |

Wording is deliberately supportive and non-judgmental ("Based on your recent activity…",
"is associated with…" rather than "causes"). Nothing is invented: every figure in every
sentence is a value computed elsewhere in the pipeline.

### Demo worker selection

`lib/demo-worker.ts` scores all 220 workers deterministically on data richness across the
joined files, date coverage, income volatility, bill collisions, and — most importantly —
whether a shortfall lands *inside* the window rather than having already happened.

The winner is **W-0186** (moving helper, daily pay, Calgary): $341 balance, a $831 rent
payment on Jul 1 that drops the balance to −$329, and recovery to +$112 by Jul 6, with 6
wage advances and 4 recurring bills on file. Ties break on worker ID, so the selection is
stable across restarts. The **"Best demo profile"** button returns to it from any other worker.

## Architecture

```
app/
  page.tsx              server component: loads data, computes analysis, renders the dashboard
  api/copilot/route.ts  optional LLM polish (see below)
components/             header, safety card, chart, timeline, narrative, simulator, insights
lib/
  csv.ts                file reading, header normalization, safe value parsers
  mappings.ts           column aliases, raw rows -> normalized models
  types.ts              normalized domain models
  data.ts               loading, caching, joins, per-worker index
  calculations.ts       analysis date, balance, income/spending models, obligations, coverage
  forecast.ts           pure forecast engine (runs on both server and client)
  insights.ts           deterministic natural-language generation
  demo-worker.ts        deterministic demo-profile ranking
  formatters.ts         currency, dates, calendar helpers
scripts/                dev-only sanity checks (not part of the build)
```

`scripts/check-all.ts` runs the entire analysis pipeline for all 220 workers and asserts
there are no exceptions, no non-finite numbers, no out-of-range buffer values, and no
`undefined`/`NaN` leaking into generated sentences. It also runs a what-if scenario for
each worker. Run it with `npx tsx scripts/check-all.ts`. Current result: **220 workers
checked, no problems found** (43 at risk, 1 watch, 176 safe; 4.57 insights per worker).

All six CSVs are parsed **once per server process** and cached in module scope. The
31,726-row ledger never reaches the browser — the page ships only the computed forecast,
the narrative strings, and a small worker list for the selector.

The what-if simulator imports the **same** `runForecast` function the server uses, so
scenario numbers can never drift from the baseline. `lib/forecast.ts` is deliberately free
of Node and React imports for this reason.

Formatting is `en-CA` / CAD: the dataset has no currency field, but every money column is
suffixed `_cad` and all 220 workers are in Alberta.

## Limitations

- **The forecast is an estimate, not a prediction.** Expected income is a
  probability-weighted average by weekday; a worker who picks up or loses shifts will
  diverge from it immediately.
- **Only a 7-day horizon.** Monthly bills falling just outside the window are not shown.
- **Balance provenance is imperfect in the source data.** The running-balance column does
  not reconcile with the ledger's own net flow (documented in `DATA_REPORT.md` §4b);
  Buffer uses the definition that two independent files agree on and says so in the footer.
- **Synthetic data.** Balances are unusually high for most workers, so 176 of 220 profiles
  are comfortably safe and the "Watch" state is rare.
- **Advance repayment timing is approximated** in the simulator (repaid from a payout
  inside the same window), since future repayment dates are not knowable.
- Buffer is **not financial advice**, and the UI says so in the footer.

## Optional AI extension

`app/api/copilot/route.ts` can rephrase the already-calculated aggregates through an LLM.
It is entirely optional and **off by default**:

- Reads `OPENAI_API_KEY` from the environment; see `.env.example`
- The key is server-side only and never reaches the client
- Only aggregated metrics are sent — never raw transactions
- The response is validated, and on a missing key, bad response, non-200, or timeout it
  **falls back to the deterministic text** and returns HTTP 200 so the UI never blocks

The dashboard does not call this route in its default flow. The deterministic engine in
`lib/insights.ts` is the product; this endpoint is a garnish.
