import type { TrendSummary, Verdict } from "@/lib/trend-summary";

// Colour is never the only cue: each verdict also has a word and an arrow.
const VERDICT_STYLE: Record<Verdict, { badge: string; arrow: string }> = {
  growing: { badge: "bg-death-tint text-death ring-death/30", arrow: "↗" },
  declining: { badge: "bg-good-tint text-good ring-good/30", arrow: "↘" },
  plateau: { badge: "bg-suspected-tint text-suspected-text ring-suspected/30", arrow: "→" },
  unknown: { badge: "bg-sunk text-ink-muted ring-rule-strong/60", arrow: "·" },
};

/** The trend verdict from describeTrend as a pill: arrow plus label. */
export default function TrendBadge({
  summary,
  className = "",
}: {
  summary: Pick<TrendSummary, "verdict" | "label">;
  className?: string;
}) {
  const style = VERDICT_STYLE[summary.verdict];
  return (
    <span
      data-testid="trend-badge"
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold ring-1 ring-inset ${style.badge} ${className}`}
    >
      <span aria-hidden>{style.arrow}</span>
      {summary.label}
    </span>
  );
}
