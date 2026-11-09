import { describe, it, expect } from "vitest";
import {
  parseRSSItems,
  classifyFeedItems,
  pickSummaryIds,
  mergeRecentItems,
  mergeIdList,
  mergeCandidates,
  itemId,
  parseFeedItems,
  isHeadlineOnly,
  needsSummaryRepair,
  MAX_ITEM_TEXT,
  whoDonItems,
  titleKeys,
  summaryProblem,
  cleanSummary,
  repairInput,
} from "../scripts/lib/feed-items.mjs";

const rss = (items: Array<{ t: string; g: string; d?: string }>) =>
  `<rss><channel>${items
    .map(
      (i) =>
        `<item><title><![CDATA[${i.t}]]></title><link>https://x/${i.g}</link><guid>${i.g}</guid>` +
        `<pubDate>Tue, 03 Nov 2026 10:00:00 GMT</pubDate><description>${i.d ?? "body"}</description></item>`,
    )
    .join("")}</channel></rss>`;

describe("parseRSSItems", () => {
  it("parses CDATA titles, guids and entity-encoded descriptions", () => {
    const [a] = parseRSSItems(rss([{ t: "Ebola &amp; more", g: "g1", d: "&lt;b&gt;Cases&lt;/b&gt; rise" }]));
    expect(a).toMatchObject({ guid: "g1", link: "https://x/g1", title: "Ebola & more", description: "Cases rise" });
  });
});

describe("classifyFeedItems", () => {
  const mk = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ guid: `g${i}`, title: `Title ${i}`, link: "l", pubDate: "2026-11-03", description: "" }));

  it("caps new items, marks the backlog processed, skips processed ids and repeated headlines", () => {
    const items = mk(6);
    const processed = new Set([itemId("WHO", "g1")]);
    const seen = new Set(["title 2"]);
    const r = classifyFeedItems(items, { feedSource: "WHO", processed, seenTitles: seen, maxNew: 2 });
    // g0 new, g1 already processed, g2 duplicate headline, g3 new, g4/g5 beyond the cap
    expect(r.fresh.map((f) => f.id)).toEqual([itemId("WHO", "g0"), itemId("WHO", "g3")]);
    expect(r.skippedProcessed).toBe(1);
    expect(r.duplicates).toBe(1);
    expect(r.markProcessed).toEqual([itemId("WHO", "g2"), itemId("WHO", "g4"), itemId("WHO", "g5")]);
  });
});

describe("pickSummaryIds", () => {
  const row = (id: string, date: string) => ({ id, date });

  it("summarises only new items that make the newest-N list", () => {
    const existing = [row("e1", "2026-11-05"), row("e2", "2026-11-04")];
    const fresh = [row("n-old", "2026-10-01"), row("n-new", "2026-11-06"), row("n-mid", "2026-11-04")];
    const ids = pickSummaryIds(fresh, existing, 3);
    // top 3: n-new (11-06), e1 (11-05), then 11-04 tie: e2 < n-mid by id → e2
    expect([...ids]).toEqual(["n-new"]);
    expect([...pickSummaryIds(fresh, existing, 4)].sort()).toEqual(["n-mid", "n-new"]);
  });

  it("keeps everything while under the limit, and nothing if all are older than a full list", () => {
    expect(pickSummaryIds([row("a", "2026-01-01")], [], 20).has("a")).toBe(true);
    const full = Array.from({ length: 20 }, (_, i) => row(`e${i}`, "2026-11-05"));
    expect(pickSummaryIds([row("a", "2026-01-01")], full, 20).size).toBe(0);
  });
});

describe("merge helpers", () => {
  it("mergeRecentItems sorts by date then id, dedupes by id, caps", () => {
    const m = mergeRecentItems(
      [{ id: "b", date: "2026-11-02" }, { id: "a", date: "2026-11-02" }],
      [{ id: "a", date: "2026-11-02", old: true }, { id: "c", date: "2026-11-03" }],
      3,
    );
    expect(m.map((x: { id: string }) => x.id)).toEqual(["c", "a", "b"]);
    expect((m[1] as { old?: boolean }).old).toBeUndefined();
  });

  it("mergeIdList appends without duplicates and keeps the newest", () => {
    expect(mergeIdList(["a", "b"], ["b", "c"], 10)).toEqual(["a", "b", "c"]);
    expect(mergeIdList(["a", "b"], ["c"], 2)).toEqual(["b", "c"]);
  });

  it("mergeCandidates drops old entries, dedupes (new wins) and sorts", () => {
    const now = Date.parse("2026-11-06T00:00:00Z");
    const out = mergeCandidates(
      [{ id: "n", date: "2026-11-05" }, { id: "dup", date: "2026-11-01", v: "new" }],
      [{ id: "dup", date: "2026-11-01", v: "old" }, { id: "stale", date: "2026-08-01" }, { id: "z", date: "2026-11-05" }],
      now,
    );
    expect(out.map((c: { id: string }) => c.id)).toEqual(["n", "z", "dup"]);
    expect((out[2] as { v: string }).v).toBe("new");
  });
});

describe("parseFeedItems", () => {
  it("keeps the article body from content:encoded when it is longer than the description", () => {
    const xml = `<rss><channel><item><title>Ebola &amp; more</title><link>https://a/1</link><guid isPermaLink="false">g1</guid>
      <pubDate>Fri, 06 Nov 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>Short teaser</p>]]></description>
      <content:encoded><![CDATA[<p>Long body with <b>14 deaths</b> reported.</p><script>track()</script>]]></content:encoded></item></channel></rss>`;
    expect(parseFeedItems(xml)).toEqual([
      { guid: "g1", title: "Ebola & more", link: "https://a/1", pubDate: "Fri, 06 Nov 2026 10:00:00 GMT", description: "Long body with 14 deaths reported.", contentLength: 34 },
    ]);
  });

  it("reads Atom entries (alternate link, published date, content over summary)", () => {
    const xml = `<feed><entry><title>Measles update</title><link rel="alternate" href="https://b/2?x=1&amp;y=2"/><id>tag:b,2</id>
      <published>2026-11-05T00:00:00Z</published><summary>sum</summary><content type="html">&lt;p&gt;Full text here&lt;/p&gt;</content></entry></feed>`;
    expect(parseFeedItems(xml)[0]).toMatchObject({ guid: "tag:b,2", link: "https://b/2?x=1&y=2", pubDate: "2026-11-05T00:00:00Z", description: "Full text here" });
  });

  it("caps the text handed to the model and gives Google News items the same text as parseRSSItems", () => {
    const long = "word ".repeat(1000);
    expect(parseFeedItems(`<item><title>t</title><guid>g</guid><description>${long}</description></item>`)[0].description).toHaveLength(MAX_ITEM_TEXT);
    const gn = `<item><title>X - Pub</title><link>https://news.google.com/a</link><guid>g</guid><description>&lt;a href=&quot;u&quot;&gt;X&lt;/a&gt;&amp;nbsp;&lt;font&gt;Pub&lt;/font&gt;</description></item>`;
    expect(parseFeedItems(gn)[0].description).toBe(parseRSSItems(gn)[0].description);
  });
});

