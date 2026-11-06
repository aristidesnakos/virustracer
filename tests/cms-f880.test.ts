/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures are edited as loose JSON to build each bad case */
import { describe, it, expect } from "vitest";
import {
  CITATION_FIELDS,
  CMS_FIELDS,
  buildStateFiles,
  careCompareUrl,
  citationsToCsv,
  cmsQueryUrl,
  csvToCitations,
  isCmsUrl,
  isHarmLevel,
  parseCmsMetastore,
  validateCitationRows,
} from "../scripts/lib/cms-f880.mjs";

function citation(over: Record<string, string> = {}) {
  return {
    cms_certification_number_ccn: "015009",
    provider_name: "BURNS NURSING HOME, INC.",
    provider_address: "701 MONROE STREET NW",
    citytown: "RUSSELLVILLE",
    state: "AL",
    zip_code: "35653",
    survey_date: "2023-03-02",
    survey_footnote: "",
    survey_type: "Health",
    deficiency_prefix: "F",
    deficiency_category: "Infection Control Deficiencies",
    deficiency_tag_number: "0880",
    deficiency_description: "Provide and implement an infection prevention and control program.",
    scope_severity_code: "F",
    deficiency_corrected: "Deficient, Provider has date of correction",
    correction_date: "2023-04-06",
    inspection_cycle: "1",
    standard_deficiency: "Y",
    complaint_deficiency: "N",
    infection_control_inspection_deficiency: "N",
    citation_under_idr: "N",
    citation_under_iidr: "N",
    location: "701 MONROE STREET NW,RUSSELLVILLE,AL,35653",
    processing_date: "2026-10-01",
    ...over,
  };
}

const opts = (n: number) => ({ modified: "2026-10-01", reportedCount: n });

describe("validateCitationRows", () => {
  it("accepts a clean release", () => {
    const rows = [citation(), citation({ survey_date: "2019-08-21", scope_severity_code: "D", inspection_cycle: "2" })];
    expect(validateCitationRows(rows, opts(2))).toEqual({ ok: true, notes: [] });
  });

  it("rejects a count that does not match, another tag, another release and duplicates", () => {
    expect((validateCitationRows([citation()], opts(2)) as any).reason).toMatch(/reported 2/);
    expect((validateCitationRows([citation({ deficiency_tag_number: "0689" })], opts(1)) as any).reason).toMatch(/not 0880/);
    expect((validateCitationRows([citation({ processing_date: "2026-09-01" })], opts(1)) as any).reason).toMatch(/release is 2026-10-01/);
    expect((validateCitationRows([citation(), citation()], opts(2)) as any).reason).toMatch(/twice/);
  });

  it("rejects unknown vocabulary and bad dates", () => {
    expect((validateCitationRows([citation({ scope_severity_code: "M" })], opts(1)) as any).reason).toMatch(/scope\/severity/);
    expect((validateCitationRows([citation({ deficiency_corrected: "Waived" })], opts(1)) as any).reason).toMatch(/unknown correction status/);
    expect((validateCitationRows([citation({ survey_date: "2026-10-02" })], opts(1)) as any).reason).toMatch(/survey date/);
    expect((validateCitationRows([citation({ correction_date: "soon" })], opts(1)) as any).reason).toMatch(/correction date/);
    expect((validateCitationRows([citation({ citation_under_idr: "" })], opts(1)) as any).reason).toMatch(/citation_under_idr/);
    const { state: _s, ...noState } = citation();
    void _s;
    expect((validateCitationRows([noState], opts(1)) as any).reason).toMatch(/lacks state/);
  });

  it("notes a CCN listed under two names without failing", () => {
    const r = validateCitationRows([citation(), citation({ survey_date: "2024-01-01", provider_name: "NEW NAME" })], opts(2));
    expect(r.ok && r.notes[0]).toMatch(/more than one name/);
  });
});

describe("buildStateFiles", () => {
  it("groups by state, newest survey first, with the newest name for each home", () => {
    const rows = [
      citation(),
      citation({ survey_date: "2025-05-01", provider_name: "BURNS NH", complaint_deficiency: "Y", standard_deficiency: "N", correction_date: "", deficiency_corrected: "Deficient, Provider has no plan of correction", citation_under_idr: "Y" }),
      citation({ state: "AK", cms_certification_number_ccn: "025001", citytown: "JUNEAU" }),
    ];
    const files = buildStateFiles(rows, { release: "2026-10-01", released: "2026-10-28" });
    expect(Object.keys(files)).toEqual(["AK", "AL"]);
    expect(files.AL.fields).toEqual(CITATION_FIELDS);
    expect(files.AL.facilities["015009"][0]).toBe("BURNS NH");
    expect(files.AL.citations[0]).toEqual(["015009", "2025-05-01", "F", 1, true, false, false, "no-plan", null, true, false]);
    expect(files.AL.citations[1][1]).toBe("2023-03-02");
    expect(files.AK).toMatchObject({ release: "2026-10-01", released: "2026-10-28" });
  });
});

describe("helpers", () => {
  it("round-trips every field through the archived CSV, commas and quotes included", () => {
    const rows = [citation({ provider_name: 'A, "B" HOME' }), citation({ state: "AK", cms_certification_number_ccn: "02A001" })];
    const back = csvToCitations(citationsToCsv(rows));
    expect(back).toHaveLength(2);
    expect(back.find((r: any) => r.state === "AL")).toEqual(rows[0]);
    expect(Object.keys(back[0])).toEqual(CMS_FIELDS);
  });

  it("reads the metastore entry", () => {
    expect(parseCmsMetastore({ identifier: "r5ix-sfxw", modified: "2026-10-01", released: "2026-10-28", nextUpdateDate: "2026-12-02" })).toMatchObject({
      ok: true, modified: "2026-10-01", released: "2026-10-28", nextUpdateDate: "2026-12-02",
    });
    expect(parseCmsMetastore({ identifier: "r5ix-sfxw", modified: "Oct 2026", released: "2026-10-28" }).ok).toBe(false);
  });

  it("builds query, host and Care Compare URLs", () => {
    const u = new URL(cmsQueryUrl(3000));
    expect(u.hostname).toBe("data.cms.gov");
    expect(u.searchParams.get("conditions[0][value]")).toBe("0880");
    expect(u.searchParams.get("offset")).toBe("3000");
    expect(u.searchParams.get("limit")).toBe("1500");
    expect(isCmsUrl("https://data.cms.gov/x")).toBe(true);
    expect(isCmsUrl("https://data.cms.gov.example.com/x")).toBe(false);
    expect(careCompareUrl("01A193", "AL")).toBe("https://www.medicare.gov/care-compare/details/nursing-home/01A193?state=AL");
  });

  it("calls G and above actual harm", () => {
    expect(["D", "F"].map(isHarmLevel)).toEqual([false, false]);
    expect(["G", "J", "L"].map(isHarmLevel)).toEqual([true, true, true]);
  });
});
