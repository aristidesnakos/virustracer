/* eslint-disable @typescript-eslint/no-explicit-any -- fake stores and model clients in this test are loosely typed on purpose */
import { describe, it, expect } from "vitest";
import { runOutbreakFeeds } from "../scripts/lib/feed-run.mjs";
import { ModelResponseError } from "../scripts/lib/feed-model.mjs";

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
          const title = /(?:Title|Headline): (.*)/.exec(prompt)?.[1] ?? "";
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
    const recentItems = Array.from({ length: 5 }, (_, i) => ({ id: `old-${i}`, title: `Old ${i}`, url: "u", date: "2026-11-01", source: "WHO", summary: "Officials reported new cases on Monday." }));
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
    expect(s.live.recentItems[0].summaryFallback).toBe(true);
    expect(s.cands).toBeNull();
  });

  it("counts failures by cause and flags the fallback summary; the failed candidate is not checked", async () => {
    const f = fetchFor({ "https://feed/who": rss([{ g: "a", day: 2 }, { g: "b", day: 3 }]), "https://feed/news": rss([]) });
    const { s, store } = memStore();
    const cutOff = () =>
      new ModelResponseError("length_reasoning", { finishReason: "length", provider: "Baidu", reasoningTokens: 150, usedReasoning: true, completionTokens: 150 });
    // Item "b" (newest, so first) fails both calls (each call is tried twice: the one retry for an unusable answer).
    const m = fakeModel({ fail: (_kind, n) => (n <= 2 ? cutOff() : null), delay: () => 0 });
    const warns: string[] = [];
    const out = await run({ client: m.client, fetchText: f, store, concurrency: 1, log: { log: () => {}, warn: (x: string) => warns.push(x) } });
    expect(out.stats.failureCauses).toEqual({ length_reasoning: 2 });
    expect(warns.join("\n")).toMatch(/\[summary, length_reasoning\].*provider=Baidu/);
    const byId = Object.fromEntries(s.live.recentItems.map((it: any) => [it.title, it]));
    expect(byId["Ebola update b"].summaryFallback).toBe(true);
    expect(byId["Ebola update a"]).toMatchObject({ summary: "Summary of Ebola update a", summaryFallback: false });
    expect(s.cands.checkedIds).toHaveLength(1);
  });
});

describe("summary repair", () => {
  const item = (g: string, day: number, summary: string, extra: any = {}) => ({
    id: `news-${g}`,
    title: `Outbreak headline number ${g} - Publisher`,
    url: `https://x/${g}`,
    date: `2026-11-0${day}`,
    source: "News",
    summary,
    ...extra,
  });
  const stored = () => [
    // Legacy fallback (no flag): the summary starts with the headline, as a Google News description does.
    item("a", 5, "Outbreak headline number a  Publisher"),
    // Flagged fallback from a run after the change.
    item("b", 4, "some raw description", { summaryFallback: true }),
    // Model summaries: never touched, even one that happens to start with its headline.
    item("c", 3, "Officials reported 12 deaths."),
    item("d", 2, "Outbreak headline number d was confirmed by officials.", { summaryFallback: false }),
    // Gave up after three failed re-requests.
    item("e", 1, "raw", { summaryFallback: true, summaryRepairAttempts: 3 }),
  ];
  const empty = fetchFor({ "https://feed/who": rss([]), "https://feed/news": rss([]) });
  const checkedStore = () =>
    memStore({
      live: { lastFetched: "", processedIds: [], recentItems: stored() },
      cands: { lastExtracted: "", candidates: [], checkedIds: ["news-a", "news-b", "news-c", "news-d", "news-e"] },
    });

  it("re-requests summaries only for displayed fallbacks, and records success", async () => {
    const { s, store } = checkedStore();
    const m = fakeModel();
    const out = await run({ client: m.client, fetchText: empty, store });
    expect(m.log.summary).toBe(2);
    expect(m.log.candidate).toBe(0);
    expect(out.stats.summariesRepaired).toBe(2);
    const byId = Object.fromEntries(s.live.recentItems.map((it: any) => [it.id, it]));
    // A legacy fallback is headline-only, so the headline prompt is used (publisher split off).
    expect(byId["news-a"]).toMatchObject({ summary: "Summary of Outbreak headline number a", summaryFallback: false, summaryVersion: 2 });
    expect(byId["news-b"].summaryFallback).toBe(false);
    expect(byId["news-c"]).toEqual(stored()[2]);
    expect(byId["news-d"]).toEqual(stored()[3]);
    expect(byId["news-e"]).toEqual(stored()[4]);
    // A rerun has nothing left to repair.
    const again = fakeModel();
    await run({ client: again.client, fetchText: empty, store });
    expect(again.log.summary).toBe(0);
  });

  it("a failed repair keeps the text, counts the attempt and stops after three", async () => {
    const { s, store } = checkedStore();
    const down = fakeModel({ fail: () => Object.assign(new Error("bad request"), { status: 400 }) });
    for (let i = 0; i < 4; i++) await run({ client: down.client, fetchText: empty, store }).catch(() => {});
    expect(down.log.summary).toBe(6); // 2 items x 3 attempts, then left alone
    const a = s.live.recentItems.find((it: any) => it.id === "news-a");
    expect(a).toMatchObject({ summary: "Outbreak headline number a  Publisher", summaryFallback: true, summaryRepairAttempts: 3 });
  });

  it("repairs at most 20 per run", async () => {
    const many = Array.from({ length: 25 }, (_, i) => item(`x${i}`, 1 + (i % 9), `Outbreak headline number x${i}  Publisher`));
    const { store } = memStore({
      live: { lastFetched: "", processedIds: [], recentItems: many },
      cands: { lastExtracted: "", candidates: [], checkedIds: many.map((m) => m.id) },
    });
    const m = fakeModel();
    await run({ client: m.client, fetchText: empty, store });
    expect(m.log.summary).toBe(20);
  });
});

