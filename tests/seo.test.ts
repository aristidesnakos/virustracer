import { describe, expect, it } from "vitest";
import { describeFigures, latestFigures } from "@/lib/seo";
import type { CaseDataPoint } from "@/data/outbreaks";

const pt = (date: string, extra: Partial<CaseDataPoint>): CaseDataPoint => ({
  date,
  label: date,
  source: "test",
  ...extra,
});

describe("latestFigures", () => {
  it("returns null for an empty timeline", () => {
    expect(latestFigures([])).toBeNull();
  });

  it("reads each series from its newest point that has it", () => {
    const f = latestFigures([
      pt("2026-09-01", { confirmed: 10, deaths: 2 }),
      pt("2026-09-03", { confirmed: 30 }),
      pt("2026-09-02", { deaths: 5 }),
    ]);
    expect(f).toEqual({ date: "2026-09-03", confirmed: 30, deaths: 5 });
  });
});

const label = { shortName: "2026 Ebola outbreak", places: "DR Congo, Uganda" };

describe("describeFigures", () => {
  it("puts the numbers in the description", () => {
    const d = describeFigures({ date: "2026-09-29", confirmed: 1234, deaths: 567 }, "fallback", label);
    expect(d).toContain("2026 Ebola outbreak: ");
    expect(d).toContain("(DR Congo, Uganda)");
    expect(d).toContain("567 deaths");
    expect(d).toContain("1,234 confirmed cases");
    expect(d).toContain("29 September 2026");
    expect(d.length).toBeLessThanOrEqual(175);
  });

  it("falls back when there is no data", () => {
    expect(describeFigures(null, "fallback", label)).toBe("fallback");
  });

  it("names whichever outbreak it is given", () => {
    const d = describeFigures(
      { date: "2026-09-29", confirmed: 10, deaths: null },
      "fallback",
      { shortName: "2027 Cholera outbreak", places: "Yemen" },
    );
    expect(d).toContain("2027 Cholera outbreak: ");
    expect(d).toContain("(Yemen)");
    expect(d).not.toMatch(/ebola/i);
  });
});
