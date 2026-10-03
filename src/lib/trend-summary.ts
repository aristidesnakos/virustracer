import type { Metrics } from "./metrics";

// Turns the numbers from computeMetrics into one honest plain-language line.
// Pure and client-safe.

export type Verdict = "growing" | "declining" | "plateau" | "unknown";

export interface TrendSummary {
  verdict: Verdict;
  /** Short label for a badge. */
  label: string;
  /** One sentence a non-specialist can read. */
  headline: string;
}

/**
 * The plain-language result a home card leads with. The badge labels ("Growing", "Plateau", ...)
 * stay for the dashboard; the headline below starts with the same words, so they cannot drift.
 */
export const TREND_STATEMENT = {
  growing: "Cases are rising",
  declining: "Cases are falling",
  plateau: "No clear rise or fall",
  unclear: "Too few new cases to judge a trend",
  noData: "Not enough data for a trend yet",
} as const;

export function trendStatement(summary: Pick<TrendSummary, "verdict" | "label">): string {
  switch (summary.verdict) {
    case "growing":
      return TREND_STATEMENT.growing;
    case "declining":
      return TREND_STATEMENT.declining;
    case "plateau":
      return TREND_STATEMENT.plateau;
    default:
      return summary.label === "Unclear" ? TREND_STATEMENT.unclear : TREND_STATEMENT.noData;
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-01" -> "1 Oct" (UTC). */
export function shortDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

function comparison(changePct: number | null): string {
  if (changePct === null) return "";
  const rounded = Math.round(Math.abs(changePct));
  if (rounded === 0) return ", about the same as the week before";
  return `, ${rounded}% ${changePct > 0 ? "more" : "fewer"} than the week before`;
}

export function describeTrend(metrics: Metrics): TrendSummary {
  if (metrics.status !== "ok" || !metrics.incidence || !metrics.windowEnd) {
    return {
      verdict: "unknown",
      label: "Not enough data",
      headline: metrics.reason ?? "Not enough history yet to show a trend.",
    };
  }

  const { last7, changePct } = metrics.incidence.confirmed;
  const base = `${fmt(last7)} new confirmed cases in the 7 days to ${shortDay(metrics.windowEnd)}${comparison(changePct)}.`;

  switch (metrics.growth?.trend) {
    case "growing":
      return { verdict: "growing", label: "Growing", headline: `${TREND_STATEMENT.growing}: ${base}` };
    case "shrinking":
      return { verdict: "declining", label: "Declining", headline: `${TREND_STATEMENT.declining}: ${base}` };
    case "stable":
      return {
        verdict: "plateau",
        label: "Plateau",
        headline: `${TREND_STATEMENT.plateau}: ${base}`,
      };
    default:
      return { verdict: "unknown", label: "Unclear", headline: `${TREND_STATEMENT.unclear}: ${base}` };
  }
}
