#!/usr/bin/env node
/**
 * One-off history import for data/outbreaks/<slug>/toll.json (plain `node` 22, no deps).
 *
 * Walks the tracked Wikipedia article's revision history, takes the last
 * revision of every UTC day, parses the infobox of each (same parser as the
 * daily updater) and merges the results into the outbreak's toll.json. Every snapshot
 * links to the exact revision it came from.
 *
 *   node scripts/backfill-toll.mjs                          # every automated outbreak
 *   node scripts/backfill-toll.mjs --outbreak=<slug>        # just one
 *   node scripts/backfill-toll.mjs --dry-run                # report only, write nothing
 *
 * Existing snapshots are never overwritten: the daily updater's reading for a
 * date wins over the imported one. Vandalised or mid-edit revisions are
 * removed by keeping only the longest never-decreasing chain of readings.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseInfobox, validateSnapshot, MAX_SNAPSHOTS, withoutIgnored } from "./lib/toll.mjs";
import { archiveInfobox } from "./lib/raw.mjs";
import { lastRevisionPerDay, keepLongestMonotoneChain } from "./lib/backfill.mjs";
import { USER_AGENT, dataFile, selectOutbreaksWith, tollAdapter } from "./lib/outbreak-registry.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
const TIMEOUT_MS = 30_000;
const PAUSE_MS = 400; // be polite to the Wikipedia API
const CONTENT_BATCH = 50; // API limit for revisions with content

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const API = "https://en.wikipedia.org/w/api.php";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Wikipedia API responded HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`Wikipedia API error: ${json.error.code} ${json.error.info}`);
  await sleep(PAUSE_MS);
  return json;
}

/** Every revision of the page (id + timestamp), oldest first. */
async function listRevisions(pageTitle) {
  const revisions = [];
  let cont = {};
  do {
    const json = await api({
      action: "query",
      prop: "revisions",
      titles: pageTitle,
      redirects: "1",
      rvprop: "ids|timestamp",
      rvlimit: "500",
      rvdir: "newer",
      ...cont,
    });
    const page = json.query?.pages?.[0];
    if (!page || page.missing) throw new Error(`Page "${pageTitle}" not found`);
    for (const r of page.revisions ?? []) revisions.push({ revid: r.revid, timestamp: r.timestamp });
    cont = json.continue ?? null;
    process.stdout.write(`\r  listed ${revisions.length} revisions`);
  } while (cont);
  process.stdout.write("\n");
  return revisions;
}

/** Lead-section wikitext for a batch of revision ids, keyed by revid. */
async function fetchLeadSections(revids) {
  const json = await api({
    action: "query",
    prop: "revisions",
    revids: revids.join("|"),
    rvprop: "ids|content",
    rvslots: "main",
    rvsection: "0",
  });
  const out = new Map();
  for (const r of json.query?.pages?.[0]?.revisions ?? []) {
    const content = r.slots?.main?.content;
    if (typeof content === "string") out.set(r.revid, content);
  }
  return out;
}

function readStore(tollJson) {
  if (!existsSync(tollJson)) return { lastChecked: "", snapshots: [] };
  const parsed = JSON.parse(readFileSync(tollJson, "utf-8"));
  return {
    lastChecked: typeof parsed.lastChecked === "string" ? parsed.lastChecked : "",
    snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
  };
}

