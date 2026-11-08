#!/usr/bin/env node
/**
 * Keyless probe of candidate news sources for the outbreak feeds (scripts/fetch-feeds.mjs).
 * Run through .github/workflows/probe-feeds.yml (workflow_dispatch): the build sandbox cannot
 * reach these hosts, GitHub's runners can, and production fetches from the runners too.
 *
 * For every candidate it prints one `SOURCE` line: HTTP status, final host, format (rss, atom,
 * json, html), item count, newest date, average text length (description and content:encoded),
 * how many items are headline-only, and per outbreak how many items pass that outbreak's keyword
 * filter (isOutbreakRelated with the registry's feed config) and how many of those carry text.
 * Index pages (`kind: "index"`) are scanned for feed links, printed as `DISCOVERED` lines.
 * No model calls, no secrets. Usage: node scripts/probe-feeds.mjs [--only=<substring>]
 *
 * `--pipeline`: instead, run the real feed pipeline (runOutbreakFeeds in scripts/lib/feed-run.mjs)
 * for every automated outbreak on the live feeds, with no model client and an in-memory copy of
 * the stored live/candidates/signals files (nothing is written), and print the items it would keep
 * (`KEPT` lines: source, date, text length, headline-only or not).
 */
import { OUTBREAKS, USER_AGENT } from "./lib/outbreak-registry.mjs";
import { parseFeedItems, isOutbreakRelated, isHeadlineOnly, isoDate, whoDonItems } from "./lib/feed-items.mjs";
import { mapPool } from "./lib/pool.mjs";
import { runOutbreakFeeds } from "./lib/feed-run.mjs";
import { dataFile } from "./lib/outbreak-registry.mjs";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const gnews = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

/** Candidates: name, url, kind ("feed" default | "index" | "who-don-api"). */
export const CANDIDATES = [
  // Baseline: what production reads today.
  { name: "baseline WHO news RSS", url: "https://www.who.int/rss-feeds/news-english.xml" },
  { name: "baseline Google News (Ebola)", url: gnews("Ebola Congo death toll") },
  // Specialist infectious-disease news.
  { name: "CIDRAP all news", url: "https://www.cidrap.umn.edu/news/all/rss" },
  { name: "CIDRAP all news (http)", url: "http://www.cidrap.umn.edu/news/all/rss" },
  { name: "CIDRAP measles topic", url: "https://www.cidrap.umn.edu/news/78/rss" },
  { name: "Outbreak News Today (feedburner)", url: "https://feeds.feedburner.com/OutbreakNewsToday" },
  { name: "Outbreak News Today (site feed)", url: "https://outbreaknewstoday.com/feed/" },
  { name: "Outbreak News Today (substack)", url: "https://outbreaknewstoday.substack.com/feed" },
  { name: "STAT News", url: "https://www.statnews.com/feed/" },
  { name: "BNO News", url: "https://bnonews.com/index.php/feed/" },
  { name: "Contagion Live", url: "https://www.contagionlive.com/rss" },
  // Official and humanitarian.
  { name: "WHO DON API (JSON)", url: "https://www.who.int/api/news/diseaseoutbreaknews?$orderby=PublicationDateAndTime%20desc&$top=30", kind: "who-don-api" },
  { name: "Africa CDC", url: "https://africacdc.org/feed/" },
  { name: "ReliefWeb RSS: ebola", url: "https://reliefweb.int/updates/rss.xml?search=ebola" },
  { name: "ReliefWeb RSS: measles bangladesh", url: "https://reliefweb.int/updates/rss.xml?search=measles%20bangladesh" },
  { name: "ReliefWeb RSS: west nile", url: "https://reliefweb.int/updates/rss.xml?search=%22west%20nile%22" },
  { name: "CDC newsroom (tools.cdc.gov 132608)", url: "https://tools.cdc.gov/api/v2/resources/media/132608.rss" },
  { name: "CDC HAN (tools.cdc.gov 413690)", url: "https://tools.cdc.gov/api/v2/resources/media/413690.rss" },
  { name: "ECDC news (taxonomy 1307)", url: "https://www.ecdc.europa.eu/en/taxonomy/term/1307/feed" },
  { name: "ECDC threats report (taxonomy 1310)", url: "https://www.ecdc.europa.eu/en/taxonomy/term/1310/feed" },
  // Bangladesh press.
  { name: "The Daily Star (BD) front page", url: "https://www.thedailystar.net/frontpage/rss.xml" },
  { name: "The Daily Star (BD) health", url: "https://www.thedailystar.net/health/rss.xml" },
  { name: "Dhaka Tribune", url: "https://www.dhakatribune.com/feed" },
  { name: "The Business Standard (BD)", url: "https://www.tbsnews.net/top-news/rss.xml" },
  { name: "bdnews24", url: "https://bdnews24.com/?widgetName=rssfeed&widgetId=1150&getXmlFeed=true" },
  // Greek press (English).
  { name: "eKathimerini", url: "https://www.ekathimerini.com/rss" },
  { name: "Greek Reporter", url: "https://greekreporter.com/feed/" },
  { name: "Keep Talking Greece", url: "https://www.keeptalkinggreece.com/feed/" },
  // Index pages: scanned for feed links.
  { name: "ECDC RSS index", url: "https://www.ecdc.europa.eu/en/rss-feeds", kind: "index" },
  { name: "CDC RSS index", url: "https://www.cdc.gov/other/rss.html", kind: "index" },
  { name: "WHO RSS index", url: "https://www.who.int/about/policies/publishing/rss-feeds", kind: "index" },
];

