import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import CasesChart from "@/components/CasesChart";
import MonitoringTable from "@/components/MonitoringTable";
import StatStrip from "@/components/StatStrip";
import OutbreakPage, { generateMetadata } from "@/app/outbreaks/[slug]/page";
import { getOutbreak, isArchivedRecord, listOutbreaks, DEFAULT_OUTBREAK_SLUG } from "@/data/outbreaks";
import { mergeTimeline } from "@/lib/timeline";

// The map is client-only (MapLibre needs WebGL); its loader is not under test here.
vi.mock("@/components/MapLoader", () => ({ default: () => <div data-testid="map" /> }));

const SLUG = "measles-bangladesh-2026";
const measles = getOutbreak(SLUG)!;
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

/** Every string in the definition, so wording checks cannot miss a field. */
function allText(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allText);
  if (value && typeof value === "object") return Object.values(value).flatMap(allText);
  return [];
}

describe("measles-bangladesh-2026 definition", () => {
  it("is registered, active and read from the Wikipedia infobox", () => {
    expect(measles).toBeDefined();
    expect(listOutbreaks().map((o) => o.slug)).toContain(SLUG);
    expect(DEFAULT_OUTBREAK_SLUG).toBe("ebola-bundibugyo-2026");
    expect(measles.slug).toBe(SLUG);
    expect(measles.disease).toBe("Measles");
    expect(measles.status).toBe("active");
    expect(measles.source).toEqual({ kind: "wikipedia-infobox", ref: "2026_Bangladesh_measles_outbreak" });
    expect(isArchivedRecord(measles)).toBe(false);
    expect(measles.dataset.isBasedOn).toBe("https://en.wikipedia.org/wiki/2026_Bangladesh_measles_outbreak");
  });

  it("names the event, not the site, and keeps the search title short", () => {
    expect(measles.title).toBe("Bangladesh Measles Outbreak 2026");
    expect(measles.title).not.toMatch(/outbreak files/i);
    expect(measles.seoTitle.length).toBeLessThanOrEqual(60);
    expect(measles.seoTitle.toLowerCase().startsWith("measles outbreak")).toBe(true);
  });

  it("reports no Rt, no delay adjustment, and says why in one sentence", () => {
    expect(measles.metrics.serialInterval).toBeNull();
    expect(measles.metrics.caseToDeathDays).toBeNull();
    expect(Object.keys(measles.metrics).sort()).toEqual(["caseToDeathDays", "rtNote", "serialInterval"]);
    const note = measles.metrics.rtNote!;
    expect(note).toMatch(/serial interval/i);
    expect(note).toMatch(/testing capacity/i);
    expect(note.match(/[.!?](\s|$)/g)).toHaveLength(1);
  });

  it("leaves the curated timeline empty so the daily snapshots supply the series", () => {
    expect(measles.casesTimeline).toEqual([]);
  });

  it("gives every table row and map marker a source and an as-of date", () => {
    expect(measles.monitoringData.length).toBeGreaterThan(0);
    for (const row of measles.monitoringData) {
      expect(row.source.trim(), row.country).not.toBe("");
      expect(row.asOf, row.country).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(row.asOf))).toBe(false);
    }
    for (const loc of measles.caseLocations) expect(loc.asOf, loc.country).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const national = measles.monitoringData.filter((r) => !r.parentIso);
    expect(national.map((r) => r.iso)).toEqual(["BD"]);
  });

  it("has dated, in-country hotspot stops and no case bubbles that would hide the suspected-case deaths", () => {
    expect(measles.spreadStops.length).toBeGreaterThan(0);
    for (const stop of measles.spreadStops) {
      expect(stop.date).toBe("2026-04-04");
      expect(stop.coords[0]).toBeGreaterThan(88);
      expect(stop.coords[0]).toBeLessThan(93);
      expect(stop.coords[1]).toBeGreaterThan(20);
      expect(stop.coords[1]).toBeLessThan(27);
    }
    expect(new Set(measles.spreadStops.map((s) => s.name)).size).toBe(measles.spreadStops.length);
    expect(measles.caseLocations).toEqual([]);
    expect(measles.map?.center).toEqual([90.3, 23.7]);
  });

  it("carries no Ebola-specific wording", () => {
    for (const text of allText(measles)) {
      expect(text).not.toMatch(/ebola|bundibugyo|\bDRC\b|congo|insp|health[- ]worker|contacts? (under|followed)|province/i);
    }
  });

  it("only links to https pages", () => {
    expect(measles.links.length).toBeGreaterThan(3);
    for (const link of measles.links) expect(link.href).toMatch(/^https:\/\//);
  });

  it("states the 909 deaths among suspected cases wherever the headline death count could mislead", () => {
    const wanted = /909 more among suspected cases \(1,009 in all\)/;
    expect(measles.description).toMatch(wanted);
    expect(measles.monitoringData[0].detail).toMatch(wanted);
    expect(measles.summary.spreadStatus).toMatch(/909/);
    expect(measles.summary.spreadNote).toMatch(/1,009 deaths in all/);
    expect(measles.summary.spreadNote).toMatch(/909 among suspected cases/);
    expect(measles.summary.spreadNote).toMatch(/10 Sep 2026/);
  });

  it("keeps the table row on the headline definition: deaths among confirmed cases", () => {
    const row = measles.monitoringData[0];
    expect(row.confirmed).toBe(19933);
    expect(row.deaths).toBe(100);
    expect(row.asOf).toBe("2026-09-10");
    expect(row.detail).toMatch(/100 deaths among confirmed cases/);
  });
});

