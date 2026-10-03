import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import OutbreakCard from "@/components/OutbreakCard";
import { getDefaultOutbreak } from "@/data/outbreaks";
import { outbreakPath } from "@/lib/outbreak-paths";

const outbreak = getDefaultOutbreak();

describe("OutbreakCard", () => {
  it("shows the title, status, figures and as-of date", () => {
    render(
      <OutbreakCard
        outbreak={outbreak}
        figures={{ date: "2026-09-27", confirmed: 8123, deaths: 4321 }}
      />,
    );
    expect(screen.getByRole("heading", { name: outbreak.title })).toBeInTheDocument();
    expect(screen.getByTestId("outbreak-status")).toHaveTextContent("Active");
    expect(screen.getByText("4,321")).toBeInTheDocument();
    expect(screen.getByText("8,123")).toBeInTheDocument();
    expect(screen.getByText("As of 27 Sept 2026")).toBeInTheDocument();
  });

  it("links to the outbreak dashboard and the data page", () => {
    render(<OutbreakCard outbreak={outbreak} figures={null} />);
    const dashboardLinks = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href") === outbreakPath(outbreak.slug));
    expect(dashboardLinks).toHaveLength(2);
    expect(screen.getByRole("link", { name: /data & api/i })).toHaveAttribute("href", "/data");
  });

  it("shows dashes instead of numbers when there are no figures", () => {
    render(<OutbreakCard outbreak={outbreak} figures={null} />);
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getByText("No figures yet")).toBeInTheDocument();
  });

  it("shows a dash for a figure the source does not report", () => {
    render(
      <OutbreakCard
        outbreak={outbreak}
        figures={{ date: "2026-09-27", confirmed: null, deaths: 12 }}
      />,
    );
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(1);
  });
});