describe("article-text sources", () => {
  const cfg = {
    subject: "Ebola",
    strongKeywords: ["ebola"],
    sources: [
      { name: "WHO DON", source: "WHO", url: "https://who/don", format: "who-don-api" },
      { name: "Local paper", source: "News", url: "https://paper/rss", match: ["measles"] },
      { name: "Google", source: "News", url: "https://news.google.com/rss/x" },
    ],
    extraction: { scope: "Return the country.", exclusions: "Else nulls." },
  };
  const don = JSON.stringify({
    value: [
      { Id: "d1", Title: "Ebola disease - Uganda", UrlName: "2026-DON1", PublicationDateAndTime: "2026-11-05T10:00:00Z", Summary: "<p>Uganda reported 3 confirmed cases.</p>" },
      { Id: "d2", Title: "Cholera - Somewhere", UrlName: "2026-DON2", PublicationDateAndTime: "2026-11-04T10:00:00Z", Summary: "<p>Not ours.</p>" },
    ],
  });
  const paper = `<rss><channel><item><title>Measles vaccine inquiry formed</title><link>https://paper/1</link><guid>p1</guid>
    <pubDate>Thu, 05 Nov 2026 10:00:00 GMT</pubDate><description>A three-member commission will look into delays.</description></item></channel></rss>`;
  const google = `<rss><channel><item><title>Ebola disease - Uganda - WHO</title><link>https://news.google.com/a</link><guid>g1</guid>
    <pubDate>Thu, 05 Nov 2026 10:00:00 GMT</pubDate><description>Ebola disease - Uganda WHO</description></item></channel></rss>`;

  it("reads the WHO JSON API and a source-level keyword filter; the text copy of a story wins the dedupe", async () => {
    const { s, store } = memStore();
    const f = fetchFor({ "https://who/don": don, "https://paper/rss": paper, "https://news.google.com/rss/x": google });
    const m = fakeModel();
    await runOutbreakFeeds({ outbreak: { slug: "t", disease: "Ebola", feed: cfg }, client: m.client, fetchText: f, store, now: () => NOW, retryOptions: noSleep, log: quiet });
    const titles = s.live.recentItems.map((it: any) => `${it.source}: ${it.title}`).sort();
    // The cholera DON fails the Ebola filter; the paper's measles story passes its own `match`
    // (no "ebola" in it); the Google copy of the DON headline is a duplicate and is dropped.
    expect(titles).toEqual(["Local paper: Measles vaccine inquiry formed", "WHO DON: Ebola disease - Uganda"]);
    const donItem = s.live.recentItems.find((it: any) => it.source === "WHO DON");
    expect(donItem.url).toBe("https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON1");
    // The model was given the report's text, not just the headline.
    expect(m.log.titles).toContain("summary:Ebola disease - Uganda");
  });
});

describe("summary prompt version 2", () => {
  const item = (id: string, url: string, summary: string, extra: any = {}) => ({
    id,
    title: `Ebola toll rises in North Kivu ${id} - Reuters`,
    url,
    date: "2026-11-05",
    source: "News",
    summary,
    ...extra,
  });
  const empty = fetchFor({ "https://feed/who": rss([]), "https://feed/news": rss([]) });

  it("re-requests filler and old Google News summaries once, from the headline alone, and leaves good ones", async () => {
    const g = "https://news.google.com/rss/articles/x";
    const items = [
      item("filler", "https://who/x", "The article does not provide a cumulative death toll for the outbreak."),
      item("oldgoogle", g, "As of March 2026, the outbreak has caused 15 deaths in North Kivu."),
      item("newgoogle", g, "The Ebola toll rose in North Kivu, Reuters reported.", { summaryFallback: false, summaryVersion: 2 }),
      item("good", "https://who/y", "WHO reported 412 new confirmed cases in the week to 20 October.", { summaryFallback: false }),
    ];
    const { s, store } = memStore({
      live: { lastFetched: "", processedIds: [], recentItems: items },
      cands: { lastExtracted: "", candidates: [], checkedIds: items.map((i) => i.id) },
    });
    const prompts: string[] = [];
    const m = fakeModel();
    const create = m.client.chat.completions.create;
    m.client.chat.completions.create = async (req: any) => (prompts.push(req.messages[0].content), create(req));
    await run({ client: m.client, fetchText: empty, store });
    expect(m.log.summary).toBe(2);
    // Both were re-asked from the headline only: the bad summary is never fed back as "content".
    expect(prompts.every((p) => p.includes("The article itself is not available") && !p.includes("does not provide") && !p.includes("March 2026"))).toBe(true);
    const byId = Object.fromEntries(s.live.recentItems.map((it: any) => [it.id, it]));
    expect(byId.filler).toMatchObject({ summaryFallback: false, summaryVersion: 2 });
    expect(byId.oldgoogle.summary).toBe("Summary of Ebola toll rises in North Kivu oldgoogle");
    expect(byId.newgoogle).toEqual(items[2]);
    expect(byId.good).toEqual(items[3]);
  });
});
