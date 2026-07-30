import {
  isEssential,
  mean,
  median,
  stdDev,
  type IncomeModel,
  type ProjectedObligation,
  type SpendingModel,
} from "./calculations";
import type { WorkerBundle } from "./data";
import {
  addDaysKey,
  categoryLabel,
  formatCurrency,
  formatDays,
  formatShortDate,
  fromKey,
  relativeDayPhrase,
  relativeDayWord,
  toKey,
  weekdayName,
} from "./formatters";
import type { ForecastResult, Insight, Recommendation, Transaction } from "./types";

/**
 * Turns calculated metrics into plain, supportive language.
 *
 * Every sentence produced here is assembled from deterministic numbers passed
 * in by the caller. Nothing is invented, and correlations are described as
 * associations rather than causes.
 */

export type NarrativeContext = {
  bundle: WorkerBundle;
  anchorKey: string;
  forecast: ForecastResult;
  income: IncomeModel;
  spending: SpendingModel;
  projectedObligations: ProjectedObligation[];
};

/* ------------------------------------------------------ shortfall drivers */

export type ShortfallDriver = {
  label: string;
  amount: number;
  kind: "obligation" | "essentials" | "income-gap";
};

/** Ranks what actually pushes the balance under the floor, largest first. */
export function shortfallDrivers(context: NarrativeContext): ShortfallDriver[] {
  const { forecast, projectedObligations } = context;
  const cutoff = forecast.shortfallDate ?? forecast.lowestBalanceDate;
  const drivers: ShortfallDriver[] = [];

  const bills = projectedObligations.filter((p) => p.date <= cutoff);
  for (const bill of bills) {
    drivers.push({ label: bill.obligation.name, amount: bill.amount, kind: "obligation" });
  }

  const daysToCutoff = forecast.days.filter((d) => d.date <= cutoff);
  const essentials = daysToCutoff.reduce((sum, d) => sum + d.expectedEssentialSpending, 0);
  if (essentials > 0) {
    drivers.push({ label: "Everyday essentials", amount: essentials, kind: "essentials" });
  }

  const income = daysToCutoff.reduce((sum, d) => sum + d.expectedIncome, 0);
  const daysWithoutIncome = daysToCutoff.filter((d) => d.expectedIncome < 1).length;
  if (daysWithoutIncome >= 2 && income < essentials) {
    drivers.push({
      label: `${daysWithoutIncome} days with no expected payout`,
      amount: 0,
      kind: "income-gap",
    });
  }

  return drivers.sort((a, b) => b.amount - a.amount);
}

/* -------------------------------------------------------- hero explanation */

export function heroExplanation(context: NarrativeContext): string {
  const { forecast, anchorKey } = context;
  const drivers = shortfallDrivers(context);
  const billNames = drivers
    .filter((d) => d.kind === "obligation")
    .slice(0, 2)
    .map((d) => d.label.toLowerCase());

  if (forecast.survivesWindow) {
    const lowDay = relativeDayPhrase(anchorKey, forecast.lowestBalanceDate);
    const positive = `No cash shortfall is projected in the next ${forecast.days.length} days. Your lowest expected balance is ${formatCurrency(forecast.lowestBalance)} ${lowDay}.`;
    if (billNames.length) {
      return `${positive} ${sentenceCase(joinList(billNames))} ${billNames.length > 1 ? "are" : "is"} already accounted for.`;
    }
    return positive;
  }

  const when = relativeDayPhrase(anchorKey, forecast.shortfallDate!);
  const amount = formatCurrency(forecast.shortfallAmount ?? 0);
  const cause = billNames.length
    ? `${joinList(billNames)} ${billNames.length > 1 ? "payments arrive" : "arrives"} before your next expected payouts catch up`
    : `expected essential spending outpaces the payouts arriving this week`;

  return `You're likely to fall about ${amount} below ${formatCurrency(forecast.safetyFloor)} ${when} because ${cause}.`;
}

/* --------------------------------------------- "what your money is telling you" */

export type MoneyNarrative = {
  headline: string;
  what: string;
  why: string;
  when: string;
  action: string;
};

