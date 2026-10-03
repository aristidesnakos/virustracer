/**
 * Single source of truth for absolute URLs used in metadata, structured data,
 * the sitemap and robots.txt. Canonical, Open Graph and JSON-LD URLs must all
 * name the same host, or search engines treat them as separate properties.
 *
 * Set NEXT_PUBLIC_SITE_URL to a custom domain; on Vercel the production domain
 * (VERCEL_PROJECT_PRODUCTION_URL) is picked up automatically.
 */
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
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
