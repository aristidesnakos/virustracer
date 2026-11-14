/**
 * DataFast goals this site records, shared by the client tracker (src/lib/analytics.ts) and the
 * proxy (src/app/api/datafast/route.ts). The proxy forwards only these names and only these
 * metadata keys, so the public endpoint cannot be used to write arbitrary events with our key.
 * Names are lowercase snake_case and stable: renaming one splits its metric in the dashboard.
 */
export const GOALS = {
  /** The vaccines-and-treatments box scrolled into view (once per page load). */
  countermeasures_view: ["pathogen", "outbreak"],
  /** A source link in the box (registry, regulator, statement) was clicked. */
  countermeasures_source_click: ["pathogen", "outbreak", "product", "tier", "source_kind"],
  /** "How this box is kept" (link to /methodology#countermeasures) was clicked. */
  countermeasures_method_click: ["pathogen", "outbreak"],
} as const satisfies Record<string, readonly string[]>;

export type GoalName = keyof typeof GOALS;

/** Keys every goal may carry, added by the tracker. */
export const COMMON_METADATA_KEYS = ["page_url", "page_title", "timestamp"] as const;

export const MAX_METADATA_VALUE = 300;

export function isGoalName(name: unknown): name is GoalName {
  return typeof name === "string" && Object.prototype.hasOwnProperty.call(GOALS, name);
}

/** Keep only the keys allowed for `name`, as strings no longer than MAX_METADATA_VALUE. */
export function cleanMetadata(name: GoalName, metadata: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!metadata || typeof metadata !== "object") return out;
  const allowed = new Set<string>([...GOALS[name], ...COMMON_METADATA_KEYS]);
  for (const [k, v] of Object.entries(metadata as Record<string, unknown>)) {
    if (!allowed.has(k) || v == null || typeof v === "object") continue;
    out[k] = String(v).slice(0, MAX_METADATA_VALUE);
  }
  return out;
}

/** DataFast visitor ids are short opaque tokens; refuse anything else. */
export function isVisitorId(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{6,100}$/.test(id);
}