export function moneyNarrative(context: NarrativeContext): MoneyNarrative {
  const { forecast, anchorKey, income, spending } = context;
  const drivers = shortfallDrivers(context);
  const bills = drivers.filter((d) => d.kind === "obligation");

  const incomeThisWeek = forecast.totalExpectedIncome;
  const outflow = forecast.totalObligations + forecast.totalEssentials;

  if (forecast.survivesWindow) {
    const lowDay = relativeDayPhrase(anchorKey, forecast.lowestBalanceDate);
    const lowWord = relativeDayWord(anchorKey, forecast.lowestBalanceDate);
    return {
      headline: `Your buffer holds for the full ${forecast.days.length}-day window`,
      what: `Based on your recent activity, your balance is expected to stay above ${formatCurrency(forecast.safetyFloor)} all week, with its lowest point of ${formatCurrency(forecast.lowestBalance)} ${lowDay}.`,
      why: `Estimated income of ${formatCurrency(incomeThisWeek)} roughly ${incomeThisWeek >= outflow ? "covers" : "trails"} ${formatCurrency(outflow)} of bills and everyday essentials.`,
      when: bills.length
        ? `The tightest moment is ${lowWord}, right after ${joinList(bills.slice(0, 2).map((b) => b.label.toLowerCase()))}.`
        : `The tightest moment is ${lowWord}.`,
      action: `Setting aside about ${formatCurrency(Math.max(20, Math.round(spending.essentialPerDay)))} from your next payout would extend the cushion without changing anything else.`,
    };
  }

  const when = relativeDayWord(anchorKey, forecast.shortfallDate!);
  const gap = forecast.shortfallAmount ?? 0;
  const billText = bills.length
    ? `${joinList(bills.slice(0, 2).map((b) => `${b.label.toLowerCase()} of ${formatCurrency(b.amount)}`))} ${bills.length > 1 ? "land" : "lands"} before your payouts catch up`
    : `everyday essentials of about ${formatCurrency(spending.essentialPerDay)} a day run ahead of your expected payouts`;

  const trim = roundUpTo(Math.min(gap, spending.discretionaryPerDay * 3), 5);
  const canTrimAll = trim >= gap;

  return {
    headline: `A projected ${formatCurrency(gap)} shortfall may occur ${when}`,
    what: `Your data suggests the balance drops below ${formatCurrency(forecast.safetyFloor)} on ${formatShortDate(forecast.shortfallDate!)}, reaching about ${formatCurrency(forecast.lowestBalance)} at its lowest.`,
    why: `${sentenceCase(billText)}. Estimated pay of ${formatCurrency(incomeThisWeek)} is spread across the week based on how often you are paid on each weekday, so it arrives too gradually to cover the bill on time.`,
    when: `The gap opens ${when} and ${forecast.days.at(-1)!.endingBalance >= forecast.safetyFloor ? "closes again by " + relativeDayWord(anchorKey, forecast.days.at(-1)!.date) : "stays open through the end of the window"}.`,
    action: canTrimAll
      ? `Delaying about ${formatCurrency(trim)} of optional spending would be enough to keep the balance positive.`
      : `Delaying about ${formatCurrency(trim)} of optional spending would narrow the gap to ${formatCurrency(gap - trim)}, and one shift near your ${formatCurrency(income.medianShiftNet)} median would close most of what is left.`,
  };
}

/* ------------------------------------------------------------ recommendations */

