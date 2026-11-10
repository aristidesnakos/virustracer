import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import OutbreakPage from "@/app/outbreaks/[slug]/page";
import HomePage from "@/app/page";
import { listOutbreaks } from "@/data/outbreaks";
import { getTollData } from "@/lib/toll";
import { mergeTimeline } from "@/lib/timeline";
import { answerSentence, latestFigures } from "@/lib/seo";

// On-page search wording (docs/seo-keywords.md): headings, the answer sentence, cross-links, breadcrumb.
vi.mock("@/components/MapLoader", () => ({ default: () => <div data-testid="map" /> }));

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe("answerSentence", () => {
  const fig = { date: "2026-11-05", confirmed: 462, deaths: 53 };
  it("fills date, cases and deaths with the outbreak's own labels", () => {
    expect(
      answerSentence(fig, { answerTemplate: "As of {date}, X had {cases} and {deaths}.", summary: { deathsQualifier: "among confirmed cases" } }),
    ).toBe("As of 5 November 2026, X had 462 confirmed cases and 53 deaths among confirmed cases.");
    expect(answerSentence({ ...fig, deaths: 1 }, { answerTemplate: "{deaths}" })).toBe("1 death");
  });
  it("is left out rather than guessed when a figure is missing", () => {
    expect(answerSentence({ ...fig, deaths: null }, { answerTemplate: "{cases} and {deaths}" })).toBeNull();
    expect(answerSentence(fig, {})).toBeNull();
    expect(answerSentence(null, { answerTemplate: "{cases}" })).toBeNull();
  });
});

describe("every registered outbreak's on-page wording", () => {
  for (const o of listOutbreaks()) {
    it(`${o.slug}: has an answer sentence from its current figures and honest headings`, () => {
      const figures = latestFigures(mergeTimeline(o.casesTimeline, getTollData(o.slug).snapshots));
      const answer = answerSentence(figures, o);
      expect(answer, o.slug).toBeTruthy();
      expect(answer).not.toMatch(/[{}]/);
      // A source that reports no deaths says so, and never prints a death count.
      if (o.summary.deathsNotReported) expect(answer).toMatch(/does not report deaths/);
      // "By state" only with the threshold that limits the table's rows.
      if (/by state/i.test(o.headings?.table ?? "")) expect(o.headings?.table).toMatch(/100\+/);
      for (const h of Object.values(o.headings ?? {})) expect(h).not.toMatch(/\b(live|today)\b/i);
    });
  }
});

describe("outbreak page", () => {
  it("shows the search headings, the answer sentence, links to every other outbreak and a breadcrumb", async () => {
    const o = listOutbreaks().find((x) => x.slug === "ebola-bundibugyo-2026")!;
    const others = listOutbreaks().filter((x) => x.slug !== o.slug);
    const { container } = render(await OutbreakPage(params(o.slug)));
    expect(screen.getByRole("heading", { name: "Ebola death toll and confirmed cases" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ebola outbreak map" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ebola cases by country and province" })).toBeInTheDocument();
    expect(screen.getByTestId("answer-sentence").textContent).toMatch(
      /^As of \d+ \w+ 2026, the 2026 Ebola outbreak in DR Congo and Uganda had [\d,]+ deaths and [\d,]+ confirmed cases\.$/,
    );
    const nav = screen.getByRole("navigation", { name: "Other outbreaks we track" });
    for (const other of others) expect(within(nav).getByRole("link", { name: other.title })).toHaveAttribute("href", `/outbreaks/${other.slug}`);
    expect(within(nav).queryByRole("link", { name: o.title })).toBeNull();
    const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!);
    const crumbs = ld["@graph"].find((n: { "@type": string }) => n["@type"] === "BreadcrumbList");
    expect(crumbs.itemListElement.map((i: { name: string }) => i.name)).toEqual(["Outbreak Files", o.title]);
  });
});

describe("home page", () => {
  it("names current disease outbreaks in its visible intro and section heading, without 'live'", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 2, name: "Current disease outbreaks we track" })).toBeInTheDocument();
    const intro = screen.getByText(/^Current disease outbreaks in 2026, with death tolls, cases and maps/);
    expect(intro.textContent).not.toMatch(/\blive\b/i);
  });
});
