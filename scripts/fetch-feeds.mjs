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

  const processedSet = new Set(live.processedIds ?? []);
  const newItems = [];

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

      newItems.push({
        id,
        title: item.title,
        url: item.link,
        date: isoDate(item.pubDate),
        source: feed.name,
        summary,
      });

      processedSet.add(id);
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
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
