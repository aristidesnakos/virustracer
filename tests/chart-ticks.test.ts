import { describe, it, expect } from "vitest";
import { evenTicks } from "@/lib/chart-ticks";

describe("evenTicks", () => {
  it("spaces ticks evenly from min to max", () => {
    expect(evenTicks(0, 30, 4)).toEqual([0, 10, 20, 30]);
    expect(evenTicks(0, 10, 4)).toEqual([0, 3, 7, 10]); // rounded to whole milliseconds
  });

  it("gives one tick for a single reading, not the same tick repeated", () => {
    // A new outbreak starts with one reading, so the axis runs from a date to itself.
    expect(evenTicks(1793232000000, 1793232000000, 5)).toEqual([1793232000000]);
  });

  it("never repeats a value, even when the span is shorter than the tick count", () => {
    const ticks = evenTicks(0, 2, 5);
    expect(new Set(ticks).size).toBe(ticks.length);
    expect(ticks[0]).toBe(0);
    expect(ticks.at(-1)).toBe(2);
  });

  it("copes with fewer than two ticks requested", () => {
    expect(evenTicks(5, 9, 1)).toEqual([5]);
  });
});
