/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures are edited as loose JSON to build each bad case */
import { describe, it, expect } from "vitest";
import {
  ALL_PATHOGENS_FROM,
  COUNT_FIELDS,
  csvToNhsnRows,
  csvToRateRows,
  isNhsnUrl,
  isoFromUsDate,
  nhsnRowsToCsv,
  parseDashboard,
  parseNhsnMetadata,
  parseNhsnRows,
  per100k,
  rateRowsToCsv,
} from "../scripts/lib/nhsn.mjs";

const STATES = ["AK", "AL"];
const REGIONS = Array.from({ length: 10 }, (_, i) => `Region ${i + 1}`);

/** One week of rows that adds up: AK + AL = USA, Region 1 holds everything, the other regions zero. */
function week(date: string, { flu = true, ak = 10, al = 30 } = {}) {
  const row = (j: string, cases: number, res: number, fac: number) => {
    const r: Record<string, string> = {
      jurisdiction: j,
      survweekend: `${date}T00:00:00.000`,
      faccount: String(fac),
      numres: String(res),
      totresuptodate: String(Math.floor(res / 2)),
      pct_totresuptodate: res ? (Math.round((Math.floor(res / 2) / res) * 1000) / 10).toFixed(1) : "0",
      numresc19postest: String(cases),
      numresc19posutd: "0",
      numresc19hosppos: String(Math.floor(cases / 10)),
      numresc19hosputd: "0",
    };
    if (flu) {
      Object.assign(r, {
        numresfluvacc: "0", pct_numresfluvacc: "0.0", numresflupostest: String(cases), numresfluposvacc: "0",
        numresfluhosppos: "0", numresfluhospvacc: "0", numresrsvvacc: "0", pct_numresrsvvacc: "0.0",
        numresrsvpostest: "1", numresrsvposvacc: "0", numresrsvhosppos: "0", numresrsvhospvacc: "0",
      });
      if (j.startsWith("Region") && j !== "Region 1") r.numresrsvpostest = "0";
      if (j === "USA" || j === "Region 1") r.numresrsvpostest = "2";
    }
    return r;
  };
  return [
    row("USA", ak + al, 3000, 30),
    row("AK", ak, 1000, 10),
    row("AL", al, 2000, 20),
    ...REGIONS.map((g) => (g === "Region 1" ? row(g, ak + al, 3000, 30) : row(g, 0, 0, 0))),
  ];
}

describe("parseNhsnRows", () => {
  const good = [...week("2025-01-05", { flu: false }), ...week("2025-01-12")];

  it("reads rows that add up into one row per jurisdiction and week, regions dropped", () => {
    const p = parseNhsnRows(good, { nowISO: "2026-11-06T00:00:00Z" });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.weeks).toEqual(["2025-01-05", "2025-01-12"]);
    expect(p.rows).toHaveLength(6);
    expect(p.rows[0].slice(0, 4)).toEqual(["2025-01-05", "USA", 30, 3000]);
    const fluIdx = COUNT_FIELDS.indexOf("fluCases");
    expect(p.rows[0][fluIdx]).toBeNull(); // missing before the break, never zero
    expect(p.rows[3][fluIdx]).toBe(40);
  });

  it("rejects states that do not add up to the national row", () => {
    const bad = week("2025-01-12").map((r) => (r.jurisdiction === "AK" ? { ...r, numresc19postest: "11" } : r));
    const p = parseNhsnRows(bad);
    expect(p).toMatchObject({ ok: false });
    expect((p as any).reason).toMatch(/states add up to 41 numresc19postest/);
  });

  it("rejects HHS regions that do not add up", () => {
    const bad = week("2025-01-12").map((r) => (r.jurisdiction === "Region 2" ? { ...r, faccount: "1" } : r));
    expect((parseNhsnRows(bad) as any).reason).toMatch(/HHS regions add up/);
  });

  it("rejects a part larger than its whole and a wrong percentage", () => {
    const part = week("2025-01-12").map((r) => (r.jurisdiction === "AK" ? { ...r, numresc19posutd: "99" } : r));
    expect((parseNhsnRows(part) as any).reason).toMatch(/exceeds/);
    const pct = week("2025-01-12").map((r) => (r.jurisdiction === "AK" ? { ...r, pct_totresuptodate: "70.0" } : r));
    expect((parseNhsnRows(pct) as any).reason).toMatch(/pct_totresuptodate/);
  });

  it("rejects missing influenza after the break, non-Sundays, future weeks and duplicates", () => {
    expect((parseNhsnRows(week("2025-01-19", { flu: false })) as any).reason).toMatch(/no influenza/);
    expect((parseNhsnRows(week("2025-01-13")) as any).reason).toMatch(/Sunday/);
    expect((parseNhsnRows(week("2026-12-27"), { nowISO: "2026-11-06T00:00:00Z" }) as any).reason).toMatch(/future/);
    expect((parseNhsnRows([...week("2025-01-12"), week("2025-01-12")[1]]) as any).reason).toMatch(/twice/);
    expect((parseNhsnRows(week("2025-01-12").filter((r) => r.jurisdiction !== "USA")) as any).reason).toMatch(/no national/);
  });

  it("treats a blank cell as missing, and a non-count as an error", () => {
    const bad = week("2025-01-12").map((r) => (r.jurisdiction === "AL" ? { ...r, numres: "n/a" } : r));
    expect((parseNhsnRows(bad) as any).reason).toMatch(/not a count/);
  });

  it("round-trips through the archived CSV", () => {
    const csv = nhsnRowsToCsv(good);
    const back = parseNhsnRows(csvToNhsnRows(csv));
    expect(back).toEqual(parseNhsnRows(good));
  });

  it("marks the first week with all three pathogens", () => {
    expect(ALL_PATHOGENS_FROM).toBe("2025-01-12");
    expect(STATES).toHaveLength(2);
  });
});

