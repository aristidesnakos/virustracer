import { describe, it, expect } from "vitest";
import { parseTollQuery, selectSnapshots, toCsv, toPublicSnapshot, tollToCsv } from "@/lib/api";
import type { TollSnapshot } from "@/lib/toll";

const snap = (date: string, confirmed: number): TollSnapshot => ({
  date,
  confirmed,
  suspected: null,
  deaths: Math.floor(confirmed / 2),
  recovered: null,
  source: "Wikipedia infobox",
  sourceUrl: `https://example.org/${date}`,
});

const q = (s: string) => parseTollQuery(new URLSearchParams(s));

describe("parseTollQuery", () => {
  it("defaults to json with no filters", () => {
    expect(q("")).toEqual({ from: undefined, to: undefined, limit: undefined, format: "json" });
  });
  it("accepts valid values", () => {
    expect(q("from=2026-09-01&to=2026-09-30&limit=5&format=csv")).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
      limit: 5,
      format: "csv",
    });
  });
  it.each([
    ["from=yesterday", /from/],
    ["to=2026-13-01", /to/],
    ["from=2026-02-30", /from/],
    ["from=2026-10-02&to=2026-09-01", /not be after/],
    ["limit=0", /limit/],
    ["limit=1001", /limit/],
    ["limit=2.5", /limit/],
    ["limit=abc", /limit/],
    ["format=xml", /format/],
  ])("rejects %s", (qs, message) => {
    const out = q(qs);
    expect("error" in out && out.error).toMatch(message);
  });
});

describe("selectSnapshots", () => {
  const rows = [snap("2026-09-03", 30), snap("2026-09-01", 10), snap("2026-09-02", 20), snap("2026-09-04", 40)];
  it("sorts ascending", () => {
    expect(selectSnapshots(rows, {}).map((r) => r.date)).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
    ]);
  });
  it("filters by inclusive range", () => {
    expect(selectSnapshots(rows, { from: "2026-09-02", to: "2026-09-03" }).map((r) => r.date)).toEqual([
      "2026-09-02",
      "2026-09-03",
    ]);
  });
  it("keeps the most recent `limit` rows", () => {
    expect(selectSnapshots(rows, { limit: 2 }).map((r) => r.date)).toEqual(["2026-09-03", "2026-09-04"]);
  });
  it("does not mutate its input", () => {
    const copy = [...rows];
    selectSnapshots(rows, { limit: 1 });
    expect(rows).toEqual(copy);
  });
});

describe("csv", () => {
  it("quotes cells with commas, quotes and newlines", () => {
    expect(toCsv(["a", "b"], [["x,y", 'say "hi"'], ["line\nbreak", 1]])).toBe(
      'a,b\r\n"x,y","say ""hi"""\r\n"line\nbreak",1\r\n',
    );
  });
  it("renders null and undefined as empty cells", () => {
    expect(toCsv(["a", "b", "c"], [[null, undefined, 0]])).toBe("a,b,c\r\n,,0\r\n");
  });
  it("neutralises spreadsheet formulas but leaves negative numbers alone", () => {
    expect(toCsv(["a"], [["=SUM(A1)"], ["-5"], ["+1 555"]])).toBe("a\r\n'=SUM(A1)\r\n-5\r\n'+1 555\r\n");
  });
  it("writes one row per snapshot with a header", () => {
    const csv = tollToCsv([snap("2026-09-01", 10)]);
    expect(csv.split("\r\n")[0]).toBe("date,confirmed,suspected,deaths,recovered,revid,revision_timestamp,source_url");
    expect(csv.split("\r\n")[1]).toBe("2026-09-01,10,,5,,,,https://example.org/2026-09-01");
  });
});

describe("toPublicSnapshot", () => {
  it("drops the internal archive path but keeps the checksum", () => {
    const out = toPublicSnapshot({ ...snap("2026-09-01", 10), rawPath: "data/raw/infobox/1.txt", rawSha256: "abc" });
    expect(out).not.toHaveProperty("rawPath");
    expect(out.rawSha256).toBe("abc");
    expect(out.confirmed).toBe(10);
  });
  it("leaves old snapshots unchanged", () => {
    expect(toPublicSnapshot(snap("2026-09-01", 10))).toEqual(snap("2026-09-01", 10));
  });
});
