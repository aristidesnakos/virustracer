import { ebolaBundibugyo2026 } from "./ebola-bundibugyo-2026";
import { hantavirusMvHondius2026 } from "./hantavirus-mv-hondius-2026";
import { measlesBangladesh2026 } from "./measles-bangladesh-2026";
import type { OutbreakDefinition } from "./types";

export type * from "./types";

/**
 * Every outbreak the site knows about, keyed by slug. Add one by creating its file
 * in this folder and listing it here (and in scripts/lib/outbreak-registry.mjs
 * if its figures are fetched automatically).
 */
const OUTBREAKS: readonly OutbreakDefinition[] = [
  ebolaBundibugyo2026,
  hantavirusMvHondius2026,
  measlesBangladesh2026,
];

/** Shown at `/` until the home page becomes a multi-outbreak snapshot. */
export const DEFAULT_OUTBREAK_SLUG = ebolaBundibugyo2026.slug;

export function listOutbreaks(): readonly OutbreakDefinition[] {
  return OUTBREAKS;
}

export function getOutbreak(slug: string): OutbreakDefinition | undefined {
  return OUTBREAKS.find((o) => o.slug === slug);
}

export function getDefaultOutbreak(): OutbreakDefinition {
  const found = getOutbreak(DEFAULT_OUTBREAK_SLUG);
  if (!found) throw new Error(`Default outbreak "${DEFAULT_OUTBREAK_SLUG}" is not registered`);
  return found;
}

/**
 * A closed, hand-kept record rather than a live dashboard: the outbreak is over or
 * its figures are curated by hand. Its page and home card show a "last verified"
 * date and nothing that looks live (no pulsing dot, no fetch times, no "latest" news).
 */
export function isArchivedRecord(o: Pick<OutbreakDefinition, "status" | "source">): boolean {
  return o.status === "over" || o.source.kind === "manual";
}
