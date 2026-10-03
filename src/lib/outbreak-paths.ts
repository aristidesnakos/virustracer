// URL shapes for an outbreak's pages and API. Pure and client-safe. Everything
// that links to an outbreak goes through these, so a URL change is one edit.

/** Dashboard page for one outbreak. */
export const outbreakPath = (slug: string): string => `/outbreaks/${slug}`;

export type OutbreakApiResource = "toll" | "metrics" | "signals";

/** Per-outbreak API endpoint, e.g. /api/v1/outbreaks/<slug>/toll. */
export const outbreakApiPath = (slug: string, resource: OutbreakApiResource): string =>
  `/api/v1/outbreaks/${slug}/${resource}`;

/** The list of all outbreaks. */
export const OUTBREAKS_API_PATH = "/api/v1/outbreaks";

/**
 * The un-prefixed endpoints (/api/v1/toll and friends) are permanent aliases for
 * the default outbreak. Callers rely on them, so they must never be removed.
 */
export const legacyApiPath = (resource: OutbreakApiResource): string => `/api/v1/${resource}`;
