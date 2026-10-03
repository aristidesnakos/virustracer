import { describe, it, expect } from "vitest";
import { listOutbreaks, getOutbreak, getDefaultOutbreak, DEFAULT_OUTBREAK_SLUG } from "@/data/outbreaks";
import { outbreakDataPath } from "@/lib/outbreak-data";
import { OUTBREAKS, AUTOMATED_STATUSES, selectOutbreaks, dataFile } from "../scripts/lib/outbreak-registry.mjs";

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

describe("script registry stays in step with the site registry", () => {
  it("lists exactly the automated outbreaks of the site registry", () => {
    const automated = listOutbreaks()
      .filter((o) => o.source.kind === "wikipedia-infobox")
      .map((o) => o.slug)
      .sort();
    expect(OUTBREAKS.map((o) => o.slug).sort()).toEqual(automated);
  });

  it("agrees on status, disease and Wikipedia page", () => {
    for (const s of OUTBREAKS) {
      const o = getOutbreak(s.slug);
      expect(o, s.slug).toBeDefined();
      expect(s.status).toBe(o!.status);
      expect(s.disease).toBe(o!.disease);
      expect(s.toll.page).toBe(o!.source.ref);
    }
  });

  it("selects automated outbreaks by default and one by flag", () => {
    expect(selectOutbreaks([]).every((o: { status: string }) => AUTOMATED_STATUSES.includes(o.status))).toBe(true);
    expect(selectOutbreaks([`--outbreak=${DEFAULT_OUTBREAK_SLUG}`]).map((o: { slug: string }) => o.slug)).toEqual([
      DEFAULT_OUTBREAK_SLUG,
    ]);
    expect(() => selectOutbreaks(["--outbreak=nope"])).toThrow(/Unknown outbreak/);
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
