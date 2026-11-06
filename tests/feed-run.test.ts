/* eslint-disable @typescript-eslint/no-explicit-any -- fake stores and model clients in this test are loosely typed on purpose */
import { describe, it, expect } from "vitest";
import { runOutbreakFeeds } from "../scripts/lib/feed-run.mjs";

const quiet = { log: () => {}, warn: () => {} };
const noSleep = { sleep: async () => {}, random: () => 0 };

const feedConfig = {
  subject: "Ebola",
  strongKeywords: ["ebola"],
  sources: [
    { name: "WHO", source: "WHO", url: "https://feed/who" },
    { name: "News", source: "News", url: "https://feed/news" },
  ],
  extraction: { scope: "Return the country.", exclusions: "Else nulls." },
};
const outbreak = { slug: "ebola-test", disease: "Ebola", feed: feedConfig };

type Row = { g: string; day: number };
const rss = (rows: Row[]) =>
  `<rss><channel>${rows
    .map(
      (r) =>
        `<item><title>Ebola update ${r.g}</title><link>https://x/${r.g}</link><guid>${r.g}</guid>` +
        `<pubDate>${new Date(Date.UTC(2026, 10, r.day)).toUTCString()}</pubDate><description>Ebola ${r.g} body</description></item>`,
    )
    .join("")}</channel></rss>`;

function memStore(init: { live?: any; cands?: any; ledger?: any } = {}) {
  const s = {
    live: init.live ?? null,
    cands: init.cands ?? null,
    ledger: init.ledger ?? null,
    writes: { live: 0, cands: 0, ledger: 0 },
  };
  return {
    s,
    store: {
      readLive: () => (s.live ? structuredClone(s.live) : null),
      readCandidates: () => (s.cands ? structuredClone(s.cands) : null),
      readLedger: () => (s.ledger ? structuredClone(s.ledger) : null),
      writeLive: (v: any) => ((s.live = structuredClone(v)), s.writes.live++),
      writeCandidates: (v: any) => ((s.cands = structuredClone(v)), s.writes.cands++),
      writeLedger: (v: any) => ((s.ledger = structuredClone(v)), s.writes.ledger++),
    },
  };
}

/** A fake OpenAI-shaped client: tells summary and candidate prompts apart and records calls. */
function fakeModel(opts: { delay?: (n: number) => number; fail?: (kind: string, n: number) => Error | null; noCountry?: (title: string) => boolean } = {}) {
  const log = { summary: 0, candidate: 0, active: 0, peak: 0, titles: [] as string[] };
  const client = {
    chat: {
      completions: {
        create: async (req: any) => {
          const prompt: string = req.messages[0].content;
          const kind = req.response_format ? "candidate" : "summary";
          const n = ++log[kind as "summary" | "candidate"];
          log.active++;
          log.peak = Math.max(log.peak, log.active);
          await new Promise((r) => setTimeout(r, opts.delay?.(n) ?? 1));
          log.active--;
          const err = opts.fail?.(kind, n);
          if (err) throw err;
          const title = /Title: (.*)/.exec(prompt)?.[1] ?? "";
          log.titles.push(`${kind}:${title}`);
          if (kind === "summary") return { choices: [{ message: { content: `Summary of ${title}` } }] };
          const none = opts.noCountry?.(title) ?? false;
          return {
            choices: [{ message: { content: JSON.stringify(none ? { country: null, iso: null } : { country: "Uganda", iso: "UG", casesMentioned: 3, deathsMentioned: null, context: "c" }) } }],
          };
        },
      },
    },
  };
  return { client, log };
}

const fetchFor = (byUrl: Record<string, string>) => async (url: string) => {
  if (!(url in byUrl)) throw new Error("HTTP 503");
  return byUrl[url];
};

const NOW = new Date("2026-11-06T12:00:00Z");
const run = (extra: any) =>
  runOutbreakFeeds({ outbreak, now: () => NOW, retryOptions: noSleep, log: quiet, ...extra });

describe("runOutbreakFeeds", () => {
  const who = rss(Array.from({ length: 15 }, (_, i) => ({ g: `w${i}`, day: 1 + (i % 5) })));
  const news = rss(Array.from({ length: 12 }, (_, i) => ({ g: `n${i}`, day: 3 + (i % 6) })));
  const feeds = fetchFor({ "https://feed/who": who, "https://feed/news": news });

  it("cold start: candidates for every item, summaries only for the newest 20, bounded concurrency", async () => {
    const { s, store } = memStore();
    const { client, log } = fakeModel();
    const { stats } = await run({ client, fetchText: feeds, store });
    expect(stats.newItems).toBe(27);
    expect(log.candidate).toBe(27); // no early signal skipped
    expect(log.summary).toBe(20); // the 7 that cannot make the top 20 get none
    expect(log.peak).toBeLessThanOrEqual(8); // 4 items x 2 parallel calls
    expect(log.peak).toBeGreaterThan(2);
    expect(s.live.recentItems).toHaveLength(20);
    const dates = s.live.recentItems.map((i: any) => i.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(s.live.recentItems.every((i: any) => i.summary.startsWith("Summary of"))).toBe(true);
    expect(s.live.processedIds).toHaveLength(27);
    expect(s.cands.candidates).toHaveLength(27);
    expect(s.cands.checkedIds).toHaveLength(27);
    expect(s.ledger.signals[0]).toMatchObject({ iso: "UG", mentions: 27 });
  });

  it("steady state: a rerun makes no model calls and writes no candidates or ledger", async () => {
    const { s, store } = memStore();
    await run({ client: fakeModel().client, fetchText: feeds, store });
    const before = JSON.stringify([s.cands, s.ledger]);
    const second = fakeModel();
    s.writes = { live: 0, cands: 0, ledger: 0 };
    await run({ client: second.client, fetchText: feeds, store });
    expect(second.log.summary + second.log.candidate).toBe(0);
    expect(s.writes.cands).toBe(0);
    expect(s.writes.ledger).toBe(0);
    expect(JSON.stringify([s.cands, s.ledger])).toBe(before);
  });

  it("remembers items that yielded no candidate, so they are never asked again", async () => {
    const rows = Array.from({ length: 4 }, (_, i) => ({ g: `w${i}`, day: 1 + i }));
    const only = fetchFor({ "https://feed/who": rss(rows), "https://feed/news": rss([]) });
    const { s, store } = memStore();
    const a = fakeModel({ noCountry: () => true });
    await run({ client: a.client, fetchText: only, store });
    expect(s.cands.candidates).toHaveLength(0);
    expect(s.cands.checkedIds).toHaveLength(4);
    const b = fakeModel();
    await run({ client: b.client, fetchText: only, store });
    expect(b.log.candidate).toBe(0);
  });

  it("backfills stored items never checked (old store with no checkedIds), once", async () => {
    const recentItems = Array.from({ length: 5 }, (_, i) => ({ id: `old-${i}`, title: `Old ${i}`, url: "u", date: "2026-11-01", source: "WHO", summary: "s" }));
    const empty = fetchFor({ "https://feed/who": rss([]), "https://feed/news": rss([]) });
    const { s, store } = memStore({
      live: { lastFetched: "", processedIds: [], recentItems },
      cands: { lastExtracted: "", candidates: [{ id: "old-0", date: "2026-11-01", iso: "UG", country: "Uganda", flag: "", casesMentioned: 1, deathsMentioned: null, sourceTitle: "x", sourceUrl: "u", sourceName: "WHO", extractedAt: "x" }] },
    });
    const a = fakeModel({ noCountry: () => true });
    await run({ client: a.client, fetchText: empty, store });
    expect(a.log.candidate).toBe(4); // old-0 already has a candidate
    expect(a.log.summary).toBe(0);
    expect(s.cands.checkedIds.sort()).toEqual(["old-1", "old-2", "old-3", "old-4"]);
    const b = fakeModel();
    await run({ client: b.client, fetchText: empty, store });
    expect(b.log.candidate).toBe(0);
  });

  it("does not remember a failed candidate call, and keeps a dropped item unprocessed for retry", async () => {
    // 22 items, all different dates: the 2 oldest cannot be in the top 20 (no summary, not stored).
    const rows = Array.from({ length: 15 }, (_, i) => ({ g: `w${i}`, day: 1 + i }));
    const more = Array.from({ length: 7 }, (_, i) => ({ g: `n${i}`, day: 16 + i }));
    const f = fetchFor({ "https://feed/who": rss(rows), "https://feed/news": rss(more) });
    const { s, store } = memStore();
    const m = fakeModel({ fail: (kind) => (kind === "candidate" ? Object.assign(new Error("boom"), { status: 400 }) : null) });
    await expect(run({ client: m.client, fetchText: f, store })).rejects.toThrow(/every model call failed/);
    // progress was saved before the throw
    expect(s.cands?.checkedIds ?? []).toHaveLength(0);
    expect(s.live.recentItems).toHaveLength(20);
    // 2 dropped items had no candidate: still unprocessed, so a healthy rerun picks them up
    expect(s.live.processedIds).toHaveLength(20);
    const ok = fakeModel();
    await run({ client: ok.client, fetchText: f, store });
    expect(s.cands.candidates).toHaveLength(22);
  });

  it("a flaky 429 is retried and loses nothing", async () => {
    const f = fetchFor({ "https://feed/who": rss([{ g: "a", day: 2 }, { g: "b", day: 3 }]), "https://feed/news": rss([]) });
    const { s, store } = memStore();
    const m = fakeModel({ fail: (_k, n) => (n === 1 ? Object.assign(new Error("429"), { status: 429 }) : null) });
    await run({ client: m.client, fetchText: f, store });
    expect(s.cands.candidates).toHaveLength(2);
    expect(s.live.recentItems).toHaveLength(2);
  });

  it("persists after every item: a run killed part-way keeps the finished items", async () => {
    const { s, store } = memStore();
    let liveWrites = 0;
    // After the 6th write the "process is gone": nothing further reaches the store.
    const killing = { ...store, writeLive: (v: any) => { if (++liveWrites > 6) throw new Error("killed"); store.writeLive(v); } };
    await expect(run({ client: fakeModel().client, fetchText: feeds, store: killing, concurrency: 1 })).rejects.toThrow("killed");
    expect(s.cands.candidates.length).toBeGreaterThanOrEqual(5);
    expect(s.live.processedIds.length).toBeGreaterThanOrEqual(5);
    // resume: only the unfinished items are asked
    const resume = fakeModel();
    await run({ client: resume.client, fetchText: feeds, store });
    expect(resume.log.candidate).toBeLessThan(27);
    expect(s.cands.checkedIds).toHaveLength(27);
  });

  it("is deterministic: random model latency does not change the stored bytes", async () => {
    const out: string[] = [];
    for (const seed of [1, 2, 3]) {
      const { s, store } = memStore();
      await run({
        client: fakeModel({ delay: (n) => ((n * 7919 * seed) % 11) + 1 }).client,
        fetchText: feeds,
        store,
      });
      out.push(JSON.stringify([s.live, { ...s.cands, candidates: s.cands.candidates.map((c: any) => ({ ...c })) }, s.ledger]));
    }
    expect(out[1]).toBe(out[0]);
    expect(out[2]).toBe(out[0]);
  });

  it("one failing feed does not stop the other; every feed failing throws", async () => {
    const half = fetchFor({ "https://feed/news": rss([{ g: "n1", day: 4 }]) });
    const { s, store } = memStore();
    const warns: string[] = [];
    const { stats } = await run({ client: fakeModel().client, fetchText: half, store, log: { log: () => {}, warn: (m: string) => warns.push(m) } });
    expect(stats.newItems).toBe(1);
    expect(warns.some((w) => w.includes("WHO fetch failed"))).toBe(true);
    expect(s.live.recentItems).toHaveLength(1);
    await expect(run({ client: null, fetchText: fetchFor({}), store: memStore().store })).rejects.toThrow(/every feed failed/);
  });

  it("without a model client it stores raw descriptions and calls nothing", async () => {
    const { s, store } = memStore();
    const f = fetchFor({ "https://feed/who": rss([{ g: "a", day: 2 }]), "https://feed/news": rss([]) });
    await run({ client: null, fetchText: f, store });
    expect(s.live.recentItems[0].summary).toBe("Ebola a body");
    expect(s.cands).toBeNull();
  });
});
