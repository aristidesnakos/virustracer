import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import MonitoringTable from "@/components/MonitoringTable";
import { getDefaultOutbreak } from "@/data/outbreaks";

const { monitoringData } = getDefaultOutbreak();

describe("MonitoringTable", () => {
  it("renders the new heading and columns", () => {
    render(<MonitoringTable monitoringData={monitoringData} />);
    expect(screen.getByText(/by country & province/i)).toBeInTheDocument();
    for (const col of ["Region", "Confirmed", "Deaths", "CFR", "Status"]) {
      expect(screen.getByRole("columnheader", { name: col })).toBeInTheDocument();
    }
  });

  it("renders province rows indented with a marker", () => {
    render(<MonitoringTable monitoringData={monitoringData} />);
    const provinces = monitoringData.filter((r) => r.parentIso);
    expect(provinces.length).toBeGreaterThan(0);
    for (const p of provinces) {
      const row = screen.getByTestId(`row-${p.iso}`);
      expect(row).toHaveAttribute("data-province", "true");
      expect(row.textContent).toContain("↳");
    }
    const country = screen.getByTestId("row-CD");
    expect(country).not.toHaveAttribute("data-province");
    expect(country.textContent).not.toContain("↳");
  });

  it("excludes province rows from the Total", () => {
    render(<MonitoringTable monitoringData={monitoringData} />);
    const total = screen.getByText("Total").closest("tr")!;
    const cells = within(total).getAllByRole("cell");
    const countries = monitoringData.filter((r) => !r.parentIso);
    const confirmed = countries.reduce((s, r) => s + r.confirmed, 0);
    const deaths = countries.reduce((s, r) => s + r.deaths, 0);
    expect(confirmed).toBe(8245);
    expect(deaths).toBe(3984);
    expect(cells[1].textContent).toBe("8,245");
    expect(cells[2].textContent).toBe("3,984");
    expect(cells[3].textContent).toBe("48.3%");
  });

  it("shows CFR per row and a dash when there are no confirmed cases", () => {
    render(<MonitoringTable monitoringData={monitoringData} />);
    const drc = screen.getByTestId("row-CD");
    expect(drc.textContent).toContain("48.4%");
    const germany = screen.getByTestId("row-DE");
    expect(within(germany).getAllByRole("cell")[3].textContent).toBe("—");
  });

  it("does not list a CD candidate as unverified (provinces cover base country)", () => {
    render(
      <MonitoringTable
        monitoringData={monitoringData}
        candidates={[
          {
            id: "1",
            country: "DR Congo",
            iso: "CD",
            flag: "🇨🇩",
            casesMentioned: 10,
            deathsMentioned: 1,
            context: "x",
            sourceTitle: "t",
            sourceUrl: "https://example.com",
            sourceName: "n",
            date: "2026-09-01",
            extractedAt: "2026-09-01",
          },
        ]}
      />,
    );
    expect(screen.queryByText(/unconfirmed/i)).not.toBeInTheDocument();
  });
});
