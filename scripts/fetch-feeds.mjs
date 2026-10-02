#!/usr/bin/env node
/**
 * virustracer — Ebola Outbreak Tracker — Feed Updater
 * Runs on a GitHub Actions cron. Fetches RSS feeds from WHO and Google News,
 * filters for 2026 Bundibugyo Ebola (DR Congo & Uganda) content, summarizes via
 * OpenRouter (DeepSeek), and writes updated data/live.json.
 *
 * Required env: OPENROUTER_API_KEY
 */

import OpenAI from "openai";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { createHash } from "crypto";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const LIVE_JSON = resolve(ROOT, "data/live.json");
const CANDIDATES_JSON = resolve(ROOT, "data/candidates.json");

// Cap candidates list to recent signals to avoid carrying stale extractions forever.
const CANDIDATE_MAX_AGE_DAYS = 30;

// ── Feed sources ──────────────────────────────────────────────────────────────
const gnews = (q) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

const FEEDS = [
  {
    name: "WHO News",
    // WHO general news RSS — not outbreak-specific, so keyword filtered below
    url: "https://www.who.int/rss-feeds/news-english.xml",
    source: "WHO",
  },
  {
    name: "Google News — Ebola death toll",
    url: gnews("Ebola Congo death toll"),
    source: "News",
  },
  {
    name: "Google News — Bundibugyo outbreak",
    url: gnews("Ebola Bundibugyo outbreak"),
    source: "News",
  },
  {
    name: "Google News — WHO DON",
    // Specifically tracks WHO disease outbreak news
    url: gnews('WHO "disease outbreak news" Ebola Bundibugyo'),
    source: "WHO",
  },
];

// ── Keywords that flag an outbreak-related article ────────────────────────────
// Strong terms match on their own; "ituri" is noisy so it needs outbreak context.
const STRONG_KEYWORDS = ["ebola", "bundibugyo", "ebola virus disease", "filovirus"];
const ITURI_CONTEXT = ["outbreak", "virus", "cases", "deaths"];

