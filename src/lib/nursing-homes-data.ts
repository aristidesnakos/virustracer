import { existsSync, readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import type { CountsFile, F880Index, RatesFile, StateCitationsFile } from "./nursing-homes";

// Server-side only: reads data/nursing-homes/, written by scripts/update-nursing-homes.mjs.
// Each reader returns null when the file is missing or unreadable, so a page can say
// "not yet fetched" instead of crashing.

const DIR = () => resolve(process.cwd(), "data", "nursing-homes");

function readJson<T>(...parts: string[]): T | null {
  const path = resolve(DIR(), ...parts);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

export const getRespiratoryCounts = (): CountsFile | null => readJson<CountsFile>("respiratory", "counts.json");
export const getRespiratoryRates = (): RatesFile | null => readJson<RatesFile>("respiratory", "rates.json");
export const getF880Index = (): F880Index | null => readJson<F880Index>("infection-control", "index.json");

const STATE_CODE = /^[A-Z]{2}$/;

/** Two-letter codes with a stored F880 file, sorted. */
export function listF880States(): string[] {
  const dir = resolve(DIR(), "infection-control", "states");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^[A-Z]{2}\.json$/.test(f))
    .map((f) => f.slice(0, 2))
    .sort();
}

/** One state's citations, or null. Rejects anything but a two-letter upper-case code, so input cannot leave the folder. */
export function getF880State(state: string): StateCitationsFile | null {
  if (!STATE_CODE.test(state)) return null;
  return readJson<StateCitationsFile>("infection-control", "states", `${state}.json`);
}