describe("parseNhsnMetadata", () => {
  const columns = [
    "jurisdiction", "survweekend", "faccount", "numres", "totresuptodate", "numresc19postest", "numresc19posutd",
    "numresc19hosppos", "numresc19hosputd", "numresfluvacc", "numresflupostest", "numresfluposvacc", "numresfluhosppos",
    "numresfluhospvacc", "numresrsvvacc", "numresrsvpostest", "numresrsvposvacc", "numresrsvhosppos", "numresrsvhospvacc",
  ].map((fieldName) => ({ fieldName }));
  it("reads rowsUpdatedAt and checks the layout", () => {
    expect(parseNhsnMetadata({ id: "tscn-ryh9", rowsUpdatedAt: 1787577627, columns })).toMatchObject({
      ok: true,
      rowsUpdatedAt: "2026-08-24T13:20:27.000Z",
    });
    expect(parseNhsnMetadata({ id: "other", rowsUpdatedAt: 1, columns }).ok).toBe(false);
    expect((parseNhsnMetadata({ id: "tscn-ryh9", rowsUpdatedAt: 1, columns: columns.slice(1) }) as any).reason).toMatch(/jurisdiction/);
  });
});

describe("parseDashboard", () => {
  const row = (week: string, state: string, vc: string, cr: string, vh: string, hr: string, trigger = "") => ({
    week_end: week, state, "Virus (Case)": vc, "Case Rate": cr, "Virus (Hosp)": vh, "Hosp Rate": hr, Trigger: trigger,
  });
  const file = (data: any[]) => ({ title: " Case Rates per 100,000 Residents", data });
  const cross = (week: string, state: string, rates: Record<string, [string, string]>) =>
    Object.entries(rates).flatMap(([vc, [cr]]) => Object.entries(rates).map(([vh, [, hr]]) => row(week, state, vc, cr, vh, hr)));

  it("folds the cross product into one row per week and jurisdiction", () => {
    const p = parseDashboard(
      file([
        ...cross("11/1/2026", "USA", { "COVID-19": ["43.6", "13.3"], Influenza: ["5", "1"], RSV: ["2.6", "0.5"] }),
        ...cross("11/1/2026", "AK", { "COVID-19": ["0", "0"], Influenza: ["", ""], RSV: ["1", "0"] }),
      ]),
      { nowISO: "2026-11-06T00:00:00Z" },
    );
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.rows).toEqual([
      ["2026-11-01", "USA", 43.6, 13.3, 5, 1, 2.6, 0.5, false],
      ["2026-11-01", "AK", 0, 0, null, null, 1, 0, false],
    ]);
    expect(csvToRateRows(rateRowsToCsv(p.rows))).toEqual(p.rows);
  });

  it("rejects copies of a rate that disagree, a missing national row, a changed unit and bad dates", () => {
    const disagree = [row("11/1/2026", "USA", "COVID-19", "1", "COVID-19", "1"), row("11/1/2026", "USA", "COVID-19", "2", "RSV", "1")];
    expect((parseDashboard(file(disagree)) as any).reason).toMatch(/two different values/);
    expect((parseDashboard(file([row("11/1/2026", "AK", "RSV", "1", "RSV", "1")])) as any).reason).toMatch(/no national/);
    expect((parseDashboard({ title: "Case counts", data: disagree }) as any).reason).toMatch(/per 100,000/);
    expect((parseDashboard(file([row("11/2/2026", "USA", "RSV", "1", "RSV", "1")])) as any).reason).toMatch(/Sunday/);
    expect((parseDashboard(file([row("11/1/2026", "USA", "RSV", "-1", "RSV", "1")])) as any).reason).toMatch(/unreadable rate/);
    expect((parseDashboard(file([row("11/1/2026", "USA", "Mpox", "1", "RSV", "1")])) as any).reason).toMatch(/virus/);
  });

  it("keeps CDC's marker for flagged weeks", () => {
    const p = parseDashboard(file([row("10/5/2025", "USA", "COVID-19", "1", "COVID-19", "1", "Dotted")]));
    expect(p.ok && p.rows[0].at(-1)).toBe(true);
  });
});

describe("small helpers", () => {
  it("accepts only https CDC hosts", () => {
    expect(isNhsnUrl("https://data.cdc.gov/resource/tscn-ryh9.json")).toBe(true);
    expect(isNhsnUrl("https://www.cdc.gov/nhsn/modules/x.json")).toBe(true);
    expect(isNhsnUrl("http://data.cdc.gov/x")).toBe(false);
    expect(isNhsnUrl("https://data.cdc.gov.evil.example/x")).toBe(false);
    expect(isNhsnUrl("https://data.cdc.gov:8443/x")).toBe(false);
  });
  it("reads US dates and computes rates per 100,000", () => {
    expect(isoFromUsDate("11/1/2026")).toBe("2026-11-01");
    expect(isoFromUsDate("2/30/2026")).toBeNull();
    expect(per100k(743, 604866)).toBe(122.8);
    expect(per100k(null, 100)).toBeNull();
    expect(per100k(1, 0)).toBeNull();
  });
});
