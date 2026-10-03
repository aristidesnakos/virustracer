// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  availability,
  collectSources,
  decodeGoogleNewsUrl,
  emptyLedger,
  normalizeLedger,
  parseAvailability,
  recordMetadata,
  requestSave,
  resolveGoogleNewsUrl,
  runArchive,
  serializeLedger,
  waybackTimestampToIso,
} from "../scripts/lib/archive.mjs";

const NOW = "2026-10-02T12:00:00.000Z";

type Handler = (url: string) => Response | Promise<Response> | never;

/** A fetch stub that records calls; no network. */
function stubFetch(handler: Handler) {
  const calls: string[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    return handler(url);
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const withUrl = (res: Response, url: string) => Object.defineProperty(res, "url", { value: url });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const closest = (url: string, timestamp = "20261001120000", status = "200") => ({
  archived_snapshots: { closest: { available: true, url, timestamp, status } },
});

/** Answers availability with "none" and saves with a content-location capture. */
const happyHandler: Handler = (url) => {
  if (url.startsWith("https://archive.org/wayback/available")) return json({ archived_snapshots: {} });
  return new Response("ok", {
    status: 200,
    headers: { "content-location": `/web/20261002120000/${url.replace("https://web.archive.org/save/", "")}` },
  });
};

const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    url: `https://example.org/a${i}`,
    title: `Article ${i}`,
    publishedAt: "2026-10-01",
    source: "News",
    kind: "news",
  }));

const noSleep = async () => {};

describe("availability", () => {
  it("parses the closest 2xx capture and upgrades http to https", async () => {
    const { fn, calls } = stubFetch(() =>
      json(closest("http://web.archive.org/web/20261001120000/https://example.org/a", "20261001120000")),
    );
    const res = await availability("https://example.org/a", fn);
    expect(res).toEqual({
      archivedUrl: "https://web.archive.org/web/20261001120000/https://example.org/a",
      archivedAt: "2026-10-01T12:00:00Z",
    });
    expect(calls[0]).toBe(
      "https://archive.org/wayback/available?url=" + encodeURIComponent("https://example.org/a"),
    );
  });

  it("returns null when there is no capture or the capture was an error page", () => {
    expect(parseAvailability({ archived_snapshots: {} })).toBeNull();
    expect(parseAvailability(null)).toBeNull();
    expect(parseAvailability(closest("http://x", "20261001120000", "404"))).toBeNull();
    expect(parseAvailability({ archived_snapshots: { closest: { available: false } } })).toBeNull();
  });

  it("throws on HTTP errors", async () => {
    const { fn } = stubFetch(() => new Response("", { status: 503 }));
    await expect(availability("https://example.org/a", fn)).rejects.toThrow(/503/);
  });

  it("converts Wayback timestamps", () => {
    expect(waybackTimestampToIso("20260102030405")).toBe("2026-01-02T03:04:05Z");
    expect(waybackTimestampToIso("nope")).toBeNull();
  });
});

describe("requestSave", () => {
  it("reads the capture URL from content-location", async () => {
    const { fn, calls } = stubFetch(happyHandler);
    const res = await requestSave("https://example.org/a", fn);
    expect(calls[0]).toBe("https://web.archive.org/save/https://example.org/a");
    expect(res).toEqual({
      ok: true,
      archivedUrl: "https://web.archive.org/web/20261002120000/https://example.org/a",
      archivedAt: "2026-10-02T12:00:00Z",
    });
  });

  it("accepts the request without a capture URL (confirmed on a later run)", async () => {
    const { fn } = stubFetch(() => new Response("queued", { status: 200 }));
    expect(await requestSave("https://example.org/a", fn)).toEqual({
      ok: true,
      archivedUrl: null,
      archivedAt: null,
    });
  });

  it("reports 429 as rate limited", async () => {
    const { fn } = stubFetch(() => new Response("", { status: 429 }));
    expect(await requestSave("https://example.org/a", fn)).toMatchObject({ ok: false, rateLimited: true });
  });

  it("reports a timeout without throwing", async () => {
    const { fn } = stubFetch(() => {
      throw new DOMException("The operation timed out", "TimeoutError");
    });
    expect(await requestSave("https://example.org/a", fn)).toEqual({
      ok: false,
      rateLimited: false,
      error: "timeout",
    });
  });

  it("reports other HTTP errors", async () => {
    const { fn } = stubFetch(() => new Response("", { status: 502 }));
    expect(await requestSave("https://example.org/a", fn)).toMatchObject({ ok: false, error: "HTTP 502" });
  });
});

