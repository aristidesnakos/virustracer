#!/usr/bin/env node
/**
 * Probe: Wikimedia pageviews (official, keyless REST API) for the English Wikipedia articles on our
 * topics: a proxy for public attention, NOT search volume. Run it from a GitHub runner (the cloud
 * sandbox cannot reach wikimedia.org): the "Probe keywords" workflow. Prints per article the
 * 90-day total, the daily mean, the last-30 vs previous-30 means, the peak day and a weekly sparkline row.
 * The Wikipedia article titles of our trackers are in scripts/lib/outbreak-registry.mjs (toll.page);
 * the other titles were found with a MediaWiki title lookup.
 */
const UA = "outbreakfiles-seo-probe/1.0 (https://github.com/aristidesnakos/virustracer; pageview research)";
const ARTICLES = (process.env.PAGEVIEW_ARTICLES ?? [
  "2026_Ebola_epidemic", "Bundibugyo_ebolavirus", "Ebola", "Measles", "2026_Bangladesh_measles_outbreak",
  "Measles_resurgence_in_the_United_States", "2026_Pennsylvania_measles_outbreak", "MV_Hondius_hantavirus_outbreak", "West_Nile_fever", "West_Nile_virus", "Candida_auris", "Hantavirus", "Andes_virus",
  "Disease_outbreak", "Epidemic", "Nursing_home", "Avian_influenza", "H5N1",
].join("|")).split("|");

const day = (d) => d.toISOString().slice(0, 10).replaceAll("-", "");
const end = new Date(Date.now() - 86_400_000);
const start = new Date(end.getTime() - 89 * 86_400_000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let errors = 0;
console.log(`Window ${day(start)} to ${day(end)} (90 days), en.wikipedia, all-access, user`);
for (const title of ARTICLES) {
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(title)}/daily/${day(start)}/${day(end)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (res.status === 404) { console.log(`P: ${title} => no data (404: page missing or no views in the window)`); await sleep(300); continue; }
    if (!res.ok) { errors++; console.log(`P: ${title} => ERROR HTTP ${res.status}`); if (errors >= 3) { console.log("::warning::3 errors; stopping"); break; } continue; }
    const items = (await res.json()).items ?? [];
    const v = items.map((i) => i.views);
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    const last30 = v.slice(-30), prev30 = v.slice(-60, -30);
    const peak = items.reduce((m, i) => (i.views > m.views ? i : m), items[0] ?? { views: 0, timestamp: "" });
    const weekly = [];
    for (let i = 0; i < v.length; i += 7) weekly.push(sum(v.slice(i, i + 7)));
    console.log(`P: ${title} | days ${v.length} | total ${sum(v)} | mean/day ${Math.round(sum(v) / (v.length || 1))} | last30 mean ${Math.round(sum(last30) / (last30.length || 1))} | prev30 mean ${Math.round(sum(prev30) / (prev30.length || 1))} | peak ${peak.views} on ${String(peak.timestamp).slice(0, 8)} | weekly ${weekly.join(",")}`);
  } catch (err) {
    errors++;
    console.log(`P: ${title} => ERROR ${err instanceof Error ? err.message : err}`);
  }
  await sleep(300);
}
console.log(`done, ${errors} errors`);
