import type { CountermeasureFile } from "@/lib/countermeasures";
import bundibugyo from "./ebolavirus-bundibugyo.json";

/**
 * Hand-curated countermeasure files, keyed by pathogen id. An outbreak shows one through
 * `OutbreakDefinition.countermeasures`. Add a file here and in this folder; the shape and rules
 * are in src/lib/countermeasures.ts and checked by tests/countermeasures.test.ts.
 */
const FILES: readonly CountermeasureFile[] = [bundibugyo as CountermeasureFile];

export function listCountermeasures(): readonly CountermeasureFile[] {
  return FILES;
}

export function getCountermeasures(id: string | undefined): CountermeasureFile | undefined {
  return id ? FILES.find((f) => f.id === id) : undefined;
}