describe("runArchive", () => {
  it("records metadata for every item but processes at most `max` per run", async () => {
    const { fn } = stubFetch(happyHandler);
    const { ledger, stats } = await runArchive({
      ledger: emptyLedger(),
      items: items(5),
      fetchImpl: fn,
      now: NOW,
      max: 2,
      delayMs: 0,
      sleep: noSleep,
    });
    expect(Object.keys(ledger.entries)).toHaveLength(5);
    expect(stats.processed).toBe(2);
    const states = Object.values(ledger.entries).map((e) => e.status);
    expect(states.filter((s) => s === "archived")).toHaveLength(2);
    expect(states.filter((s) => s === "pending")).toHaveLength(3);
    expect(ledger.entries["https://example.org/a3"]).toMatchObject({
      title: "Article 3",
      publishedAt: "2026-10-01",
      source: "News",
      attempts: 0,
    });
    expect(ledger.lastRun).toBe(NOW);
  });

  it("skips URLs that are already archived", async () => {
    const first = await runArchive({
      ledger: emptyLedger(),
      items: items(2),
      fetchImpl: stubFetch(happyHandler).fn,
      now: NOW,
      delayMs: 0,
      sleep: noSleep,
    });
    const { fn, calls } = stubFetch(happyHandler);
    const second = await runArchive({
      ledger: first.ledger,
      items: items(2),
      fetchImpl: fn,
      now: NOW,
      delayMs: 0,
      sleep: noSleep,
    });
    expect(calls).toHaveLength(0);
    expect(second.stats.processed).toBe(0);
  });

  it("prefers an existing capture and does not re-save", async () => {
    const { fn, calls } = stubFetch((url) =>
      url.startsWith("https://archive.org/wayback/available")
        ? json(closest("http://web.archive.org/web/20260901000000/https://example.org/a0", "20260901000000"))
        : new Response("", { status: 500 }),
    );
    const { ledger, stats } = await runArchive({
      ledger: emptyLedger(),
      items: items(1),
      fetchImpl: fn,
      now: NOW,
      delayMs: 0,
      sleep: noSleep,
    });
    expect(calls.some((c) => c.startsWith("https://web.archive.org/save/"))).toBe(false);
    expect(stats.existing).toBe(1);
    expect(ledger.entries["https://example.org/a0"]).toMatchObject({
      status: "archived",
      archivedAt: "2026-09-01T00:00:00Z",
    });
  });

  it("waits at least delayMs between Save Page Now requests", async () => {
    let t = 0;
    const sleeps: number[] = [];
    const { fn } = stubFetch(happyHandler);
    await runArchive({
      ledger: emptyLedger(),
      items: items(3),
      fetchImpl: fn,
      now: NOW,
      delayMs: 5000,
      clock: () => t,
      sleep: async (ms) => {
        sleeps.push(ms);
        t += ms;
      },
    });
    expect(sleeps).toEqual([5000, 5000]);
  });

  it("stops the whole run on 429 and does not count that attempt", async () => {
    const { fn, calls } = stubFetch((url) =>
      url.startsWith("https://archive.org/wayback/available")
        ? json({ archived_snapshots: {} })
        : new Response("", { status: 429 }),
    );
    const { ledger, stats } = await runArchive({
      ledger: emptyLedger(),
      items: items(4),
      fetchImpl: fn,
      now: NOW,
      delayMs: 0,
      sleep: noSleep,
    });
    expect(stats.rateLimited).toBe(true);
    expect(calls.filter((c) => c.includes("/save/"))).toHaveLength(1);
    expect(ledger.entries["https://example.org/a0"].attempts).toBe(0);
    expect(ledger.entries["https://example.org/a0"].status).toBe("pending");
  });

  it("also stops when the availability API returns 429", async () => {
    const { fn, calls } = stubFetch(() => new Response("", { status: 429 }));
    const { stats } = await runArchive({
      ledger: emptyLedger(),
      items: items(3),
      fetchImpl: fn,
      now: NOW,
      delayMs: 0,
      sleep: noSleep,
    });
    expect(stats.rateLimited).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("marks a failed save and retries it next run, giving up at maxAttempts", async () => {
    const failing = stubFetch((url) =>
      url.startsWith("https://archive.org/wayback/available")
        ? json({ archived_snapshots: {} })
        : new Response("", { status: 502 }),
    );
    const run = (ledger: ReturnType<typeof emptyLedger>) =>
      runArchive({
        ledger,
        items: items(1),
        fetchImpl: failing.fn,
        now: NOW,
        maxAttempts: 3,
        delayMs: 0,
        sleep: noSleep,
      });
    let ledger = (await run(emptyLedger())).ledger;
    expect(ledger.entries["https://example.org/a0"]).toMatchObject({ status: "failed", attempts: 1 });
    ledger = (await run(ledger)).ledger;
    expect(ledger.entries["https://example.org/a0"].attempts).toBe(2);
    ledger = (await run(ledger)).ledger;
    expect(ledger.entries["https://example.org/a0"]).toMatchObject({ status: "failed", attempts: 3 });

    const before = failing.calls.length;
    const final = await run(ledger);
    expect(failing.calls.length).toBe(before); // out of attempts: untouched
    expect(final.stats.processed).toBe(0);
  });

  it("a timed-out save is recorded as failed, not thrown", async () => {
    const { fn } = stubFetch((url) => {
      if (url.startsWith("https://archive.org/wayback/available")) return json({ archived_snapshots: {} });
      throw new DOMException("timed out", "TimeoutError");
    });
    const { ledger } = await runArchive({
      ledger: emptyLedger(),
      items: items(1),
      fetchImpl: fn,
      now: NOW,
      delayMs: 0,
      sleep: noSleep,
    });
    expect(ledger.entries["https://example.org/a0"].status).toBe("failed");
  });

  it("dry run makes no network calls", async () => {
    const { fn, calls } = stubFetch(happyHandler);
    const { stats } = await runArchive({
      ledger: emptyLedger(),
      items: items(3),
      fetchImpl: fn,
      now: NOW,
      max: 2,
      dryRun: true,
    });
    expect(calls).toHaveLength(0);
    expect(stats.wouldProcess).toHaveLength(2);
  });

  it("does not mutate the input ledger", async () => {
    const input = emptyLedger();
    await runArchive({ ledger: input, items: items(1), fetchImpl: stubFetch(happyHandler).fn, now: NOW, delayMs: 0, sleep: noSleep });
    expect(input).toEqual(emptyLedger());
  });
});

describe("Google News links", () => {
  // Current-format ids are opaque (no embedded URL).
  const opaque = "https://news.google.com/rss/articles/CBMijwFBVV95cUxQaUQ5d29xQ3QtcG5LWHl1?oc=5";
  const legacy =
    "https://news.google.com/rss/articles/" +
    Buffer.from("\x08\x13\x22\x1ehttps://example.org/story/1\xd2\x01\x00").toString("base64url");

  it("decodes legacy ids and leaves opaque ones alone", () => {
    expect(decodeGoogleNewsUrl(legacy)).toBe("https://example.org/story/1");
    expect(decodeGoogleNewsUrl(opaque)).toBeNull();
  });

  it("resolves via redirect only when it lands off Google", async () => {
    const hop = stubFetch(() => withUrl(new Response("", { status: 200 }), "https://publisher.example/x"));
    expect(await resolveGoogleNewsUrl(opaque, hop.fn)).toBe("https://publisher.example/x");
    const stuck = stubFetch(() => withUrl(new Response("", { status: 200 }), "https://news.google.com/rss/articles/x"));
    expect(await resolveGoogleNewsUrl(opaque, stuck.fn)).toBeNull();
    const down = stubFetch(() => {
      throw new Error("offline");
    });
    expect(await resolveGoogleNewsUrl(opaque, down.fn)).toBeNull();
  });

  it("archives the resolved publisher URL and keeps the original as the key", async () => {
    const { fn, calls } = stubFetch(happyHandler);
    const { ledger } = await runArchive({
      ledger: emptyLedger(),
      items: [{ url: legacy, title: "T", publishedAt: "2026-10-01", source: "News", kind: "news" }],
      fetchImpl: fn,
      now: NOW,
      delayMs: 0,
      sleep: noSleep,
    });
    expect(calls.some((c) => c.endsWith("/save/https://example.org/story/1"))).toBe(true);
    expect(ledger.entries[legacy]).toMatchObject({
      status: "archived",
      resolvedUrl: "https://example.org/story/1",
    });
  });

  it("processes unresolvable Google links after everything else", async () => {
    const { fn, calls } = stubFetch((url) => {
      if (url.startsWith("https://news.google.com/")) return withUrl(new Response(""), url);
      return happyHandler(url);
    });
    await runArchive({
      ledger: emptyLedger(),
      items: [
        { url: opaque, title: "G", publishedAt: null, source: "News", kind: "news" },
        ...items(1),
      ],
      fetchImpl: fn,
      now: NOW,
      max: 1,
      delayMs: 0,
      sleep: noSleep,
    });
    expect(calls.some((c) => c.includes("example.org/a0"))).toBe(true);
    expect(calls.some((c) => c.includes("/save/https://news.google.com"))).toBe(false);
  });
});

describe("collectSources", () => {
  it("gathers news, toll permalinks and literal curated URLs without duplicates", () => {
    const out = collectSources({
      outbreaks: [
        {
          slug: "ebola-x",
          live: {
            recentItems: [
              { url: "https://a.example/1", title: "Old", date: "2026-09-01", source: "WHO" },
              { url: "https://a.example/2", title: "New", date: "2026-10-01", source: "News" },
              { url: "https://a.example/2", title: "Dup", date: "2026-10-01", source: "News" },
            ],
          },
          toll: {
            snapshots: [
              {
                date: "2026-06-02",
                confirmed: 330,
                deaths: 49,
                sourceUrl: "https://en.wikipedia.org/w/index.php?oldid=1",
                revisionTimestamp: "2026-06-02T23:32:22Z",
              },
            ],
          },
          source: `links: [{ label: "CDC", href: "https://www.cdc.gov/ebola" }], source: "WHO DON614"`,
        },
      ],
    });
    expect(out.map((i) => i.url)).toEqual([
      "https://a.example/2",
      "https://a.example/1",
      "https://en.wikipedia.org/w/index.php?oldid=1",
      "https://www.cdc.gov/ebola",
    ]);
    expect(out[2]).toMatchObject({ kind: "toll", publishedAt: "2026-06-02T23:32:22Z", source: "Wikipedia" });
    expect(out[3]).toMatchObject({
      kind: "curated",
      title: "CDC",
      source: "Curated (src/data/outbreaks/ebola-x.ts)",
    });
    expect(out.every((i) => i.outbreak === "ebola-x")).toBe(true);
  });

  it("merges outbreaks by priority, newest news first, and tags each URL with the first outbreak citing it", () => {
    const out = collectSources({
      outbreaks: [
        {
          slug: "a",
          live: { recentItems: [{ url: "https://n.example/old", title: "A", date: "2026-09-01", source: "News" }] },
          source: `href: "https://shared.example/who"`,
        },
        {
          slug: "b",
          live: { recentItems: [{ url: "https://n.example/new", title: "B", date: "2026-10-01", source: "News" }] },
          toll: { snapshots: [{ date: "2026-09-30", sourceUrl: "https://en.wikipedia.org/w/index.php?oldid=2" }] },
          source: `href: "https://shared.example/who"`,
        },
      ],
    });
    expect(out.map((i) => [i.url, i.kind, i.outbreak])).toEqual([
      ["https://n.example/new", "news", "b"],
      ["https://n.example/old", "news", "a"],
      ["https://en.wikipedia.org/w/index.php?oldid=2", "toll", "b"],
      ["https://shared.example/who", "curated", "a"],
    ]);
  });

  it("tolerates missing inputs", () => {
    expect(collectSources()).toEqual([]);
    expect(collectSources({ outbreaks: [{ slug: "x", live: {}, toll: {}, source: "" }] })).toEqual([]);
  });
});

describe("ledger serialization", () => {
  it("is deterministic: entries sorted by URL, fixed field order, trailing newline", async () => {
    const forward = await runArchive({
      ledger: emptyLedger(),
      items: items(3),
      fetchImpl: stubFetch(happyHandler).fn,
      now: NOW,
      delayMs: 0,
      sleep: noSleep,
    });
    const reversed = await runArchive({
      ledger: emptyLedger(),
      items: items(3).reverse(),
      fetchImpl: stubFetch(happyHandler).fn,
      now: NOW,
      delayMs: 0,
      sleep: noSleep,
    });
    const a = serializeLedger(forward.ledger);
    expect(Object.keys(JSON.parse(a).entries)).toEqual([
      "https://example.org/a0",
      "https://example.org/a1",
      "https://example.org/a2",
    ]);
    expect(a.endsWith("}\n")).toBe(true);
    // Same content in a different insertion order serializes identically.
    const shuffled = { ...forward.ledger, entries: Object.fromEntries(Object.entries(forward.ledger.entries).reverse()) };
    expect(serializeLedger(shuffled)).toBe(a);
    expect(Object.keys(JSON.parse(a).entries["https://example.org/a0"]).slice(0, 4)).toEqual([
      "archivedUrl",
      "archivedAt",
      "status",
      "attempts",
    ]);
    expect(reversed.ledger.entries).toBeDefined();
  });

  it("keeps the outbreak slug of the first outbreak that cited a URL", () => {
    const item = { url: "https://example.org/x", title: "X", publishedAt: null, source: "News", kind: "news" };
    const first = recordMetadata(emptyLedger(), [{ ...item, outbreak: "ebola-x" }]);
    const again = recordMetadata(first, [{ ...item, outbreak: "cholera-y" }]);
    expect(again.entries["https://example.org/x"].outbreak).toBe("ebola-x");
    expect(JSON.parse(serializeLedger(again)).entries["https://example.org/x"].outbreak).toBe("ebola-x");
    // Our own pages belong to no outbreak and carry no field at all.
    const site = recordMetadata(emptyLedger(), [{ ...item, kind: "site" }]);
    expect(JSON.parse(serializeLedger(site)).entries["https://example.org/x"]).not.toHaveProperty("outbreak");
  });

  it("normalizeLedger tolerates junk", () => {
    expect(normalizeLedger(null)).toEqual(emptyLedger());
    expect(normalizeLedger({ entries: 3 })).toEqual(emptyLedger());
    expect(normalizeLedger({ lastRun: "x", entries: {} })).toEqual({ lastRun: "x", entries: {} });
  });
});

describe("src/lib/archive.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("fs");
  });

  it("returns an empty ledger when data/archive.json is missing", async () => {
    vi.doMock("fs", async (orig) => ({
      ...(await orig<typeof import("fs")>()),
      existsSync: () => false,
    }));
    const { getArchiveLedger, archivedUrlFor } = await import("@/lib/archive");
    expect(getArchiveLedger()).toEqual({ lastRun: "", entries: {} });
    expect(archivedUrlFor("https://example.org/a")).toBeNull();
  });

  it("returns an empty ledger for malformed JSON", async () => {
    vi.doMock("fs", async (orig) => ({
      ...(await orig<typeof import("fs")>()),
      existsSync: () => true,
      readFileSync: () => "{not json",
    }));
    const { getArchiveLedger } = await import("@/lib/archive");
    expect(getArchiveLedger()).toEqual({ lastRun: "", entries: {} });
  });

  it("archivedUrlFor only returns captures with status archived", async () => {
    const { archivedUrlFor } = await import("@/lib/archive");
    const base = { attempts: 1, lastAttempt: NOW, title: "", publishedAt: null, source: "", kind: "news", resolvedUrl: null };
    const ledger = {
      lastRun: NOW,
      entries: {
        "https://x/ok": { ...base, status: "archived" as const, archivedUrl: "https://web.archive.org/web/1/x", archivedAt: NOW },
        "https://x/pending": { ...base, status: "pending" as const, archivedUrl: null, archivedAt: null },
      },
    };
    expect(archivedUrlFor("https://x/ok", ledger)).toBe("https://web.archive.org/web/1/x");
    expect(archivedUrlFor("https://x/pending", ledger)).toBeNull();
    expect(archivedUrlFor("https://x/unknown", ledger)).toBeNull();
  });
});

