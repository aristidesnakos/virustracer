import { describe, it, expect } from "vitest";
import {
  careCompareUrl,
  latestFullWeek,
  nationalSummary,
  per100k,
  severityWords,
  summarizeState,
  thinlyReportedWeeks,
  twelveMonthsBefore,
  type CountRow,
  type StateCitationsFile,
} from "@/lib/nursing-homes";
import { citationsResponse, nursingHomesIndexResponse, respiratoryResponse } from "@/lib/nursing-homes-api";
import { per100k as scriptPer100k, careCompareUrlScript } from "./helpers/nursing-homes-script";
import { getF880Index, getF880State, listF880States } from "@/lib/nursing-homes-data";

const req = (path: string) => new Request(`https://example.org${path}`);

function natWeek(week: string, facilities: number): CountRow {
  return {
    week, jurisdiction: "USA", facilities, residents: facilities * 80, covidCases: 1, covidHosp: 0, fluCases: 0, fluHosp: 0,
    rsvCases: 0, rsvHosp: 0, covidUpToDate: 0, fluVaccinated: 0, rsvVaccinated: 0,
  };
}

describe("respiratory helpers", () => {
  it("flags weeks with far fewer reporting homes than usual", () => {
    const weeks = ["2026-01-04", "2026-01-11", "2026-01-18", "2026-01-25", "2026-02-01", "2026-02-08", "2026-02-15"];
    const rows = weeks.map((w, i) => natWeek(w, i < 5 ? 12000 : i === 5 ? 10000 : 6000));
    expect([...thinlyReportedWeeks(rows)]).toEqual(["2026-02-08", "2026-02-15"]);
    expect(latestFullWeek(rows)).toBe("2026-02-01");
  });

  it("computes rates the same way as the reader script", () => {
    expect(per100k(743, 604866)).toBe(122.8);
    expect(per100k(743, 604866)).toBe(scriptPer100k(743, 604866));
    expect(per100k(null, 10)).toBeNull();
  });
});

describe("citation helpers", () => {
  const file: StateCitationsFile = {
    state: "VT", release: "2026-10-01", released: "2026-10-28", fields: [],
    facilities: { "475001": ["A HOME", "1 MAIN ST", "BURLINGTON", "05401"], "475002": ["B HOME", "2 MAIN ST", "BARRE", "05641"] },
    citations: [
      ["475001", "2026-09-01", "J", 1, true, false, false, "plan", null, false, false],
      ["475001", "2025-10-02", "D", 1, false, true, false, "corrected", "2025-11-01", false, false],
      ["475002", "2025-10-01", "E", 2, false, true, false, "corrected", "2025-11-01", true, false],
    ],
  };

  it("counts the last 12 months up to the release date", () => {
    expect(twelveMonthsBefore("2026-10-01")).toBe("2025-10-02");
    const s = summarizeState(file);
    expect(s).toMatchObject({ citations12m: 2, facilities12m: 1, harm12m: 1, harmShare12m: 0.5, complaint12m: 1, citationsAll: 3, facilitiesAll: 2 });
    expect(s.grid).toMatchObject({ J: 1, D: 1, E: 1, A: 0 });
    expect(nationalSummary([s, { ...s, state: "NH" }])).toMatchObject({ state: "USA", citations12m: 4, harmShare12m: 0.5 });
  });

  it("explains severity letters and links Care Compare", () => {
    expect(severityWords("E")).toBe("pattern; no actual harm, potential for more than minimal harm");
    expect(severityWords("J")).toMatch(/^isolated; immediate jeopardy/);
    expect(careCompareUrl("475001", "VT")).toBe(careCompareUrlScript("475001", "VT"));
  });
});

describe("nursing-home API", () => {
  it("lists the datasets", async () => {
    const body = await nursingHomesIndexResponse().json();
    expect(body.datasets.map((d: { id: string }) => d.id)).toEqual(["respiratory", "infection-control-citations"]);
  });

  it("validates parameters with JSON errors", async () => {
    for (const p of ["?series=daily", "?state=XX", "?from=2026-13-01", "?format=xml", "?from=2026-02-01&to=2026-01-01"]) {
      const res = respiratoryResponse(req(`/api/v1/nursing-homes/respiratory${p}`));
      expect(res.status).toBe(400);
      expect(await res.json()).toHaveProperty("error");
    }
    for (const p of ["?ccn=12", "?min_severity=Z", "?state=USA"]) {
      expect(citationsResponse(req(`/api/v1/nursing-homes/infection-control-citations${p}`)).status).toBe(400);
    }
  });

  it("serves counts with computed rates and a state filter, as JSON and CSV", async () => {
    const res = respiratoryResponse(req("/api/v1/nursing-homes/respiratory?state=vt&from=2026-01-01"));
    if (res.status === 503) return; // not fetched in this checkout
    const body = await res.json();
    expect(body.meta.series).toBe("counts");
    expect(body.rows.length).toBeGreaterThan(0);
    for (const r of body.rows) {
      expect(r.jurisdiction).toBe("VT");
      expect(r.week >= "2026-01-01").toBe(true);
      expect(r.covidCaseRate).toBe(per100k(r.covidCases, r.residents));
    }
    const csv = await respiratoryResponse(req("/api/v1/nursing-homes/respiratory?series=rates&state=USA&format=csv")).text();
    expect(csv.split("\r\n")[0]).toBe("week,jurisdiction,covidCaseRate,covidHospRate,fluCaseRate,fluHospRate,rsvCaseRate,rsvHospRate,marked");
  });

  it("summarises citations by state, and lists one state's or one home's rows", async () => {
    if (!getF880Index()) return;
    const summary = await citationsResponse(req("/api/v1/nursing-homes/infection-control-citations")).json();
    expect(summary.states).toHaveLength(listF880States().length);
    expect(summary.national.citationsAll).toBe(getF880Index()!.releases.at(-1)!.citations);

    const vt = await citationsResponse(req("/api/v1/nursing-homes/infection-control-citations?state=VT&min_severity=G")).json();
    for (const c of vt.citations) {
      expect(c.state).toBe("VT");
      expect(c.severity >= "G").toBe(true);
      expect(c.release).toBe(vt.meta.release);
      expect(c.careCompareUrl).toMatch(/^https:\/\/www\.medicare\.gov\/care-compare\/details\/nursing-home\//);
    }
    const ccn = Object.keys(getF880State("VT")!.facilities)[0];
    const one = await citationsResponse(req(`/api/v1/nursing-homes/infection-control-citations?ccn=${ccn}`)).json();
    expect(one.citations.length).toBeGreaterThan(0);
    expect(one.citations.every((c: { ccn: string }) => c.ccn === ccn)).toBe(true);
  });
});
