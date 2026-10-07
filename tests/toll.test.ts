import { describe, it, expect } from "vitest";
import {
  parseInfobox,
  extractInfobox,
  validateSnapshot,
  applySnapshot,
  withoutIgnored,
  MAX_SNAPSHOTS,
  WEEKLY_STALE_PREV_DAYS,
} from "../scripts/lib/toll.mjs";

const INFOBOX = `{{Short description|Ebola epidemic}}
{{Infobox outbreak
| name            = 2026 Ebola epidemic
| disease         = [[Ebola]]
| virus_strain    = [[Bundibugyo virus]]
| confirmed_cases = 8,245<ref name = "INSP-DRC" /><ref>{{cite web |title=Alert and Response |url=https://www.who.int/x |website=www.who.int
|publisher=World Health Organization}}</ref>
| suspected_cases = 347
| recovery_cases  = 2,140<ref name="WHO">some text, with 1,234 numbers</ref>
| deaths          = 3,984 <!-- updated daily -->
| date            = May 2026
}}
'''Ebola''' is a disease.`;

type Snap = Parameters<typeof applySnapshot>[1];
const snap = (over: Partial<Snap> = {}): Snap => ({
  date: "2026-10-02",
  confirmed: 8245,
  suspected: 347,
  deaths: 3984,
  recovered: 2140,
  source: "test",
  sourceUrl: "https://example.org",
  ...over,
});

describe("parseInfobox", () => {
  it("parses a realistic infobox with refs, commas and comments", () => {
    expect(parseInfobox(INFOBOX)).toEqual({
      confirmed: 8245,
      suspected: 347,
      deaths: 3984,
      recovered: 2140,
    });
  });

  it("returns null for blank optional fields", () => {
    const wt = `{{Infobox outbreak\n| confirmed_cases = 10\n| suspected_cases =\n| recovery_cases = <ref name="x" />\n| deaths = 3\n}}`;
    expect(parseInfobox(wt)).toEqual({ confirmed: 10, suspected: null, deaths: 3, recovered: null });
  });

  it("strips templates such as {{formatnum}} and {{efn}}", () => {
    const wt = `{{Infobox outbreak\n| confirmed_cases = {{formatnum:1234}}\n| deaths = 56{{efn|note}}\n}}`;
    expect(parseInfobox(wt)).toMatchObject({ confirmed: 1234, deaths: 56 });
  });

  it("returns null when confirmed or deaths is missing/unparseable", () => {
    expect(parseInfobox(`{{Infobox outbreak\n| confirmed_cases = 5\n}}`)).toBeNull();
    expect(parseInfobox(`{{Infobox outbreak\n| confirmed_cases = many\n| deaths = 2\n}}`)).toBeNull();
    expect(parseInfobox(`{{Infobox outbreak\n| confirmed_cases = \n| deaths = 2\n}}`)).toBeNull();
  });

  it("returns null when there is no infobox", () => {
    expect(parseInfobox("Just text, deaths = 5")).toBeNull();
    expect(parseInfobox("")).toBeNull();
  });
});

// Trimmed copy of the live "2026 Bangladesh measles outbreak" infobox (revision 1377973650):
// a nested map template with its own `| link =` fields, and a two-figure deaths field.
const BD_DEATHS = `100 {{small|(confirmed cases)}}  <br>'''1,009 {{small|(all cases)}}'''`;
const bangladesh = (deaths: string) => `{{Infobox outbreak
| name            = 2026 measles outbreak in Bangladesh
| map1            = {{Location map+ | Bangladesh
| caption =
| float  = center
| places =
 {{Location map~ | Bangladesh
    | label =
    | lat_deg = 23.54
    | link = Sreenagar Upazila }}
 {{Location map~ | Bangladesh
    | label =
    | lat_deg = 24.01
    | link = Pabna }}
}}
| disease         = [[Measles]]
| date            = Late February 2026 – present
| confirmed_cases = 19,933
| active_cases    =
| suspected_cases = 168,745
| hospitalized_cases = 148,555
| recovery_cases  = 142,888
| deaths          = ${deaths}
| fatality_rate   = 5.06% {{small|(confirmed cases)}}<br>'''0.53% {{small|(all cases)}}'''
}}
In mid-March 2026, a [[measles]] outbreak started in [[Bangladesh]].`;