describe("own site pages", () => {
  const siteItems = collectSources({
    siteUrl: "https://outbreakfiles.com/",
    sitePages: ["/", "/data"],
  });

  it("collects them first, as kind site, from a public https host only", () => {
    expect(siteItems.map((i) => [i.url, i.kind])).toEqual([
      ["https://outbreakfiles.com", "site"],
      ["https://outbreakfiles.com/data", "site"],
    ]);
    for (const bad of ["http://localhost:3000", "https://localhost", "http://outbreakfiles.com", "not a url", undefined]) {
      expect(collectSources({ siteUrl: bad, sitePages: ["/"] })).toEqual([]);
    }
  });

  it("saves a never-captured page without consulting the availability API", async () => {
    const { fn, calls } = stubFetch(happyHandler);
    const { ledger } = await runArchive({
      ledger: emptyLedger(), items: siteItems, fetchImpl: fn, now: NOW, delayMs: 0, sleep: noSleep,
    });
    expect(calls.some((c) => c.startsWith("https://archive.org/wayback/available"))).toBe(false);
    expect(ledger.entries["https://outbreakfiles.com/data"]).toMatchObject({ status: "archived", kind: "site", attempts: 0 });
  });

  it("is not due again until a week has passed, then re-captures", async () => {
    const first = await runArchive({
      ledger: emptyLedger(), items: siteItems, fetchImpl: stubFetch(happyHandler).fn, now: NOW, delayMs: 0, sleep: noSleep,
    });
    const soon = stubFetch(happyHandler);
    await runArchive({
      ledger: first.ledger, items: siteItems, fetchImpl: soon.fn, now: "2026-10-05T12:00:00.000Z", delayMs: 0, sleep: noSleep,
    });
    expect(soon.calls).toHaveLength(0);

    const later = stubFetch(happyHandler);
    const { stats } = await runArchive({
      ledger: first.ledger, items: siteItems, fetchImpl: later.fn, now: "2026-10-10T12:00:00.000Z", delayMs: 0, sleep: noSleep,
    });
    expect(stats.saved).toBe(2);
  });

  it("never marks a page failed while the domain is down, keeps the old capture, and backs off", async () => {
    const first = await runArchive({
      ledger: emptyLedger(), items: siteItems, fetchImpl: stubFetch(happyHandler).fn, now: NOW, delayMs: 0, sleep: noSleep,
    });
    const down = stubFetch(() => new Response("bad gateway", { status: 502 }));
    const t1 = "2026-10-10T12:00:00.000Z";
    const r1 = await runArchive({ ledger: first.ledger, items: siteItems, fetchImpl: down.fn, now: t1, delayMs: 0, sleep: noSleep });
    const e = r1.ledger.entries["https://outbreakfiles.com/data"];
    expect(e.status).toBe("archived");
    expect(e.archivedUrl).toBe(first.ledger.entries["https://outbreakfiles.com/data"].archivedUrl);
    expect(e.lastAttempt).toBe(t1);

    const again = stubFetch(() => new Response("bad gateway", { status: 502 }));
    await runArchive({ ledger: r1.ledger, items: siteItems, fetchImpl: again.fn, now: "2026-10-10T13:00:00.000Z", delayMs: 0, sleep: noSleep });
    expect(again.calls).toHaveLength(0);
  });

  it("a page that has never been captured stays pending, not failed, after many failures", async () => {
    let ledger = emptyLedger();
    for (let h = 0; h < 8; h++) {
      const down = stubFetch(() => new Response("nope", { status: 502 }));
      ({ ledger } = await runArchive({
        ledger, items: siteItems, fetchImpl: down.fn, now: new Date(Date.UTC(2026, 9, 2, 12 + h * 13)).toISOString(), delayMs: 0, sleep: noSleep,
      }));
    }
    expect(ledger.entries["https://outbreakfiles.com"].status).toBe("pending");
  });
});
