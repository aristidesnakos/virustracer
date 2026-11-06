import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import MonitoringTable from "@/components/MonitoringTable";
import StatStrip from "@/components/StatStrip";
import OutbreakPage, { generateMetadata } from "@/app/outbreaks/[slug]/page";
import { getOutbreak, isArchivedRecord, listOutbreaks } from "@/data/outbreaks";
import { getTollData, type TollSnapshot } from "@/lib/toll";
import { mergeTimeline } from "@/lib/timeline";
import { computeMetrics } from "@/lib/metrics";
import { tollToCsv } from "@/lib/api";
import { buildSnapshot, compareSnapshots } from "@/lib/home-snapshot";
import { latestFigures } from "@/lib/seo";

// The map is client-only (MapLibre needs WebGL); its loader is not under test here.
vi.mock("@/components/MapLoader", () => ({ default: () => <div data-testid="map" /> }));

const SLUG = "candida-auris-us-2026";
const auris = getOutbreak(SLUG)!;
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

function allText(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allText);
  if (value && typeof value === "object") return Object.values(value).flatMap(allText);
  return [];
}

const snap = (date: string, confirmed: number, screening: number): TollSnapshot => ({
  date,
  confirmed,
  suspected: null,
  deaths: null,
  recovered: null,
  screening,
  source: "CDC NNDSS weekly table (Candida auris, clinical)",
  sourceUrl: "https://data.cdc.gov/resource/x9gk-5huc.json",
});

