import { describe, it, expect } from "vitest";
import {
  listOutbreaks,
  getOutbreak,
  getDefaultOutbreak,
  DEFAULT_OUTBREAK_SLUG,
  isArchivedRecord,
} from "@/data/outbreaks";
import { outbreakDataPath } from "@/lib/outbreak-data";
import {
  OUTBREAKS,
  AUTOMATED_STATUSES,
  selectArchivableOutbreaks,
  selectOutbreaks,
  selectOutbreaksWith,
  dataFile,
} from "../scripts/lib/outbreak-registry.mjs";

const HANTA = "hantavirus-mv-hondius-2026";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe("outbreak registry", () => {
  it("has unique, folder-safe slugs", () => {
    const slugs = listOutbreaks().map((o) => o.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(SLUG);
  });

  it("finds outbreaks by slug and exposes a default", () => {
    expect(getOutbreak("no-such-outbreak")).toBeUndefined();
    expect(getDefaultOutbreak().slug).toBe(DEFAULT_OUTBREAK_SLUG);
    expect(getOutbreak(DEFAULT_OUTBREAK_SLUG)).toBe(getDefaultOutbreak());
  });

  it("gives every outbreak the fields the pages need", () => {
    for (const o of listOutbreaks()) {
      for (const key of ["title", "seoTitle", "subtitle", "description", "shortName", "places"] as const) {
        expect(o[key], `${o.slug}.${key}`).toBeTruthy();
      }
      expect(o.keywords.length).toBeGreaterThan(0);
      expect(o.countries.length).toBeGreaterThan(0);
      expect(o.casesTimeline.length).toBeGreaterThan(0);
    }
  });
});

describe("the archived hantavirus record", () => {
  const o = getOutbreak(HANTA)!;

  it("is registered as a finished, hand-curated outbreak", () => {
    expect(o).toBeDefined();
    expect(o.status).toBe("over");
    expect(o.source.kind).toBe("manual");
    expect(o.disease).toBe("Hantavirus");
    expect(isArchivedRecord(o)).toBe(true);
  });

  it("leaves the default outbreak live", () => {
    expect(DEFAULT_OUTBREAK_SLUG).toBe("ebola-bundibugyo-2026");
    expect(isArchivedRecord(getDefaultOutbreak())).toBe(false);
  });

  it("cites a source on every row and keeps cumulative counts from falling", () => {
    for (const row of [...o.casesTimeline, ...o.monitoringData]) expect(row.source).toBeTruthy();
    const dates = o.casesTimeline.map((p) => p.date);
    expect([...dates].sort()).toEqual(dates);
    for (const k of ["confirmed", "deaths"] as const) {
      const series = o.casesTimeline.map((p) => p[k] ?? 0);
      for (let i = 1; i < series.length; i++) expect(series[i]).toBeGreaterThanOrEqual(series[i - 1]);
    }
    expect(o.seoTitle.length).toBeLessThanOrEqual(65);
  });

  it("ends on WHO's final figures: 12 confirmed + 1 probable, 3 deaths, declared over 2 July 2026", () => {
    const last = o.casesTimeline.at(-1)!;
    expect(last).toMatchObject({ date: "2026-07-02", confirmed: 12, suspected: 1, deaths: 3 });
    expect(last.source).toMatch(/DON611/);
    expect(o.casesTimeline.some((p) => p.date === "2026-05-12")).toBe(false);
  });

  it("has a country table whose sums equal the final timeline row", () => {
    const last = o.casesTimeline.at(-1)!;
    const rows = o.monitoringData.filter((r) => !r.parentIso);
    expect(rows.reduce((n, r) => n + r.confirmed, 0)).toBe(last.confirmed);
    expect(rows.reduce((n, r) => n + r.deaths, 0)).toBe(last.deaths);
    expect(rows.filter((r) => r.confirmed > 0)).toHaveLength(o.summary.countriesAffected);
    // Map case markers agree with the table.
    for (const r of rows.filter((x) => x.confirmed > 0)) {
      const marker = o.caseLocations.find((l) => l.country === r.country);
      expect(marker, r.country).toMatchObject({ confirmed: r.confirmed, deaths: r.deaths, type: "case" });
    }
  });

  it("carries its correction notice and the researched source links as data", () => {
    expect(o.corrections).toEqual([
      {
        date: "2026-10-03",
        note: "figures shown in May counted a US case later ruled out and missed cases in France, Switzerland and Spain.",
      },
    ]);
    expect(o.summary.lastReviewed).toBe("2026-10-03");
    const hrefs = o.links.map((l) => l.href);
    expect(hrefs).toContain("https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON611");
    expect(hrefs).toContain("https://en.wikipedia.org/wiki/MV_Hondius_hantavirus_outbreak");
    expect(hrefs).not.toContain("https://www.who.int/emergencies/disease-outbreak-news");
  });
});

describe("script registry stays in step with the site registry", () => {
  it("lists every site outbreak, with a toll source exactly for the Wikipedia-backed ones", () => {
    expect(OUTBREAKS.map((o) => o.slug).sort()).toEqual(listOutbreaks().map((o) => o.slug).sort());
    for (const s of OUTBREAKS) {
      const o = getOutbreak(s.slug)!;
      expect(Boolean(s.toll), s.slug).toBe(o.source.kind === "wikipedia-infobox");
    }
  });

  it("agrees on status, disease and Wikipedia page", () => {
    for (const s of OUTBREAKS) {
      const o = getOutbreak(s.slug);
      expect(o, s.slug).toBeDefined();
      expect(s.status).toBe(o!.status);
      expect(s.disease).toBe(o!.disease);
      if (s.toll) expect(s.toll.page).toBe(o!.source.ref);
    }
  });

  it("selects automated outbreaks by default and one by flag", () => {
    expect(selectOutbreaks([]).every((o: { status: string }) => AUTOMATED_STATUSES.includes(o.status))).toBe(true);
    expect(selectOutbreaks([]).map((o: { slug: string }) => o.slug)).not.toContain(HANTA);
    expect(selectOutbreaks([`--outbreak=${DEFAULT_OUTBREAK_SLUG}`]).map((o: { slug: string }) => o.slug)).toEqual([
      DEFAULT_OUTBREAK_SLUG,
    ]);
    expect(() => selectOutbreaks(["--outbreak=nope"])).toThrow(/Unknown outbreak/);
    // Link archiving covers finished records too, unless one outbreak is named.
    expect(selectArchivableOutbreaks([]).map((o: { slug: string }) => o.slug)).toContain(HANTA);
    expect(selectArchivableOutbreaks([`--outbreak=${HANTA}`]).map((o: { slug: string }) => o.slug)).toEqual([HANTA]);
  });

  it("skips a named outbreak that has no toll or feed instead of failing", () => {
    for (const key of ["toll", "feed"] as const) {
      const logs: string[] = [];
      expect(selectOutbreaksWith(key, [`--outbreak=${HANTA}`], (m: string) => logs.push(m))).toEqual([]);
      expect(logs.join("\n")).toMatch(new RegExp(`Skipping ${HANTA}: it has no ${key} source`));
      const def = selectOutbreaksWith(key, [], () => {});
      expect(def.map((o: { slug: string }) => o.slug)).toEqual([DEFAULT_OUTBREAK_SLUG]);
    }
  });
});

describe("data paths", () => {
  it("point at data/outbreaks/<slug>/<file>.json in both worlds", () => {
    const fromSite = outbreakDataPath(DEFAULT_OUTBREAK_SLUG, "toll");
    expect(fromSite.endsWith(`data/outbreaks/${DEFAULT_OUTBREAK_SLUG}/toll.json`)).toBe(true);
    expect(dataFile("/repo", DEFAULT_OUTBREAK_SLUG, "toll")).toBe(
      `/repo/data/outbreaks/${DEFAULT_OUTBREAK_SLUG}/toll.json`,
    );
  });

  it("rejects slugs that could leave the data folder", () => {
    for (const bad of ["../etc", "a/b", "A", "", "-x", "x-", "a..b", "a b"]) {
      expect(() => outbreakDataPath(bad, "toll"), bad).toThrow(/Invalid outbreak slug/);
      expect(() => dataFile("/repo", bad, "toll"), bad).toThrow(/Invalid outbreak slug/);
    }
  });
});
