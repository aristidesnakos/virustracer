import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

export interface FeedItem {
  id: string;
  title: string;
  url: string;
  date: string;
  source: string;
  summary: string;
}

export interface LiveData {
  lastFetched: string;
  processedIds: string[];
  recentItems: FeedItem[];
}

const LIVE_PATH = resolve(process.cwd(), "data/live.json");

export function getLiveData(): LiveData {
  if (!existsSync(LIVE_PATH)) {
    return { lastFetched: "", processedIds: [], recentItems: [] };
  }
  try {
    return JSON.parse(readFileSync(LIVE_PATH, "utf-8")) as LiveData;
  } catch {
    return { lastFetched: "", processedIds: [], recentItems: [] };
  }
}