describe("parseInfobox with a two-figure deaths field", () => {
  const expected = { confirmed: 19933, suspected: 168745, deaths: 100, recovered: 142888 };

  it("takes the deaths among confirmed cases from the real Bangladesh infobox", () => {
    expect(parseInfobox(bangladesh(BD_DEATHS))).toEqual(expected);
  });

  it("does not take the all-cases figure when the editor reorders the two lines", () => {
    const reordered = `'''1,009 {{small|(all cases)}}'''<br>100 {{small|(confirmed cases)}}`;
    expect(parseInfobox(bangladesh(reordered))).toEqual(expected);
  });

  it("skips an all-cases figure listed first even when the confirmed line carries no label", () => {
    expect(parseInfobox(bangladesh(`1,009 {{small|(all cases)}}<br>100`))).toEqual(expected);
    expect(parseInfobox(bangladesh(`'''1,009 (total)'''<br>100`))).toEqual(expected);
  });

  it("takes the first figure when no label says confirmed", () => {
    expect(parseInfobox(bangladesh(`100<br>1,009`))).toMatchObject({ deaths: 100 });
    expect(parseInfobox(bangladesh(`100 {{small|(DGHS)}}<br>'''1,009 {{small|(all cases)}}'''`))).toMatchObject({
      deaths: 100,
    });
  });

  it("copes with <br /> and a refs/comment between the figures", () => {
    const messy = `100 {{small|(confirmed cases)}}<ref name="x">1,009 died</ref><br /><!-- all --> '''1,009 {{small|(all cases)}}'''`;
    expect(parseInfobox(bangladesh(messy))).toMatchObject({ deaths: 100 });
  });

  it("refuses to read the field when every figure is a wider count", () => {
    expect(parseInfobox(bangladesh(`'''1,009 {{small|(all cases)}}'''<br>1,200 {{small|(total)}}`))).toBeNull();
  });

  it("reads the older 'total (N suspected cases)' format as deaths among confirmed cases", () => {
    // Until 2026-09-08 the field was `997 (897 suspected cases)`; 997 - 897 = 100, the figure
    // the infobox gave as "confirmed cases" two days later.
    expect(parseInfobox(bangladesh(`997 (897 suspected cases)`))).toMatchObject({ deaths: 100 });
    expect(parseInfobox(bangladesh(`114 (98 suspected case)`))).toMatchObject({ deaths: 16 });
    expect(parseInfobox(bangladesh(`594 (504suspected cases)`))).toMatchObject({ deaths: 90 });
    expect(parseInfobox(bangladesh(`1,009 (909 suspected cases)<ref name="a" />`))).toMatchObject({ deaths: 100 });
  });

  it("does not subtract from an approximate total or when the bracket exceeds it", () => {
    expect(parseInfobox(bangladesh(`300+ (98 suspected case)`))).toBeNull();
    expect(parseInfobox(bangladesh(`50 (98 suspected cases)`))).toBeNull();
  });

  it("reads a single labelled figure exactly as before", () => {
    expect(parseInfobox(bangladesh(`100 {{small|(confirmed cases)}}`))).toMatchObject({ deaths: 100 });
    expect(parseInfobox(bangladesh(`1,009 {{small|(all cases)}}`))).toMatchObject({ deaths: 1009 });
  });
});

