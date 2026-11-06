import type { MetadataRoute } from "next";
import { INFECTION_CONTROL_PATH, NURSING_HOMES_PATH, RESPIRATORY_PATH, stateCitationsPath } from "./nursing-homes";
import { getF880Index, getRespiratoryRates, listF880States } from "./nursing-homes-data";
import { newestDate } from "./seo";
import { absoluteUrl } from "./site";

const toDate = (iso: string | null | undefined): Date | undefined => (iso ? new Date(iso) : undefined);

/**
 * Sitemap entries for the nursing-home pages. `lastModified` is the date the data moved:
 * the newest NHSN week for the respiratory page, the CMS release's publication date for
 * the citation pages; never build time.
 */
export function nursingHomeSitemapEntries(): MetadataRoute.Sitemap {
  const respiratory = getRespiratoryRates()?.latestWeek;
  const released = getF880Index()?.releases.at(-1)?.released;
  return [
    { url: absoluteUrl(NURSING_HOMES_PATH), lastModified: toDate(newestDate([respiratory ?? null, released ?? null])), changeFrequency: "weekly", priority: 0.6 },
    { url: absoluteUrl(RESPIRATORY_PATH), lastModified: toDate(respiratory), changeFrequency: "weekly", priority: 0.6 },
    { url: absoluteUrl(INFECTION_CONTROL_PATH), lastModified: toDate(released), changeFrequency: "monthly", priority: 0.5 },
    ...listF880States().map((st) => ({
      url: absoluteUrl(stateCitationsPath(st)),
      lastModified: toDate(released),
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
  ];
}
