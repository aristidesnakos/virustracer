import type { OutbreakDefinition, OutbreakStatus } from "@/data/outbreaks";
import { computeMetrics, type Metrics, type WeeklyPeriod } from "./metrics";
import { deathsSuffix, latestFigures, type LatestFigures } from "./seo";
import { mergeTimeline } from "./timeline";
import type { TollData } from "./toll";
import { describeTrend, type TrendSummary } from "./trend-summary";

// What the home page shows per outbreak, and the published order of the cards.
// Pure and client-safe: the page reads toll.json and passes it in.

/**
 * Group order on the home page, as published on /methodology: outbreaks spreading
 * now, then signals that may become outbreaks, then ones winding down, then the record.
 */
export const STATUS_ORDER: readonly OutbreakStatus[] = ["active", "watch", "waning", "over"];

export const STATUS_HEADING: Record<OutbreakStatus, string> = {
  active: "Active",
  watch: "Under watch",
  waning: "Waning",
  over: "Declared over",
};

export interface SnapshotSource {
  /** Short label, e.g. "Wikipedia infobox (cites INSP DRC / WHO)" or "Curated by hand". */
  label: string;
  /** Exact revision of the newest automated reading, when there is one. */
  url: string | null;
  /** When the automated source was last read (ISO), or the curated "last reviewed" date. */
  checked: string | null;
  automated: boolean;
}

export interface OutbreakSnapshot {
  outbreak: OutbreakDefinition;
  figures: LatestFigures | null;
  trend: TrendSummary;
  /** New cases and deaths in the 7 days to `windowEnd`; null when history is too thin. */
  incidence: Metrics["incidence"];
  windowEnd: string | null;
  /** Weekly new cases and deaths, newest last; drives the sparkline. */
  weekly: WeeklyPeriod[];
  source: SnapshotSource;
}

/**
 * Builds one card's data. Rates come from `computeMetrics` on the daily snapshots
 * only (never the merged timeline), so windows end on the last day the total moved.
 * The headline figures use the merged timeline, like the dashboard.
 */
export function buildSnapshot(outbreak: OutbreakDefinition, toll: TollData): OutbreakSnapshot {
  const metrics = computeMetrics(toll.snapshots, outbreak.metrics);
  const ok = metrics.status === "ok";
  const newest = toll.snapshots.at(-1);
  const automated = outbreak.source.kind !== "manual";
  return {
    outbreak,
    figures: latestFigures(mergeTimeline(outbreak.casesTimeline, toll.snapshots)),
    trend: describeTrend(metrics),
    incidence: ok ? metrics.incidence : null,
    windowEnd: ok ? metrics.windowEnd : null,
    weekly: ok ? metrics.weekly : [],
    source: automated
      ? {
          label: newest?.source ?? "Wikipedia infobox",
          url: newest?.sourceUrl ?? null,
          checked: toll.lastChecked || null,
          automated,
        }
      : {
          label: "Curated by hand",
          url: null,
          checked: outbreak.summary.lastReviewed || null,
          automated,
        },
  };
}

/** Outbreaks without enough history sort after every outbreak with a measured week. */
const last7 = (s: OutbreakSnapshot, field: "deaths" | "confirmed"): number =>
  s.incidence?.[field].last7 ?? -1;

/**
 * The published ranking rule: status group first (STATUS_ORDER), then most new
 * deaths in the last 7 days, then most new confirmed cases, then title.
 */
export function compareSnapshots(a: OutbreakSnapshot, b: OutbreakSnapshot): number {
  return (
    STATUS_ORDER.indexOf(a.outbreak.status) - STATUS_ORDER.indexOf(b.outbreak.status) ||
    last7(b, "deaths") - last7(a, "deaths") ||
    last7(b, "confirmed") - last7(a, "confirmed") ||
    a.outbreak.title.localeCompare(b.outbreak.title)
  );
}

export interface StatusGroup {
  status: OutbreakStatus;
  heading: string;
  items: OutbreakSnapshot[];
}

/** Ranked snapshots split into status groups, in STATUS_ORDER; empty groups are left out. */
export function groupByStatus(snapshots: readonly OutbreakSnapshot[]): StatusGroup[] {
  const ranked = [...snapshots].sort(compareSnapshots);
  return STATUS_ORDER.map((status) => ({
    status,
    heading: STATUS_HEADING[status],
    items: ranked.filter((s) => s.outbreak.status === status),
  })).filter((g) => g.items.length > 0);
}

const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * Home meta description naming the top outbreaks with their numbers, capped near
 * the ~160 characters search engines show. Falls back when nothing has figures.
 */
export function describeHome(ranked: readonly OutbreakSnapshot[], fallback: string): string {
  const parts = ranked
    .filter((s) => s.outbreak.status !== "over" && s.figures)
    .slice(0, 3)
    .map(({ outbreak, figures }) => {
      const nums = [
        figures!.deaths !== null ? `${fmt(figures!.deaths)} deaths${deathsSuffix(outbreak.summary)}` : null,
        figures!.confirmed !== null ? `${fmt(figures!.confirmed)} cases` : null,
      ].filter(Boolean);
      return nums.length ? `${outbreak.shortName}: ${nums.join(", ")}` : outbreak.shortName;
    });
  if (parts.length === 0) return fallback;
  const lead = `Live outbreak figures with sources. ${parts.join("; ")}.`;
  return lead.length <= 160 ? lead : `${lead.slice(0, 157).trimEnd()}…`;
}
