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
      return { verdict: "growing", label: "Growing", headline: `Cases are rising: ${base}` };
    case "shrinking":
      return { verdict: "declining", label: "Declining", headline: `Cases are falling: ${base}` };
    case "stable":
      return {
        verdict: "plateau",
        label: "Plateau",
        headline: `No clear rise or fall: ${base}`,
      };
    default:
      return { verdict: "unknown", label: "Unclear", headline: `Too few new cases to judge a trend: ${base}` };
  }
}
