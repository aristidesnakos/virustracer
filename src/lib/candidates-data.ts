import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

export interface CandidateSignal {
  id: string;
  country: string;
  iso: string;
  flag: string;
  casesMentioned: number | null;
  deathsMentioned: number | null;
  monitoredMentioned: number | null;
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

const CANDIDATES_PATH = resolve(process.cwd(), "data/candidates.json");

export function getCandidatesData(): CandidatesData {
  if (!existsSync(CANDIDATES_PATH)) {
    return { lastExtracted: "", candidates: [] };
  }
  try {
    return JSON.parse(
      readFileSync(CANDIDATES_PATH, "utf-8"),
    ) as CandidatesData;
  } catch {
    return { lastExtracted: "", candidates: [] };
  }
}
