import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import MonitoringTable from "@/components/MonitoringTable";
import StatStrip from "@/components/StatStrip";
import OutbreakPage, { generateMetadata } from "@/app/outbreaks/[slug]/page";
import { getOutbreak, isArchivedRecord, listOutbreaks } from "@/data/outbreaks";
import { getTollData } from "@/lib/toll";
import { mergeTimeline } from "@/lib/timeline";

// The map is client-only (MapLibre needs WebGL); its loader is not under test here.
vi.mock("@/components/MapLoader", () => ({ default: () => <div data-testid="map" /> }));

const SLUG = "measles-us-2026";
const us = getOutbreak(SLUG)!;
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

/** Every string in the definition, so wording checks cannot miss a field. */
function allText(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allText);
  if (value && typeof value === "object") return Object.values(value).flatMap(allText);
  return [];
}

describe("measles-us-2026 definition", () => {
  it("is registered, active and read from the CDC page", () => {
    expect(us).toBeDefined();
    expect(listOutbreaks().map((o) => o.slug)).toContain(SLUG);
    expect(us.disease).toBe("Measles");
    expect(us.status).toBe("active");
    expect(us.source.kind).toBe("official-report");
    expect(us.source.ref).toMatch(/CDC/);
    expect(isArchivedRecord(us)).toBe(false);
    expect(us.dataset.isBasedOn).toBe("https://www.cdc.gov/measles/data-research/index.html");
  });

  it("names the event, not the site, and keeps the search title short", () => {
    expect(us.title).toBe("US Measles Outbreaks 2026");
    expect(us.title).not.toMatch(/outbreak files/i);
    expect(us.seoTitle.length).toBeLessThanOrEqual(60);
    // "measles tracker" is the head search phrase; no "by state" (the table lists only states with 100+ cases).
    expect(us.seoTitle.toLowerCase().startsWith("us measles tracker")).toBe(true);
    expect(us.seoTitle.toLowerCase()).not.toMatch(/by state/);
  });

  it("reports no Rt, no delay adjustment, a weekly cadence, and says why in one sentence", () => {
    expect(us.metrics.serialInterval).toBeNull();
    expect(us.metrics.caseToDeathDays).toBeNull();
    expect(us.metrics.reportingCadence).toBe("weekly");
    expect(Object.keys(us.metrics).sort()).toEqual(["caseToDeathDays", "reportingCadence", "rtNote", "serialInterval"]);
    const note = us.metrics.rtNote!;
    expect(note).toMatch(/serial interval/i);
    expect(note.match(/[.!?](\s|$)/g)).toHaveLength(1);
  });

  it("leaves the curated timeline empty so the weekly snapshots supply the series", () => {
    expect(us.casesTimeline).toEqual([]);
  });

  it("has one national row and the 11 largest states as sub-rows, each sourced and dated", () => {
    const national = us.monitoringData.filter((r) => !r.parentIso);
    const states = us.monitoringData.filter((r) => r.parentIso);
    expect(national.map((r) => r.iso)).toEqual(["US"]);
    expect(states).toHaveLength(11);
    for (const row of us.monitoringData) {
      expect(row.source.trim(), row.country).not.toBe("");
      expect(row.asOf, row.country).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(row.asOf))).toBe(false);
    }
    for (const s of states) {
      expect(s.parentIso).toBe("US");
      expect(s.confirmed, s.country).toBeGreaterThanOrEqual(100);
      expect(s.deaths, s.country).toBe(0); // the CDC publishes no deaths by state
      expect(s.deathsUnreported, s.country).toBe(true);
      expect(s.detail, s.country).toMatch(/no deaths by state/);
    }
    const counts = states.map((s) => s.confirmed);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    expect(states[0]).toMatchObject({ country: "Pennsylvania", confirmed: 1411, status: "Epicentre" });
    // The states are part of the 4,834 cases reported by jurisdictions, never more than the national total.
    expect(counts.reduce((a, b) => a + b, 0)).toBe(4131);
    expect(counts.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(national[0].confirmed);
  });

  it("agrees with the latest stored CDC reading whenever the table is as recent as it", () => {
    const latest = getTollData(SLUG).snapshots.at(-1);
    expect(latest).toBeDefined();
    const row = us.monitoringData.find((r) => r.iso === "US")!;
    // The table is hand-kept and dated; a newer weekly snapshot is expected to run ahead of it.
    if (latest!.date === row.asOf) {
      expect(row.confirmed).toBe(latest!.confirmed);
      expect(row.deaths).toBe(latest!.deaths);
    } else {
      expect(Date.parse(latest!.date)).toBeGreaterThan(Date.parse(row.asOf));
    }
  });

  it("marks each table state on the map, in the contiguous United States, with no death-labelled bubbles", () => {
    const states = us.monitoringData.filter((r) => r.parentIso).map((r) => r.country);
    expect(us.spreadStops.map((s) => s.name)).toEqual(states);
    expect(new Set(us.spreadStops.map((s) => s.name)).size).toBe(us.spreadStops.length);
    for (const stop of us.spreadStops) {
      expect(stop.date).toBe("2026-10-29");
      expect(stop.coords[0], stop.name).toBeGreaterThan(-125);
      expect(stop.coords[0], stop.name).toBeLessThan(-66);
      expect(stop.coords[1], stop.name).toBeGreaterThan(24);
      expect(stop.coords[1], stop.name).toBeLessThan(50);
      expect(stop.event).toMatch(/confirmed cases in 2026 by 29 Oct \(CDC\)/);
    }
    expect(us.caseLocations).toEqual([]);
  });

  it("carries no Ebola, Bangladesh or Greece wording", () => {
    for (const text of allText(us)) {
      expect(text).not.toMatch(/ebola|bundibugyo|\bDRC\b|congo|bangladesh|greece|health[- ]worker|contacts? (under|followed)/i);
    }
  });

  it("only links to https pages", () => {
    expect(us.links.length).toBeGreaterThan(3);
    for (const link of us.links) expect(link.href).toMatch(/^https:\/\//);
  });

  it("states the deaths caveat wherever the headline could mislead, without hard-coding a stale gap", () => {
    // The 29 Oct table row keeps its dated figures (page 3, data file 5).
    expect(us.monitoringData[0].detail).toMatch(/shows 3 deaths[^.]*\.[^.]*data file[^.]*lists 5/);
    // Fields shown beside the live figures describe the gap without numbers; the numbers come
    // from toll.json (deathsDataFile) through deathsGapNote.
    expect(us.description).toMatch(/headline is the figure the CDC’s page displays[^.]*data file behind the page lists more/);
    expect(us.description).not.toMatch(/shows \d+[^.]*data file lists \d+/);
    expect(us.summary.spreadNote).not.toMatch(/data file/);
    expect(us.summary.deathsQualifier).toMatch(/CDC/);
    expect(us.monitoringData[0]).toMatchObject({ confirmed: 4852, deaths: 3, asOf: "2026-10-29" });
  });
});

