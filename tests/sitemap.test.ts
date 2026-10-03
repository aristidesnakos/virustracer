import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import { listOutbreaks } from "@/data/outbreaks";
import { getTollData } from "@/lib/toll";
import { mergeTimeline, latestDate } from "@/lib/timeline";
import { newestDate, SITEMAP_PRIORITY, sitemapChangeFrequency } from "@/lib/seo";
import { outbreakPath } from "@/lib/outbreak-paths";
import { absoluteUrl } from "@/lib/site";

const dataDate = (slug: string) => {
  const o = listOutbreaks().find((x) => x.slug === slug)!;
  return latestDate(mergeTimeline(o.casesTimeline, getTollData(slug).snapshots));
};

describe("sitemap", () => {
  const entries = sitemap();
  const byUrl = new Map(entries.map((e) => [e.url, e]));

  it("lists the home page and /data with their priorities", () => {
    expect(byUrl.get(absoluteUrl("/"))).toMatchObject({ priority: 1, changeFrequency: "daily" });
    expect(byUrl.get(absoluteUrl("/data"))).toMatchObject({ priority: 0.7, changeFrequency: "weekly" });
  });

  it("has exactly one entry per registered outbreak, prioritised by status", () => {
    const outbreakEntries = entries.filter((e) => e.url.includes("/outbreaks/"));
    expect(outbreakEntries).toHaveLength(listOutbreaks().length);
    for (const o of listOutbreaks()) {
      const e = byUrl.get(absoluteUrl(outbreakPath(o.slug)));
      expect(e, o.slug).toBeDefined();
      expect(e!.priority).toBe(SITEMAP_PRIORITY[o.status]);
      expect(e!.changeFrequency).toBe(sitemapChangeFrequency(o.status));
    }
  });

  it("dates each outbreak by when its data last moved, never by build time", () => {
    for (const o of listOutbreaks()) {
      const expected = dataDate(o.slug);
      const e = byUrl.get(absoluteUrl(outbreakPath(o.slug)))!;
      expect(e.lastModified).toEqual(expected ? new Date(expected) : undefined);
    }
  });

  it("dates / and /data by the newest outbreak", () => {
    const expected = newestDate(listOutbreaks().map((o) => dataDate(o.slug)));
    for (const path of ["/", "/data"]) {
      const e = byUrl.get(absoluteUrl(path))!;
      expect(e.lastModified).toEqual(expected ? new Date(expected) : undefined);
    }
  });
});

describe("sitemap helpers", () => {
  it("ranks live outbreaks above dormant ones", () => {
    expect(SITEMAP_PRIORITY).toEqual({ active: 0.9, waning: 0.7, over: 0.5, watch: 0.3 });
    expect(sitemapChangeFrequency("active")).toBe("daily");
    expect(sitemapChangeFrequency("waning")).toBe("daily");
    expect(sitemapChangeFrequency("over")).toBe("monthly");
    expect(sitemapChangeFrequency("watch")).toBe("monthly");
  });

  it("picks the newest valid date", () => {
    expect(newestDate([])).toBeUndefined();
    expect(newestDate([undefined, "garbage"])).toBeUndefined();
    expect(newestDate(["2026-09-01", undefined, "2026-10-02", "2026-09-30"])).toBe("2026-10-02");
  });
});