export function buildRecommendations(context: NarrativeContext): Recommendation[] {
  const { forecast, income, spending, bundle, anchorKey } = context;
  const recommendations: Recommendation[] = [];
  const gap = forecast.shortfallAmount ?? 0;

  if (!forecast.survivesWindow) {
    // 1. Smallest useful action: trim optional spending by the size of the gap.
    const trim = roundUpTo(Math.min(gap, spending.discretionaryPerDay * 3), 5);
    if (trim > 0 && spending.discretionaryPerDay > 1) {
      recommendations.push({
        id: "delay-spending",
        action: `Delay ${formatCurrency(trim)} of optional spending before ${relativeDayWord(anchorKey, forecast.shortfallDate!)}`,
        impact:
          trim >= gap
            ? `Closes the full ${formatCurrency(gap)} gap and keeps the balance above ${formatCurrency(forecast.safetyFloor)}`
            : `Reduces the projected shortfall from ${formatCurrency(gap)} to about ${formatCurrency(gap - trim)}`,
        why: `You spend about ${formatCurrency(spending.discretionaryPerDay)} a day on non-essentials, so this is roughly ${Math.max(1, Math.round(trim / Math.max(spending.discretionaryPerDay, 1)))} day${trim / Math.max(spending.discretionaryPerDay, 1) >= 2 ? "s" : ""} of optional purchases.`,
        emphasis: "primary",
      });
    }

    // 2. Earn the gap instead of borrowing it.
    if (income.medianShiftNet > 0) {
      recommendations.push({
        id: "extra-shift",
        action: `Add one shift near your ${formatCurrency(income.medianShiftNet)} median`,
        impact: `Adds ${formatCurrency(income.medianShiftNet)} of real income — ${income.medianShiftNet >= gap ? "more than enough to close the gap" : `covers ${Math.round((income.medianShiftNet / Math.max(gap, 1)) * 100)}% of the gap`}`,
        why: `Your recent shifts pay a median of ${formatCurrency(income.medianShiftNet)} net, and payouts typically land ${income.payoutLagDays === 0 ? "the same day" : `about ${formatDays(income.payoutLagDays)} days later`}.`,
        emphasis: "primary",
      });
    }

    // 3. If an advance is genuinely needed, take the smallest one that still helps.
    if (bundle.advances.length) {
      const feeRate = median(
        bundle.advances.filter((a) => a.fee !== undefined && a.amount > 0).map((a) => a.fee! / a.amount),
      );
      const ceiling = Math.max(...bundle.advances.map((a) => a.amount));
      const needed = roundUpTo(Math.min(gap, ceiling), 5);
      const fee = needed * feeRate;
      const coversAll = needed >= gap;
      recommendations.push({
        id: "smallest-advance",
        action: `If you need an advance, request only ${formatCurrency(needed)} — not more`,
        impact: coversAll
          ? `Covers the gap for an estimated ${formatCurrency(fee, 2)} fee, leaving ${formatCurrency(needed - fee)} usable`
          : `Covers ${formatCurrency(needed - fee)} of the ${formatCurrency(gap)} gap for an estimated ${formatCurrency(fee, 2)} fee`,
        why: `Your ${bundle.advances.length} past advances averaged ${formatCurrency(mean(bundle.advances.map((a) => a.amount)))} with a ${(feeRate * 100).toFixed(1)}% fee. An advance is pay you have already earned, so it moves money forward rather than adding income — your next payout arrives smaller.`,
        emphasis: "secondary",
      });
    }
  } else {
    const reserve = roundUpTo(Math.max(25, spending.essentialPerDay), 5);
    recommendations.push({
      id: "reserve",
      action: `Reserve ${formatCurrency(reserve)} from your next payout`,
      impact: `Would lift your lowest projected balance from ${formatCurrency(forecast.lowestBalance)} to about ${formatCurrency(forecast.lowestBalance + reserve)}`,
      why: `Your balance dips to its weekly low ${relativeDayPhrase(anchorKey, forecast.lowestBalanceDate)}. A small reserve absorbs a missed shift without borrowing.`,
      emphasis: "primary",
    });

    const worstWeekday = weakestEarningWeekday(context);
    if (worstWeekday) {
      recommendations.push({
        id: "plan-low-day",
        action: `Plan ahead for ${worstWeekday.name}s`,
        impact: `Historically your lowest-earning weekday at about ${formatCurrency(worstWeekday.amount)} expected`,
        why: `Based on the last eight weeks of payouts, ${worstWeekday.name} brings in the least, so bills landing near it feel tighter.`,
        emphasis: "secondary",
      });
    }
  }

  if (bundle.advances.length >= 3 && forecast.survivesWindow) {
    const fees = bundle.advances.reduce((sum, a) => sum + (a.fee ?? 0), 0);
    if (fees > 0) {
      recommendations.push({
        id: "avoid-advance",
        action: "Skip an advance this week if you can",
        impact: `You are projected to stay above ${formatCurrency(forecast.safetyFloor)} without one, saving an estimated ${formatCurrency(fees / bundle.advances.length, 2)} in fees`,
        why: `You have paid ${formatCurrency(fees, 2)} in advance fees across ${bundle.advances.length} advances. Skipping one week keeps that money with you.`,
        emphasis: "secondary",
      });
    }
  }

  return recommendations.slice(0, 3);
}

