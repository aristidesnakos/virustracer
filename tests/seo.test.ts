import { describe, expect, it } from "vitest";
import { describeFigures, latestFigures } from "@/lib/seo";
import { PRODUCTION_SITE_URL } from "@/lib/site";
import { SITE_URL as SCRIPT_SITE_URL } from "../scripts/lib/site.mjs";
import { isArchivedRecord, listOutbreaks, type CaseDataPoint } from "@/data/outbreaks";
import { getTollData } from "@/lib/toll";
import { mergeTimeline } from "@/lib/timeline";

const pt = (date: string, extra: Partial<CaseDataPoint>): CaseDataPoint => ({
  date,
  label: date,
  source: "test",
  ...extra,
});

describe("latestFigures", () => {
  it("returns null for an empty timeline", () => {
    expect(latestFigures([])).toBeNull();
  });

  it("reads each series from its newest point that has it", () => {
    const f = latestFigures([
      pt("2026-09-01", { confirmed: 10, deaths: 2 }),
      pt("2026-09-03", { confirmed: 30 }),
      pt("2026-09-02", { deaths: 5 }),
    ]);
    expect(f).toEqual({ date: "2026-09-03", confirmed: 30, deaths: 5 });
  });
});

const label = { shortName: "2026 Ebola outbreak", places: "DR Congo, Uganda" };

describe("describeFigures", () => {
  it("puts the numbers in the description", () => {
    const d = describeFigures({ date: "2026-09-29", confirmed: 1234, deaths: 567 }, "fallback", label);
    expect(d).toContain("2026 Ebola outbreak: ");
    expect(d).toContain("(DR Congo, Uganda)");
    expect(d).toContain("567 deaths");
    expect(d).toContain("1,234 confirmed cases");
    expect(d).toContain("29 September 2026");
    expect(d.length).toBeLessThanOrEqual(175);
  });

  it("falls back when there is no data", () => {
    expect(describeFigures(null, "fallback", label)).toBe("fallback");
  });

  it("names whichever outbreak it is given", () => {
    const d = describeFigures(
      { date: "2026-09-29", confirmed: 10, deaths: null },
      "fallback",
      { shortName: "2027 Cholera outbreak", places: "Yemen" },
    );
    expect(d).toContain("2027 Cholera outbreak: ");
    expect(d).toContain("(Yemen)");
    expect(d).not.toMatch(/ebola/i);
  });

  it("leads with the search phrase and drops the place when the phrase already names it", () => {
    const d = describeFigures({ date: "2026-11-05", confirmed: 462, deaths: 53 }, "fallback", {
      shortName: "2026 West Nile virus season in Greece",
      searchLabel: "West Nile virus in Greece",
      places: "Greece",
    });
    expect(d.startsWith("West Nile virus in Greece: 53 deaths and 462 confirmed cases as of 5 November 2026. ")).toBe(true);
  });

  it("says deaths are not reported when the source collects none", () => {
    const d = describeFigures({ date: "2026-10-31", confirmed: 6572, deaths: null }, "fallback", {
      shortName: "2026 US Candida auris cases",
      places: "United States",
      summary: { casesLabel: "Clinical cases", deathsNotReported: "NNDSS does not collect deaths" },
    });
    expect(d).toContain("6,572 clinical cases as of 31 October 2026 (United States; deaths not reported).");
  });
});

describe("registered outbreaks' search metadata", () => {
  it("keeps titles short and honest, and descriptions near 160 characters", () => {
    for (const o of listOutbreaks()) {
      expect(o.seoTitle.length, o.slug).toBeLessThanOrEqual(60);
      // Figures are daily or weekly and carry an as-of date, so never "live" or "today".
      expect(o.seoTitle, o.slug).not.toMatch(/\b(live|today)\b/i);
      const figures = latestFigures(mergeTimeline(o.casesTimeline, getTollData(o.slug).snapshots));
      const d = describeFigures(figures, o.description, o, {
        archived: isArchivedRecord(o),
        weekly: o.metrics.reportingCadence === "weekly",
      });
      expect(d.length, o.slug).toBeLessThanOrEqual(170);
    }
  });
});

describe("site URL", () => {
  it("is the same permanent domain for the app and the archiver scripts", () => {
    expect(PRODUCTION_SITE_URL).toBe("https://outbreakfiles.com");
    expect(SCRIPT_SITE_URL).toBe(PRODUCTION_SITE_URL);
  });
});
