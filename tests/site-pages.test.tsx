import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MAX_JUMP_RATIO, STALE_PREV_DAYS } from "../scripts/lib/toll.mjs";
import { SITE_PAGES } from "../scripts/lib/site.mjs";
import HomePage, { generateMetadata as homeMetadata } from "@/app/page";
import MethodologyPage, { metadata as methodologyMetadata } from "@/app/methodology/page";
import AboutPage, { metadata as aboutMetadata } from "@/app/about/page";
import { listOutbreaks } from "@/data/outbreaks";
import { STATUS_HEADING, STATUS_ORDER } from "@/lib/home-snapshot";
import { CORRECTIONS_URL, SANITY_CHECKS } from "@/lib/methodology";
import { outbreakPath } from "@/lib/outbreak-paths";

describe("home page", () => {
  it("shows one card per registered outbreak under its status group", () => {
    render(<HomePage />);
    for (const o of listOutbreaks()) {
      const group = screen.getByTestId(`status-group-${o.status}`);
      expect(within(group).getByRole("heading", { level: 4, name: o.title })).toBeInTheDocument();
    }
    // Finished outbreaks with no daily readings show their final figures instead of a trend badge.
    expect(screen.getAllByTestId("trend-badge")).toHaveLength(listOutbreaks().filter((o) => o.status !== "over").length);
    expect(screen.getByRole("link", { name: "How we rank and count" })).toHaveAttribute(
      "href",
      "/methodology#ranking",
    );
  });

  it("links the trust pages from the footer", () => {
    render(<HomePage />);
    const nav = screen.getByRole("navigation", { name: "Site" });
    for (const href of ["/methodology", "/about", "/data"]) {
      expect(within(nav).getAllByRole("link").some((a) => a.getAttribute("href") === href)).toBe(true);
    }
  });

  it("lists the outbreaks in its structured data, in ranked order", () => {
    const { container } = render(<HomePage />);
    const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!);
    const list = ld["@graph"].find((n: { "@type": string }) => n["@type"] === "CollectionPage").mainEntity;
    expect(list.numberOfItems).toBe(listOutbreaks().length);
    expect(list.itemListElement[0].url).toMatch(new RegExp(`${outbreakPath("")}`));
  });

  it("has its own canonical and a description built from the data", () => {
    const m = homeMetadata();
    expect(m.alternates?.canonical).toBe("/");
    expect(m.description).toMatch(/^Live outbreak figures with sources\./);
    expect((m.description as string).length).toBeLessThanOrEqual(160);
    expect(m.openGraph).toMatchObject({ siteName: "Outbreak Files", type: "website", url: "/" });
  });
});

describe("/methodology", () => {
  it("quotes the same sanity-check limits the scripts enforce", () => {
    expect(SANITY_CHECKS.maxJumpPct).toBe(MAX_JUMP_RATIO * 100);
    expect(SANITY_CHECKS.stalePrevDays).toBe(STALE_PREV_DAYS);
  });

  it("publishes the ranking rule with the status groups in the order the home page uses", () => {
    render(<MethodologyPage />);
    const section = screen.getByRole("heading", { name: "How the home page orders outbreaks" }).parentElement!;
    const rows = within(section.querySelector("table")!).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(STATUS_ORDER.length);
    STATUS_ORDER.forEach((s, i) => expect(rows[i]).toHaveTextContent(STATUS_HEADING[s]));
    expect(section.textContent).toMatch(/most new deaths/i);
  });

  it("lists every section in its contents and each link has a target on the page", () => {
    const { container } = render(<MethodologyPage />);
    const nav = screen.getByRole("navigation", { name: "On this page" });
    const links = within(nav).getAllByRole("link");
    expect(links.length).toBeGreaterThanOrEqual(6);
    for (const a of links) {
      expect(container.querySelector(a.getAttribute("href")!)).toBeInTheDocument();
    }
  });

  it("shows every trend badge state the cards can show", () => {
    render(<MethodologyPage />);
    const table = screen.getByRole("table", { name: /trend badge states/i });
    const labels = within(table).getAllByTestId("trend-badge").map((b) => b.textContent);
    expect(labels).toEqual(["↗Growing", "↘Declining", "→Plateau", "·Unclear", "·Not enough data"]);
  });

  it("has its own canonical and repeats the shared Open Graph fields", () => {
    expect(methodologyMetadata.alternates?.canonical).toBe("/methodology");
    expect(methodologyMetadata.openGraph).toMatchObject({ siteName: "Outbreak Files", type: "website" });
  });
});

describe("/about", () => {
  it("names who runs the site, says it is unofficial and links corrections", () => {
    render(<AboutPage />);
    expect(screen.getByText(/run by Ari Nakos/)).toHaveTextContent(/not an official public health resource/);
    expect(screen.getByRole("link", { name: "open an issue on GitHub" })).toHaveAttribute("href", CORRECTIONS_URL);
  });

  it("keeps a space after the bold layer names in the data table", () => {
    const { container } = render(<AboutPage />);
    expect(container.innerHTML).not.toMatch(/<\/strong>[A-Za-z]/);
  });

  it("has its own canonical and repeats the shared Open Graph fields", () => {
    expect(aboutMetadata.alternates?.canonical).toBe("/about");
    expect(aboutMetadata.openGraph).toMatchObject({ siteName: "Outbreak Files", type: "website" });
  });
});

describe("archived site pages", () => {
  it("include the new text pages", () => {
    expect(SITE_PAGES).toEqual(expect.arrayContaining(["/methodology", "/about"]));
  });
});
