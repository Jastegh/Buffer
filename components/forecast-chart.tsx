"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyForecast } from "@/lib/types";
import { formatCurrency, formatShortDate, formatTinyDate } from "@/lib/formatters";
import { useChartColors } from "./theme-provider";

type ChartPoint = {
  date: string;
  balance: number;
  scenario?: number;
};

/**
 * Projected end-of-day balance across the forecast window, with the safety
 * floor drawn in and an optional scenario overlay.
 */
export function ForecastChart({
  days,
  safetyFloor,
  startingBalance,
  anchorDate,
  scenarioDays,
}: {
  days: DailyForecast[];
  safetyFloor: number;
  startingBalance: number;
  anchorDate: string;
  scenarioDays?: DailyForecast[];
}) {
  const colors = useChartColors();
  const data: ChartPoint[] = [
    { date: anchorDate, balance: startingBalance, scenario: scenarioDays ? startingBalance : undefined },
    ...days.map((day, index) => ({
      date: day.date,
      balance: day.endingBalance,
      scenario: scenarioDays?.[index]?.endingBalance,
    })),
  ];

  const values = data.flatMap((point) =>
    [point.balance, point.scenario].filter((v): v is number => typeof v === "number"),
  );
  const min = Math.min(...values, safetyFloor);
  const max = Math.max(...values, safetyFloor);
  const pad = Math.max(60, (max - min) * 0.15);

  const hasBreach = days.some((day) => day.endingBalance < safetyFloor);

  // Gradient stop placed exactly at the safety floor, so the line and fill turn
  // red precisely where the balance crosses below it.
  const top = max + pad;
  const bottom = min - pad;
  const floorOffset = Math.max(0, Math.min(1, (top - safetyFloor) / (top - bottom)));

  return (
    <div className="w-full">
      <div className="h-[240px] w-full sm:h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset={0} stopColor={colors.lineFill} stopOpacity={0.35} />
                <stop offset={floorOffset} stopColor={colors.lineFill} stopOpacity={0.04} />
                <stop offset={floorOffset} stopColor={colors.riskFill} stopOpacity={0.28} />
                <stop offset={1} stopColor={colors.riskFill} stopOpacity={0.14} />
              </linearGradient>
              <linearGradient id="balanceStroke" x1="0" y1="0" x2="0" y2="1">
                <stop offset={floorOffset} stopColor={colors.line} />
                <stop offset={floorOffset} stopColor={colors.risk} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(value: string) => formatTinyDate(value)}
              stroke={colors.axis}
              tick={{ fill: colors.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: colors.axisLine }}
              minTickGap={8}
            />
            <YAxis
              domain={[min - pad, max + pad]}
              tickFormatter={(value: number) => formatCurrency(value)}
              stroke={colors.axis}
              tick={{ fill: colors.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={64}
            />
            <ReferenceLine
              y={safetyFloor}
              stroke={hasBreach ? colors.risk : colors.floor}
              strokeDasharray="5 4"
              strokeWidth={1.5}
              label={{
                value: `Safety floor ${formatCurrency(safetyFloor)}`,
                position: "insideBottomLeft",
                fill: hasBreach ? colors.risk : colors.axis,
                fontSize: 11,
              }}
            />
            <Tooltip
              cursor={{ stroke: colors.axis, strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const balance = payload.find((p) => p.dataKey === "balance")?.value as number;
                const scenario = payload.find((p) => p.dataKey === "scenario")?.value as
                  | number
                  | undefined;
                const isAnchor = label === anchorDate;
                return (
                  <div className="rounded-lg border border-ink-600 bg-ink-850 px-3 py-2 text-xs shadow-xl">
                    <p className="font-medium text-mist-100">{formatShortDate(String(label))}</p>
                    <p className="tabular mt-1 text-mist-300">
                      {isAnchor ? "Current balance" : "Projected"}:{" "}
                      <span className={balance < safetyFloor ? "text-risk-400" : "text-mist-100"}>
                        {formatCurrency(balance)}
                      </span>
                    </p>
                    {typeof scenario === "number" ? (
                      <p className="tabular mt-0.5 text-accent-400">
                        Scenario: {formatCurrency(scenario)}
                      </p>
                    ) : null}
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="balance"
              stroke={hasBreach ? "url(#balanceStroke)" : colors.line}
              strokeWidth={2.5}
              fill="url(#balanceFill)"
              dot={(props) => {
                const { cx, cy, index, payload } = props as {
                  cx: number;
                  cy: number;
                  index: number;
                  payload: ChartPoint;
                };
                const below = payload.balance < safetyFloor;
                return (
                  <circle
                    key={index}
                    cx={cx}
                    cy={cy}
                    r={3}
                    fill={colors.dotCore}
                    stroke={below ? colors.risk : colors.line}
                    strokeWidth={2}
                  />
                );
              }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
              name="Projected balance"
            />
            {scenarioDays ? (
              <Line
                type="monotone"
                dataKey="scenario"
                stroke={colors.scenario}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
                name="Scenario balance"
              />
            ) : null}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Text equivalent so the chart's meaning is available without seeing it. */}
      <p className="sr-only">
        Projected end-of-day balance from {formatShortDate(anchorDate)} to{" "}
        {formatShortDate(days.at(-1)!.date)}.{" "}
        {days
          .map((day) => `${formatShortDate(day.date)}: ${formatCurrency(day.endingBalance)}`)
          .join(". ")}
        . The safety floor is {formatCurrency(safetyFloor)}.
      </p>
    </div>
  );
}
