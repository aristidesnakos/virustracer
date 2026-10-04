import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import FeedUpdates, { coverageSpan } from "@/components/FeedUpdates";
import StatStrip from "@/components/StatStrip";
import { getOutbreak } from "@/data/outbreaks";
import { getLiveData, type LiveData } from "@/lib/live-data";

const SLUG = "hantavirus-mv-hondius-2026";
const hanta = getOutbreak(SLUG)!;
const raw = JSON.parse(
  readFileSync(resolve(process.cwd(), "data", "outbreaks", SLUG, "live.json"), "utf-8"),
) as LiveData;

describe("hantavirus news record (data/outbreaks/hantavirus-mv-hondius-2026/live.json)", () => {
  const items = raw.recentItems;

  it("has the live.json shape the site reads", () => {
    expect(getLiveData(SLUG)).toEqual(raw);
    expect(typeof raw.lastFetched).toBe("string");
    expect(items.length).toBeGreaterThan(20);
    for (const it of items) {
      expect(Object.keys(it).sort()).toEqual(["date", "id", "source", "summary", "title", "url"]);
      expect(it.url).toMatch(/^https?:\/\//);
      expect(Number.isNaN(Date.parse(it.date))).toBe(false);
    }
    expect(raw.processedIds).toEqual(items.map((i) => i.id));
  });

  it("is sorted newest first", () => {
    for (let i = 1; i < items.length; i++) {
      expect(Date.parse(items[i - 1].date)).toBeGreaterThanOrEqual(Date.parse(items[i].date));
    }
  });

  it("has no duplicate ids or links", () => {
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(new Set(items.map((i) => i.url)).size).toBe(items.length);
  });

  it("only holds hantavirus coverage", () => {
    for (const it of items) expect(`${it.title} ${it.summary}`, it.title).toMatch(/hanta|hondius|andes virus/i);
  });
});

describe("archived record rendering", () => {
  it("lists the news as a dated archive, not the latest updates", () => {
    render(<FeedUpdates items={raw.recentItems} lastFetched={raw.lastFetched} archived headingId="feed" />);
    expect(screen.getByRole("heading", { name: "News coverage at the time" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Archived news coverage, newest first" })).toBeInTheDocument();
    expect(screen.queryByText(/Fetched/)).not.toBeInTheDocument();
    expect(screen.queryByText(/refreshes automatically/)).not.toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${raw.recentItems.length} articles`))).toBeInTheDocument();
  });

  it("labels the span of the coverage", () => {
    expect(coverageSpan([{ date: "2026-05-03" }, { date: "2026-06-23" }])).toBe("May – Jun 2026");
    expect(coverageSpan([{ date: "2026-05-03" }])).toBe("May 2026");
    expect(coverageSpan([{ date: "2025-12-03" }, { date: "2026-01-02" }])).toBe("Dec 2025 – Jan 2026");
    expect(coverageSpan([])).toBeNull();
  });

  it("shows the record's own monitoring and spread wording in the stat strip", () => {
    render(<StatStrip timeline={hanta.casesTimeline} summary={hanta.summary} />);
    expect(screen.getByText("People monitored")).toBeInTheDocument();
    expect(screen.getByText("115")).toBeInTheDocument();
    expect(screen.getByText(hanta.summary.spreadNote!)).toBeInTheDocument();
    expect(screen.queryByText(/provinces/)).not.toBeInTheDocument();
    // One death is a probable case, so the basis is all 13 cases, matching WHO (23%).
    expect(screen.getByText("23.1%")).toBeInTheDocument();
    expect(screen.getByText("deaths / all cases (confirmed + probable)")).toBeInTheDocument();
  });
});
