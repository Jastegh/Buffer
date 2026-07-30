# Data Inspection Report

Inspection of the six CSV files in `public/data`, performed before any calculation
or UI work. All findings below come from reading the actual files — no schema was
assumed.

## 1. Summary

| File | Rows | Primary key | Worker key | Date columns |
| --- | --- | --- | --- | --- |
| `workers.csv` | 220 | `worker_id` | `worker_id` | — |
| `daily_earnings.csv` | 12,204 | `earnings_id` | `worker_id` | `work_date` |
| `recurring_obligations.csv` | 849 | `obligation_id` | `worker_id` | `due_day_of_month` (day number, not a date) |
| `transactions.csv` | 31,726 | `txn_id` | `worker_id` | `txn_ts` |
| `earned_wage_advances.csv` | 535 | `advance_id` | `worker_id` | `requested_at`, `repaid_at` |
| `weekly_cashflow_summary.csv` | 3,072 | `worker_id` + `week_start` | `worker_id` | `week_start` |

Every file uses the identical identifier name **`worker_id`** with the format `W-0001`.
No aliasing was required, though the loader still supports aliases so a differently
named export would not break the app.

## 2. Schemas

**`workers.csv`** — `worker_id, city, province, occupation, pay_type,
typical_daily_net_cad, income_volatility, tip_share, household_size, dependents,
has_bank_account, uses_prepaid_card, primary_employer_id, tenure_months,
has_side_gig, commute_mode, rent_burden_band`

- 220 unique workers, all in Alberta (`province` = `AB` for every row).
- Cities: Calgary (123), Edmonton (44), Red Deer (18), Airdrie (12), Lethbridge (10), plus 3 smaller.
- `pay_type`: `hourly` (137), `daily` (52), `gig` (31).
- 14 occupations. `income_volatility` ranges 0.20–0.55.
- Booleans are encoded as `0`/`1`.

**`daily_earnings.csv`** — `earnings_id, worker_id, work_date, employer_id,
shift_type, hours_worked, gross_pay_cad, tips_cad, deductions_cad, net_pay_cad,
paid_same_day, pay_method`

- `work_date` spans **2026-04-01 → 2026-06-30** (91 distinct days).
- `net_pay_cad` ranges $33.78–$455.59.
- `paid_same_day` is 1 for 4,869 rows and 0 for 7,335 — i.e. most pay is lagged.
- **There is no payout-date column.** See §4 for how the payout date is recovered.

**`recurring_obligations.csv`** — `obligation_id, worker_id, name, category,
amount_cad, frequency, due_day_of_month, autopay, essential`

- Six bill types: Rent (220), Mobile phone (220), Utilities (150),
  Installment / loan payment (94), Streaming / subscription (85), Childcare (80).
- Every worker has at least Rent and Mobile phone.
- `frequency`: `monthly` (811), `biweekly` (38).
- `due_day_of_month` is 1–28, so no month-length clamping problems arise in practice
  (the code clamps anyway).

**`transactions.csv`** — `txn_id, worker_id, txn_ts, direction, amount_cad,
category, merchant_type, channel, is_essential, running_balance_cad, notes`

- `txn_ts` spans **2026-04-01T06:00 → 2026-07-05T11:40**.
- `direction`: `debit` (19,522), `credit` (12,204).
- The credit count is exactly the earnings row count — every shift has one matching credit.
- 16 categories. `is_essential` is perfectly consistent per category
  (e.g. `groceries`/`transit`/`childcare`/`housing` always 1; `food_out`/`entertainment`/`misc` always 0).
- `notes` is populated on 14,886 rows with either `linked_earnings_id=E-…` (credits)
  or `obligation_id=O-…` (2,682 debits). Blank otherwise.

**`earned_wage_advances.csv`** — `advance_id, worker_id, requested_at, amount_cad,
fee_cad, status, repaid_at, repayment_source, reason_code`

- Only **128 of 220 workers** appear here; this is the one dataset that does not
  cover everyone, so the app degrades gracefully when it is absent for a worker.
- `status`: `repaid` (452), `outstanding` (68), `cancelled` (15).
- `repaid_at` is blank for 83 rows, which lines up with the outstanding/cancelled counts.
- Amounts $20.14–$179.43; fees $0–$10.70 (roughly 0–6%).

**`weekly_cashflow_summary.csv`** — `worker_id, week_start, income_cad,
expense_cad, essential_expense_cad, net_cashflow_cad, advances_count,
advances_amount_cad, advance_fees_cad, ending_balance_cad, buffer_days_estimate,
negative_balance_flag`

- 14 weeks per worker, `week_start` from 2026-03-30 to 2026-06-29 (Mondays).
- `buffer_days_estimate` is blank on 330 rows and reaches absurd values elsewhere
  (max 17,568), so it is **not** used as a headline metric — see §5.

## 3. Confirmed joins

All joins were verified by set comparison of `worker_id` values:

| Dataset | Distinct workers | Present in `workers.csv` | Orphans |
| --- | --- | --- | --- |
| `daily_earnings` | 220 | 220 | 0 |
| `recurring_obligations` | 220 | 220 | 0 |
| `transactions` | 220 | 220 | 0 |
| `earned_wage_advances` | 128 | 128 | 0 |
| `weekly_cashflow_summary` | 220 | 220 | 0 |

