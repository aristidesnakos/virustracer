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
