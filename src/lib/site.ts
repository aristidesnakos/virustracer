/**
 * Single source of truth for absolute URLs used in metadata, structured data,
 * the sitemap and robots.txt. Canonical, Open Graph and JSON-LD URLs must all
 * name the same host, or search engines treat them as separate properties.
 *
 * The permanent domain is a constant, so canonical URLs never depend on a
 * platform-assigned address (a renamed Vercel project must not change what we
 * tell search engines, citations and DOIs). NEXT_PUBLIC_SITE_URL overrides it.
 */
export const PRODUCTION_SITE_URL = "https://outbreakfiles.com";

function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  return process.env.NODE_ENV === "production" ? PRODUCTION_SITE_URL : "http://localhost:3000";
}

export const SITE_URL = resolveSiteUrl();
/**
 * The site's own name, kept separate from any outbreak so the registry can hold
 * several. Each outbreak has its own `title`; this names the site that holds them.
 */
export const SITE_NAME = "Outbreak Files";
/** One-line description of the site as a whole (not of any single outbreak). */
export const SITE_TAGLINE = "Live outbreak figures, each tied to its source and kept on file.";

export const absoluteUrl = (path = "/"): string => `${SITE_URL}${path === "/" ? "" : path}`;

/**
 * The site's licence for its data. Most outbreaks are read from a Wikipedia infobox (CC BY-SA 4.0),
 * so the data is shared under the same licence; figures from official reports (e.g. EODY) are facts
 * shared under it too, with the report credited.
 */
export const DATA_LICENSE = "https://creativecommons.org/licenses/by-sa/4.0/";
export const DATA_LICENSE_NAME = "CC BY-SA 4.0";
