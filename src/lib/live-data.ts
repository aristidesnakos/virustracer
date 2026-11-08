import { readFileSync, existsSync } from "fs";
import { outbreakDataPath } from "./outbreak-data";

export interface FeedItem {
  id: string;
  title: string;
  url: string;
  date: string;
  source: string;
  summary: string;
  /** True when `summary` is the raw feed text because the model call failed (repaired by a later run). */
  summaryFallback?: boolean;
  /** Failed summary re-requests so far (scripts/lib/feed-items.mjs `needsSummaryRepair`). */
  summaryRepairAttempts?: number;
}

export interface LiveData {
  lastFetched: string;
  processedIds: string[];
  recentItems: FeedItem[];
}

export function getLiveData(slug: string): LiveData {
  const path = outbreakDataPath(slug, "live");
  if (!existsSync(path)) {
    return { lastFetched: "", processedIds: [], recentItems: [] };
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as LiveData;
  } catch {
    return { lastFetched: "", processedIds: [], recentItems: [] };
  }
}
