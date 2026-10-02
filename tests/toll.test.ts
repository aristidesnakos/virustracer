import { describe, it, expect } from "vitest";
import {
  parseInfobox,
  validateSnapshot,
  applySnapshot,
  MAX_SNAPSHOTS,
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
