#!/usr/bin/env node
/**
 * One-off: archive the raw infobox wikitext for snapshots in
 * data/outbreaks/<slug>/toll.json that predate the archive (plain `node` 22, no deps).
 *
 *   node scripts/backfill-raw.mjs                     # every automated outbreak
 *   node scripts/backfill-raw.mjs --outbreak=<slug>   # just one
 *   node scripts/backfill-raw.mjs --dry-run           # fetch + verify, write nothing
 *
 * Writes data/raw/infobox/<revid>.txt (one directory shared by every outbreak:
 * revids are unique across Wikipedia) and adds rawPath/rawSha256 to each toll.json.
 *
 * For each snapshot without `rawPath`, fetches that exact revision's lead
 * section, extracts the infobox, re-parses it with the shared parser and
 * stores it ONLY if confirmed/suspected/deaths/recovered equal the snapshot's
 * values. Mismatches are logged and skipped; numbers are never changed.
 * Requests are sequential with a pause. One outbreak failing does not stop the others.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { backfillRawForStore } from "./lib/raw.mjs";
import { USER_AGENT, dataFile, selectOutbreaksWith } from "./lib/outbreak-registry.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
const TIMEOUT_MS = 30_000;
const PAUSE_MS = 500;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** Lead-section wikitext of one exact revision. */
async function fetchLead(revid) {
  const url =
    "https://en.wikipedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      prop: "revisions",
      revids: String(revid),
      rvprop: "ids|content",
      rvslots: "main",
      rvsection: "0",
      format: "json",
      formatversion: "2",
    });
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Wikipedia API responded HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`Wikipedia API error: ${json.error.code} ${json.error.info}`);
  const content = json.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content;
  return typeof content === "string" ? content : null;
}

/** @param {string} slug */
async function backfillOutbreak({ slug, toll }) {
  const tollJson = dataFile(ROOT, slug, "toll");
  const tollLabel = `data/outbreaks/${slug}/toll.json`;
  const store = JSON.parse(readFileSync(tollJson, "utf-8"));
  if (!Array.isArray(store.snapshots)) throw new Error(`${tollLabel} has no snapshots array`);
  const { store: next, stats } = await backfillRawForStore(store, {
    repoRoot: ROOT,
    fetchLead,
    ignore: toll.ignoreFields,
    dryRun: DRY_RUN,
    delayMs: PAUSE_MS,
    log: (m) => console.log(`  ${m}`),
  });
  console.log(`Summary: ${JSON.stringify(stats)}`);
  if (DRY_RUN) {
    console.log("--dry-run: nothing written.");
    return;
  }
  writeFileSync(tollJson, JSON.stringify(next, null, 2) + "\n");
  console.log(`Wrote ${tollLabel}`);
}

async function main() {
  let failed = 0;
  // Only outbreaks with an automated toll source have Wikipedia revisions to archive.
  for (const outbreak of selectOutbreaksWith("toll")) {
    const { slug } = outbreak;
    console.log(`── ${slug} ──`);
    try {
      await backfillOutbreak(outbreak);
    } catch (err) {
      // One outbreak failing must not stop the others.
      failed++;
      console.error(`backfill-raw failed for ${slug}:`, err instanceof Error ? err.message : err);
    }
  }
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error("backfill-raw failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
