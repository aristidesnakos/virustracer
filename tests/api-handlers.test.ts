import { describe, it, expect } from "vitest";
import { DEFAULT_OUTBREAK_SLUG, getDefaultOutbreak, listOutbreaks } from "@/data/outbreaks";
import { API_ATTRIBUTION, attributionFor } from "@/lib/api";
import {
  forOutbreak,
  metricsResponse,
  outbreaksListResponse,
  signalsResponse,
  tollResponse,
} from "@/lib/api-handlers";
import { GET as aliasToll, OPTIONS as aliasOptions } from "@/app/api/v1/toll/route";
import { GET as aliasMetrics } from "@/app/api/v1/metrics/route";
import { GET as aliasSignals } from "@/app/api/v1/signals/route";
import { GET as listGet } from "@/app/api/v1/outbreaks/route";
import { GET as slugToll, OPTIONS as slugOptions } from "@/app/api/v1/outbreaks/[slug]/toll/route";
import { GET as slugMetrics } from "@/app/api/v1/outbreaks/[slug]/metrics/route";
import { GET as slugSignals } from "@/app/api/v1/outbreaks/[slug]/signals/route";
import { outbreakApiPath, outbreakPath } from "@/lib/outbreak-paths";

const outbreak = getDefaultOutbreak();
const req = (path: string) => new Request(`http://localhost${path}`);
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });

async function body(res: Response) {
  return { status: res.status, text: await res.text(), headers: Object.fromEntries(res.headers) };
}

/** Parse a JSON body and drop the additive per-outbreak field so alias and slug responses can be compared. */
function withoutSlug(text: string) {
  const json = JSON.parse(text);
  delete json.meta?.slug;
  return json;
}

describe("attributionFor", () => {
  it("keeps the default outbreak's text under API_ATTRIBUTION", () => {
    expect(attributionFor(outbreak)).toBe(API_ATTRIBUTION);
    expect(API_ATTRIBUTION).toContain("INSP DRC and WHO");
  });
  it("describes a hand-curated outbreak without claiming Wikipedia", () => {
    const text = attributionFor({ slug: "x", source: { kind: "manual", ref: "WHO bulletins" } });
    expect(text).toContain("WHO bulletins");
    expect(text).not.toContain("Wikipedia");
    expect(text).toContain("CC BY-SA 4.0");
  });
  it("falls back to a generic citation for an unlisted Wikipedia outbreak", () => {
    const text = attributionFor({ slug: "x", source: { kind: "wikipedia-infobox", ref: "Some_article" } });
    expect(text).toContain("Wikipedia");
    expect(text).not.toContain("INSP DRC");
  });
});

describe("alias routes and per-outbreak routes share one implementation", () => {
  it("toll: identical apart from meta.slug", async () => {
    const path = "/api/v1/toll?limit=5";
    const alias = await body(await aliasToll(req(path)));
    const named = await body(await slugToll(req(path), ctx(DEFAULT_OUTBREAK_SLUG)));
    expect(alias.status).toBe(200);
    expect(named.status).toBe(200);
    expect(withoutSlug(named.text)).toEqual(withoutSlug(alias.text));
    expect(named.headers).toEqual(alias.headers);
    expect(JSON.parse(alias.text).meta.slug).toBe(DEFAULT_OUTBREAK_SLUG);
  });

  it("toll csv: byte-identical", async () => {
    const alias = await body(await aliasToll(req("/api/v1/toll?format=csv")));
    const named = await body(await slugToll(req("/x?format=csv"), ctx(DEFAULT_OUTBREAK_SLUG)));
    expect(named).toEqual(alias);
    expect(alias.headers["content-type"]).toContain("text/csv");
  });

  it("metrics: identical apart from meta.slug, with and without daily", async () => {
    for (const qs of ["", "?include=daily"]) {
      const alias = await body(await aliasMetrics(req(`/api/v1/metrics${qs}`)));
      const named = await body(await slugMetrics(req(`/x${qs}`), ctx(DEFAULT_OUTBREAK_SLUG)));
      expect(named.status).toBe(200);
      expect(withoutSlug(named.text)).toEqual(withoutSlug(alias.text));
    }
  });

  it("signals: identical apart from meta.slug", async () => {
    const alias = await body(await aliasSignals());
    const named = await body(await slugSignals(req("/x"), ctx(DEFAULT_OUTBREAK_SLUG)));
    expect(named.status).toBe(200);
    expect(withoutSlug(named.text)).toEqual(withoutSlug(alias.text));
  });

  it("keeps every pre-existing response field", async () => {
    const toll = JSON.parse((await body(await aliasToll(req("/api/v1/toll")))).text);
    expect(Object.keys(toll.meta)).toEqual(
      expect.arrayContaining(["outbreak", "description", "lastChecked", "count", "attribution", "docs"]),
    );
    expect(toll).toHaveProperty("latest");
    expect(toll).toHaveProperty("snapshots");
    const signals = JSON.parse((await body(await aliasSignals())).text);
    expect(Object.keys(signals.summary)).toEqual(
      expect.arrayContaining(["total", "confirmed", "unverified", "withLeadTime", "medianLeadDays"]),
    );
    expect(signals.meta.attribution).toBe(API_ATTRIBUTION);
  });

  it("validation errors are 400 JSON on both", async () => {
    for (const res of [
      await aliasToll(req("/api/v1/toll?from=nope")),
      await slugToll(req("/x?from=nope"), ctx(DEFAULT_OUTBREAK_SLUG)),
      await aliasMetrics(req("/api/v1/metrics?include=weekly")),
      await slugMetrics(req("/x?format=xml"), ctx(DEFAULT_OUTBREAK_SLUG)),
    ]) {
      expect(res.status).toBe(400);
      expect(JSON.parse(await res.text())).toHaveProperty("error");
    }
  });

  it("OPTIONS answers with the same CORS headers", () => {
    const a = aliasOptions();
    const b = slugOptions();
    expect(a.status).toBe(204);
    expect(b.status).toBe(204);
    expect(b.headers.get("access-control-allow-origin")).toBe("*");
    expect(Object.fromEntries(b.headers)).toEqual(Object.fromEntries(a.headers));
  });
});

