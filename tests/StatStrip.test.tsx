import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatStrip from "@/components/StatStrip";
import { summary } from "@/data/outbreak";

describe("StatStrip", () => {
  it("renders one tile per tracked metric with the current value", () => {
    render(<StatStrip />);
    expect(screen.getByText(/confirmed cases/i)).toBeInTheDocument();
    expect(screen.getByText(/deaths/i)).toBeInTheDocument();
    expect(screen.getByText(/probable/i)).toBeInTheDocument();
    expect(screen.getByText(/under monitoring/i)).toBeInTheDocument();
    expect(screen.getByText(/ship status/i)).toBeInTheDocument();
  });

  it("surfaces the summary monitored total and ship status from outbreak data", () => {
    render(<StatStrip />);
    expect(screen.getByText(String(summary.totalMonitored))).toBeInTheDocument();
    expect(screen.getByText(summary.shipStatus)).toBeInTheDocument();
  });

  it("labels each delta badge for accessibility", () => {
    render(<StatStrip />);
    expect(
      screen.getByLabelText(/confirmed cases change in last 7 days/i),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/deaths change in last 7 days/i),
    ).toBeInTheDocument();
  });
});
