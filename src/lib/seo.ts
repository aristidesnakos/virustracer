import type { CaseDataPoint } from "@/data/outbreaks";
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
export function describeFigures(
  figures: LatestFigures | null,
  fallback: string,
  label: { shortName: string; places: string },
): string {
  if (!figures || (figures.deaths === null && figures.confirmed === null)) return fallback;
  const parts: string[] = [];
  if (figures.deaths !== null) parts.push(`${fmt(figures.deaths)} deaths`);
  if (figures.confirmed !== null) parts.push(`${fmt(figures.confirmed)} confirmed cases`);
  return (
    `${label.shortName}: ${parts.join(" and ")} as of ${longDate(figures.date)} ` +
    `(${label.places}). Updated daily, with map, trend and free data API.`
  );
}
