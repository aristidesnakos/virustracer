// Pure helpers for scripts/fetch-feeds.mjs (no network, no fs): RSS parsing, filtering, which
// items are new, which of them need a summary, and how stored lists are merged. Unit-tested in
// tests/feed-items.test.ts.
import { createHash } from "node:crypto";

export const RECENT_ITEMS_KEEP = 20;
export const PROCESSED_IDS_KEEP = 1000;
export const CHECKED_IDS_KEEP = 1000;
// Max new items handled per feed per run (the stored list is capped at 20 anyway).
export const MAX_NEW_PER_FEED = 15;
// Cap candidates list to recent signals to avoid carrying stale extractions forever.
export const CANDIDATE_MAX_AGE_DAYS = 30;

export function decodeHtmlEntities(str) {
  // Run multiple passes to handle double-encoded entities (e.g. &amp;amp; → &amp; → &)
  let prev;
  let s = str;
  do {
    prev = s;
    s = s
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  } while (s !== prev);
  return s;
}

// ── Parse RSS XML into items ──
export function parseRSSItems(xml) {
  const items = [];
  const blocks = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);
  for (const block of blocks) {
    const raw = block[1];
    const title =
      raw.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/s)?.[1] ??
      raw.match(/<title>(.*?)<\/title>/s)?.[1] ??
      "";
    const link =
      raw.match(/<link>(.*?)<\/link>/s)?.[1] ??
      raw.match(/<guid>(.*?)<\/guid>/s)?.[1] ??
      "";
    const pubDate = raw.match(/<pubDate>(.*?)<\/pubDate>/s)?.[1] ?? "";
    const description =
      raw.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/s)?.[1] ??
      raw.match(/<description>([\s\S]*?)<\/description>/s)?.[1] ??
      "";
    const guid =
      raw.match(/<guid[^>]*>(.*?)<\/guid>/s)?.[1] ??
      link;
    const decodedDescription = decodeHtmlEntities(description);
    const tagsStripped = decodedDescription.replace(/<[^>]+>/g, " ").replace(/<[^>]*$/, "");
    const trailingCleanup = tagsStripped.replace(/\s*&[a-zA-Z0-9#]*$/, "").replace(/\s+/g, " ").trim();

    items.push({
      guid: guid.trim(),
      title: decodeHtmlEntities(title.trim()).replace(/<[^>]+>/g, ""),
      link: link.trim(),
      pubDate: pubDate.trim(),
      description: trailingCleanup.slice(0, 600),
    });
  }
  return items;
}

export function isOutbreakRelated(item, feedConfig) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  if (feedConfig.strongKeywords.some((kw) => text.includes(kw))) return true;
  return (feedConfig.contextualKeywords ?? []).some(
    ({ term, needsOneOf }) => text.includes(term) && needsOneOf.some((kw) => text.includes(kw)),
  );
}

export function itemId(feedSource, guid) {
  // Hash the full guid — Google News guids share long common prefixes, so a
  // truncated base64 would collide and silently drop distinct articles.
  const hash = createHash("sha1").update(guid).digest("hex").slice(0, 16);
  return `${feedSource.toLowerCase().replace(/\s+/g, "-")}-${hash}`;
}

// Normalize a headline for cross-publisher dedupe (strip " - Publisher", punctuation).
export function titleKey(title) {
  return title
    .replace(/\s+[-–—|]\s+[^-–—|]{2,60}$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isoDate(pubDate) {
  try {
    const d = new Date(pubDate);
    if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
    return d.toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Newest first, then id, so equal dates keep a stable order between runs. */
export function compareItems(a, b) {
  return String(b.date).localeCompare(String(a.date)) || String(a.id).localeCompare(String(b.id));
}

/**
 * Split one feed's outbreak-related items (newest first) into the ones to work on and the
 * backlog. Mirrors the original loop: a backlog beyond `maxNew` and a repeated headline are
 * marked processed without work; an id already processed is skipped. `seenTitles` is shared
 * across feeds and is mutated.
 * @param {Array<{guid: string, title: string, link: string, pubDate: string, description: string}>} relevant
 * @param {{feedSource: string, processed: Set<string>, seenTitles: Set<string>, maxNew?: number}} o
 * @returns {{fresh: Array<{id: string, item: object, date: string}>, markProcessed: string[], skippedProcessed: number, duplicates: number}}
 */
export function classifyFeedItems(relevant, { feedSource, processed, seenTitles, maxNew = MAX_NEW_PER_FEED }) {
  const fresh = [];
  const markProcessed = [];
  let skippedProcessed = 0;
  let duplicates = 0;
  for (const item of relevant) {
    const id = itemId(feedSource, item.guid);
    if (fresh.length >= maxNew) {
      markProcessed.push(id);
      continue;
    }
    if (processed.has(id)) {
      skippedProcessed++;
      continue;
    }
    const key = titleKey(item.title);
    if (seenTitles.has(key)) {
      markProcessed.push(id);
      duplicates++;
      continue;
    }
    seenTitles.add(key);
    fresh.push({ id, item, date: isoDate(item.pubDate) });
  }
  return { fresh, markProcessed, skippedProcessed, duplicates };
}

/**
 * Ids of the new items that will survive in recentItems (the newest `keep` after merging with
 * the stored ones). Only these are worth a summary, which is display-only; the others still
 * get a candidate extraction because that feeds the early-signal ledger.
 * @param {Array<{id: string, date: string}>} fresh
 * @param {Array<{id: string, date: string}>} existing
 * @returns {Set<string>}
 */
export function pickSummaryIds(fresh, existing, keep = RECENT_ITEMS_KEEP) {
  const freshIds = new Set(fresh.map((f) => f.id));
  const pool = [
    ...fresh.map((f) => ({ id: f.id, date: f.date })),
    ...existing.filter((e) => !freshIds.has(e.id)).map((e) => ({ id: e.id, date: e.date })),
  ].sort(compareItems);
  return new Set(
    pool
      .slice(0, keep)
      .map((p) => p.id)
      .filter((id) => freshIds.has(id)),
  );
}

/** New items first, deduped by id, newest `keep` in a deterministic order. */
export function mergeRecentItems(newItems, existing, keep = RECENT_ITEMS_KEEP) {
  const byId = new Map();
  for (const it of [...newItems, ...existing]) if (!byId.has(it.id)) byId.set(it.id, it);
  return [...byId.values()].sort(compareItems).slice(0, keep);
}

/** Previous ids then `added`, no duplicates, only the newest `keep` (list order = age). */
export function mergeIdList(previous, added, keep) {
  const seen = new Set();
  const out = [];
  for (const id of [...previous, ...added]) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.slice(-keep);
}

/**
 * Candidates after a run: new ones first, entries older than `maxAgeDays` dropped, deduped by
 * id (earliest occurrence wins), sorted newest first then by id.
 */
export function mergeCandidates(newCandidates, existing, nowMs, maxAgeDays = CANDIDATE_MAX_AGE_DAYS) {
  const cutoff = nowMs - maxAgeDays * 24 * 60 * 60 * 1000;
  const seen = new Set();
  const out = [];
  for (const c of [...newCandidates, ...existing]) {
    const t = new Date(c.date || c.extractedAt).getTime();
    if (!Number.isFinite(t) || t < cutoff || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out.sort(compareItems);
}
