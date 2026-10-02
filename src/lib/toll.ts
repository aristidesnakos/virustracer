import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

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
}

export interface TollData {
  /** ISO timestamp of the last successful check, "" if never. */
  lastChecked: string;
  /** Ascending by date. */
  snapshots: TollSnapshot[];
}

const TOLL_PATH = resolve(process.cwd(), "data/toll.json");

const EMPTY: TollData = { lastChecked: "", snapshots: [] };

export function getTollData(): TollData {
  if (!existsSync(TOLL_PATH)) return { ...EMPTY, snapshots: [] };
  try {
    const raw = JSON.parse(readFileSync(TOLL_PATH, "utf-8")) as Partial<TollData>;
    return {
      lastChecked: typeof raw.lastChecked === "string" ? raw.lastChecked : "",
      snapshots: Array.isArray(raw.snapshots) ? raw.snapshots : [],
    };
  } catch {
    return { ...EMPTY, snapshots: [] };
  }
}
