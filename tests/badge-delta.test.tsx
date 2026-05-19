import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BadgeDelta, deltaTone } from "@/components/ui/badge-delta";

describe("BadgeDelta", () => {
  it("renders a positive delta with a + sign", () => {
    render(<BadgeDelta delta={4} />);
    expect(screen.getByText("+4")).toBeInTheDocument();
  });

  it("renders a negative delta with a minus sign", () => {
    render(<BadgeDelta delta={-2} />);
    expect(screen.getByText("−2")).toBeInTheDocument();
  });

  it("renders zero without a sign", () => {
    render(<BadgeDelta delta={0} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("respects a custom formatter", () => {
    render(<BadgeDelta delta={3} format={(d) => `${d} new`} />);
    expect(screen.getByText("3 new")).toBeInTheDocument();
  });
});

describe("deltaTone", () => {
  it("returns increase for positive numbers", () => {
    expect(deltaTone(1)).toBe("increase");
  });
  it("returns decrease for negative numbers", () => {
    expect(deltaTone(-1)).toBe("decrease");
  });
  it("returns unchanged for zero", () => {
    expect(deltaTone(0)).toBe("unchanged");
  });
});
