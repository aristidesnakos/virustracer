import { readFileSync, existsSync } from "fs";
import { outbreakDataPath } from "./outbreak-data";

// Server-side only (reads the filesystem). Client code must import the types
// with `import type` and receive the data via props.

export interface TollSnapshot {
  /** UTC date, YYYY-MM-DD */
  date: string;
  confirmed: number;
  suspected: number | null;
  /** Null for a source that collects no deaths at all (CDC's NNDSS table), never a stand-in 0. */
  deaths: number | null;
  recovered: number | null;
  /**
   * Screening (colonisation) cases, for a source that counts them apart from clinical cases
   * (NNDSS Candida auris). Never part of `confirmed` or `suspected`.
   */
  screening?: number | null;
  /**
   * US measles (CDC): the deaths in the data file behind the page (`measles_hosp.json`), which the
   * page does not display. `deaths` is the figure the page shows, "subject to change" while CDC
   * reviews are completed. Absent for every other source.
   */
  deathsDataFile?: number | null;
  /** MMWR year and week of a reading from CDC's weekly NNDSS table. */
  mmwrYear?: number;
  mmwrWeek?: number;
  source: string;
  sourceUrl: string;
  revid?: number;
  /** When that Wikipedia revision was saved (UTC ISO), so readers can see how fresh the reading was. */
  revisionTimestamp?: string;
  /** Repo-relative path of the archived raw infobox wikitext this reading was parsed from. Internal; not exposed by the API. */
  rawPath?: string;
  /** SHA-256 (hex) of that archived file, so the reading can be re-verified independently. */
  rawSha256?: string;
  /** SHA-256 (hex) of the source document itself, for an official report (the PDF at `sourceUrl`). */
  sourceSha256?: string;
}

export interface TollData {
  /** ISO timestamp of the last successful check, "" if never. */
  lastChecked: string;
  /** Ascending by date. */
  snapshots: TollSnapshot[];
}

const EMPTY: TollData = { lastChecked: "", snapshots: [] };

/**
 * A note for the deaths figure when the source carries a second, larger count it does not
 * display: the CDC measles page shows the deaths that passed its review, its data file the deaths
 * reported so far. Computed from the latest snapshot, so it cannot go stale like a hand-typed note.
 * Null when the two agree or there is no second figure.
 */
export function deathsGapNote(snapshots: readonly TollSnapshot[]): string | null {
  const latest = [...snapshots].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const file = latest?.deathsDataFile;
  if (!latest || file == null || latest.deaths == null || file === latest.deaths) return null;
  const n = (x: number) => x.toLocaleString("en-US");
  return `${n(file)} in the CDC’s data file; the page shows ${n(latest.deaths)}, “subject to change” while CDC reviews are completed`;
}

export function getTollData(slug: string): TollData {
  const path = outbreakDataPath(slug, "toll");
  if (!existsSync(path)) return { ...EMPTY, snapshots: [] };
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as Partial<TollData>;
    return {
      lastChecked: typeof raw.lastChecked === "string" ? raw.lastChecked : "",
      snapshots: Array.isArray(raw.snapshots) ? raw.snapshots : [],
    };
  } catch {
    return { ...EMPTY, snapshots: [] };
  }
}
