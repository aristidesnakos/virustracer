import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { getDefaultOutbreak, getOutbreak } from "@/data/outbreaks";
import OutbreakPage, { generateMetadata } from "@/app/outbreaks/[slug]/page";
import HomePage from "@/app/page";
import OutbreakCard from "@/components/OutbreakCard";
import { GET as slugToll } from "@/app/api/v1/outbreaks/[slug]/toll/route";
import { GET as slugMetrics } from "@/app/api/v1/outbreaks/[slug]/metrics/route";
import { GET as slugSignals } from "@/app/api/v1/outbreaks/[slug]/signals/route";
import { GET as listGet } from "@/app/api/v1/outbreaks/route";
import { shareCardFooter } from "@/lib/seo";
import { buildSnapshot } from "@/lib/home-snapshot";
import { getTollData } from "@/lib/toll";

// The map is client-only (MapLibre needs WebGL); its loader is not under test here.
vi.mock("@/components/MapLoader", () => ({ default: () => <div data-testid="map" /> }));

const SLUG = "hantavirus-mv-hondius-2026";
const hanta = getOutbreak(SLUG)!;
const ebola = getDefaultOutbreak();
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe("/outbreaks/hantavirus-mv-hondius-2026", () => {
  it("reads as an archived record, with its correction and nothing live", async () => {
    const { container } = render(await OutbreakPage(params(SLUG)));
    expect(screen.getByTestId("archived-record")).toHaveTextContent("Archived record · last verified 3 October 2026");
    expect(screen.getByTestId("correction")).toHaveTextContent(
      "Corrected 3 Oct 2026: figures shown in May counted a US case later ruled out and missed cases in France, Switzerland and Spain.",
    );
    expect(container.querySelector(".live-dot, .animate-pulse")).toBeNull();
    for (const live of ["Toll as of", "Last checked", "News feed", "Is it still growing?", /Get alerts/i, /WHO PHEIC/]) {
      expect(screen.queryByText(live)).not.toBeInTheDocument();
    }
    expect(screen.getByText("Record covers")).toBeInTheDocument();
    expect(screen.getByText("1 Apr – 2 Jul 2026")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "About this record" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "News coverage at the time" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Route & reported cases" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "By country" })).toBeInTheDocument();
    // The frozen news record is read and listed.
    expect(screen.getByText(/130 articles/)).toBeInTheDocument();
    // Deaths include a probable case the rows don't count, so no per-country CFR.
    expect(screen.queryByRole("columnheader", { name: "CFR" })).not.toBeInTheDocument();
  });

  it("does not offer the empty toll endpoint as a Dataset download", async () => {
    const { container } = render(await OutbreakPage(params(SLUG)));
    const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!);
    const dataset = ld["@graph"].find((n: { "@type": string }) => n["@type"] === "Dataset");
    expect(dataset).not.toHaveProperty("distribution");
    expect(dataset.temporalCoverage).toBe("2026-04-11/2026-07-02");
  });

  it("describes the final figures without promising daily updates", async () => {
    const meta = await generateMetadata(params(SLUG));
    expect(meta.description).toContain("3 deaths and 12 confirmed cases as of 2 July 2026");
    expect(meta.description).toContain("Archived record");
    expect(meta.description).not.toMatch(/updated daily/i);
  });
});

describe("the Ebola page keeps its live presentation", () => {
  it("has the live dot, fetch dates, trend panel and PHEIC-era wording", async () => {
    const { container } = render(await OutbreakPage(params(ebola.slug)));
    expect(container.querySelector(".live-dot")).not.toBeNull();
    expect(screen.getByText("Toll as of")).toBeInTheDocument();
    expect(screen.getByText("Is it still growing?")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Where cases are reported" })).toBeInTheDocument();
    expect(screen.queryByTestId("archived-record")).not.toBeInTheDocument();
    expect(screen.queryByTestId("correction")).not.toBeInTheDocument();
    const meta = await generateMetadata(params(ebola.slug));
    expect(meta.description).toContain("Updated daily");
  });
});

describe("home page", () => {
  it("lists the live outbreak first and the finished one under 'Declared over'", () => {
    render(<HomePage />);
    const live = screen.getByRole("heading", { name: ebola.title }).closest("section")!;
    const past = screen.getByRole("heading", { name: hanta.title }).closest("section")!;
    expect(past).not.toBe(live);
    expect(within(past).getByRole("heading", { level: 3, name: /Declared over/ })).toBeInTheDocument();
    expect(live.compareDocumentPosition(past) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the finished outbreak's final figures from its curated timeline, marked last verified", () => {
    render(<OutbreakCard snapshot={buildSnapshot(hanta, getTollData(SLUG))} />);
    expect(screen.getByTestId("outbreak-status")).toHaveTextContent("Declared over");
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/As of 2 Jul 2026 · last verified 3 Oct 2026/)).toBeInTheDocument();
    expect(screen.getByText("Outbreak over: these are the final figures.")).toBeInTheDocument();
    expect(screen.queryByText(/Not enough data|No readings yet/)).not.toBeInTheDocument();
  });
});

describe("share card footer", () => {
  it("keeps the Ebola wording", () => {
    expect(shareCardFooter(ebola, { date: "2026-10-02", confirmed: 1, deaths: 1 })).toBe(
      "Unofficial dashboard · figures from WHO and INSP DRC via Wikipedia · as of 2026-10-02",
    );
  });

  it("says 'Archived record' and the last-verified date for the finished outbreak", () => {
    expect(shareCardFooter(hanta, { date: "2026-07-02", confirmed: 12, deaths: 3 })).toBe(
      "Archived record · hand-curated from WHO, ECDC and national health agencies · last verified 3 October 2026",
    );
  });
});

describe("API for a hand-curated outbreak with no toll.json", () => {
  const req = (path: string) => new Request(`http://localhost${path}`);

  it("toll answers 200 with no readings and says why", async () => {
    for (const path of ["/x", "/x?format=csv"]) {
      const res = await slugToll(req(path), params(SLUG));
      expect(res.status).toBe(200);
    }
    const json = JSON.parse(await (await slugToll(req("/x"), params(SLUG))).text());
    expect(json.snapshots).toEqual([]);
    expect(json.latest).toBeNull();
    expect(json.meta.note).toMatch(/curated by hand/);
    expect(json.meta.attribution).not.toMatch(/Wikipedia article's infobox/);
  });

  it("metrics answer 200 with insufficient_data, and signals with an empty list", async () => {
    const m = JSON.parse(await (await slugMetrics(req("/x"), params(SLUG))).text());
    expect(m.status).toBe("insufficient_data");
    expect(m.meta.note).toMatch(/curated by hand/);
    const s = await slugSignals(req("/x"), params(SLUG));
    expect(s.status).toBe(200);
    expect(JSON.parse(await s.text()).signals).toEqual([]);
  });

  it("the outbreak list gives its final figures from the curated timeline", async () => {
    const list = JSON.parse(await listGet().text());
    const entry = list.outbreaks.find((o: { slug: string }) => o.slug === SLUG);
    expect(entry).toMatchObject({ status: "over", latest: { date: "2026-07-02", confirmed: 12, deaths: 3 } });
  });

  it("adds no note for an automated outbreak", async () => {
    const json = JSON.parse(await (await slugToll(req("/x"), params(ebola.slug))).text());
    expect(json.meta).not.toHaveProperty("note");
  });
});
