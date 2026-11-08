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

// Text handed to the model per item. Article-text feeds (content:encoded, Atom content) are
// longer than a Google News description, which is only "<headline> <publisher>".
export const MAX_ITEM_TEXT = 1500;

/** HTML or entity-encoded feed text → plain text on one line. */
export function feedText(raw) {
  const unwrapped = String(raw ?? "").replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
  return decodeHtmlEntities(unwrapped)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/<[^>]*$/, "")
    .replace(/\s*&[a-zA-Z0-9#]*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? m[1] : "";
}

/**
 * RSS 2.0/RDF `<item>`s and Atom `<entry>`s → items. `description` is the longer of the summary
 * and the full content (`content:encoded`, Atom `<content>`), as plain text capped at
 * MAX_ITEM_TEXT; `contentLength` is the uncapped length of that text (for the source probe).
 */
export function parseFeedItems(xml, maxText = MAX_ITEM_TEXT) {
  const items = [];
  for (const m of String(xml).matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)) {
    const raw = m[1];
    const link = feedText(tag(raw, "link")) || feedText(tag(raw, "guid"));
    const text = [feedText(tag(raw, "description")), feedText(tag(raw, "content:encoded"))].sort((a, b) => b.length - a.length)[0];
    items.push({
      guid: feedText(tag(raw, "guid")) || link,
      title: feedText(tag(raw, "title")),
      link,
      pubDate: feedText(tag(raw, "pubDate")) || feedText(tag(raw, "dc:date")),
      description: text.slice(0, maxText),
      contentLength: text.length,
    });
  }
  for (const m of String(xml).matchAll(/<entry[\s>]([\s\S]*?)<\/entry>/gi)) {
    const raw = m[1];
    const href =
      raw.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)?.[1] ??
      raw.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] ??
      "";
    const text = [feedText(tag(raw, "summary")), feedText(tag(raw, "content"))].sort((a, b) => b.length - a.length)[0];
    const link = decodeHtmlEntities(href);
    items.push({
      guid: feedText(tag(raw, "id")) || link,
      title: feedText(tag(raw, "title")),
      link,
      pubDate: feedText(tag(raw, "published")) || feedText(tag(raw, "updated")),
      description: text.slice(0, maxText),
      contentLength: text.length,
    });
  }
  return items;
}

/**
 * WHO Disease Outbreak News API (https://www.who.int/api/news/diseaseoutbreaknews, JSON, OData)
 * → feed items. The text is Summary + Overview + Epidemiology as plain text, capped like any
 * feed item; the link is the public DON page built from `UrlName` (e.g. 2026-DON590).
 */
export function whoDonItems(json, maxText = MAX_ITEM_TEXT) {
  const rows = Array.isArray(json?.value) ? json.value : [];
  return rows
    .map((r) => {
      const text = [r.Summary, r.Overview, r.Epidemiology].map(feedText).filter(Boolean).join(" ");
      const title = feedText(r.UseOverrideTitle && r.OverrideTitle ? r.OverrideTitle : r.Title);
      return {
        guid: String(r.Id ?? r.DonId ?? r.UrlName ?? title),
        title,
        link: r.UrlName ? `https://www.who.int/emergencies/disease-outbreak-news/item/${encodeURIComponent(r.UrlName)}` : "",
        pubDate: String(r.PublicationDateAndTime ?? r.PublicationDate ?? ""),
        description: text.slice(0, maxText),
        contentLength: text.length,
      };
    })
    .filter((it) => it.title && it.link);
}

/** Feed body → items, by the source's `format` ("rss" default: RSS or Atom; "who-don-api": JSON). */
export function parseSourceItems(body, source = {}) {
  if (source.format === "who-don-api") return whoDonItems(JSON.parse(body));
  return parseFeedItems(body);
}

/**
 * Does an item belong to this outbreak? A source may set `match` (lower-case terms, any one
 * suffices) to replace the outbreak's keyword filter: a local paper's health section never says
 * "Bangladesh", so the outbreak filter would drop its measles stories.
 */
export function itemMatches(item, feedConfig, source = {}) {
  if (Array.isArray(source.match) && source.match.length) {
    const text = `${item.title} ${item.description}`.toLowerCase();
    return source.match.some((kw) => text.includes(kw));
  }
  return isOutbreakRelated(item, feedConfig);
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

const normKey = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Dedupe keys for a headline. Always the whole title; for a Google News item also the title
 * without its trailing " - Publisher" (titleKey), which is what lets "Headline - Reuters" match
 * "Headline - AP" and the source's own "Headline". Other sources' titles keep their dashes:
 * WHO's "Ebola disease - Uganda" and "Ebola disease - DRC" are different reports.
 * @param {string} title
 * @param {string} [link]
 */
export function titleKeys(title, link = "") {
  const keys = [normKey(title)];
  if (/^https?:\/\/news\.google\.com\//.test(link)) {
    const stripped = titleKey(title);
    if (stripped && stripped !== keys[0]) keys.push(stripped);
  }
  return keys.filter(Boolean);
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
    const keys = titleKeys(item.title, item.link);
    if (keys.some((k) => seenTitles.has(k))) {
      markProcessed.push(id);
      duplicates++;
      continue;
    }
    for (const k of keys) seenTitles.add(k);
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

// ── Summary repair and input quality ──────────────────────────────────────────
// Re-requests per item, at most, before a fallback summary is left as it is.
export const MAX_SUMMARY_REPAIR_ATTEMPTS = 3;
export const MAX_SUMMARY_REPAIRS_PER_RUN = 20;

const normText = (s) => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** A headline without its trailing " - Publisher" (Google News titles carry one). */
const headlineCore = (title) => String(title ?? "").replace(/\s+[-–—|]\s+[^-–—|]{2,60}$/, "");

/**
 * True when a stored item still shows a raw-text fallback instead of a model summary.
 * New items carry `summaryFallback` (true/false). Items stored before that flag existed are
 * judged by one rule: the summary starts with the item's headline (minus " - Publisher"),
 * which is what a Google News description looks like ("<headline> <publisher>"); a model
 * summary does not repeat the headline verbatim. A WHO description fallback is not caught by
 * the rule and is left alone. Gives up after MAX_SUMMARY_REPAIR_ATTEMPTS failed re-requests.
 */
export function needsSummaryRepair(item) {
  if ((item.summaryRepairAttempts ?? 0) >= MAX_SUMMARY_REPAIR_ATTEMPTS) return false;
  if (item.summaryFallback === true) return true;
  if (item.summaryFallback === false) return false;
  const core = normText(headlineCore(item.title));
  return core.length >= 15 && normText(item.summary).startsWith(core);
}

/**
 * True when an item's description adds next to nothing to its headline (Google News RSS gives
 * only "<headline> <publisher>"), so the model summarises a headline, not an article.
 */
export function isHeadlineOnly(title, description) {
  const core = normText(headlineCore(title));
  const desc = normText(description);
  if (!desc) return true;
  return desc.startsWith(core) && desc.length - core.length < 40;
}