async function backfillOutbreak({ slug, toll }) {
  const PAGE_TITLE = toll.page;
  const tollJson = dataFile(ROOT, slug, "toll");
  const tollLabel = `data/outbreaks/${slug}/toll.json`;
  const store = readStore(tollJson);
  console.log(`Backfilling ${slug}: ${PAGE_TITLE} (${store.snapshots.length} snapshot(s) already stored)`);

  const revisions = await listRevisions(PAGE_TITLE);
  const days = lastRevisionPerDay(revisions);
  console.log(`  ${revisions.length} revisions across ${days.length} days`);

  const imported = [];
  /** revid -> lead-section wikitext; archived only for snapshots that survive filtering. */
  const leads = new Map();
  let unparseable = 0;
  for (let i = 0; i < days.length; i += CONTENT_BATCH) {
    const batch = days.slice(i, i + CONTENT_BATCH);
    const sections = await fetchLeadSections(batch.map((d) => d.revid));
    for (const day of batch) {
      const parsed = sections.has(day.revid)
        ? withoutIgnored(parseInfobox(sections.get(day.revid)), toll.ignoreFields)
        : null;
      if (!parsed) {
        unparseable++;
        continue;
      }
      leads.set(day.revid, sections.get(day.revid));
      imported.push({
        date: day.date,
        confirmed: parsed.confirmed,
        suspected: parsed.suspected,
        deaths: parsed.deaths,
        recovered: parsed.recovered,
        source: toll.source,
        sourceUrl: `https://en.wikipedia.org/w/index.php?oldid=${day.revid}`,
        revid: day.revid,
        revisionTimestamp: day.timestamp,
      });
    }
    process.stdout.write(`\r  parsed ${Math.min(i + CONTENT_BATCH, days.length)}/${days.length} days`);
  }
  process.stdout.write("\n");
  console.log(`  ${imported.length} readable, ${unparseable} without a parseable infobox`);

  // Existing readings win for their date, then drop impossible ones from the union.
  const have = new Map(store.snapshots.map((s) => [s.date, s]));
  const union = [...store.snapshots, ...imported.filter((s) => !have.has(s.date))].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  // Early revisions counted suspected deaths in the deaths field (deaths > confirmed),
  // a different definition from the one the tracker reports, so they are excluded.
  const plausible = union.filter((s) => {
    const verdict = validateSnapshot(s, null, s.date);
    if (!verdict.ok) console.log(`  skipped ${s.date}: ${verdict.reason}`);
    return verdict.ok;
  });
  const { kept, dropped } = keepLongestMonotoneChain(plausible);
  for (const d of dropped) {
    console.log(
      `  dropped ${d.date} (revision ${d.revid ?? "?"}): confirmed=${d.confirmed} deaths=${d.deaths} breaks the cumulative trend`,
    );
  }

  const added = kept.filter((s) => !have.has(s.date)).length;
  console.log(
    `Result: ${kept.length} snapshots (${added} new, ${dropped.length} dropped as inconsistent), ` +
      `${kept[0]?.date ?? "?"} → ${kept.at(-1)?.date ?? "?"}`,
  );

  if (DRY_RUN) {
    console.log(`--dry-run: ${tollLabel} not written.`);
    return;
  }
  // Archive the raw infobox of every newly imported snapshot that survived filtering.
  // (Snapshots that already existed are handled by scripts/backfill-raw.mjs.)
  let archived = 0;
  const finalSnaps = kept.slice(-MAX_SNAPSHOTS).map((s) => {
    if (s.rawPath || !leads.has(s.revid)) return s;
    const raw = archiveInfobox(ROOT, s.revid, leads.get(s.revid));
    if (!raw.ok) {
      console.log(`  warning: ${s.date} (revision ${s.revid}) not archived: ${raw.reason}`);
      return s;
    }
    if (raw.written) archived++;
    return { ...s, rawPath: raw.rawPath, rawSha256: raw.rawSha256 };
  });
  console.log(`Archived ${archived} raw infobox file(s) under data/raw/infobox/`);

  mkdirSync(dirname(tollJson), { recursive: true });
  writeFileSync(tollJson, JSON.stringify({ ...store, snapshots: finalSnaps }, null, 2) + "\n");
  console.log(`Wrote ${tollLabel}`);
}

async function main() {
  // Wikipedia history only; an official-report outbreak is backfilled with
  // `update-toll.mjs --outbreak=<slug> --report=<pdf-url>` instead.
  for (const outbreak of selectOutbreaksWith("toll").filter((o) => tollAdapter(o) === "wikipedia")) {
    await backfillOutbreak(outbreak);
  }
}

main().catch((err) => {
  console.error("Backfill failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