describe("measles-bangladesh-2026 rendering with no curated timeline", () => {
  it("merges to an empty timeline when toll.json has no snapshots", () => {
    expect(mergeTimeline(measles.casesTimeline, [])).toEqual([]);
  });

  it("renders the stat strip on an empty timeline with the measles wording", () => {
    render(<StatStrip timeline={[]} summary={measles.summary} />);
    expect(screen.getByText("Children vaccinated")).toBeInTheDocument();
    expect(screen.getByText("18,400,000")).toBeInTheDocument();
    expect(screen.queryByText("Contacts followed up")).not.toBeInTheDocument();
    expect(screen.queryByText(/provinces|health zones/i)).not.toBeInTheDocument();
    expect(screen.getByText(measles.summary.spreadStatus)).toBeInTheDocument();
    expect(screen.getByText(measles.summary.spreadNote!)).toBeInTheDocument();
    expect(screen.getByText("deaths / confirmed")).toBeInTheDocument();
    // No readings yet: dashes, not zeros.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("renders the stat strip from a snapshot-only timeline", () => {
    const timeline = mergeTimeline(measles.casesTimeline, [
      {
        date: "2026-09-10",
        confirmed: 19933,
        suspected: 168745,
        deaths: 100,
        recovered: null,
        source: "Wikipedia infobox (cites DGHS Bangladesh)",
        sourceUrl: "https://en.wikipedia.org/w/index.php?oldid=1",
        revid: 1,
        revisionTimestamp: "2026-09-10T00:00:00Z",
      },
    ]);
    render(<StatStrip timeline={timeline} summary={measles.summary} />);
    expect(screen.getByText("19,933")).toBeInTheDocument();
    expect(screen.getByText("168,745")).toBeInTheDocument();
    expect(screen.getByText("0.5%")).toBeInTheDocument();
  });

  it("renders the chart on an empty timeline", () => {
    render(<CasesChart timeline={[]} headingId="chart" reference={measles.chartReference} />);
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
  });

  it("renders the table with its one national row and expands the 909-death statement", () => {
    render(
      <MonitoringTable
        monitoringData={measles.monitoringData}
        candidates={[]}
        headingId="table"
        title="By country"
        sources={measles.tableSources}
      />,
    );
    expect(screen.getByRole("heading", { name: "By country" })).toBeInTheDocument();
    expect(screen.getByText("Bangladesh")).toBeInTheDocument();
    expect(screen.getAllByText("19,933").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Bangladesh/ }));
    expect(screen.getByText(/909 more among suspected cases \(1,009 in all\)/)).toBeInTheDocument();
  });
});

describe("/outbreaks/measles-bangladesh-2026", () => {
  it("renders as a live dashboard without Ebola wording and with the 909 statement", async () => {
    const { container } = render(await OutbreakPage(params(SLUG)));
    expect(screen.getByRole("heading", { level: 1, name: measles.title })).toBeInTheDocument();
    expect(container.querySelector(".live-dot")).not.toBeNull();
    expect(screen.queryByTestId("archived-record")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Where cases are reported" })).toBeInTheDocument();
    expect(screen.getByText(measles.summary.spreadNote!)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Is it still growing?" })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/ebola|bundibugyo|\bDRC\b|congo/i);
  });

  it("builds metadata that is valid whether or not toll.json has readings", async () => {
    const meta = await generateMetadata(params(SLUG));
    expect(meta.title).toEqual({ absolute: measles.seoTitle });
    expect(typeof meta.description).toBe("string");
    expect((meta.description as string).length).toBeGreaterThan(40);
  });
});