describe("extractInfobox", () => {
  it("returns exactly the brace-balanced infobox block, without surrounding text", () => {
    const block = extractInfobox(INFOBOX)!;
    expect(block.startsWith("{{Infobox outbreak")).toBe(true);
    expect(block.endsWith("}}")).toBe(true);
    expect(INFOBOX).toContain(block);
    expect(block).not.toContain("Short description");
    expect(block).not.toContain("is a disease");
    expect(block).toContain("{{cite web"); // nested templates stay inside
  });

  it("is consistent with parseInfobox", () => {
    expect(parseInfobox(extractInfobox(INFOBOX)!)).toEqual(parseInfobox(INFOBOX));
  });

  it("matches Infobox_outbreak with underscore and any case", () => {
    expect(extractInfobox("x {{infobox_outbreak\n| deaths = 1\n}} y")).toBe("{{infobox_outbreak\n| deaths = 1\n}}");
  });

  it("returns null when absent, unbalanced or not a string", () => {
    expect(extractInfobox("no box here")).toBeNull();
    expect(extractInfobox("{{Infobox outbreak\n| deaths = 1")).toBeNull();
    expect(extractInfobox(undefined as unknown as string)).toBeNull();
  });
});

describe("validateSnapshot", () => {
  const prev = snap({ date: "2026-10-01", confirmed: 8100, deaths: 3900, suspected: 300, recovered: 2000 });

  it("accepts a normal increase", () => {
    expect(validateSnapshot(snap(), prev, "2026-10-02")).toEqual({ ok: true });
  });

  it("accepts the first snapshot (no prev)", () => {
    expect(validateSnapshot(snap(), null, "2026-10-02").ok).toBe(true);
  });

  it("rejects negative or non-integer values", () => {
    expect(validateSnapshot(snap({ deaths: -1 }), null, "2026-10-02").ok).toBe(false);
    expect(validateSnapshot(snap({ confirmed: 10.5 }), null, "2026-10-02").ok).toBe(false);
  });

  it("rejects deaths greater than confirmed", () => {
    const r = validateSnapshot(snap({ confirmed: 100, deaths: 101 }), null, "2026-10-02");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/exceed/);
  });

  it("rejects decreases in cumulative values", () => {
    const r = validateSnapshot(snap({ deaths: 3800 }), prev, "2026-10-02");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/deaths decreased/);
    expect(validateSnapshot(snap({ confirmed: 8000 }), prev, "2026-10-02").ok).toBe(false);
  });

  it("allows suspected to decrease (reclassification)", () => {
    expect(validateSnapshot(snap({ suspected: 10 }), prev, "2026-10-02").ok).toBe(true);
  });

  it("rejects a >25% jump when the previous snapshot is recent", () => {
    const r = validateSnapshot(snap({ deaths: 5000, confirmed: 8200 }), prev, "2026-10-02");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/jumped/);
  });

  it("allows a big jump when the previous snapshot is more than 7 days old", () => {
    const old = snap({ date: "2026-09-20", confirmed: 7000, deaths: 3000 });
    expect(validateSnapshot(snap(), old, "2026-10-02").ok).toBe(true);
  });

  it("for a weekly report, allows early-season growth a week on but checks a reissue within the week", () => {
    // EODY West Nile, Greece: 157 -> 232 cases in the week to 26 Aug 2026 (+48%).
    const week = snap({ date: "2026-08-19", confirmed: 157, deaths: 13, suspected: null, recovered: null });
    const next = snap({ date: "2026-08-26", confirmed: 232, deaths: 19, suspected: null, recovered: null });
    const weekly = { stalePrevDays: WEEKLY_STALE_PREV_DAYS };
    expect(validateSnapshot(next, week, next.date).ok).toBe(false); // the daily rule would block it
    expect(validateSnapshot(next, week, next.date, weekly)).toEqual({ ok: true });
    const reissue = snap({ ...next, date: "2026-08-21" });
    expect(validateSnapshot(reissue, week, reissue.date, weekly).reason).toMatch(/jumped .* within 3 days/);
    // A report day moving from Thursday back to Wednesday leaves 6 days: still accepted.
    const early = snap({ ...next, date: "2026-08-25" });
    expect(validateSnapshot(early, week, early.date, weekly)).toEqual({ ok: true });
  });
});

