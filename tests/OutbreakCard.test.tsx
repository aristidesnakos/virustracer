import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import OutbreakCard from "@/components/OutbreakCard";
import { getDefaultOutbreak } from "@/data/outbreaks";
import type { OutbreakSnapshot } from "@/lib/home-snapshot";
import { outbreakPath } from "@/lib/outbreak-paths";

const outbreak = getDefaultOutbreak();

function snapshot(overrides: Partial<OutbreakSnapshot> = {}): OutbreakSnapshot {
  return {
    outbreak,
    figures: { date: "2026-09-27", confirmed: 8123, deaths: 4321 },
    trend: { verdict: "plateau", label: "Plateau", headline: "No clear rise or fall." },
    incidence: {
      confirmed: { last7: 404, prev7: 416, changePct: -2.9 },
      deaths: { last7: 120, prev7: 130, changePct: -7.7 },
    },
    windowEnd: "2026-10-02",
    weekly: [
      { periodEnd: "2026-09-25", newConfirmed: 416, newDeaths: 130 },
      { periodEnd: "2026-10-02", newConfirmed: 404, newDeaths: 120 },
    ],
    source: {
      label: "Wikipedia infobox (cites WHO)",
      url: "https://en.wikipedia.org/w/index.php?oldid=1",
      checked: "2026-10-03T08:00:00.000Z",
      automated: true,
    },
    ...overrides,
  };
}

const NO_DATA = {
  figures: null,
  incidence: null,
  windowEnd: null,
  weekly: [],
  trend: { verdict: "unknown" as const, label: "Not enough data", headline: "No readings yet." },
};

describe("OutbreakCard", () => {
  it("shows the title, status, figures and as-of date", () => {
    render(<OutbreakCard snapshot={snapshot()} />);
    expect(screen.getByRole("heading", { name: outbreak.title })).toBeInTheDocument();
    expect(screen.getByTestId("outbreak-status")).toHaveTextContent("Active");
    expect(screen.getByText("4,321")).toBeInTheDocument();
    expect(screen.getByText("8,123")).toBeInTheDocument();
    expect(screen.getByText(/As of 27 Sept 2026/)).toBeInTheDocument();
  });

  it("shows the 7-day trend badge, counts, change and a weekly sparkline", () => {
    render(<OutbreakCard snapshot={snapshot()} />);
    expect(screen.getByTestId("trend-badge")).toHaveTextContent("Plateau");
    expect(screen.getByText(/in the 7 days to 2 Oct/)).toHaveTextContent(
      "404 new cases and 120 deaths in the 7 days to 2 Oct (cases −3% vs the week before)",
    );
    expect(screen.getByRole("img", { name: /New confirmed cases per week, 2 weeks to 2 Oct/ })).toBeInTheDocument();
  });

  it("links the source revision and says when it was checked", () => {
    render(<OutbreakCard snapshot={snapshot()} />);
    const link = screen.getByRole("link", { name: "Wikipedia infobox" });
    expect(link).toHaveAttribute("href", "https://en.wikipedia.org/w/index.php?oldid=1");
    // Who the source cites is methodology detail: kept out of the card, available on hover.
    expect(link).toHaveAttribute("title", "Wikipedia infobox (cites WHO)");
    expect(screen.getByText(/checked 3 Oct 2026/)).toBeInTheDocument();
  });

  it("puts the dates and the source on separate lines", () => {
    render(<OutbreakCard snapshot={snapshot()} />);
    expect(screen.getByText(/As of 27 Sept 2026/)).toHaveTextContent("As of 27 Sept 2026 · checked 3 Oct 2026");
    expect(screen.getByText(/^Source:/)).toHaveTextContent("Source: Wikipedia infobox");
  });

  it("leaves the visible kicker to the places and gives the status to screen readers only", () => {
    render(<OutbreakCard snapshot={snapshot()} />);
    expect(screen.getByTestId("outbreak-status")).toHaveClass("sr-only");
    expect(screen.getByTestId("outbreak-status").parentElement).toHaveTextContent(outbreak.places);
  });

  it("shows a curated outbreak's last verified date", () => {
    render(
      <OutbreakCard
        snapshot={snapshot({
          source: { label: "Curated by hand", url: null, checked: "2026-09-30", automated: false },
        })}
      />,
    );
    expect(screen.getByText(/last verified 30 Sept 2026/)).toBeInTheDocument();
    expect(screen.getByText(/^Source: Curated by hand/)).toBeInTheDocument();
  });

  it("links to the outbreak dashboard and the data page", () => {
    render(<OutbreakCard snapshot={snapshot()} />);
    const dashboardLinks = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href") === outbreakPath(outbreak.slug));
    expect(dashboardLinks).toHaveLength(2);
    expect(screen.getByRole("link", { name: /data & api/i })).toHaveAttribute("href", "/data");
  });

  it("shows dashes, no sparkline and the reason when there is no data", () => {
    render(<OutbreakCard snapshot={snapshot(NO_DATA)} />);
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getByText(/No figures yet/)).toBeInTheDocument();
    expect(screen.getByTestId("trend-badge")).toHaveTextContent("Not enough data");
    expect(screen.getByText("No readings yet.")).toBeInTheDocument();
    expect(screen.queryByTestId("weekly-sparkline")).not.toBeInTheDocument();
  });

  it("shows a dash for a figure the source does not report", () => {
    render(
      <OutbreakCard snapshot={snapshot({ figures: { date: "2026-09-27", confirmed: null, deaths: 12 } })} />,
    );
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(1);
  });

  it("renders the title at the requested heading level", () => {
    render(<OutbreakCard snapshot={snapshot()} headingLevel={4} />);
    expect(screen.getByRole("heading", { level: 4, name: outbreak.title })).toBeInTheDocument();
  });
});