describe("isHeadlineOnly and needsSummaryRepair", () => {
  it("spots a Google News description and passes real article text", () => {
    expect(isHeadlineOnly("Ebola toll rises to 5,198 in Congo - Reuters", "Ebola toll rises to 5,198 in Congo Reuters")).toBe(true);
    expect(isHeadlineOnly("Ebola toll rises", "The health ministry said on Friday that 14 more people had died, bringing the total to 5,198.")).toBe(false);
  });

  it("repairs flagged and legacy fallbacks only", () => {
    const base = { title: "Ebola toll rises to 5,198 in Congo - Reuters" };
    expect(needsSummaryRepair({ ...base, summary: "Ebola toll rises to 5,198 in Congo  Reuters" })).toBe(true);
    expect(needsSummaryRepair({ ...base, summary: "Officials reported 5,198 deaths." })).toBe(false);
    expect(needsSummaryRepair({ ...base, summary: "Ebola toll rises to 5,198 in Congo, officials said.", summaryFallback: false })).toBe(false);
    expect(needsSummaryRepair({ ...base, summary: "x", summaryFallback: true, summaryRepairAttempts: 3 })).toBe(false);
  });
});

describe("whoDonItems", () => {
  it("maps the WHO DON API to feed items with the report text and the public DON link", () => {
    const items = whoDonItems({
      value: [
        { Id: "a", Title: "Ebola disease - DRC", UseOverrideTitle: false, OverrideTitle: "x", UrlName: "2026-DON590", PublicationDateAndTime: "2026-10-23T12:00:00Z", Summary: "<p>Since 8 October, <b>412</b> new cases.</p>", Overview: "<p>Overview.</p>", Epidemiology: "" },
        { Id: "b", Title: "", UrlName: "2026-DON591" },
      ],
    });
    expect(items).toEqual([
      { guid: "a", title: "Ebola disease - DRC", link: "https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON590", pubDate: "2026-10-23T12:00:00Z", description: "Since 8 October, 412 new cases. Overview.", contentLength: 41 },
    ]);
    expect(whoDonItems({})).toEqual([]);
  });
});

