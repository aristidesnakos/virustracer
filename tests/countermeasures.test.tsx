import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import CountermeasuresPanel from "@/components/CountermeasuresPanel";
import OutbreakPage from "@/app/outbreaks/[slug]/page";
import MethodologyPage from "@/app/methodology/page";
import { getCountermeasures, listCountermeasures } from "@/data/countermeasures";
import { listOutbreaks } from "@/data/outbreaks";
import {
  ALLOWED_MILESTONES,
  STALE_AFTER_DAYS,
  TIER_LABEL,
  isStale,
  validateCountermeasures,
  type CountermeasureFile,
} from "@/lib/countermeasures";

vi.mock("@/components/MapLoader", () => ({ default: () => <div data-testid="map" /> }));

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });
const bundibugyo = getCountermeasures("ebolavirus-bundibugyo")!;
const clone = (f: CountermeasureFile): CountermeasureFile => JSON.parse(JSON.stringify(f));
const lineCount = (f: CountermeasureFile) => f.products.reduce((n, p) => n + p.events.length, 0);
const dayAfterCheck = new Date(`${bundibugyo.checked}T12:00:00Z`);

describe("curated countermeasure files", () => {
  it("every file follows the vocabulary, tier and sourcing rules", () => {
    expect(listCountermeasures().length).toBeGreaterThan(0);
    for (const f of listCountermeasures()) expect(validateCountermeasures(f)).toEqual([]);
  });

  it("every outbreak that names a file points at one that exists, for the same pathogen", () => {
    const linked = listOutbreaks().filter((o) => o.countermeasures);
    expect(linked.map((o) => o.slug)).toContain("ebola-bundibugyo-2026");
    for (const o of linked) {
      const file = getCountermeasures(o.countermeasures);
      expect(file, o.slug).toBeDefined();
      expect(file!.name).toBe(o.pathogen);
    }
  });

  it("rejects a statement that claims an approval", () => {
    const f = clone(bundibugyo);
    const e = f.products.find((p) => p.events.some((x) => x.tier === "E"))!.events.find((x) => x.tier === "E")!;
    e.milestone = "authorised";
    expect(validateCountermeasures(f).join("\n")).toMatch(/tier E may not claim authorised/);
    expect(ALLOWED_MILESTONES.E).not.toContain("authorised");
  });

  it("rejects promotional words, unsourced pages, plain http and lines dated after the check", () => {
    const f = clone(bundibugyo);
    const p = f.products[0];
    p.note = "A promising candidate.";
    p.events[0].text = "Shown to be effective.";
    const web = f.products.flatMap((x) => x.events).find((x) => x.source.kind === "web")!;
    web.expect = {};
    web.source.url = web.source.url.replace("https:", "http:");
    f.products[1].events[0].date = "2999-01-01";
    const problems = validateCountermeasures(f).join("\n");
    expect(problems).toMatch(/banned word: .*promising/);
    expect(problems).toMatch(/banned word in text: Shown to be effective/);
    expect(problems).toMatch(/needs at least one quote/);
    expect(problems).toMatch(/must be https/);
    expect(problems).toMatch(/dated after the file was checked/);
  });

  it("ties registry lines to their record page and registry status", () => {
    const f = clone(bundibugyo);
    const reg = f.products.flatMap((x) => x.events).find((x) => x.source.kind === "clinicaltrials.gov")!;
    reg.source.url = "https://clinicaltrials.gov/search?term=ebola";
    reg.expect = { ...reg.expect, registryStatus: "MAYBE" };
    reg.tier = "E";
    const problems = validateCountermeasures(f).join("\n");
    expect(problems).toMatch(/url must be the study page/);
    expect(problems).toMatch(/needs a known registryStatus/);
    expect(problems).toMatch(/a registry record is tier B/);
  });

  it("flags a file as stale after the set number of days", () => {
    expect(isStale("2026-11-09", new Date("2026-11-10T00:00:00Z"))).toBe(false);
    const late = new Date(Date.parse("2026-11-09T00:00:00Z") + (STALE_AFTER_DAYS + 1) * 86_400_000);
    expect(isStale("2026-11-09", late)).toBe(true);
    expect(isStale("not a date")).toBe(true);
  });
});

