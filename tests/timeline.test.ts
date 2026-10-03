import { describe, it, expect } from "vitest";
import type { CaseDataPoint } from "@/data/outbreaks";
import type { TollSnapshot } from "@/lib/toll";
import { mergeTimeline, latestDate } from "@/lib/timeline";

const curated: CaseDataPoint[] = [
  { date: "2026-09-27", label: "Sep 27", confirmed: 8116, deaths: 3924, source: "curated" },
  { date: "2026-09-19", label: "Sep 19", confirmed: 7672, deaths: 3699, source: "curated" },
];

const snap = (over: Partial<TollSnapshot> = {}): TollSnapshot => ({
  date: "2026-10-02",
  confirmed: 8245,
  suspected: 347,
  deaths: 3984,
  recovered: 2140,
  source: "Wikipedia infobox",
  sourceUrl: "https://example.org",
  ...over,
});

describe("mergeTimeline", () => {
  it("converts snapshots to points with a short UTC label and note", () => {
    const out = mergeTimeline([], [snap()]);
    expect(out).toEqual([
      {
        date: "2026-10-02",
        label: "Oct 2",
        confirmed: 8245,
        suspected: 347,
        deaths: 3984,
        recovered: 2140,
        note: "Auto-tracked daily by GitHub Action",
        source: "Wikipedia infobox",
      },
    ]);
  });

  it("omits suspected/recovered when null", () => {
    const [p] = mergeTimeline([], [snap({ suspected: null, recovered: null })]);
    expect("suspected" in p).toBe(false);
    expect("recovered" in p).toBe(false);
  });

  it("sorts ascending even if curated input is unordered", () => {
    const out = mergeTimeline(curated, [snap()]);
    expect(out.map((p) => p.date)).toEqual(["2026-09-19", "2026-09-27", "2026-10-02"]);
  });

  it("lets curated points win on a date collision", () => {
    const out = mergeTimeline(curated, [snap({ date: "2026-09-27", deaths: 9999 })]);
    expect(out).toHaveLength(2);
    expect(out.find((p) => p.date === "2026-09-27")?.deaths).toBe(3924);
  });

  it("uses UTC for labels at month boundaries", () => {
    const [p] = mergeTimeline([], [snap({ date: "2026-10-01" })]);
    expect(p.label).toBe("Oct 1");
  });

  it("does not mutate its inputs", () => {
    const c = [...curated];
    mergeTimeline(c, [snap()]);
    expect(c).toEqual(curated);
  });
});

describe("latestDate", () => {
  it("returns the most recent date", () => {
    expect(latestDate(mergeTimeline(curated, [snap()]))).toBe("2026-10-02");
  });
  it("returns null for an empty timeline", () => {
    expect(latestDate([])).toBeNull();
  });
});
