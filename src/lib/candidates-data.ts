import { readFileSync, existsSync } from "fs";
import { outbreakDataPath } from "./outbreak-data";

export interface CandidateSignal {
  id: string;
  country: string;
  iso: string;
  flag: string;
  casesMentioned: number | null;
  deathsMentioned: number | null;
  context: string;
  sourceTitle: string;
  sourceUrl: string;
  sourceName: string;
  date: string;
  extractedAt: string;
}

export interface CandidatesData {
  lastExtracted: string;
  candidates: CandidateSignal[];
  /**
   * Ids of articles the model has already read (including ones that named no country), so
   * the updater does not ask again. Written by scripts/fetch-feeds.mjs; absent in old files.
   * Not used for display or in any API output.
   */
  checkedIds?: string[];
}

export function getCandidatesData(slug: string): CandidatesData {
  const path = outbreakDataPath(slug, "candidates");
  if (!existsSync(path)) {
    return { lastExtracted: "", candidates: [] };
  }
  try {
    return JSON.parse(
      readFileSync(path, "utf-8"),
    ) as CandidatesData;
  } catch {
    return { lastExtracted: "", candidates: [] };
  }
}
