/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures are edited as loose JSON to build each bad case */
import { describe, it, expect } from "vitest";
import {
  ALL_AREAS,
  REGIONS,
  TERRITORIES,
  buildNndssReading,
  groupWeeks,
  isNndssUrl,
  mmwrWeekEnding,
  mmwrWeeksInYear,
  nndssQueryUrl,
  parseNndssReading,
  serializeNndssReading,
  snapshotFromNndssReading,
} from "../scripts/lib/nndss.mjs";
import { sha256, verifyNndssRaw } from "../scripts/lib/raw.mjs";
import { validateSnapshot, WEEKLY_STALE_PREV_DAYS } from "../scripts/lib/toll.mjs";
import { getOutbreak } from "../scripts/lib/outbreak-registry.mjs";

const LABELS = { clinical: "Candida auris, clinical", screening: "Candida auris, screening" };
const TOLL = { source: "CDC NNDSS weekly table (Candida auris, clinical)", labels: LABELS };

/**
 * One label's 70 rows for a week, in the table's shape: a state's count is given, or
 * omitted (shown as "-"); aggregates are summed the way the real table sums them.
 */
function weekRows(label: string, year: number, week: number, counts: Record<string, number>, overrides: Record<string, any> = {}) {
  const val = (n: number) => (n > 0 ? { v: `${n}.0` } : { flag: "-" });
  const row = (states: string, m1: number, m3: number, m4: number, extra: object = {}) => {
    const r: any = { states, year: String(year), week: String(week), label, location1: states, sort_order: String(ALL_AREAS.indexOf(states)).padStart(3, "0"), ...extra };
    for (const [k, n] of [["m1", m1], ["m3", m3], ["m4", m4]] as const) {
      const x = val(n);
      if (x.v) r[k] = x.v;
      else r[`${k}_flag`] = x.flag;
    }
    r.m2 = `${Math.max(m1, 1)}.0`;
    return { ...r, ...(overrides[states] ?? {}) };
  };
  const m3 = (s: string) => counts[s] ?? 0;
  const m1 = (s: string) => Math.min(1, m3(s));
  const sum = (names: readonly string[], f: (s: string) => number) => names.reduce((a, s) => a + f(s), 0);
  const rows: any[] = [];
  const states = Object.values(REGIONS).flat();
  rows.push(row("U.S. Residents", sum(states, m1), sum(states, m3), 0));
  for (const [region, members] of Object.entries(REGIONS)) {
    rows.push(row(region, sum(members, m1), sum(members, m3), 0));
    for (const s of members) rows.push(row(s, m1(s), m3(s), 0, { geocode: { type: "Point", coordinates: [-100, 40] } }));
  }
  rows.push(row("U.S. Territories", 0, 0, 0));
  for (const t of TERRITORIES) rows.push(row(t, 0, 0, 0));
  rows.push(row("Non-U.S. Residents", 0, 0, 0));
  rows.push(row("Total", sum(states, m1), sum(states, m3), 0));
  return rows;
}

const CLINICAL = { California: 50, Nevada: 30, Texas: 20 };
const SCREENING = { Nevada: 40, Michigan: 7 };

function doc(over: { clinical?: Record<string, any>; screening?: Record<string, any>; week?: number } = {}): any {
  const week = over.week ?? 43;
  const rows = [
    ...weekRows(LABELS.clinical, 2026, week, CLINICAL, over.clinical),
    ...weekRows(LABELS.screening, 2026, week, SCREENING, over.screening),
  ];
  return JSON.parse(serializeNndssReading(buildNndssReading({ year: 2026, week, rows, labels: LABELS })));
}

describe("MMWR weeks", () => {
  it("dates a week by the Saturday that ends it (checked against CDC's weekly datasets)", () => {
    expect(mmwrWeekEnding(2026, 1)).toBe("2026-01-10");
    expect(mmwrWeekEnding(2026, 43)).toBe("2026-10-31");
    expect(mmwrWeekEnding(2025, 1)).toBe("2025-01-04");
    expect(mmwrWeekEnding(2025, 53)).toBe("2026-01-03");
    expect(new Date(mmwrWeekEnding(2027, 1)!).getUTCDay()).toBe(6);
  });
  it("knows which years have 53 weeks", () => {
    expect(mmwrWeeksInYear(2025)).toBe(53);
    expect(mmwrWeeksInYear(2026)).toBe(52);
    expect(mmwrWeekEnding(2026, 53)).toBeNull();
    expect(mmwrWeekEnding(2026, 0)).toBeNull();
    expect(mmwrWeekEnding(2026, 1.5)).toBeNull();
  });
});

