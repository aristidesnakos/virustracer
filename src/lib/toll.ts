import { readFileSync, existsSync } from "fs";
import { outbreakDataPath } from "./outbreak-data";

// Server-side only (reads the filesystem). Client code must import the types
// with `import type` and receive the data via props.

export interface TollSnapshot {
  /** UTC date, YYYY-MM-DD */
  date: string;
  confirmed: number;
  suspected: number | null;
  deaths: number;
  recovered: number | null;
  source: string;
  sourceUrl: string;
  revid?: number;
  /** When that Wikipedia revision was saved (UTC ISO), so readers can see how fresh the reading was. */
  revisionTimestamp?: string;
  /** Repo-relative path of the archived raw infobox wikitext this reading was parsed from. Internal; not exposed by the API. */
  rawPath?: string;
  /** SHA-256 (hex) of that archived file, so the reading can be re-verified independently. */
  rawSha256?: string;
}

export interface TollData {
  /** ISO timestamp of the last successful check, "" if never. */
  lastChecked: string;
  /** Ascending by date. */
  snapshots: TollSnapshot[];
}

const EMPTY: TollData = { lastChecked: "", snapshots: [] };

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
