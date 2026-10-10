import type { MetadataRoute } from "next";
import { listOutbreaks } from "@/data/outbreaks";
import { getTollData } from "@/lib/toll";
import { mergeTimeline, latestDate } from "@/lib/timeline";
import { newestDate, SITEMAP_PRIORITY, sitemapChangeFrequency } from "@/lib/seo";
import { outbreakPath } from "@/lib/outbreak-paths";
import { COMMERCIAL_PATH } from "@/lib/commercial";
import { absoluteUrl } from "@/lib/site";

const toDate = (iso: string | null | undefined): Date | undefined => (iso ? new Date(iso) : undefined);

// `lastModified` is the date the data last moved, not the build time: a
// timestamp that changes on every deploy claims everything changed at once and
// gets ignored. The home page and /data change whenever any outbreak does.
export default function sitemap(): MetadataRoute.Sitemap {
  const outbreaks = listOutbreaks().map((o) => ({
    outbreak: o,
    dataDate: latestDate(mergeTimeline(o.casesTimeline, getTollData(o.slug).snapshots)),
  }));
  const siteDate = toDate(newestDate(outbreaks.map((o) => o.dataDate)));

  return [
    { url: absoluteUrl("/"), lastModified: siteDate, changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/data"), lastModified: siteDate, changeFrequency: "weekly", priority: 0.7 },
    // Text pages change only when edited; no honest lastModified without a content date, so it is left out.
    { url: absoluteUrl("/methodology"), changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl("/about"), changeFrequency: "monthly", priority: 0.4 },
    { url: absoluteUrl(COMMERCIAL_PATH), changeFrequency: "monthly", priority: 0.3 },
    ...outbreaks.map(({ outbreak, dataDate }) => ({
      url: absoluteUrl(outbreakPath(outbreak.slug)),
      lastModified: toDate(dataDate),
      changeFrequency: sitemapChangeFrequency(outbreak.status),
      priority: SITEMAP_PRIORITY[outbreak.status],
    })),
  ];
}
