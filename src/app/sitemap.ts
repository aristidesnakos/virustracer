import type { MetadataRoute } from "next";
import { getDefaultOutbreak } from "@/data/outbreaks";
import { getTollData } from "@/lib/toll";
import { mergeTimeline, latestDate } from "@/lib/timeline";
import { absoluteUrl } from "@/lib/site";

// `lastModified` is the date the data last moved, not the build time: a
// timestamp that changes on every deploy claims everything changed at once and
// gets ignored.
export default function sitemap(): MetadataRoute.Sitemap {
  const outbreak = getDefaultOutbreak();
  const toll = getTollData(outbreak.slug);
  const dataDate = latestDate(mergeTimeline(outbreak.casesTimeline, toll.snapshots));
  const lastModified = dataDate ? new Date(dataDate) : undefined;
  return [
    { url: absoluteUrl("/"), lastModified, changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/data"), lastModified, changeFrequency: "weekly", priority: 0.7 },
  ];
}
