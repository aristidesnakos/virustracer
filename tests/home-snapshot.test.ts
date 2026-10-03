import { describe, expect, it } from "vitest";
import { getDefaultOutbreak, type OutbreakDefinition, type OutbreakStatus } from "@/data/outbreaks";
import {
  STATUS_ORDER,
  buildSnapshot,
  compareSnapshots,
  describeHome,
  groupByStatus,
  type OutbreakSnapshot,
} from "@/lib/home-snapshot";
import type { TollData, TollSnapshot } from "@/lib/toll";

const base = getDefaultOutbreak();

function outbreak(overrides: Partial<OutbreakDefinition>): OutbreakDefinition {
  return { ...base, casesTimeline: [], ...overrides };
}

/** `days` daily readings ending 2026-10-02, adding `perDay` cases and `deathsPerDay` deaths each day. */
function toll(days: number, perDay: number, deathsPerDay: number): TollData {
  const end = Date.UTC(2026, 9, 2);
  const snapshots: TollSnapshot[] = Array.from({ length: days }, (_, i) => {
    const n = i + 1;
    return {
      date: new Date(end - (days - n) * 86_400_000).toISOString().slice(0, 10),
      confirmed: 1000 + n * perDay,
      suspected: null,
      deaths: 100 + n * deathsPerDay,
      recovered: null,
      source: "Wikipedia infobox (cites WHO)",
      sourceUrl: `https://en.wikipedia.org/w/index.php?oldid=${n}`,
    };
  });
  return { lastChecked: "2026-10-03T08:00:00.000Z", snapshots };
}

const EMPTY: TollData = { lastChecked: "", snapshots: [] };

function snap(slug: string, status: OutbreakStatus, data: TollData, title = slug): OutbreakSnapshot {
  return buildSnapshot(outbreak({ slug, status, title }), data);
}

describe("buildSnapshot", () => {
  it("measures the last 7 days from the daily readings and links the newest revision", () => {
    const s = snap("a", "active", toll(30, 10, 2));
    expect(s.incidence?.confirmed.last7).toBe(70);
    expect(s.incidence?.deaths.last7).toBe(14);
    expect(s.windowEnd).toBe("2026-10-02");
    expect(s.weekly.length).toBeGreaterThanOrEqual(2);
    expect(s.trend.verdict).toBe("plateau");
    expect(s.figures).toEqual({ date: "2026-10-02", confirmed: 1300, deaths: 160 });
    expect(s.source).toEqual({
      label: "Wikipedia infobox (cites WHO)",
      url: "https://en.wikipedia.org/w/index.php?oldid=30",
      checked: "2026-10-03T08:00:00.000Z",
      automated: true,
    });
  });

  it("says there is not enough data rather than guessing a trend", () => {
    const s = snap("thin", "active", toll(5, 10, 1));
    expect(s.incidence).toBeNull();
    expect(s.windowEnd).toBeNull();
    expect(s.weekly).toEqual([]);
    expect(s.trend.verdict).toBe("unknown");
    expect(s.trend.label).toBe("Not enough data");
  });

  it("shows a hand-curated outbreak's last verified date instead of a check time", () => {
    const o = outbreak({ slug: "m", source: { kind: "manual", ref: "WHO DON" } });
    const s = buildSnapshot(o, EMPTY);
    expect(s.figures).toBeNull();
    expect(s.source).toEqual({
      label: "Curated by hand",
      url: null,
      checked: base.summary.lastReviewed,
      automated: false,
    });
  });
});

describe("ranking", () => {
  it("orders by status group, then 7-day deaths, then 7-day cases, then title", () => {
    const items = [
      snap("over", "over", toll(30, 100, 50)),
      snap("waning", "waning", toll(30, 100, 50)),
      snap("watch", "watch", EMPTY),
      snap("active-few-deaths", "active", toll(30, 100, 1)),
      snap("active-thin", "active", toll(5, 100, 50)),
      snap("active-many-deaths", "active", toll(30, 10, 5)),
      snap("active-tie-fewer-cases", "active", toll(30, 20, 1)),
    ];
    expect([...items].sort(compareSnapshots).map((s) => s.outbreak.slug)).toEqual([
      "active-many-deaths",
      "active-few-deaths",
      "active-tie-fewer-cases",
      "active-thin",
      "watch",
      "waning",
      "over",
    ]);
  });

  it("breaks a full tie alphabetically by title", () => {
    const a = snap("x", "active", EMPTY, "Alpha");
    const b = snap("y", "active", EMPTY, "Beta");
    expect([b, a].sort(compareSnapshots).map((s) => s.outbreak.title)).toEqual(["Alpha", "Beta"]);
  });

  it("groups ranked outbreaks by status in the published order and drops empty groups", () => {
    const groups = groupByStatus([
      snap("w", "waning", EMPTY),
      snap("a2", "active", toll(30, 10, 1)),
      snap("a1", "active", toll(30, 10, 3)),
    ]);
    expect(groups.map((g) => g.status)).toEqual(["active", "waning"]);
    expect(groups[0].heading).toBe("Active");
    expect(groups[0].items.map((s) => s.outbreak.slug)).toEqual(["a1", "a2"]);
    expect(STATUS_ORDER).toEqual(["active", "watch", "waning", "over"]);
  });
});

describe("describeHome", () => {
  it("names the top outbreaks with their numbers", () => {
    const d = describeHome([snap("a", "active", toll(30, 10, 2))], "fallback");
    expect(d).toBe(`Live outbreak figures with sources. ${base.shortName}: 160 deaths, 1,300 cases.`);
  });

  it("skips outbreaks that are over or have no figures, and falls back when none are left", () => {
    expect(describeHome([snap("o", "over", toll(30, 10, 2)), snap("e", "active", EMPTY)], "fallback")).toBe(
      "fallback",
    );
  });

  it("stays within the length search engines show", () => {
    const many = Array.from({ length: 3 }, (_, i) =>
      buildSnapshot(outbreak({ slug: `s${i}`, shortName: `A very long outbreak name number ${i}` }), toll(30, 1000, 500)),
    );
    expect(describeHome(many, "fallback").length).toBeLessThanOrEqual(160);
  });
});
