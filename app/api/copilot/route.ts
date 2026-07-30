import { NextResponse } from "next/server";

/**
 * Optional LLM polish layer.
 *
 * The dashboard is fully functional without this route and without any API
 * key: every explanation on the page is generated deterministically in
 * `lib/insights.ts`. This endpoint only rephrases *already calculated*
 * aggregates, and it never receives raw transaction rows.
 */

export const runtime = "nodejs";

type CopilotRequest = {
  currentBalance?: number;
  safeDays?: number;
  cashShortfallDate?: string | null;
  projectedShortfall?: number;
  upcomingObligations?: { name: string; amount: number; date: string }[];
  incomeTrend?: string;
  spendingPatterns?: string;
  advancePatterns?: string;
  confidence?: string;
};

type CopilotResponse = {
  summary: string;
  recommendations: string[];
  explanation: string;
  source: "model" | "deterministic";
};

function isValidPayload(value: unknown): value is CopilotRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as CopilotRequest;
  return (
    (body.currentBalance === undefined || typeof body.currentBalance === "number") &&
    (body.safeDays === undefined || typeof body.safeDays === "number")
  );
}

/** Mirrors the on-page wording so the fallback never looks degraded. */
function deterministicResponse(body: CopilotRequest): CopilotResponse {
  const bills = (body.upcomingObligations ?? []).slice(0, 2).map((o) => o.name.toLowerCase());
  const hasShortfall = Boolean(body.cashShortfallDate);
  const summary = hasShortfall
    ? `Your buffer covers about ${(body.safeDays ?? 0).toFixed(1)} days, with a projected shortfall of $${Math.round(body.projectedShortfall ?? 0)} on ${body.cashShortfallDate}.`
    : `No cash shortfall is projected in this window, and your buffer covers the full forecast.`;

  return {
    summary,
    recommendations: hasShortfall
      ? [
          "Delay optional spending until after the bill clears.",
          "Consider one extra shift near your recent median pay.",
          "If an advance is needed, take only the amount that closes the gap.",
        ]
      : ["Reserve a small amount from your next payout to extend the cushion."],
    explanation: bills.length
      ? `${bills.join(" and ")} ${bills.length > 1 ? "fall" : "falls"} inside the window and ${bills.length > 1 ? "account" : "accounts"} for most of the pressure on your balance.`
      : `Everyday essentials are the main draw on your balance in this window.`,
    source: "deterministic",
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidPayload(body)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const fallback = deterministicResponse(body);

  // No key configured: return the deterministic copy rather than an error, so
  // the UI never blocks on this endpoint.
  if (!apiKey) return NextResponse.json(fallback);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You rewrite pre-calculated personal cashflow metrics into supportive, non-judgmental plain English for a worker with irregular income. Never invent numbers, never add facts that are not in the input, and never give financial advice. Respond as JSON with keys: summary (string), recommendations (array of up to 3 short strings), explanation (string).",
          },
          { role: "user", content: JSON.stringify(body) },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return NextResponse.json(fallback);

    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content;
    if (typeof raw !== "string") return NextResponse.json(fallback);

    const parsed = JSON.parse(raw);
    if (typeof parsed?.summary !== "string" || typeof parsed?.explanation !== "string") {
      return NextResponse.json(fallback);
    }

    return NextResponse.json({
      summary: parsed.summary,
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations.filter((r: unknown) => typeof r === "string").slice(0, 3)
        : fallback.recommendations,
      explanation: parsed.explanation,
      source: "model",
    } satisfies CopilotResponse);
  } catch {
    return NextResponse.json(fallback);
  }
}
