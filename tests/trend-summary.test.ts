import { describe, it, expect } from "vitest";
import { computeMetrics, type MetricsPoint } from "@/lib/metrics";
import { ebolaBundibugyo2026 } from "@/data/outbreaks/ebola-bundibugyo-2026";

const EBOLA = ebolaBundibugyo2026.metrics;
import { describeTrend, shortDay } from "@/lib/trend-summary";

const DAY = 24 * 60 * 60 * 1000;
const START = Date.parse("2026-08-01T00:00:00Z");

function series(days: number, base: number, r: number): MetricsPoint[] {
  let confirmed = 1000;
  return Array.from({ length: days }, (_, t) => {
    confirmed += base * Math.exp(r * t);
    return { date: new Date(START + t * DAY).toISOString().slice(0, 10), confirmed, deaths: confirmed * 0.4 };
  });
}

describe("shortDay", () => {
  it("formats in UTC without a leading zero", () => {
    expect(shortDay("2026-10-01")).toBe("1 Oct");
    expect(shortDay("2026-12-31")).toBe("31 Dec");
  });
});

describe("describeTrend", () => {
  it("explains a lack of data instead of inventing a trend", () => {
    const s = describeTrend(computeMetrics([], EBOLA));
    expect(s.verdict).toBe("unknown");
    expect(s.label).toBe("Not enough data");
  });

  it("describes a rising outbreak", () => {
    const s = describeTrend(computeMetrics(series(40, 50, 0.06), EBOLA));
    expect(s.verdict).toBe("growing");
    expect(s.headline).toMatch(/^Cases are rising: [\d,]+ new confirmed cases in the 7 days to 9 Sep, \d+% more than the week before\.$/);
  });

  it("describes a falling outbreak", () => {
    const s = describeTrend(computeMetrics(series(40, 400, -0.06), EBOLA));
    expect(s.verdict).toBe("declining");
    expect(s.headline).toMatch(/fewer than the week before/);
  });

  it("does not call a flat series a trend", () => {
    const s = describeTrend(computeMetrics(series(40, 100, 0), EBOLA));
    expect(s.verdict).toBe("plateau");
    expect(s.headline).toMatch(/^No clear rise or fall: 700 new confirmed cases/);
    expect(s.headline).toMatch(/about the same as the week before\.$/);
  });
});