Two additional joins exist inside the `notes` column of `transactions.csv` and are
used by the app:

- `transactions.notes = "linked_earnings_id=E-…"` → `daily_earnings.earnings_id`
- `transactions.notes = "obligation_id=O-…"` → `recurring_obligations.obligation_id`

There are no orphaned identifiers anywhere.

## 4. Data-quality findings

**a) `daily_earnings` has no payout date — it is recovered from the join.**
Each income credit in `transactions.csv` carries `linked_earnings_id`, so the credit's
timestamp *is* the observed payout date. Measured lag between `work_date` and the
matching credit: 0 days for 4,869 records (same-day pay) and a roughly even spread
across 1–5 days for the rest (median 1 day). The app uses this to place income on the
day the money actually lands.

**b) `running_balance_cad` is only coherent in `txn_id` order, not timestamp order.**
Checking `balance[n-1] + signed_amount[n] == balance[n]` for consecutive rows per worker:

- sorted by `txn_id`: **100.0%** consistent
- sorted by `txn_ts` (and in file order, which is timestamp-sorted): **20.5%** consistent

So the generator accumulated balances in `txn_id` order and then emitted the file
sorted by timestamp. Summing credits and debits therefore does **not** reconcile with
the balance column (for `W-0186` the net flow is −$257 while the balance column climbs
by several thousand over the same period). Consequently the app never reconstructs a
balance by summing flows when a running balance is present.

**c) The weekly summary independently confirms the timestamp-ordered balance.**
For every one of 557 checked week/worker combinations, `ending_balance_cad` exactly
equals the `running_balance_cad` of the last transaction of that week in timestamp
order. Two independent files agree on this definition, so the app treats
"running balance of the newest transaction" as the authoritative current balance and
displays a "cross-checked" badge when the two sources match.

**d) `weekly_cashflow_summary.net_cashflow_cad` does not reconcile with its own
`ending_balance_cad` deltas** (median absolute error ≈ $4,615 per worker). The weekly
file is therefore used for trend analysis and as a fallback only, never as the
primary balance source.

**e) `buffer_days_estimate` is unusable as a headline figure** — 330 blanks and values
up to 17,568 days. Buffer computes its own buffer-days metric from the forecast.

**f) No missing or malformed values elsewhere.** Every non-`notes`/`repaid_at` column
is fully populated, all numerics parse cleanly, and all timestamps are valid ISO 8601.
There are no currency symbols or thousands separators, though the parser handles both.

## 5. Analysis date ("today")

The data is entirely in 2026 and ends before the real current date, so anchoring to the
system clock would produce an empty dashboard. The app resolves the anchor per worker as
the **latest date with genuine activity: a shift worked or money spent**. Across the 220
workers this yields 2026-06-25 → 2026-06-30, with 173 workers anchored to 2026-06-30.

This choice has a useful side effect: income credits dated *after* the anchor are payouts
for shifts already worked, so they enter the forecast as **confirmed** income rather than
estimates. It also places the forecast window across a month boundary, where rent and
other day-of-month bills fall.

## 6. Best candidate workers for the demo

Ranked by the deterministic scorer in `lib/demo-worker.ts` (data richness + an
interesting near-term risk):

| Rank | Worker | Balance | Buffer | Why |
| --- | --- | --- | --- | --- |
| 1 | **W-0186** | $341 | 1.6 days | Moving helper, daily pay, volatility 0.48. $831 rent on Jul 1 pushes the balance to −$329, then payouts pull it back to +$112 by Jul 6. 6 advances, 4 bills, 52 shifts, 179 transactions. |
| 2 | W-0029 | $1,286 | 0.0 days | $1,783 rent lands on day 1; recovers by day 4. 8 advances. |
| 3 | W-0178 | $2,911 | 7+ days | Rent and childcare collide on day 1 but income covers it. Good "safe" contrast case. |
| 4 | W-0154 | $12,523 | 7+ days | High-balance case, useful for checking the safe state. |
| 5 | W-0098 | $3 | 0.0 days | Extreme case, starts at almost zero. |

**W-0186 is the default demo profile.** Across all 220 workers the forecast produces
44 at-risk, and the remainder safe, so the selector demonstrates a range of outcomes.

## 7. Assumptions

1. **Currency is CAD.** Every money column is suffixed `_cad` and all workers are in
   Alberta. No explicit currency field exists.
2. **The payout date is the linked credit's timestamp.** Where an earning has no linked
   credit, the shift date is used.
3. **Expected future income is probability-weighted by weekday**: for each weekday,
   P(a payout arrived on that weekday over the last 8 weeks) × the trimmed-median payout
   size. This avoids assuming the worker is paid every day, and because it models payout
   *arrival* it already accounts for the lag.
4. **Confirmed payouts override the estimate** for days where they exist, rather than
   adding to it, so shifts already worked are never counted twice.
5. **Essential-spending estimates exclude debits tagged with an `obligation_id`,**
   because those bills are projected separately.
6. **Obligations already settled on a given date before the anchor are not re-projected.**
7. **Biweekly obligations step 14 days from the last observed payment** in the ledger,
   falling back to the monthly due day if no payment is on record.
8. The `is_essential` flag is trusted where present; category-based inference is only a
   fallback for rows that lack it.