describe("applySnapshot", () => {
  const base = { lastChecked: "2026-10-01T00:00:00.000Z", snapshots: [snap({ date: "2026-10-01", confirmed: 8100, deaths: 3900 })] };

  it("appends a new date and sets lastChecked", () => {
    const out = applySnapshot(base, snap(), "2026-10-02T06:00:00.000Z");
    expect(out.lastChecked).toBe("2026-10-02T06:00:00.000Z");
    expect(out.snapshots.map((s) => s.date)).toEqual(["2026-10-01", "2026-10-02"]);
  });

  it("only touches lastChecked when values are identical", () => {
    const same = snap({ date: "2026-10-02", confirmed: 8100, deaths: 3900 });
    const out = applySnapshot(base, same, "2026-10-02T06:00:00.000Z");
    expect(out.lastChecked).toBe("2026-10-02T06:00:00.000Z");
    expect(out.snapshots).toEqual(base.snapshots);
  });

  it("with appendUnchanged, records an unchanged reading for a new date (a quiet week)", () => {
    const same = snap({ date: "2026-10-08", confirmed: 8100, deaths: 3900 });
    const out = applySnapshot(base, same, "2026-10-08T06:00:00.000Z", { appendUnchanged: true });
    expect(out.snapshots.map((s) => s.date)).toEqual(["2026-10-01", "2026-10-08"]);
    // ...but the same report read again changes nothing.
    const again = applySnapshot(out, same, "2026-10-08T18:00:00.000Z", { appendUnchanged: true });
    expect(again.snapshots).toEqual(out.snapshots);
  });

  it("replaces the last snapshot when the date is the same", () => {
    const out = applySnapshot(base, snap({ date: "2026-10-01", deaths: 3950 }), "2026-10-01T12:00:00.000Z");
    expect(out.snapshots).toHaveLength(1);
    expect(out.snapshots[0].deaths).toBe(3950);
  });

  it("does not mutate the input store", () => {
    const frozen = JSON.parse(JSON.stringify(base));
    applySnapshot(base, snap(), "x");
    expect(base).toEqual(frozen);
  });

  it("works on an empty store", () => {
    const out = applySnapshot({ lastChecked: "", snapshots: [] }, snap(), "now");
    expect(out.snapshots).toHaveLength(1);
  });

  it("keeps snapshots sorted and capped", () => {
    let store = { lastChecked: "", snapshots: [] as Snap[] };
    const start = Date.UTC(2025, 0, 1);
    for (let i = 0; i < MAX_SNAPSHOTS + 5; i++) {
      const date = new Date(start + i * 86400000).toISOString().slice(0, 10);
      store = applySnapshot(store, snap({ date, confirmed: 100 + i, deaths: i }), "now");
    }
    expect(store.snapshots).toHaveLength(MAX_SNAPSHOTS);
    const dates = store.snapshots.map((s) => s.date);
    expect([...dates].sort()).toEqual(dates);
    expect(store.snapshots[store.snapshots.length - 1].deaths).toBe(MAX_SNAPSHOTS + 4);
  });
});

describe("withoutIgnored", () => {
  const parsed = { confirmed: 10, suspected: 5, deaths: 2, recovered: 7 };

  it("blanks only the listed fields", () => {
    expect(withoutIgnored(parsed, ["recovered"])).toEqual({ ...parsed, recovered: null });
    expect(withoutIgnored(parsed, [])).toEqual(parsed);
    expect(withoutIgnored(parsed)).toEqual(parsed);
  });

  it("never blanks confirmed or deaths, and passes null through", () => {
    expect(withoutIgnored(parsed, ["confirmed", "deaths"])).toEqual(parsed);
    expect(withoutIgnored(null, ["recovered"])).toBeNull();
  });

  it("does not mutate its input", () => {
    withoutIgnored(parsed, ["recovered"]);
    expect(parsed.recovered).toBe(7);
  });
});
