import { isArchivedRecord, type CaseDataPoint, type OutbreakDefinition, type OutbreakStatus } from "@/data/outbreaks";
import { latestDate } from "./timeline";

// Pure helpers behind the page metadata and structured data (no fs, no Next).

export interface LatestFigures {
  /** Date of the newest point on the timeline, ISO. */
  date: string;
  confirmed: number | null;
  deaths: number | null;
}

/**
 * The newest reported confirmed and death counts. Curated milestone rows carry
 * only one figure, so each series is read from the latest point that has it.
 */
export function latestFigures(timeline: readonly CaseDataPoint[]): LatestFigures | null {
  const date = latestDate(timeline);
  if (!date) return null;
  const newest = (field: "confirmed" | "deaths"): number | null => {
    let best: CaseDataPoint | null = null;
    for (const p of timeline) {
      if (p[field] === undefined) continue;
      if (best === null || Date.parse(p.date) > Date.parse(best.date)) best = p;
    }
    return best?.[field] ?? null;
  };
  return { date, confirmed: newest("confirmed"), deaths: newest("deaths") };
}

const fmt = (n: number) => n.toLocaleString("en-US");

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Meta description with the current numbers up front, which is what a searcher
 * for "ebola death toll" wants to see in the snippet. Falls back to the static
 * description when there is no data. Capped near the ~160 characters search
 * engines show.
 */
/** " among confirmed cases" (leading space) or "", for text that follows "N deaths". */
export function deathsSuffix(summary?: { deathsQualifier?: string }): string {
  return summary?.deathsQualifier ? ` ${summary.deathsQualifier}` : "";
}

export function describeFigures(
  figures: LatestFigures | null,
  fallback: string,
  label: { shortName: string; places: string; summary?: { deathsQualifier?: string } },
  /** A closed, hand-curated record: say so instead of promising daily updates. A weekly source says weekly. */
  options: { archived?: boolean; weekly?: boolean } = {},
): string {
  if (!figures || (figures.deaths === null && figures.confirmed === null)) return fallback;
  const parts: string[] = [];
  if (figures.deaths !== null) parts.push(`${fmt(figures.deaths)} deaths${deathsSuffix(label.summary)}`);
  if (figures.confirmed !== null) parts.push(`${fmt(figures.confirmed)} confirmed cases`);
  const tail = options.archived
    ? "Archived record with map, timeline and sources."
    : options.weekly
      ? "Updated weekly, with map, trend and free data API."
      : "Updated daily, with map, trend and free data API.";
  return (
    `${label.shortName}: ${parts.join(" and ")} as of ${longDate(figures.date)} ` +
    `(${label.places}). ${tail}`
  );
}

type ChangeFrequency = "daily" | "monthly";

/** How much an outbreak page matters to crawl: live ones first, dormant watch-list entries last. */
export const SITEMAP_PRIORITY: Record<OutbreakStatus, number> = {
  active: 0.9,
  waning: 0.7,
  over: 0.5,
  watch: 0.3,
};

/** Outbreaks still moving change daily; finished or dormant ones rarely. */
export function sitemapChangeFrequency(status: OutbreakStatus): ChangeFrequency {
  return status === "active" || status === "waning" ? "daily" : "monthly";
}

/** The newest of several ISO dates (undefined entries ignored), or undefined when there are none. */
export function newestDate(dates: readonly (string | undefined | null)[]): string | undefined {
  let best: string | undefined;
  for (const d of dates) {
    if (!d || Number.isNaN(Date.parse(d))) continue;
    if (best === undefined || Date.parse(d) > Date.parse(best)) best = d;
  }
  return best;
}

/**
 * Bottom line of an outbreak's share card. A live outbreak gives the date of its
 * figures ("as of"); an archived record says it is one and when it was last
 * checked against its sources.
 */
export function shareCardFooter(
  outbreak: Pick<OutbreakDefinition, "credit" | "status" | "source" | "summary">,
  figures: LatestFigures | null,
): string {
  const credit = outbreak.credit ?? `figures from ${outbreak.summary.source}`;
  if (isArchivedRecord(outbreak)) {
    return `Archived record · ${credit} · last verified ${longDate(outbreak.summary.lastReviewed)}`;
  }
  return `Unofficial dashboard · ${credit}${figures ? ` · as of ${figures.date}` : ""}`;
}