describe("candida-auris-us-2026 definition", () => {
  it("is registered, active and read from CDC's NNDSS table", () => {
    expect(listOutbreaks().map((o) => o.slug)).toContain(SLUG);
    expect(auris.status).toBe("active");
    expect(auris.source.kind).toBe("official-report");
    expect(auris.source.ref).toMatch(/NNDSS/);
    expect(isArchivedRecord(auris)).toBe(false);
    expect(auris.dataset.isBasedOn).toBe("https://data.cdc.gov/NNDSS/NNDSS-Weekly-Data/x9gk-5huc");
    expect(auris.seoTitle.length).toBeLessThanOrEqual(60);
  });

  it("reports no Rt, no delay adjustment, a weekly cadence, and says why", () => {
    expect(auris.metrics).toMatchObject({ serialInterval: null, caseToDeathDays: null, reportingCadence: "weekly" });
    expect(auris.metrics.rtNote).toMatch(/serial interval/);
    expect(auris.metrics.rtShortNote).toBeTruthy();
  });

  it("says deaths are not collected and labels the counts as clinical and screening", () => {
    expect(auris.summary.deathsNotReported).toMatch(/NNDSS/);
    expect(auris.summary.casesLabel).toBe("Clinical cases");
    expect(auris.summary.screeningLabel).toBe("Screening cases");
    expect(auris.description).toMatch(/screening cases/i);
    expect(auris.description).toMatch(/provisional/);
    expect(auris.casesTimeline).toEqual([]);
  });

  it("has one national row and the states with 100+ clinical cases, every row without deaths", () => {
    const national = auris.monitoringData.filter((r) => !r.parentIso);
    const states = auris.monitoringData.filter((r) => r.parentIso);
    expect(national.map((r) => r.iso)).toEqual(["US"]);
    expect(states).toHaveLength(15);
    for (const row of auris.monitoringData) {
      expect(row.deathsUnreported, row.country).toBe(true);
      expect(row.deaths, row.country).toBe(0);
      expect(row.asOf, row.country).toBe("2026-10-31");
      expect(row.source, row.country).toMatch(/NNDSS/);
    }
    const counts = states.map((s) => s.confirmed);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    expect(counts.every((c) => c >= 100)).toBe(true);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(6226);
    expect(national[0].confirmed).toBe(6572);
  });

  it("agrees with the stored NNDSS reading for the week the table was copied from", () => {
    const stored = getTollData(SLUG).snapshots.find((s) => s.date === "2026-10-31");
    expect(stored).toMatchObject({ confirmed: 6572, screening: 7202, deaths: null, mmwrWeek: 43 });
    const row = auris.monitoringData.find((r) => r.iso === "US")!;
    expect(row.confirmed).toBe(stored!.confirmed);
  });

  it("stores no week whose cumulative count fell (weeks 17 and 18 of 2026)", () => {
    const toll = getTollData(SLUG);
    const weeks = toll.snapshots.map((s) => s.mmwrWeek);
    expect(weeks).not.toContain(17);
    expect(weeks).not.toContain(18);
    for (let i = 1; i < toll.snapshots.length; i++) {
      expect(toll.snapshots[i].confirmed).toBeGreaterThanOrEqual(toll.snapshots[i - 1].confirmed);
      expect(toll.snapshots[i].suspected).toBeNull();
      expect(toll.snapshots[i].deaths).toBeNull();
    }
  });

  it("marks each table state on the map with no death-labelled bubbles", () => {
    expect(auris.spreadStops.map((s) => s.name)).toEqual(auris.monitoringData.filter((r) => r.parentIso).map((r) => r.country));
    expect(auris.caseLocations).toEqual([]);
  });

  it("carries no other outbreak's wording and only https links", () => {
    for (const text of allText(auris)) expect(text).not.toMatch(/ebola|measles|bangladesh|greece|contacts? (under|followed)/i);
    for (const link of auris.links) expect(link.href).toMatch(/^https:\/\//);
  });
});

describe("an outbreak with no deaths", () => {
  const snapshots = [snap("2026-10-17", 6211, 6762), snap("2026-10-24", 6379, 6997), snap("2026-10-31", 6572, 7202)];

  it("keeps deaths and the fatality ratios null in the metrics", () => {
    const m = computeMetrics(snapshots, auris.metrics);
    expect(m.status).toBe("ok");
    expect(m.deathsReported).toBe(false);
    expect(m.incidence?.confirmed.last7).toBe(193);
    expect(m.incidence?.deaths).toBeNull();
    expect(m.cfr).toEqual({ naive: null, delayAdjusted: null, resolved: null });
    expect(m.weekly.every((w) => w.newDeaths === null)).toBe(true);
    expect(m.daily.every((d) => d.deaths === null && d.newDeaths === null)).toBe(true);
    expect(m.rt).toBeNull();
  });

  it("shows clinical and screening cases on the stat strip and says deaths are not reported", () => {
    render(<StatStrip timeline={mergeTimeline([], snapshots)} summary={auris.summary} />);
    expect(screen.getByText("Clinical cases")).toBeInTheDocument();
    expect(screen.getByText("6,572")).toBeInTheDocument();
    expect(screen.getByText("Screening cases")).toBeInTheDocument();
    expect(screen.getByText("7,202")).toBeInTheDocument();
    expect(within(screen.getByTestId("deaths-not-reported")).getByText("Not reported")).toBeInTheDocument();
    expect(screen.queryByText("Suspected")).not.toBeInTheDocument();
    expect(screen.queryByText("0.0%")).not.toBeInTheDocument();
  });

  it("gives no death figure to the headline helpers, and ranks by cases", () => {
    const figures = latestFigures(mergeTimeline([], snapshots));
    expect(figures).toEqual({ date: "2026-10-31", confirmed: 6572, deaths: null, screening: 7202 });
    const s = buildSnapshot(auris, { lastChecked: "2026-11-06T00:00:00Z", snapshots });
    expect(s.incidence?.deaths).toBeNull();
    // Counts as zero new deaths: after an outbreak with deaths this week, before one with no week measured.
    const withDeaths = { ...s, outbreak: { ...s.outbreak, title: "B" }, incidence: { ...s.incidence!, deaths: { last7: 1, prev7: 0, changePct: null } } };
    const thin = { ...s, outbreak: { ...s.outbreak, title: "A" }, incidence: null };
    expect([thin, s, withDeaths].sort(compareSnapshots).map((x) => x.outbreak.title)).toEqual(["B", s.outbreak.title, "A"]);
  });

  it("appends screening and the MMWR week to the CSV, after the usual columns", () => {
    const csv = tollToCsv([{ ...snapshots[2], mmwrYear: 2026, mmwrWeek: 43 }]);
    const [header, row] = csv.trim().split("\r\n");
    expect(header).toBe("date,confirmed,suspected,deaths,recovered,revid,revision_timestamp,source_url,screening,mmwr_year,mmwr_week");
    expect(row.startsWith("2026-10-31,6572,,,,,,")).toBe(true);
    expect(row.endsWith(",7202,2026,43")).toBe(true);
    // Other outbreaks keep the exact columns they had.
    expect(tollToCsv([{ ...snapshots[2], screening: undefined, deaths: 1 }]).split("\r\n")[0]).toBe(
      "date,confirmed,suspected,deaths,recovered,revid,revision_timestamp,source_url",
    );
  });

  it("shows no deaths or fatality in the table total", () => {
    render(
      <MonitoringTable monitoringData={auris.monitoringData} headingId="t" showCfr={false} casesLabel="Clinical" sources={auris.tableSources} />,
    );
    expect(screen.getByRole("columnheader", { name: "Clinical" })).toBeInTheDocument();
    const foot = screen.getByText("Total").closest("tr")!;
    expect(within(foot).getByText("6,572")).toBeInTheDocument();
    expect(within(foot).getByText("—")).toBeInTheDocument();
  });
});

describe("/outbreaks/candida-auris-us-2026", () => {
  it("renders as a live dashboard without deaths", async () => {
    const { container } = render(await OutbreakPage(params(SLUG)));
    expect(screen.getByRole("heading", { level: 1, name: auris.title })).toBeInTheDocument();
    expect(container.querySelector(".live-dot")).not.toBeNull();
    expect(screen.getByTestId("deaths-not-reported")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/ebola|bundibugyo|measles/i);
  });

  it("builds metadata with clinical cases and no death count in the description", async () => {
    const meta = await generateMetadata(params(SLUG));
    expect(meta.title).toEqual({ absolute: auris.seoTitle });
    expect(meta.description as string).toMatch(/clinical cases/);
    expect(meta.description as string).not.toMatch(/deaths/);
  });
});