describe("isNndssUrl", () => {
  it("accepts https data.cdc.gov only", () => {
    expect(isNndssUrl("https://data.cdc.gov/resource/x9gk-5huc.json")).toBe(true);
    for (const bad of [
      "http://data.cdc.gov/resource/x9gk-5huc.json",
      "https://www.cdc.gov/x",
      "https://data.cdc.gov.evil.example/x",
      "https://user:pw@data.cdc.gov/x",
      "not a url",
    ]) {
      expect(isNndssUrl(bad), bad).toBe(false);
    }
  });
  it("builds a query on data.cdc.gov that names both labels and the year", () => {
    const url = nndssQueryUrl({ year: 2026, labels: Object.values(LABELS), limit: 50000 });
    expect(isNndssUrl(url)).toBe(true);
    const where = new URL(url).searchParams.get("$where");
    expect(where).toBe("label in ('Candida auris, clinical', 'Candida auris, screening') AND year >= '2026'");
  });
});

describe("parseNndssReading", () => {
  it("reads the U.S. Residents totals, the week and the states", () => {
    const r = parseNndssReading(doc(), { nowISO: "2026-11-06T00:00:00Z" });
    if (!r.ok) throw new Error(r.reason);
    expect(r.reading).toMatchObject({ year: 2026, week: 43, weekEnding: "2026-10-31" });
    expect(r.reading.clinical).toMatchObject({ cumulative: 100, week: 3, total: 100 });
    expect(r.reading.screening.cumulative).toBe(47);
    expect(r.reading.clinical.areas[0]).toEqual({ name: "California", cumulative: 50, week: 1, flag: null, coords: [-100, 40] });
    expect(r.reading.clinical.areas).toHaveLength(52);
  });

  it("counts flags as 0 and keeps the cumulative flag on the state", () => {
    const d = doc({ clinical: { Florida: { m1: undefined, m1_flag: "N", m3: undefined, m3_flag: "N", m4: undefined, m4_flag: "N" } } });
    const r = parseNndssReading(d);
    if (!r.ok) throw new Error(r.reason);
    expect(r.reading.clinical.areas.find((a) => a.name === "Florida")).toMatchObject({ cumulative: 0, flag: "N" });
  });

  it("rejects a state that does not add up to its region", () => {
    const r = parseNndssReading(doc({ clinical: { Nevada: { m3: "31.0" } } }));
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.reason).toMatch(/Mountain/);
  });

  it("rejects regions that do not add up to U.S. Residents, and parts that do not add up to Total", () => {
    const usr = parseNndssReading(doc({ screening: { "U.S. Residents": { m3: "48.0" } } }));
    expect(!usr.ok && usr.reason).toMatch(/U\.S\. Residents/);
    const total = parseNndssReading(doc({ clinical: { Total: { m1: "4.0" } } }));
    expect(!total.ok && total.reason).toMatch(/Total/);
  });

  it("rejects a missing area, a duplicated one, an unknown one and a row from another week", () => {
    const missing = doc();
    missing.rows = missing.rows.filter((r: any) => !(r.states === "Guam" && r.label === LABELS.clinical));
    expect(parseNndssReading(missing)).toMatchObject({ ok: false });

    const dup = doc();
    dup.rows.push({ ...dup.rows[5] });
    expect(parseNndssReading(dup)).toMatchObject({ ok: false });

    const unknown = doc();
    unknown.rows[5] = { ...unknown.rows[5], states: "Atlantis" };
    expect(!parseNndssReading(unknown).ok).toBe(true);

    const otherWeek = doc();
    otherWeek.rows[5] = { ...otherWeek.rows[5], week: "42" };
    expect(parseNndssReading(otherWeek)).toMatchObject({ ok: false });
  });

  it("rejects a value with a flag, an unknown flag, a non-count and a measure with neither", () => {
    expect(parseNndssReading(doc({ clinical: { Texas: { m3_flag: "-" } } })).ok).toBe(false);
    expect(parseNndssReading(doc({ clinical: { Alaska: { m3_flag: "Z" } } })).ok).toBe(false);
    expect(parseNndssReading(doc({ clinical: { Texas: { m3: "20.5" } } })).ok).toBe(false);
    expect(parseNndssReading(doc({ clinical: { Alaska: { m3_flag: undefined } } })).ok).toBe(false);
  });

  it("rejects a week that has not ended yet, or does not exist", () => {
    expect(parseNndssReading(doc(), { nowISO: "2026-10-20T00:00:00Z" }).ok).toBe(false);
    expect(parseNndssReading({ ...doc(), week: 60 }).ok).toBe(false);
  });

  it("refuses when U.S. Residents has a flag instead of a count", () => {
    const d = doc();
    for (const r of d.rows) {
      if (r.label === LABELS.clinical) {
        for (const m of ["m1", "m3"]) {
          delete r[m];
          r[`${m}_flag`] = "-";
        }
      }
    }
    const r = parseNndssReading(d);
    expect(!r.ok && r.reason).toMatch(/U\.S\. Residents has no count/);
  });
});

