#!/usr/bin/env node
/**
 * Hantavirus Tracker — Feed Updater
 * Runs on a daily GitHub Actions cron. Fetches RSS feeds from PAHO and Google News,
 * filters for hantavirus / MV Hondius content, summarizes via OpenRouter (DeepSeek),
 * and writes updated data/live.json.
 *
 * Required env: OPENROUTER_API_KEY
 */

import OpenAI from "openai";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const LIVE_JSON = resolve(ROOT, "data/live.json");
const CANDIDATES_JSON = resolve(ROOT, "data/candidates.json");

// Cap candidates list to recent signals to avoid carrying stale extractions forever.
const CANDIDATE_MAX_AGE_DAYS = 30;

// ── Feed sources ──────────────────────────────────────────────────────────────
const FEEDS = [
  {
    name: "PAHO",
    // Pan American Health Organization — confirmed working RSS
    url: "https://www.paho.org/en/rss.xml",
    source: "PAHO",
  },
  {
    name: "Google News — Hantavirus",
    // Google News RSS for the outbreak — aggregates WHO, AP, Reuters, CDC press releases
    url: "https://news.google.com/rss/search?q=hantavirus+MV+Hondius+OR+hantavirus+outbreak+2026&hl=en-US&gl=US&ceid=US:en",
    source: "News",
  },
  {
    name: "Google News — WHO DON",
    // Specifically tracks WHO disease outbreak news
    url: "https://news.google.com/rss/search?q=WHO+%22disease+outbreak+news%22+hantavirus&hl=en-US&gl=US&ceid=US:en",
    source: "WHO",
  },
];

// ── Keywords that flag a hantavirus-related article ───────────────────────────
const KEYWORDS = [
  "hantavirus",
  "hondius",
  "andes virus",
  "andes hantavirus",
  "hantaviral",
];

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

function isHantavirusRelated(item) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  return KEYWORDS.some((kw) => text.includes(kw));
}

function itemId(feedSource, guid) {
  return `${feedSource.toLowerCase().replace(/\s+/g, "-")}-${Buffer.from(guid).toString("base64").slice(0, 18)}`;
}

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
  const prompt = `You extract structured signals from news articles about the 2026 MV Hondius hantavirus outbreak.

Read the title and content. If — and only if — the article reports a SPECIFIC COUNTRY with hantavirus cases, deaths, or persons under monitoring RELATED TO THE 2026 MV HONDIUS OUTBREAK (cruise-ship origin, Andes hantavirus, returning passengers/crew), return JSON:

{"country": "<English country name>", "iso": "<ISO 3166-1 alpha-2>", "casesMentioned": <integer or null>, "deathsMentioned": <integer or null>, "monitoredMentioned": <integer or null>, "context": "<one short factual sentence from the article>"}

If the article does NOT mention a specific country, OR the case data is from a different/historical hantavirus outbreak (rodent-borne US Southwest, endemic Argentine cases, unrelated regional outbreaks), return:

{"country": null, "iso": null, "casesMentioned": null, "deathsMentioned": null, "monitoredMentioned": null, "context": null}

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
      monitoredMentioned:
        typeof parsed.monitoredMentioned === "number"
          ? parsed.monitoredMentioned
          : null,
      context: parsed.context ? String(parsed.context) : "",
    };
  } catch (err) {
    console.error("Candidate extraction error:", err.message);
    return null;
  }
}

// ── OpenRouter summarization (DeepSeek V4 Flash — cheap, fast) ────────────────
async function extractSummary(client, title, description) {
  const prompt = `Summarize this news item about the 2026 MV Hondius hantavirus outbreak in 1–2 sentences. Be factual and specific. Include any case counts, deaths, quarantine numbers, or key official statements. No preamble.

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
          "HTTP-Referer": "https://github.com/hantavirus-tracker",
          "X-Title": "MV Hondius Hantavirus Tracker",
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
  const newItems = [];
  const newCandidates = [];

  for (const feed of FEEDS) {
    console.log(`Fetching ${feed.name}…`);
    let xml;
    try {
      const res = await fetch(feed.url, {
        headers: {
          "User-Agent": "hantavirus-tracker/1.0 (public health surveillance)",
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

    const relevant = items.filter(isHantavirusRelated);
    console.log(`  ${relevant.length} hantavirus-related`);

    for (const item of relevant) {
      const id = itemId(feed.source, item.guid);
      if (processedSet.has(id)) {
        console.log(`  Already processed: ${item.title.slice(0, 60)}`);
        continue;
      }

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
  live.processedIds = [...processedSet];

  if (newItems.length > 0) {
    live.recentItems = [...newItems, ...(live.recentItems ?? [])].slice(0, 20);
    console.log(`Added ${newItems.length} new items.`);
  } else {
    console.log("No new hantavirus items found.");
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
