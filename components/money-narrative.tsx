import { Clock, Compass, HelpCircle, Lightbulb, Sparkles } from "lucide-react";
import { Card } from "./ui";
import type { MoneyNarrative as Narrative } from "@/lib/insights";

const ROWS = [
  { key: "what", label: "What is happening", icon: Compass },
  { key: "why", label: "Why", icon: HelpCircle },
  { key: "when", label: "When it matters", icon: Clock },
  { key: "action", label: "Most useful action", icon: Lightbulb },
] as const;

/**
 * The narrative layer. Every sentence is assembled in lib/insights.ts from
 * calculated values — there is no model call and nothing is invented.
 */
export function MoneyNarrative({ narrative }: { narrative: Narrative }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-ink-700/70 bg-gradient-to-r from-accent-500/10 to-transparent px-5 py-4">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-400">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          What your money is telling you
        </p>
        <h2 className="mt-2 text-lg font-semibold leading-snug tracking-tight text-mist-100 sm:text-xl">
          {narrative.headline}
        </h2>
      </div>
      <dl className="divide-y divide-ink-800">
        {ROWS.map((row) => {
          const Icon = row.icon;
          return (
            <div key={row.key} className="flex gap-3 px-5 py-3.5">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-mist-600" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-mist-600">
                  {row.label}
                </dt>
                <dd className="mt-1 text-sm leading-relaxed text-mist-300">{narrative[row.key]}</dd>
              </div>
            </div>
          );
        })}
      </dl>
    </Card>
  );
}