describe("titleKeys", () => {
  const g = "https://news.google.com/rss/articles/x";
  it("strips the publisher only from Google News headlines", () => {
    expect(titleKeys("Ebola toll rises - Reuters", g)).toEqual(["ebola toll rises reuters", "ebola toll rises"]);
    expect(titleKeys("Ebola disease - Uganda", "https://www.who.int/x")).toEqual(["ebola disease uganda"]);
  });
  it("keeps two WHO reports apart but matches a Google copy to the source's own headline", () => {
    const who = titleKeys("Ebola disease - Uganda", "https://www.who.int/a");
    expect(who.some((k) => titleKeys("Ebola disease - DRC", "https://www.who.int/b").includes(k))).toBe(false);
    expect(titleKeys("Ebola disease - Uganda - WHO", g).some((k) => who.includes(k))).toBe(true);
  });
});

describe("classifyFeedItems with datedTitles (WHO DON updates share one title)", () => {
  const don = (g: string, day: number) => ({
    guid: g,
    title: "Ebola disease caused by Bundibugyo virus - Democratic Republic of the Congo",
    link: `https://www.who.int/x/${g}`,
    pubDate: new Date(Date.UTC(2026, 9, day)).toUTCString(),
    description: "text",
  });
  it("keeps every dated update and still drops a later Google News copy of the title", () => {
    const seen = new Set<string>();
    const processed = new Set<string>();
    const r = classifyFeedItems([don("a", 23), don("b", 8), don("c", 1)], { feedSource: "WHO", processed, seenTitles: seen, datedTitles: true });
    expect(r.fresh).toHaveLength(3);
    const googleCopy = { guid: "g", title: "Ebola disease caused by Bundibugyo virus - Democratic Republic of the Congo - WHO", link: "https://news.google.com/a", pubDate: don("a", 23).pubDate, description: "" };
    expect(classifyFeedItems([googleCopy], { feedSource: "News", processed, seenTitles: seen }).duplicates).toBe(1);
  });
  it("without the flag the same updates collapse into one (the old behaviour)", () => {
    const r = classifyFeedItems([don("a", 23), don("b", 8)], { feedSource: "WHO", processed: new Set(), seenTitles: new Set() });
    expect(r.fresh).toHaveLength(1);
  });
});

describe("summaryProblem (real summaries stored on 2026-11-08)", () => {
  const filler = [
    "The article does not provide a cumulative death toll or confirmed case count for the 2026 Bundibugyo Ebola outbreak in DR Congo and Uganda.",
    "As of the article, the 2026 Bundibugyo Ebola outbreak in DR Congo and Uganda has no officially stated cumulative death toll or confirmed case count, but the piece highlights the vaccines.",
    "Three more children have died from measles-like symptoms in Bangladesh, according to a recent report. No cumulative death toll or confirmed case count was provided.",
    "The article reports that measles cases have reached 1,487 across 45 counties in Pennsylvania, though the specific date for these figures is not provided in the title or content.",
    "Based solely on the provided title and source (a review in Frontiers), the article does not contain specific case counts.",
    "I can't summarize this item: the text you provided contains only the title and source.",
  ];
  const good = [
    "DR Congo's Ebola death toll has risen to 5,198, with total cases reaching 10,668.",
    "Six people died from measles symptoms in a single day in Bangladesh, according to bdnews24.com.",
    "States report eight measles deaths in the US this year, though the CDC's official count is lower.",
    "A three-member commission has been formed to determine liability for alleged procurement and distribution failures that delayed measles vaccines.",
    "WHO said the source of the infection is under investigation.",
  ];
  it("flags filler and stubs, and passes real summaries", () => {
    for (const f of filler) expect(summaryProblem(f), f).toBe("meta");
    for (const g of good) expect(summaryProblem(g), g).toBeNull();
    expect(summaryProblem("More than")).toBe("too_short");
  });
  it("cleanSummary drops a dateless 'As of the …' lead-in only", () => {
    expect(cleanSummary("As of the latest report, the toll reached 1,272.")).toBe("The toll reached 1,272.");
    expect(cleanSummary("As of 6 January 2026, 93 cases were confirmed.")).toBe("As of 6 January 2026, 93 cases were confirmed.");
  });
  it("repairInput never feeds a bad summary or a Google News description back to the model", () => {
    expect(repairInput({ url: "https://news.google.com/a", summary: "Headline Publisher" })).toBe("");
    expect(repairInput({ url: "https://who/x", summary: filler[0] })).toBe("");
    expect(repairInput({ url: "https://who/x", summary: "Since 8 October, 412 new cases were reported." })).toBe("Since 8 October, 412 new cases were reported.");
  });
});