// ── HTML entity decoder ───────────────────────────────────────────────────────
function decodeHtmlEntities(str) {
  // Run multiple passes to handle double-encoded entities (e.g. &amp;amp; → &amp; → &)
  let prev;
  let s = str;
  do {
    prev = s;
    s = s
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

// ── Parse RSS XML into items ──────────────────────────────────────────────────
function parseRSSItems(xml) {
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

function isOutbreakRelated(item) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  if (STRONG_KEYWORDS.some((kw) => text.includes(kw))) return true;
  return text.includes("ituri") && ITURI_CONTEXT.some((kw) => text.includes(kw));
}

function itemId(feedSource, guid) {
  // Hash the full guid — Google News guids share long common prefixes, so a
  // truncated base64 would collide and silently drop distinct articles.
  const hash = createHash("sha1").update(guid).digest("hex").slice(0, 16);
  return `${feedSource.toLowerCase().replace(/\s+/g, "-")}-${hash}`;
}

// Normalize a headline for cross-publisher dedupe (strip " - Publisher", punctuation).
function titleKey(title) {
  return title
    .replace(/\s+[-–—|]\s+[^-–—|]{2,60}$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Max new items summarized per feed per run (the stored list is capped at 20 anyway).
const MAX_NEW_PER_FEED = 15;

function isoDate(pubDate) {
  try {
    const d = new Date(pubDate);
    if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
    return d.toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// ── ISO 3166-1 alpha-2 → flag emoji ───────────────────────────────────────────
function isoToFlag(iso) {
  if (!iso || typeof iso !== "string" || iso.length !== 2) return "";
  const A = 0x1F1E6;
  const code = iso.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return (
    String.fromCodePoint(A + code.charCodeAt(0) - 65) +
    String.fromCodePoint(A + code.charCodeAt(1) - 65)
  );
}

// ── Structured candidate extraction (DeepSeek V4 Flash, JSON mode) ────────────
async function extractCandidate(client, title, description) {
  const prompt = `You extract structured signals from news articles about the 2026 Bundibugyo Ebola outbreak (DR Congo & Uganda).

Read the title and content. If — and only if — the article reports a SPECIFIC COUNTRY OTHER THAN DR CONGO (which is already curated) with Ebola cases, deaths, suspected cases, or contacts RELATED TO THE 2026 BUNDIBUGYO OUTBREAK (e.g. Uganda, Rwanda, Burundi, South Sudan, Kenya, Tanzania, or an imported/medevac case in Europe or the US), return JSON:

{"country": "<English country name>", "iso": "<ISO 3166-1 alpha-2>", "casesMentioned": <integer or null>, "deathsMentioned": <integer or null>, "context": "<one short factual sentence from the article>"}

If the article is only about DR Congo, OR does not mention a specific country, OR the data is from a historical/different outbreak (2014–16 West Africa, 2018–20 Kivu, 2025 Kasai/Uganda Sudan-virus), OR the country is merely "on alert" or preparing without reported cases/deaths/contacts, return:

{"country": null, "iso": null, "casesMentioned": null, "deathsMentioned": null, "context": null}

Title: ${title}
Content: ${description}

Respond with JSON only.`;

  try {
    const response = await client.chat.completions.create({
      model: "deepseek/deepseek-v4-flash",
      max_tokens: 250,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });
    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.country || !parsed.iso) return null;
    return {
      country: String(parsed.country),
      iso: String(parsed.iso).toUpperCase(),
      flag: isoToFlag(parsed.iso),
      casesMentioned:
        typeof parsed.casesMentioned === "number" ? parsed.casesMentioned : null,
      deathsMentioned:
        typeof parsed.deathsMentioned === "number" ? parsed.deathsMentioned : null,
      context: parsed.context ? String(parsed.context) : "",
    };
  } catch (err) {
    console.error("Candidate extraction error:", err.message);
    return null;
  }
}

// ── OpenRouter summarization (DeepSeek V4 Flash — cheap, fast) ────────────────
async function extractSummary(client, title, description) {
  const prompt = `Summarize this news item about the 2026 Bundibugyo Ebola outbreak (DR Congo & Uganda) in 1–2 factual sentences. If the article states the latest cumulative death toll or confirmed case count, LEAD with it (include the as-of date if given). Otherwise include any key figures or official statements. No preamble.

Title: ${title}
Content: ${description}`;

  try {
    const response = await client.chat.completions.create({
      model: "deepseek/deepseek-v4-flash",
      max_tokens: 150,
      messages: [{ role: "user", content: prompt }],
    });
    return response.choices[0]?.message?.content?.trim() ?? description.slice(0, 200);
  } catch (err) {
    console.error("OpenRouter error:", err.message);
    return description.slice(0, 200);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const canSummarize = Boolean(apiKey);

  const client = canSummarize
    ? new OpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey,
        defaultHeaders: {
          "HTTP-Referer": "https://github.com/aristidesnakos/virustracer",
          "X-Title": "virustracer — Ebola Outbreak Tracker",
        },
      })
    : null;

  if (!canSummarize) {
    console.warn("OPENROUTER_API_KEY not set — saving raw descriptions.");
  }

  // Load existing live.json
  let live = { lastFetched: "", processedIds: [], recentItems: [] };
  if (existsSync(LIVE_JSON)) {
    try {
      live = JSON.parse(readFileSync(LIVE_JSON, "utf-8"));
    } catch (err) {
      console.error("Failed to parse live.json:", err.message);
    }
  }

  // Load existing candidates.json
  let candidatesStore = { lastExtracted: "", candidates: [] };
  if (existsSync(CANDIDATES_JSON)) {
    try {
      candidatesStore = JSON.parse(readFileSync(CANDIDATES_JSON, "utf-8"));
    } catch (err) {
      console.error("Failed to parse candidates.json:", err.message);
    }
  }
  const candidateIdSet = new Set(
    (candidatesStore.candidates ?? []).map((c) => c.id),
  );

  const processedSet = new Set(live.processedIds ?? []);
  const seenTitles = new Set((live.recentItems ?? []).map((i) => titleKey(i.title)));
  const newItems = [];
  const newCandidates = [];

  for (const feed of FEEDS) {
    console.log(`Fetching ${feed.name}…`);
    let xml;
    try {
      const res = await fetch(feed.url, {
        headers: {
          "User-Agent": "virustracer/1.0 (Ebola outbreak tracker; public health surveillance)",
          Accept: "application/rss+xml, application/xml, text/xml",
        },
        signal: AbortSignal.timeout(20_000),
        redirect: "follow",
      });
      if (!res.ok) {
        console.warn(`  ${feed.name}: HTTP ${res.status}`);
        continue;
      }
      xml = await res.text();
    } catch (err) {
      console.warn(`  ${feed.name} fetch failed: ${err.message}`);
      continue;
    }

    const items = parseRSSItems(xml);
    console.log(`  ${items.length} items parsed`);

    const relevant = items.filter(isOutbreakRelated);
    console.log(`  ${relevant.length} outbreak-related`);

    // Newest first, so the per-feed cap keeps the most recent articles.
    relevant.sort((a, b) => isoDate(b.pubDate).localeCompare(isoDate(a.pubDate)));

    let addedFromFeed = 0;
    for (const item of relevant) {
      const id = itemId(feed.source, item.guid);
      if (addedFromFeed >= MAX_NEW_PER_FEED) {
        // Older backlog beyond the cap: mark seen so it isn't re-summarized next run.
        processedSet.add(id);
        continue;
      }
      if (processedSet.has(id)) {
        console.log(`  Already processed: ${item.title.slice(0, 60)}`);
        continue;
      }
      const tKey = titleKey(item.title);
      if (seenTitles.has(tKey)) {
        processedSet.add(id);
        console.log(`  Duplicate headline: ${item.title.slice(0, 60)}`);
        continue;
      }
      seenTitles.add(tKey);
      addedFromFeed++;

      console.log(`  New: ${item.title.slice(0, 80)}`);

      const summary = client
        ? await extractSummary(client, item.title, item.description)
        : item.description.slice(0, 200);

      const feedItem = {
        id,
        title: item.title,
        url: item.link,
        date: isoDate(item.pubDate),
        source: feed.name,
        summary,
      };
      newItems.push(feedItem);

      // Structured candidate extraction (skips silently if no LLM client)
      if (client && !candidateIdSet.has(id)) {
        const candidate = await extractCandidate(
          client,
          item.title,
          item.description,
        );
        if (candidate) {
          newCandidates.push({
            id,
            ...candidate,
            sourceTitle: item.title,
            sourceUrl: item.link,
            sourceName: feed.name,
            date: feedItem.date,
            extractedAt: new Date().toISOString(),
          });
          candidateIdSet.add(id);
          console.log(
            `    → candidate: ${candidate.country} (${candidate.casesMentioned ?? "?"} cases)`,
          );
        }
      }

      processedSet.add(id);
    }
  }

  // Backfill: extract candidates from existing recent items that haven't been processed yet.
  if (client) {
    const existingItems = live.recentItems ?? [];
    for (const item of existingItems) {
      if (candidateIdSet.has(item.id)) continue;
      console.log(`  Backfilling candidate for: ${item.title.slice(0, 60)}`);
      const candidate = await extractCandidate(client, item.title, item.summary);
      candidateIdSet.add(item.id);
      if (candidate) {
        newCandidates.push({
          id: item.id,
          ...candidate,
          sourceTitle: item.title,
          sourceUrl: item.url,
          sourceName: item.source,
          date: item.date,
          extractedAt: new Date().toISOString(),
        });
        console.log(
          `    → candidate: ${candidate.country} (${candidate.casesMentioned ?? "?"} cases)`,
        );
      }
    }
  }

  live.lastFetched = new Date().toISOString();
  live.processedIds = [...processedSet].slice(-1000);

  if (newItems.length > 0) {
    live.recentItems = [...newItems, ...(live.recentItems ?? [])]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 20);
    console.log(`Added ${newItems.length} new items.`);
  } else {
    console.log("No new outbreak items found.");
  }

  writeFileSync(LIVE_JSON, JSON.stringify(live, null, 2));

  // Merge candidates, prune stale entries, and persist.
  const allCandidates = [
    ...newCandidates,
    ...(candidatesStore.candidates ?? []),
  ];
  const cutoffMs =
    Date.now() - CANDIDATE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const fresh = allCandidates.filter((c) => {
    const t = new Date(c.date || c.extractedAt).getTime();
    return Number.isFinite(t) && t >= cutoffMs;
  });
  // Dedup by id, preferring earliest occurrence (newCandidates first).
  const seen = new Set();
  const deduped = [];
  for (const c of fresh) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    deduped.push(c);
  }

  writeFileSync(
    CANDIDATES_JSON,
    JSON.stringify(
      {
        lastExtracted: new Date().toISOString(),
        candidates: deduped,
      },
      null,
      2,
    ),
  );

  if (newCandidates.length > 0) {
    console.log(`Added ${newCandidates.length} new candidate signals.`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
