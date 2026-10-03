import { resolve } from "path";

// Server-side only. Each outbreak keeps its fetched data in data/outbreaks/<slug>/,
// written by the scripts and committed by the workflow.

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type OutbreakDataFile = "toll" | "live" | "candidates" | "signals";

/**
 * Absolute path of one of an outbreak's JSON files. Rejects anything that is not
 * a plain slug, so a route parameter can never walk out of the data folder.
 */
export function outbreakDataPath(slug: string, file: OutbreakDataFile): string {
  if (!SLUG_PATTERN.test(slug)) throw new Error(`Invalid outbreak slug: ${JSON.stringify(slug)}`);
  return resolve(process.cwd(), "data", "outbreaks", slug, `${file}.json`);
}
