import { describe, it, expect } from "vitest";
import { computeMetrics, reproductionFromGrowth, ASSUMPTIONS, type MetricsPoint } from "@/lib/metrics";

const DAY = 24 * 60 * 60 * 1000;
const START = Date.parse("2026-08-01T00:00:00Z");
const iso = (n: number) => new Date(START + n * DAY).toISOString().slice(0, 10);

/** Cumulative series whose daily incidence is `base * exp(r * t)`. */
function exponential(days: number, base: number, r: number, cfr = 0.4): MetricsPoint[] {
  const out: MetricsPoint[] = [];
  let confirmed = 1000;
  for (let t = 0; t < days; t++) {
    confirmed += base * Math.exp(r * t);
    out.push({ date: iso(t), confirmed, deaths: confirmed * cfr });
  }
  return out;
}

describe("reproductionFromGrowth", () => {
  it("is 1 when the outbreak is flat", () => {
    expect(reproductionFromGrowth(0)).toBeCloseTo(1, 10);
  });
  it("rises with growth and falls with decay", () => {
    expect(reproductionFromGrowth(0.05)).toBeGreaterThan(1);
    expect(reproductionFromGrowth(-0.05)).toBeLessThan(1);
  });
  it("floors at 0 for decay faster than the interval can express", () => {
    expect(reproductionFromGrowth(-5)).toBe(0);
  });
});