const MAX_BYTES = 5_000_000;
const clip = (s, n = 80) => String(s ?? "").replace(/\s+/g, " ").slice(0, n);
const feedOutbreaks = OUTBREAKS.filter((o) => o.feed);

async function get(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/atom+xml, application/xml, application/json, text/xml, text/html;q=0.8" },
    redirect: "follow",
    signal: AbortSignal.timeout(25_000),
  });
  const text = (await res.text()).slice(0, MAX_BYTES);
  return { status: res.status, finalHost: new URL(res.url).host, type: res.headers.get("content-type") ?? "", text };
}

function summarise(c, r, items) {
  const avg = (xs) => Math.round(xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length));
  const newest = items.map((i) => isoDate(i.pubDate)).sort().pop() ?? "-";
  const headlineOnly = items.filter((i) => isHeadlineOnly(i.title, i.description)).length;
  const per = feedOutbreaks
    .map((o) => {
      const rel = items.filter((i) => isOutbreakRelated(i, o.feed));
      const withText = rel.filter((i) => !isHeadlineOnly(i.title, i.description)).length;
      return `${o.slug.split("-").slice(0, 2).join("-")}=${rel.length}/${withText}`;
    })
    .join(" ");
  return (
    `SOURCE name="${c.name}" status=${r.status} final_host=${r.finalHost} format=${r.format} items=${items.length} newest=${newest} ` +
    `avg_description=${avg(items.map((i) => i.description.length))} avg_content_encoded=${avg(items.map((i) => i.contentLength ?? 0))} ` +
    `headline_only=${headlineOnly}/${items.length} matches(related/with_text): ${per}`
  );
}

async function probe(c) {
  let r;
  try {
    r = await get(c.url);
  } catch (e) {
    console.log(`SOURCE name="${c.name}" error="${clip(`${e.name}: ${e.message}`)}" url=${c.url}`);
    return;
  }
  const head = r.text.slice(0, 2000);
  if (c.kind === "index") {
    const links = [...new Set([...r.text.matchAll(/href=["']([^"']*(?:rss|feed|\.xml)[^"']*)["']/gi)].map((m) => new URL(m[1].replace(/&amp;/g, "&"), c.url).href))];
    console.log(`SOURCE name="${c.name}" status=${r.status} final_host=${r.finalHost} format=index feed_links=${links.length}`);
    for (const l of links.slice(0, 60)) console.log(`DISCOVERED from="${c.name}" ${l}`);
    return;
  }
  let items = [];
  if (c.kind === "who-don-api" || /json/.test(r.type)) {
    r.format = "json";
    try {
      const json = JSON.parse(r.text);
      if (json?.value?.[0]) console.log(`FIELDS name="${c.name}" ${Object.keys(json.value[0]).slice(0, 25).join(",")}`);
      items = whoDonItems(json);
    } catch (e) {
      r.format = `json-unparsed(${clip(e.message, 40)})`;
    }
  } else {
    r.format = /<feed[\s>]/i.test(head) ? "atom" : /<rss[\s>]|<rdf:RDF/i.test(head) ? "rss" : /<html/i.test(head) ? "html" : "unknown";
    items = parseFeedItems(r.text);
  }
  console.log(summarise(c, r, items));
  // Two examples of what the model would be given, so text quality can be judged by eye.
  for (const it of items.slice(0, 2)) console.log(`  EXAMPLE name="${c.name}" title="${clip(it.title, 70)}" text="${clip(it.description, 160)}"`);
}

async function pipeline() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const read = (slug, f) => {
    const p = dataFile(root, slug, f);
    return existsSync(p) ? JSON.parse(readFileSync(p, "utf-8")) : null;
  };
  const fetchText = async (url, { userAgent }) => {
    const res = await fetch(url, {
      headers: { "User-Agent": userAgent, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json" },
      signal: AbortSignal.timeout(20_000),
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  };
  for (const o of feedOutbreaks) {
    console.log(`\n══ ${o.slug} ══`);
    const mem = { live: read(o.slug, "live"), cands: read(o.slug, "candidates"), ledger: read(o.slug, "signals") };
    const before = new Set((mem.live?.recentItems ?? []).map((i) => i.id));
    const store = {
      readLive: () => structuredClone(mem.live),
      readCandidates: () => structuredClone(mem.cands),
      readLedger: () => structuredClone(mem.ledger),
      writeLive: (v) => (mem.live = v),
      writeCandidates: (v) => (mem.cands = v),
      writeLedger: (v) => (mem.ledger = v),
    };
    try {
      await runOutbreakFeeds({ outbreak: o, client: null, fetchText, store });
    } catch (e) {
      console.log(`PIPELINE_ERROR ${o.slug}: ${clip(e?.message, 160)}`);
      continue;
    }
    const items = mem.live?.recentItems ?? [];
    const bySource = items.reduce((m, i) => ((m[i.source] = (m[i.source] ?? 0) + 1), m), {});
    console.log(`DISPLAYED ${o.slug}: ${items.length} items, new this run ${items.filter((i) => !before.has(i.id)).length}, by source ${JSON.stringify(bySource)}`);
    for (const i of items.filter((x) => !before.has(x.id))) {
      console.log(`  KEPT source="${i.source}" date=${i.date} text_chars=${i.summary.length} headline_only=${isHeadlineOnly(i.title, i.summary)} title="${clip(i.title, 70)}" url=${clip(i.url, 90)}`);
    }
  }
}

async function main() {
  if (process.argv.includes("--pipeline")) return pipeline();
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
  const list = only ? CANDIDATES.filter((c) => c.name.includes(only) || c.url.includes(only)) : CANDIDATES;
  await mapPool(list, 4, probe);
}

main().catch((e) => {
  console.error("Fatal:", e?.message);
  process.exit(1);
});