function weakestEarningWeekday(context: NarrativeContext) {
  const { income } = context;
  const entries = income.byWeekday
    .map((amount, day) => ({ amount, day }))
    .filter((entry) => entry.amount > 0);
  if (entries.length < 4) return undefined;
  const worst = entries.reduce((a, b) => (a.amount <= b.amount ? a : b));
  return { name: weekdayName(new Date(2026, 0, 4 + worst.day)), amount: worst.amount };
}

/* --------------------------------------------------------- explain my money */

export function explainMyMoney(context: NarrativeContext): Insight[] {
  const { bundle, anchorKey, spending, income, forecast } = context;
  const insights: Insight[] = [];

  const anchor = fromKey(anchorKey);
  const debits = bundle.transactions.filter((t) => t.direction === "debit" && t.date <= anchor);
  const credits = bundle.transactions.filter((t) => t.direction === "credit" && t.date <= anchor);
  const discretionary = debits.filter((t) => !isEssential(t) && !t.obligationId);

  /* A. Spending after an above-average payout. */
  if (credits.length >= 8 && discretionary.length >= 10) {
    const payoutAmounts = credits.map((c) => c.amount);
    const averagePayout = mean(payoutAmounts);
    const bigPayoutDays = new Set(
      credits.filter((c) => c.amount > averagePayout).map((c) => toKey(c.date)),
    );
    const afterBigPayout = new Set<string>();
    for (const day of bigPayoutDays) {
      afterBigPayout.add(day);
      afterBigPayout.add(addDaysKey(day, 1));
    }
    const inWindow = discretionary.filter((t) => afterBigPayout.has(toKey(t.date)));
    const outsideWindow = discretionary.filter((t) => !afterBigPayout.has(toKey(t.date)));
    const windowDays = afterBigPayout.size;
    const totalDays = new Set(debits.map((t) => toKey(t.date))).size;
    const outsideDays = Math.max(1, totalDays - windowDays);

    if (inWindow.length >= 4 && outsideWindow.length >= 4 && windowDays >= 3) {
      const insideRate = inWindow.reduce((s, t) => s + t.amount, 0) / windowDays;
      const outsideRate = outsideWindow.reduce((s, t) => s + t.amount, 0) / outsideDays;
      if (outsideRate > 0) {
        const delta = ((insideRate - outsideRate) / outsideRate) * 100;
        if (Math.abs(delta) >= 12) {
          const topCategory = topCategoryOf(inWindow);
          insights.push({
            id: "payout-spending",
            title: delta > 0 ? "Spending lifts right after bigger payouts" : "Bigger payouts do not pull spending up",
            body:
              delta > 0
                ? `Optional spending is about ${Math.round(delta)}% higher in the 48 hours after an above-average payout (${formatCurrency(insideRate)} a day versus ${formatCurrency(outsideRate)} on other days). ${topCategory ? `Most of it is ${categoryLabel(topCategory)}.` : ""}`
                : `Optional spending is about ${Math.round(Math.abs(delta))}% lower in the 48 hours after an above-average payout. Your spending is not tied to payday spikes, which makes your buffer steadier.`,
            metricLabel: "Day-after-payout spending",
            metricValue: `${delta > 0 ? "+" : "−"}${Math.round(Math.abs(delta))}%`,
            trend: delta > 0 ? "up" : "down",
            tone: delta > 0 ? "caution" : "positive",
            recommendation:
              delta > 0
                ? `Waiting one day before optional purchases after a big payout could keep roughly ${formatCurrency(insideRate - outsideRate)} in your buffer each time.`
                : undefined,
          });
        }
      }
    }
  }

  /* B. Income up, balance flat. */
  const weekly = bundle.weekly.filter((w) => w.weekStart <= anchor);
  if (weekly.length >= 6) {
    const half = Math.floor(weekly.length / 2);
    const older = weekly.slice(Math.max(0, half - 4), half);
    const recent = weekly.slice(-4);
    const olderIncome = mean(older.map((w) => w.income ?? 0));
    const recentIncome = mean(recent.map((w) => w.income ?? 0));
    const olderEnding = mean(older.map((w) => w.endingBalance ?? 0));
    const recentEnding = mean(recent.map((w) => w.endingBalance ?? 0));

    if (olderIncome > 50 && olderEnding !== 0) {
      const incomeChange = ((recentIncome - olderIncome) / olderIncome) * 100;
      const balanceChange = ((recentEnding - olderEnding) / Math.abs(olderEnding)) * 100;
      if (incomeChange >= 8 && balanceChange < incomeChange * 0.5) {
        const spendChange =
          mean(recent.map((w) => w.expense ?? 0)) - mean(older.map((w) => w.expense ?? 0));
        insights.push({
          id: "income-up-balance-flat",
          title: "Income rose faster than your balance",
          body: `Weekly income is up about ${Math.round(incomeChange)}% over the last four weeks (${formatCurrency(olderIncome)} to ${formatCurrency(recentIncome)}), while your week-ending balance moved ${Math.round(balanceChange)}%. Weekly spending rose by about ${formatCurrency(Math.abs(spendChange))} over the same period.`,
          metricLabel: "Income vs balance",
          metricValue: `+${Math.round(incomeChange)}% vs ${Math.round(balanceChange)}%`,
          trend: "up",
          tone: "caution",
          recommendation: `Moving even ${formatCurrency(roundUpTo(Math.max(20, spendChange / 4), 5))} of each week's extra income aside would turn the higher income into a longer buffer.`,
        });
      } else if (incomeChange <= -8) {
        insights.push({
          id: "income-down",
          title: "Recent income is running below your earlier weeks",
          body: `Weekly income is down about ${Math.round(Math.abs(incomeChange))}% over the last four weeks (${formatCurrency(olderIncome)} to ${formatCurrency(recentIncome)}). Bills have not changed, so the same obligations now take a larger share of each week.`,
          metricLabel: "Weekly income change",
          metricValue: `−${Math.round(Math.abs(incomeChange))}%`,
          trend: "down",
          tone: "caution",
          recommendation: "Adding one shift in a lighter week has more impact than trimming spending right now.",
        });
      }
    }
  }

  /* C. Bill collision. */
  if (bundle.obligations.length >= 2) {
    const withDays = bundle.obligations.filter((o) => o.dueDay !== undefined);
    let collision: { a: string; b: string; amount: number; gap: number; day: number } | undefined;
    for (let i = 0; i < withDays.length; i += 1) {
      for (let j = i + 1; j < withDays.length; j += 1) {
        const gap = Math.abs((withDays[i].dueDay ?? 0) - (withDays[j].dueDay ?? 0));
        if (gap <= 3) {
          const amount = withDays[i].amount + withDays[j].amount;
          if (!collision || amount > collision.amount) {
            collision = {
              a: withDays[i].name,
              b: withDays[j].name,
              amount,
              gap,
              day: Math.min(withDays[i].dueDay ?? 0, withDays[j].dueDay ?? 0),
            };
          }
        }
      }
    }
    if (collision) {
      insights.push({
        id: "bill-collision",
        title: "Two bills land within days of each other",
        body: `${collision.a} and ${collision.b} are both due around day ${collision.day} of the month${collision.gap === 0 ? " — on the same day" : `, ${collision.gap} day${collision.gap === 1 ? "" : "s"} apart`}. Together they take ${formatCurrency(collision.amount)} out of your balance in a single stretch, which is what creates the narrowest point of your month.`,
        metricLabel: "Combined amount",
        metricValue: formatCurrency(collision.amount),
        tone: "caution",
        recommendation: `Splitting even ${formatCurrency(roundUpTo(collision.amount / 4, 5))} of this into the prior week would flatten the dip.`,
      });
    }
  }

  /* D. Wage-advance pattern. */
  if (bundle.advances.length >= 2) {
    const advances = bundle.advances.filter((a) => a.date <= anchor);
    const fees = advances.reduce((sum, a) => sum + (a.fee ?? 0), 0);
    const dueDays = bundle.obligations.map((o) => o.dueDay).filter((d): d is number => d !== undefined);
    const nearBill = advances.filter((a) =>
      dueDays.some((day) => {
        const diff = Math.abs(a.date.getDate() - day);
        return Math.min(diff, 30 - diff) <= 2;
      }),
    ).length;
    const outstanding = advances.filter((a) => a.repaymentStatus === "outstanding").length;

    if (advances.length >= 2) {
      const share = Math.round((nearBill / advances.length) * 100);
      insights.push({
        id: "advance-pattern",
        title:
          nearBill >= Math.ceil(advances.length / 2)
            ? "Advances cluster around bill dates"
            : "Your advances are spread through the month",
        body:
          nearBill >= Math.ceil(advances.length / 2)
            ? `${nearBill} of your last ${advances.length} advances were requested within two days of a recurring bill, and you have paid ${formatCurrency(fees, 2)} in fees in total. That timing is associated with bill dates rather than unexpected costs, which means it is predictable enough to plan around.`
            : `You have taken ${advances.length} advances totalling ${formatCurrency(advances.reduce((s, a) => s + a.amount, 0))}, with ${formatCurrency(fees, 2)} in fees. Only ${share}% landed near a bill date, so they look more like responses to slow earning weeks.`,
        metricLabel: "Fees paid to date",
        metricValue: formatCurrency(fees, 2),
        tone: fees > 15 ? "caution" : "neutral",
        trend: "flat",
        recommendation:
          outstanding > 0
            ? `${outstanding} advance${outstanding === 1 ? " is" : "s are"} still outstanding, so part of your next payout is already committed.`
            : `Covering the same gap by reserving ${formatCurrency(roundUpTo(mean(advances.map((a) => a.amount)) / 4, 5))} a week ahead of bill dates would avoid most of these fees.`,
      });
    }
  }

  /* E. Essential spending trend. */
  {
    const recentStart = addDaysKey(anchorKey, -21);
    const priorStart = addDaysKey(anchorKey, -42);
    const essentials = debits.filter((t) => isEssential(t) && !t.obligationId);
    const recent = essentials.filter((t) => toKey(t.date) > recentStart);
    const prior = essentials.filter(
      (t) => toKey(t.date) > priorStart && toKey(t.date) <= recentStart,
    );
    if (recent.length >= 8 && prior.length >= 8) {
      const recentTotal = recent.reduce((s, t) => s + t.amount, 0) / 21;
      const priorTotal = prior.reduce((s, t) => s + t.amount, 0) / 21;
      const change = ((recentTotal - priorTotal) / priorTotal) * 100;
      if (Math.abs(change) >= 10) {
        const topCategory = topCategoryOf(recent);
        insights.push({
          id: "essentials-trend",
          title: change > 0 ? "Essential spending is trending up" : "Essential spending is easing",
          body: `Your everyday essentials averaged ${formatCurrency(recentTotal)} a day over the last three weeks, compared with ${formatCurrency(priorTotal)} in the three weeks before — a change of about ${Math.round(Math.abs(change))}%.${topCategory ? ` ${sentenceCase(categoryLabel(topCategory))} is the largest piece.` : ""}`,
          metricLabel: "Daily essentials",
          metricValue: `${change > 0 ? "+" : "−"}${Math.round(Math.abs(change))}%`,
          trend: change > 0 ? "up" : "down",
          tone: change > 0 ? "caution" : "positive",
          recommendation:
            change > 0
              ? `At this rate, essentials alone use about ${formatCurrency(recentTotal * 7)} a week, which the forecast already assumes.`
              : undefined,
        });
      }
    }
  }

  /* F. Income volatility. */
  if (weekly.length >= 6) {
    const incomes = weekly.map((w) => w.income ?? 0).filter((v) => v > 0);
    if (incomes.length >= 5) {
      const avg = mean(incomes);
      const variation = avg > 0 ? (stdDev(incomes) / avg) * 100 : 0;
      if (variation >= 15) {
        const low = Math.min(...incomes);
        const high = Math.max(...incomes);
        insights.push({
          id: "volatility",
          title: "Your weekly income swings widely",
          body: `Across ${incomes.length} weeks, income ranged from ${formatCurrency(low)} to ${formatCurrency(high)} — a variation of about ${Math.round(variation)}% around your ${formatCurrency(avg)} average. Weeks like your lowest one are when bills of a fixed size become hardest to absorb.`,
          metricLabel: "Week-to-week variation",
          metricValue: `±${Math.round(variation)}%`,
          trend: "flat",
          tone: "neutral",
          recommendation: `A buffer of about ${formatCurrency(roundUpTo((avg - low) / 2, 10))} would absorb a typical low week without an advance.`,
        });
      }
    }
  }

  /* G. Best and hardest weekdays. */
  {
    const byWeekday = income.byWeekday
      .map((amount, day) => ({ amount, day }))
      .filter((e) => e.amount > 0);
    if (byWeekday.length >= 4) {
      const best = byWeekday.reduce((a, b) => (a.amount >= b.amount ? a : b));
      const worst = byWeekday.reduce((a, b) => (a.amount <= b.amount ? a : b));
      const discretionaryByWeekday = Array.from({ length: 7 }, () => 0);
      for (const txn of discretionary) discretionaryByWeekday[txn.date.getDay()] += txn.amount;
      const topSpendDay = discretionaryByWeekday.indexOf(Math.max(...discretionaryByWeekday));
      if (best.amount > worst.amount * 1.3) {
        insights.push({
          id: "weekday-pattern",
          title: `${dayName(best.day)}s carry your week`,
          body: `${dayName(best.day)} brings in about ${formatCurrency(best.amount)} in expected payouts, while ${dayName(worst.day)} averages ${formatCurrency(worst.amount)}. Your optional spending is heaviest on ${dayName(topSpendDay)}s.`,
          metricLabel: `Best vs slowest day`,
          metricValue: `${formatCurrency(best.amount)} vs ${formatCurrency(worst.amount)}`,
          tone: "neutral",
          recommendation:
            topSpendDay === best.day
              ? `Your heaviest optional spending falls on your best earning day, which is associated with a smaller carry-over into ${dayName((best.day + 1) % 7)}.`
              : `Scheduling bills just after ${dayName(best.day)} rather than before ${dayName(worst.day)} would line them up with your strongest day.`,
        });
      }
    }
  }

  /* H. Runway framing when there is spare cushion. */
  if (forecast.survivesWindow && spending.essentialPerDay > 0) {
    const runway = forecast.lowestBalance / (spending.essentialPerDay + spending.discretionaryPerDay);
    if (runway > 0 && runway < 60) {
      insights.push({
        id: "runway",
        title: "How far your lowest point would stretch",
        body: `At your recent burn rate of ${formatCurrency(spending.essentialPerDay + spending.discretionaryPerDay)} a day, the ${formatCurrency(forecast.lowestBalance)} low point of this week would cover about ${formatDays(runway)} days if no income arrived at all.`,
        metricLabel: "Days without any income",
        metricValue: `${formatDays(runway)} days`,
        tone: runway > 7 ? "positive" : "neutral",
      });
    }
  }

  return insights.slice(0, 5);
}

function topCategoryOf(transactions: Transaction[]): string | undefined {
  const totals = new Map<string, number>();
  for (const txn of transactions) {
    const key = txn.category ?? "other";
    totals.set(key, (totals.get(key) ?? 0) + txn.amount);
  }
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0];
}

function dayName(day: number): string {
  return weekdayName(new Date(2026, 0, 4 + day));
}

/* --------------------------------------------------------------- helpers */

export function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

export function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function roundUpTo(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}