describe("computeMetrics", () => {
  it("reports insufficient data for an empty or single-point series", () => {
    expect(computeMetrics([]).status).toBe("insufficient_data");
    const one = computeMetrics([{ date: "2026-10-02", confirmed: 8245, deaths: 3984 }]);
    expect(one.status).toBe("insufficient_data");
    expect(one.asOf).toBe("2026-10-02");
    expect(one.growth).toBeNull();
  });

  it("reports insufficient data when readings are too sparse to trust", () => {
    const sparse = [
      { date: iso(0), confirmed: 1000, deaths: 400 },
      { date: iso(10), confirmed: 1500, deaths: 600 },
      { date: iso(20), confirmed: 2200, deaths: 880 },
    ];
    const m = computeMetrics(sparse);
    expect(m.status).toBe("insufficient_data");
    expect(m.reason).toMatch(/dated readings/);
  });

  it("recovers a known growth rate and doubling time", () => {
    const r = 0.05;
    const m = computeMetrics(exponential(40, 50, r));
    expect(m.status).toBe("ok");
    expect(m.growth!.ratePerDay.estimate).toBeCloseTo(r, 3);
    expect(m.growth!.doublingTimeDays).toBeCloseTo(Math.LN2 / r, 0);
    expect(m.growth!.halvingTimeDays).toBeNull();
    expect(m.growth!.trend).toBe("growing");
    expect(m.rt!.estimate).toBeGreaterThan(1);
    expect(m.rt!.low).toBeLessThan(m.rt!.estimate);
    expect(m.rt!.high).toBeGreaterThan(m.rt!.estimate);
  });

  it("recognises a shrinking outbreak and gives a halving time", () => {
    const m = computeMetrics(exponential(40, 400, -0.04));
    expect(m.growth!.ratePerDay.estimate).toBeCloseTo(-0.04, 3);
    expect(m.growth!.trend).toBe("shrinking");
    expect(m.growth!.doublingTimeDays).toBeNull();
    expect(m.growth!.halvingTimeDays).toBeCloseTo(Math.LN2 / 0.04, 0);
    expect(m.rt!.estimate).toBeLessThan(1);
  });

  it("calls a constant weekly rate stable, with R near 1", () => {
    const m = computeMetrics(exponential(40, 60, 0));
    expect(m.growth!.trend).toBe("stable");
    expect(m.rt!.estimate).toBeCloseTo(1, 1);
    expect(m.incidence!.confirmed.changePct).toBeCloseTo(0, 5);
  });

  it("sums new cases and deaths over the last two 7-day windows", () => {
    const m = computeMetrics(exponential(30, 100, 0, 0.5));
    expect(m.incidence!.confirmed.last7).toBe(700);
    expect(m.incidence!.confirmed.prev7).toBe(700);
    expect(m.incidence!.deaths.last7).toBe(350);
    const last = m.weekly[m.weekly.length - 1];
    expect(last.periodEnd).toBe(m.windowEnd);
    expect(last.newConfirmed).toBe(700);
  });

  it("ends the windows on the latest day the total moved when the newest days are not yet reported", () => {
    const pts = exponential(30, 100, 0);
    const lastDay = pts[pts.length - 1];
    const stale = [
      ...pts,
      { date: iso(30), confirmed: lastDay.confirmed, deaths: lastDay.deaths },
      { date: iso(31), confirmed: lastDay.confirmed, deaths: lastDay.deaths },
    ];
    const m = computeMetrics(stale);
    expect(m.asOf).toBe(iso(31));
    expect(m.windowEnd).toBe(iso(29));
    expect(m.incidence!.confirmed.last7).toBe(700);
    expect(m.incidence!.confirmed.prev7).toBe(700);
  });

  it("treats a flat stretch longer than the allowed lag as real", () => {
    const pts = exponential(30, 100, 0);
    const lastDay = pts[pts.length - 1];
    const flat = Array.from({ length: 4 }, (_, i) => ({
      date: iso(30 + i),
      confirmed: lastDay.confirmed,
      deaths: lastDay.deaths,
    }));
    const m = computeMetrics([...pts, ...flat]);
    expect(m.windowEnd).toBe(m.asOf);
    expect(m.incidence!.confirmed.last7).toBeLessThan(700);
  });

  it("returns at most maxWeeks periods, oldest first", () => {
    const m = computeMetrics(exponential(120, 100, 0));
    expect(m.weekly).toHaveLength(ASSUMPTIONS.maxWeeks);
    const ends = m.weekly.map((w) => w.periodEnd);
    expect([...ends].sort()).toEqual(ends);
  });

  it("computes the three fatality ratios", () => {
    const pts = exponential(30, 100, 0, 0.4).map((p) => ({ ...p, recovered: 500 }));
    const m = computeMetrics(pts);
    const last = pts[pts.length - 1];
    expect(m.cfr.naive).toBeCloseTo(last.deaths / last.confirmed, 10);
    expect(m.cfr.resolved).toBeCloseTo(last.deaths / (last.deaths + 500), 10);
    // With steady incidence, the delay-adjusted ratio divides by a smaller, earlier case count.
    expect(m.cfr.delayAdjusted!).toBeGreaterThan(m.cfr.naive!);
  });

  it("leaves resolved CFR null when recoveries are not reported", () => {
    expect(computeMetrics(exponential(30, 100, 0)).cfr.resolved).toBeNull();
  });

  it("fills gaps by interpolation and marks those days", () => {
    const pts = exponential(30, 100, 0).filter((_, i) => i !== 20 && i !== 21);
    const m = computeMetrics(pts);
    const filled = m.daily.filter((d) => d.interpolated).map((d) => d.date);
    expect(filled).toEqual([iso(20), iso(21)]);
    expect(m.incidence!.confirmed.last7).toBe(700);
  });

  it("never lets a cumulative count fall (a lower later reading is ignored)", () => {
    const pts = exponential(30, 100, 0);
    pts[28] = { ...pts[28], confirmed: 10 };
    const m = computeMetrics(pts);
    expect(m.daily.every((d) => d.newConfirmed >= 0)).toBe(true);
  });

  it("gives no growth estimate when a window has no new cases", () => {
    const flat: MetricsPoint[] = Array.from({ length: 30 }, (_, t) => ({
      date: iso(t),
      confirmed: 500,
      deaths: 200,
    }));
    const m = computeMetrics(flat);
    expect(m.status).toBe("ok");
    expect(m.growth).toBeNull();
    expect(m.rt).toBeNull();
    expect(m.incidence!.confirmed.changePct).toBeNull();
  });

  it("does not mutate its input", () => {
    const pts = exponential(30, 100, 0.02);
    const copy = JSON.parse(JSON.stringify(pts));
    computeMetrics(pts);
    expect(pts).toEqual(copy);
  });
});
