import { describe, it, expect } from "vitest";
import type { CaseDataPoint } from "@/data/outbreak";
import { computeTrend, daysBetween } from "@/lib/outbreak-trend";

const FIXTURE: CaseDataPoint[] = [
  { date: "2026-04-11", label: "Apr 11", confirmed: 1, suspected: 0, deaths: 1, source: "x" },
  { date: "2026-04-26", label: "Apr 26", confirmed: 2, suspected: 0, deaths: 2, source: "x" },
  { date: "2026-05-02", label: "May 2",  confirmed: 3, suspected: 2, deaths: 3, source: "x" },
  { date: "2026-05-06", label: "May 6",  confirmed: 6, suspected: 3, deaths: 3, source: "x" },
  { date: "2026-05-12", label: "May 12", confirmed: 10, suspected: 0, deaths: 3, source: "x" },
  { date: "2026-05-18", label: "May 18", confirmed: 10, suspected: 1, deaths: 3, source: "x" },
];

describe("computeTrend", () => {
  it("returns current value as the latest reading at or before the asOf date", () => {
    const t = computeTrend(FIXTURE, "confirmed", 7, "2026-05-18");
    expect(t.current).toBe(10);
  });

  it("computes positive delta over a 7-day window when cases grew", () => {
    // 7-day window ending 2026-05-18 reaches back to 2026-05-11 → last value at or before is 6 (May 6).
    const t = computeTrend(FIXTURE, "confirmed", 7, "2026-05-18");
    expect(t.delta).toBe(10 - 6);
  });

  it("returns zero delta when value did not change in the window", () => {
    const t = computeTrend(FIXTURE, "deaths", 7, "2026-05-18");
    expect(t.delta).toBe(0);
  });

  it("treats values before the start of the window as the baseline (delta = current when no prior data)", () => {
    const t = computeTrend(FIXTURE, "confirmed", 7, "2026-04-12");
    expect(t.current).toBe(1);
    expect(t.delta).toBe(1);
  });

  it("uses the latest timeline date as asOf when none is provided", () => {
    const t = computeTrend(FIXTURE, "confirmed", 7);
    expect(t.current).toBe(10);
  });

  it("returns a non-decreasing series of points up to asOf", () => {
    const t = computeTrend(FIXTURE, "confirmed", 7, "2026-05-18");
    const values = t.series.map((p) => p.value);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
    expect(t.series[t.series.length - 1]?.value).toBe(10);
  });

  it("handles an empty timeline gracefully", () => {
    const t = computeTrend([], "confirmed", 7);
    expect(t).toEqual({ current: 0, delta: 0, windowDays: 7, series: [] });
  });
});

describe("computeTrend with optional fields", () => {
  const SPARSE: CaseDataPoint[] = [
    { date: "2026-08-01", label: "Aug 1", confirmed: 3626, deaths: 1589, recovered: 654, source: "x" },
    { date: "2026-08-07", label: "Aug 7", confirmed: 4000, source: "x" },
    { date: "2026-08-09", label: "Aug 9", deaths: 2000, source: "x" },
  ];

  it("carries the last known value over points that omit the field", () => {
    const t = computeTrend(SPARSE, "confirmed", 7, "2026-08-09");
    expect(t.current).toBe(4000);
    expect(t.delta).toBe(4000 - 3626);
  });

  it("only includes points where the field is defined in the series", () => {
    const t = computeTrend(SPARSE, "deaths", 7, "2026-08-09");
    expect(t.series.map((p) => p.value)).toEqual([1589, 2000]);
    expect(t.current).toBe(2000);
  });

  it("supports the recovered field and returns 0 when never reported", () => {
    expect(computeTrend(SPARSE, "recovered", 7).current).toBe(654);
    expect(computeTrend(SPARSE, "suspected", 7)).toEqual({
      current: 0,
      delta: 0,
      windowDays: 7,
      series: [],
    });
  });
});

describe("daysBetween", () => {
  it("returns positive integer days for a forward-in-time range", () => {
    expect(daysBetween("2026-05-01", "2026-05-18")).toBe(17);
  });

  it("returns zero for the same date", () => {
    expect(daysBetween("2026-05-18", "2026-05-18")).toBe(0);
  });

  it("returns a negative number when the destination is earlier", () => {
    expect(daysBetween("2026-05-18", "2026-05-01")).toBe(-17);
  });
});

describe("computeTrend with interpolateBaseline", () => {
  const sparse: CaseDataPoint[] = [
    { date: "2026-09-19", label: "Sep 19", confirmed: 7672, deaths: 3699, source: "x" },
    { date: "2026-09-26", label: "Sep 26", confirmed: 8067, deaths: 3901, source: "x" },
    { date: "2026-10-02", label: "Oct 2", confirmed: 8245, deaths: 3984, source: "x" },
  ];

  it("does not overstate the delta when the nearest prior reading is stale", () => {
    // 7-day window ending Oct 2 starts Sep 25: 6/7 of the way from Sep 19 to Sep 26.
    const naive = computeTrend(sparse, "deaths", 7, "2026-10-02");
    expect(naive.delta).toBe(3984 - 3699);
    const t = computeTrend(sparse, "deaths", 7, "2026-10-02", { interpolateBaseline: true });
    expect(t.delta).toBe(Math.round(3984 - (3699 + (6 / 7) * (3901 - 3699))));
    expect(t.delta).toBeLessThan(naive.delta);
  });

  it("matches the exact value when a reading lands on the window start", () => {
    const t = computeTrend(sparse, "deaths", 7, "2026-10-03", { interpolateBaseline: true });
    expect(t.delta).toBe(3984 - 3901);
  });

  it("falls back to the carried-forward value when there is no later reading", () => {
    // Window starts Sep 29, after the last reading (Sep 26), so nothing to interpolate towards.
    const t = computeTrend(sparse.slice(0, 2), "deaths", 4, "2026-10-03", { interpolateBaseline: true });
    expect(t.current).toBe(3901);
    expect(t.delta).toBe(0);
  });
});