describe("snapshotFromNndssReading", () => {
  it("puts clinical cases in confirmed, screening apart, and no deaths", () => {
    const r = parseNndssReading(doc());
    if (!r.ok) throw new Error(r.reason);
    const s = snapshotFromNndssReading(r.reading, TOLL);
    expect(s).toMatchObject({
      date: "2026-10-31",
      confirmed: 100,
      suspected: null,
      deaths: null,
      recovered: null,
      screening: 47,
      mmwrYear: 2026,
      mmwrWeek: 43,
    });
    expect(isNndssUrl(s.sourceUrl)).toBe(true);
    expect(new URL(s.sourceUrl).searchParams.get("$where")).toContain("week = '43'");
  });

  it("passes the weekly sanity check only when null deaths are allowed, and rejects a fall", () => {
    const r = parseNndssReading(doc());
    if (!r.ok) throw new Error(r.reason);
    const s = snapshotFromNndssReading(r.reading, TOLL);
    const opts = { stalePrevDays: WEEKLY_STALE_PREV_DAYS };
    expect(validateSnapshot(s, null, s.date, opts).ok).toBe(false);
    expect(validateSnapshot(s, null, s.date, { ...opts, allowNullDeaths: true }).ok).toBe(true);
    const prev = { ...s, date: "2026-10-24", confirmed: 120 };
    const fall = validateSnapshot(s, prev, s.date, { ...opts, allowNullDeaths: true });
    expect(fall).toMatchObject({ ok: false });
    expect(!fall.ok && fall.reason).toMatch(/confirmed decreased from 120/);
    const screeningFall = validateSnapshot(s, { ...s, date: "2026-10-24", screening: 60 }, s.date, { ...opts, allowNullDeaths: true });
    expect(!screeningFall.ok && screeningFall.reason).toMatch(/screening decreased/);
  });
});

describe("groupWeeks", () => {
  it("splits rows by week, oldest first, and lists later years", () => {
    const rows = [
      ...weekRows(LABELS.clinical, 2026, 2, CLINICAL),
      ...weekRows(LABELS.clinical, 2026, 1, CLINICAL),
      ...weekRows(LABELS.clinical, 2027, 1, CLINICAL),
      ...weekRows("Measles, Indigenous", 2026, 1, CLINICAL),
    ];
    const g = groupWeeks(rows, { year: 2026, labels: Object.values(LABELS) });
    expect(g.weeks.map((w) => w.week)).toEqual([1, 2]);
    expect(g.weeks[0].rows).toHaveLength(70);
    expect(g.laterYears).toEqual([2027]);
  });
  it("drops Socrata's computed columns", () => {
    const rows = weekRows(LABELS.clinical, 2026, 1, CLINICAL).map((r) => ({ ...r, ":@computed_region_x": "9" }));
    const g = groupWeeks(rows, { year: 2026, labels: [LABELS.clinical] });
    expect(Object.keys(g.weeks[0].rows[0])).not.toContain(":@computed_region_x");
  });
});

describe("verifyNndssRaw", () => {
  const text = serializeNndssReading(doc());
  const parsed = parseNndssReading(JSON.parse(text));
  if (!parsed.ok) throw new Error(parsed.reason);
  const snap = { ...snapshotFromNndssReading(parsed.reading, TOLL), rawSha256: sha256(text) };

  it("accepts the archived rows that gave the snapshot", () => {
    expect(verifyNndssRaw(snap, text)).toEqual({ ok: true });
  });
  it("rejects a changed checksum, figure, date or a death count", () => {
    expect(verifyNndssRaw({ ...snap, rawSha256: sha256(text + " ") }, text).ok).toBe(false);
    expect(verifyNndssRaw({ ...snap, confirmed: 99 }, text).ok).toBe(false);
    expect(verifyNndssRaw({ ...snap, screening: 46 }, text).ok).toBe(false);
    expect(verifyNndssRaw({ ...snap, date: "2026-10-24" }, text).ok).toBe(false);
    expect(verifyNndssRaw({ ...snap, deaths: 0 as unknown as null }, text).ok).toBe(false);
    expect(verifyNndssRaw(snap, "not json").ok).toBe(false);
  });
});

describe("registry entry", () => {
  it("names the two labels and the reader", () => {
    const o = getOutbreak("candida-auris-us-2026");
    expect(o?.toll).toMatchObject({ adapter: "cdc-nndss", year: 2026, labels: LABELS });
  });
});
