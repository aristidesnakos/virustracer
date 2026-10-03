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
 * several. Placeholder: still the Ebola tracker's name until a brand is chosen.
 */
export const SITE_NAME = "Ebola Outbreak Tracker";

export const absoluteUrl = (path = "/"): string => `${SITE_URL}${path === "/" ? "" : path}`;

/** The Wikipedia infobox is the data source (CC BY-SA 4.0), so the data is shared under the same licence. */
export const DATA_LICENSE = "https://creativecommons.org/licenses/by-sa/4.0/";
export const DATA_LICENSE_NAME = "CC BY-SA 4.0";