describe("CountermeasuresPanel", () => {
  it("shows the statement, one labelled and sourced line per event, and the disclaimer", () => {
    render(<CountermeasuresPanel data={bundibugyo} headingId="cm" now={dayAfterCheck} />);
    expect(screen.getByRole("heading", { name: "Vaccines & treatments" })).toBeInTheDocument();
    expect(screen.getByTestId("countermeasures-statement")).toHaveTextContent(bundibugyo.statement.text);
    expect(screen.getByTestId("countermeasures-statement")).toHaveTextContent(`“${bundibugyo.statement.quote}”`);

    const lines = screen.getAllByTestId("countermeasure-line");
    expect(lines).toHaveLength(lineCount(bundibugyo));
    const events = bundibugyo.products.flatMap((p) => p.events);
    lines.forEach((line, i) => {
      const e = events[i];
      expect(within(line).getByTestId("tier-badge")).toHaveTextContent(TIER_LABEL[e.tier]);
      const link = within(line).getByRole("link");
      expect(link).toHaveAttribute("href", e.source.url);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    const disclaimer = screen.getByTestId("countermeasures-disclaimer");
    expect(disclaimer).toHaveTextContent("does not mean a product works or is safe");
    expect(disclaimer).toHaveTextContent("not medical advice");
    expect(within(disclaimer).getByRole("link", { name: "How this box is kept" })).toHaveAttribute(
      "href",
      "/methodology#countermeasures",
    );
    expect(screen.getByTestId("countermeasures-checked")).not.toHaveTextContent("may be out of date");
  });

  it("says when a product is licensed only for another species, and shows the registry status", () => {
    render(<CountermeasuresPanel data={bundibugyo} headingId="cm" now={dayAfterCheck} />);
    expect(within(screen.getByTestId("countermeasure-ervebo")).getByText("Licensed for Zaire ebolavirus only")).toBeInTheDocument();
    const tumaini = screen.getByTestId("countermeasure-tumaini");
    expect(tumaini).toHaveTextContent("Registry status: Not yet recruiting");
    // The statement that the trial started is shown beside the lagging registry, not instead of it.
    expect(tumaini).toHaveTextContent("CEPI says the first participant has been vaccinated.");
  });

  it("warns when the lines have not been checked for a while", () => {
    const late = new Date(Date.parse(`${bundibugyo.checked}T00:00:00Z`) + (STALE_AFTER_DAYS + 2) * 86_400_000);
    render(<CountermeasuresPanel data={bundibugyo} headingId="cm" now={late} />);
    expect(screen.getByTestId("countermeasures-checked")).toHaveTextContent("may be out of date");
  });
});

describe("outbreak pages", () => {
  it("show the box only for an outbreak with a curated file", async () => {
    for (const o of listOutbreaks()) {
      const { container, unmount } = render(await OutbreakPage(params(o.slug)));
      const box = container.querySelector("#vaccines-and-treatments");
      if (o.countermeasures) expect(box, o.slug).not.toBeNull();
      else expect(box, o.slug).toBeNull();
      unmount();
    }
  });

  it("are explained on /methodology#countermeasures, with the tier rule from the code", () => {
    render(<MethodologyPage />);
    const section = screen.getByRole("heading", { level: 2, name: "Vaccines & treatments" }).closest("section")!;
    expect(section).toHaveAttribute("aria-labelledby", "countermeasures");
    for (const label of Object.values(TIER_LABEL)) expect(within(section).getByText(label)).toBeInTheDocument();
    expect(section).toHaveTextContent(`after ${STALE_AFTER_DAYS} days`);
  });
});
