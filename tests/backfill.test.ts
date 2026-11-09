import { describe, it, expect } from "vitest";
import { lastRevisionPerDay, keepLongestMonotoneChain, mergeBackfill } from "../scripts/lib/backfill.mjs";

type Snap = { date: string; confirmed: number; deaths: number; recovered?: number | null };
const snap = (date: string, confirmed: number, deaths: number, recovered: number | null = null): Snap => ({
  date,
  confirmed,
  deaths,
  recovered,
});

describe("lastRevisionPerDay", () => {
  it("keeps the latest revision of each UTC day, ascending", () => {
    const out = lastRevisionPerDay([
      { revid: 3, timestamp: "2026-09-02T23:59:59Z" },
      { revid: 1, timestamp: "2026-09-01T08:00:00Z" },
      { revid: 2, timestamp: "2026-09-01T20:30:00Z" },
      { revid: 4, timestamp: "2026-09-03T00:00:00Z" },
    ]);
    expect(out.map((r: { revid: number; date: string }) => [r.date, r.revid])).toEqual([
      ["2026-09-01", 2],
      ["2026-09-02", 3],
      ["2026-09-03", 4],
    ]);
  });

  it("ignores revisions with an invalid timestamp", () => {
    expect(lastRevisionPerDay([{ revid: 1, timestamp: "garbage" }])).toEqual([]);
  });
});

describe("keepLongestMonotoneChain", () => {
  it("keeps a clean series untouched", () => {
    const s = [snap("d1", 10, 1), snap("d2", 20, 2), snap("d3", 20, 3)];
    const { kept, dropped } = keepLongestMonotoneChain(s);
    expect(kept).toEqual(s);
    expect(dropped).toEqual([]);
  });

  it("drops an isolated upward spike", () => {
    const s = [snap("d1", 100, 10), snap("d2", 9000, 10), snap("d3", 120, 12), snap("d4", 130, 13)];
    const { kept, dropped } = keepLongestMonotoneChain(s);
    expect(dropped.map((x: Snap) => x.date)).toEqual(["d2"]);
    expect(kept).toHaveLength(3);
  });

  it("drops a one-off low reading on the final day without wiping the history", () => {
    const s = [snap("d1", 100, 10), snap("d2", 110, 11), snap("d3", 120, 12), snap("d4", 5, 1)];
    const { kept, dropped } = keepLongestMonotoneChain(s);
    expect(dropped.map((x: Snap) => x.date)).toEqual(["d4"]);
    expect(kept.map((x: Snap) => x.date)).toEqual(["d1", "d2", "d3"]);
  });

  it("treats a drop in any cumulative field as inconsistent", () => {
    const s = [
      snap("d0", 90, 45, 9),
      snap("d1", 100, 50, 10),
      snap("d2", 110, 40, 12), // deaths fall although confirmed rises
      snap("d3", 120, 55, 14),
    ];
    const { dropped } = keepLongestMonotoneChain(s);
    expect(dropped.map((x: Snap) => x.date)).toEqual(["d2"]);
  });

  it("ignores fields a reading does not report", () => {
    const s = [snap("d1", 100, 10, 50), snap("d2", 110, 11, null), snap("d3", 120, 12, 60)];
    expect(keepLongestMonotoneChain(s).dropped).toEqual([]);
  });

  it("handles empty input", () => {
    expect(keepLongestMonotoneChain([])).toEqual({ kept: [], dropped: [] });
  });
});

describe("mergeBackfill", () => {
  const r = (date: string, confirmed: number, deaths: number, revid?: number) => ({ date, confirmed, deaths, recovered: null, ...(revid ? { revid } : {}) });
  it("supersedes a stored snapshot the revision history contradicts and uses that day's reading instead (Ebola, Nov 2026)", () => {
    const existing = [r("2026-10-27", 10092, 4891), r("2026-11-02", 10445, 5376, 1383354892)];
    const imported = [
      r("2026-10-31", 10382, 5030),
      r("2026-11-01", 10445, 5376),
      r("2026-11-02", 10498, 5107, 1383443430),
      r("2026-11-03", 10563, 5130),
      r("2026-11-05", 10699, 5202),
      r("2026-11-06", 10772, 5234),
    ];
    const out = mergeBackfill(existing, imported);
    expect(out.kept.map((s) => `${s.date}:${s.deaths}`)).toEqual([
      "2026-10-27:4891", "2026-10-31:5030", "2026-11-02:5107", "2026-11-03:5130", "2026-11-05:5202", "2026-11-06:5234",
    ]);
    expect(out.supersededExisting).toEqual([existing[1]]);
    expect(out.droppedImported.map((s) => s.date)).toEqual(["2026-11-01"]);
  });
  it("keeps stored snapshots that fit, preferring them over the imported reading of the same day", () => {
    const existing = [r("2026-10-27", 10092, 4891, 1)];
    const out = mergeBackfill(existing, [r("2026-10-27", 10091, 4891, 2), r("2026-10-28", 10172, 4932)]);
    expect(out.kept).toEqual([existing[0], r("2026-10-28", 10172, 4932)]);
    expect(out.supersededExisting).toEqual([]);
  });
});