describe("unknown outbreak", () => {
  it.each([
    ["toll", slugToll],
    ["metrics", slugMetrics],
    ["signals", slugSignals],
  ] as const)("%s returns a 404 JSON error with CORS and no caching", async (_name, handler) => {
    const res = await handler(req("/x"), ctx("no-such-outbreak"));
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const json = JSON.parse(await res.text());
    expect(Object.keys(json)).toEqual(["error"]);
    expect(json.error).toContain("no-such-outbreak");
    expect(json.error).toContain("/api/v1/outbreaks");
  });

  it("never reads files for a path-like slug", async () => {
    const res = await slugToll(req("/x"), ctx("../../package"));
    expect(res.status).toBe(404);
  });

  it("truncates a very long slug in the message", async () => {
    const res = forOutbreak("a".repeat(500), () => new Response("unreachable"));
    expect(res.status).toBe(404);
    expect((await res.text()).length).toBeLessThan(300);
  });

  it("forOutbreak passes a known outbreak to the handler", () => {
    const res = forOutbreak(DEFAULT_OUTBREAK_SLUG, (o) => new Response(o.slug));
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/outbreaks", () => {
  it("lists every registered outbreak with links to its page and endpoints", async () => {
    const res = listGet();
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const json = JSON.parse(await res.text());
    expect(json.meta.count).toBe(listOutbreaks().length);
    expect(json.outbreaks.map((o: { slug: string }) => o.slug)).toEqual(listOutbreaks().map((o) => o.slug));

    const entry = json.outbreaks.find((o: { slug: string }) => o.slug === outbreak.slug);
    expect(entry).toMatchObject({
      title: outbreak.title,
      disease: outbreak.disease,
      status: outbreak.status,
      places: outbreak.places,
      source: { kind: outbreak.source.kind, ref: outbreak.source.ref },
      links: {
        page: outbreakPath(outbreak.slug),
        toll: outbreakApiPath(outbreak.slug, "toll"),
        metrics: outbreakApiPath(outbreak.slug, "metrics"),
        signals: outbreakApiPath(outbreak.slug, "signals"),
      },
    });
    expect(entry.latest.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(entry.latest.confirmed).toEqual(expect.any(Number));
    expect(entry.latest.deaths).toEqual(expect.any(Number));
  });

  it("latest matches the newest point the toll endpoint reports or the curated timeline", async () => {
    const list = JSON.parse(await outbreaksListResponse().text());
    const latest = list.outbreaks[0].latest;
    const toll = JSON.parse(await tollResponse(outbreak, req("/x")).text());
    const curatedLast = outbreak.casesTimeline.map((p) => p.date.slice(0, 10)).sort().at(-1) ?? "";
    expect(latest.date >= (toll.latest?.date ?? "")).toBe(true);
    expect(latest.date >= curatedLast).toBe(true);
  });
});

describe("handlers accept a plain Request", () => {
  it("metrics and signals work without Next types", async () => {
    expect(metricsResponse(outbreak, req("/x")).status).toBe(200);
    expect(signalsResponse(outbreak).status).toBe(200);
  });
});
