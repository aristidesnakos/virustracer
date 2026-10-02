import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatStrip from "@/components/StatStrip";
import { summary, type CaseDataPoint } from "@/data/outbreak";

const timeline: CaseDataPoint[] = [
  { date: "2026-09-01", label: "Sep 1", confirmed: 5000, deaths: 2500, suspected: 100, source: "test" },
  { date: "2026-09-10", label: "Sep 10", confirmed: 6000, deaths: 3000, suspected: 120, source: "test" },
  { date: "2026-09-20", label: "Sep 20", confirmed: 8000, deaths: 3900, suspected: 150, source: "test" },
  { date: "2026-09-27", label: "Sep 27", deaths: 4321, source: "test" },
];

describe("StatStrip", () => {
  it("renders every tile label", () => {
    render(<StatStrip timeline={timeline} />);
    for (const label of [
      "Deaths",
      "Confirmed cases",
      "Suspected",
      "Case fatality",
      "Contacts followed up",
      "Spread",
    ]) {
      expect(screen.getByText(label, { exact: true })).toBeInTheDocument();
    }
  });

  it("shows the latest death toll with thousands separators", () => {
    render(<StatStrip timeline={timeline} />);
    expect(screen.getByText("4,321")).toBeInTheDocument();
    expect(screen.getByText("8,000")).toBeInTheDocument();
  });

  it("computes case fatality from the last point that has both deaths and confirmed", () => {
    render(<StatStrip timeline={timeline} />);
    // 3900 / 8000 = 48.75% -> 48.8%
    expect(screen.getByText("48.8%")).toBeInTheDocument();
  });

  it("surfaces contacts followed up and spread from outbreak data", () => {
    render(<StatStrip timeline={timeline} />);
    expect(
      screen.getByText(summary.contactsUnderFollowUp.toLocaleString("en-US")),
    ).toBeInTheDocument();
    expect(screen.getByText(summary.spreadStatus)).toBeInTheDocument();
    expect(
      screen.getByText(
        `${summary.provincesAffected} provinces · ${summary.healthZonesAffected} health zones · ${summary.countriesAffected} countries`,
      ),
    ).toBeInTheDocument();
  });

  it("labels delta badges for accessibility", () => {
    render(<StatStrip timeline={timeline} />);
    const deaths = screen.getByLabelText(/^deaths change in last 7 days$/i);
    expect(deaths).toBeInTheDocument();
    // 4321 now vs 3900 on Sep 20 (7 days earlier) -> +421
    expect(deaths.textContent).toContain("+421");
    expect(
      screen.getByLabelText(/confirmed cases change in last 7 days/i),
    ).toBeInTheDocument();
  });

  it("renders a dash for a series with no data", () => {
    const noSuspected = timeline.map(({ suspected: _s, ...rest }) => rest);
    render(<StatStrip timeline={noSuspected} />);
    const tile = screen.getByText("Suspected", { exact: true }).closest("[data-slot]");
    expect(tile?.parentElement?.textContent).toContain("—");
  });
});
