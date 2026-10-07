import type { CaseDataPoint } from "@/data/outbreaks";
import type { TollSnapshot } from "./toll";

// Pure and client-safe: no fs. `TollSnapshot` is a type-only import so the
// server-side reader in ./toll is never bundled for the browser.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-02" -> "Oct 2" (UTC-safe, matches the curated labels). */
function formatLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

function snapshotToPoint(s: TollSnapshot): CaseDataPoint {
  const point: CaseDataPoint = {
    date: s.date,
    label: formatLabel(s.date),
    confirmed: s.confirmed,
    deaths: s.deaths,
    note: `Auto-tracked from ${s.source}`,
    source: s.source,
  };
  if (s.suspected !== null && s.suspected !== undefined) point.suspected = s.suspected;
  if (s.recovered !== null && s.recovered !== undefined) point.recovered = s.recovered;
  return point;
}

/**
 * Combine hand-curated points with auto-tracked snapshots. Curated rows win
 * when both exist for the same date. Result is sorted ascending by date.
 */
export function mergeTimeline(
  curated: CaseDataPoint[],
  snapshots: TollSnapshot[],
): CaseDataPoint[] {
  const curatedDays = new Set(curated.map((p) => dayKey(p.date)));
  const auto = snapshots
    .filter((s) => !curatedDays.has(dayKey(s.date)))
    .map(snapshotToPoint);
  return [...curated, ...auto].sort(
    (a, b) => Date.parse(a.date) - Date.parse(b.date),
  );
}

/** ISO date of the most recent point, or null for an empty timeline. */
export function latestDate(timeline: readonly CaseDataPoint[]): string | null {
  let best: string | null = null;
  for (const p of timeline) {
    if (best === null || Date.parse(p.date) > Date.parse(best)) best = p.date;
  }
  return best;
}