describe("measles-us-2026 rendering", () => {
  it("renders the stat strip on an empty timeline with the measles wording", () => {
    render(<StatStrip timeline={[]} summary={us.summary} />);
    expect(screen.getByText("Hospitalized")).toBeInTheDocument();
    expect(screen.getByText("511")).toBeInTheDocument();
    expect(screen.queryByText("Contacts followed up")).not.toBeInTheDocument();
    expect(screen.getByText(us.summary.spreadStatus)).toBeInTheDocument();
    expect(screen.getByText(us.summary.spreadNote!)).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("renders the stat strip from the weekly snapshot, labelling the death count as the CDC's", () => {
    const timeline = mergeTimeline(us.casesTimeline, [
      {
        date: "2026-10-29",
        confirmed: 4852,
        suspected: null,
        deaths: 3,
        recovered: null,
        source: "CDC measles cases and outbreaks page",
        sourceUrl: "https://www.cdc.gov/measles/data-research/index.html",
      },
    ]);
    render(<StatStrip timeline={timeline} summary={us.summary} />);
    expect(screen.getByText("4,852")).toBeInTheDocument();
    expect(screen.getByText(/Deaths in the CDC’s count/)).toBeInTheDocument();
    expect(screen.getByText("0.1%")).toBeInTheDocument();
  });

  it("renders the table with the states under the national row and expands the deaths statement", () => {
    render(
      <MonitoringTable
        monitoringData={us.monitoringData}
        candidates={[]}
        headingId="table"
        title="By state"
        sources={us.tableSources}
      />,
    );
    expect(screen.getByRole("heading", { name: "By state" })).toBeInTheDocument();
    const penn = screen.getByTestId("row-US-PA");
    expect(penn).toHaveAttribute("data-province", "true");
    expect(within(penn).getByText("1,411")).toBeInTheDocument();
    // No deaths are published by state, so no case fatality either (0.0% would read as "no deaths").
    expect(within(penn).queryByText("0.0%")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("row-US")).getByText("0.1%")).toBeInTheDocument();
    expect(within(screen.getByTestId("row-US")).getByText("4,852")).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId("row-US")).getByRole("button", { name: /United States/ }));
    expect(screen.getByText(/The CDC.s page shows 3 deaths in 2026/)).toBeInTheDocument();
  });
});

describe("/outbreaks/measles-us-2026", () => {
  it("renders as a live dashboard with the deaths caveat and no other outbreak's wording", async () => {
    const { container } = render(await OutbreakPage(params(SLUG)));
    expect(screen.getByRole("heading", { level: 1, name: us.title })).toBeInTheDocument();
    expect(container.querySelector(".live-dot")).not.toBeNull();
    expect(screen.queryByTestId("archived-record")).not.toBeInTheDocument();
    expect(screen.getByText(us.summary.spreadNote!)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/ebola|bundibugyo|\bDRC\b|congo|bangladesh/i);
  });

  it("shows both CDC death counts under the deaths figure, from the latest stored reading", async () => {
    const latest = getTollData(SLUG).snapshots.at(-1)!;
    render(await OutbreakPage(params(SLUG)));
    const note = screen.queryByTestId("deaths-note");
    if (latest.deathsDataFile == null || latest.deathsDataFile === latest.deaths) {
      expect(note).not.toBeInTheDocument();
    } else {
      expect(note).toHaveTextContent(
        `${latest.deathsDataFile.toLocaleString("en-US")} in the CDC’s data file; the page shows ${latest.deaths!.toLocaleString("en-US")}`,
      );
    }
  });

  it("builds metadata with the latest toll in the description", async () => {
    const meta = await generateMetadata(params(SLUG));
    expect(meta.title).toEqual({ absolute: us.seoTitle });
    // The description carries the newest stored toll. The updater adds a reading every week, so
    // read the expected figure from toll.json instead of hard-coding one that goes stale.
    const latest = getTollData(SLUG).snapshots.at(-1)!;
    expect(meta.description as string).toContain(latest.confirmed!.toLocaleString("en-US"));
  });
});
