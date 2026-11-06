import { describe, it, expect } from "vitest";
import {
  parseRSSItems,
  classifyFeedItems,
  pickSummaryIds,
  mergeRecentItems,
  mergeIdList,
  mergeCandidates,
  itemId,
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
