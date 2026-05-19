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
