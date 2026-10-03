#!/usr/bin/env node
/**
 * virustracer: source archiver (link-rot protection).
 * Collects every URL we cite for each outbreak in scripts/lib/outbreak-registry.mjs
 * (all of them, past records included; --outbreak=<slug> limits it to one)
 * (data/outbreaks/<slug>/live.json items, data/outbreaks/<slug>/toll.json Wikipedia
 * permalinks, literal URLs in src/data/outbreaks/<slug>.ts) plus our own pages,
 * records title/date/source for each in the shared data/archive.json, and archives
 * up to N per run with the Internet Archive (keyless availability API + Save Page Now).
 *
 * Usage: node scripts/archive-sources.mjs [--outbreak=<slug>] [--dry-run] [--max=15] [--max-attempts=5]
 * Env:   ARCHIVE_MAX_PER_RUN, ARCHIVE_MAX_ATTEMPTS, ARCHIVE_DELAY_MS, ARCHIVE_BUDGET_MS
 *
 * Never fails the workflow: any error becomes a ::warning:: annotation and exit 0.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  DEFAULT_BUDGET_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_MAX_PER_RUN,
  DEFAULT_SAVE_DELAY_MS,
  collectSources,
  normalizeLedger,
  runArchive,
  serializeLedger,
} from "./lib/archive.mjs";
import { USER_AGENT, dataFile, selectArchivableOutbreaks } from "./lib/outbreak-registry.mjs";
import { SITE_PAGES, SITE_URL } from "./lib/site.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const ARCHIVE_JSON = resolve(ROOT, "data/archive.json");

/** @param {string} msg */
const warn = (msg) => console.log(`::warning title=Archive sources::${msg.replace(/\r?\n/g, " ")}`);

/** @param {string} path @param {any} fallback */
function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch (err) {
    warn(`Could not parse ${path}: ${err instanceof Error ? err.message : err}`);
    return fallback;
  }
}

/**
 * Every citable input for one outbreak; a missing file just contributes nothing.
 * @param {string} slug
 */
function readOutbreakSources(slug) {
  const ts = resolve(ROOT, "src", "data", "outbreaks", `${slug}.ts`);
  return {
    slug,
    live: readJson(dataFile(ROOT, slug, "live"), {}),
    toll: readJson(dataFile(ROOT, slug, "toll"), {}),
    source: existsSync(ts) ? readFileSync(ts, "utf-8") : "",
  };
}

/** @param {string} name @param {number} fallback */
function numOption(name, fallback) {
  const flag = process.argv.find((a) => a.startsWith(`--${name}=`));
  const raw = flag ? flag.split("=")[1] : process.env[`ARCHIVE_${name.toUpperCase().replace(/-/g, "_")}`];
  const n = Number(raw);
  return raw !== undefined && raw !== "" && Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** fetch with our User-Agent; headers passed by callers win. @type {typeof fetch} */
const politeFetch = (input, init = {}) =>
  fetch(input, { ...init, headers: { "User-Agent": USER_AGENT, ...(init.headers ?? {}) } });

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const max = numOption("max", numOption("max_per_run", DEFAULT_MAX_PER_RUN));
  const maxAttempts = numOption("max-attempts", DEFAULT_MAX_ATTEMPTS);
  const delayMs = Math.max(5_000, numOption("delay_ms", DEFAULT_SAVE_DELAY_MS));
  const budgetMs = numOption("budget_ms", DEFAULT_BUDGET_MS);

  const items = collectSources({
    outbreaks: selectArchivableOutbreaks().map((o) => readOutbreakSources(o.slug)),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL?.trim() || SITE_URL,
    sitePages: SITE_PAGES,
  });
  const ledger = normalizeLedger(readJson(ARCHIVE_JSON, null));
  console.log(
    `${items.length} source URLs, ${Object.keys(ledger.entries).length} already in the ledger` +
      `${dryRun ? " (dry run: no network, no writes)" : ""}`,
  );

  const { ledger: next, stats } = await runArchive({
    ledger,
    items,
    fetchImpl: politeFetch,
    now: new Date().toISOString(),
    max,
    maxAttempts,
    delayMs,
    budgetMs,
    dryRun,
    log: (m) => console.log(`  ${m}`),
  });

  if (!dryRun) writeFileSync(ARCHIVE_JSON, serializeLedger(next));

  const all = Object.values(next.entries);
  const count = (/** @type {string} */ s) => all.filter((e) => e.status === s).length;
  console.log(
    dryRun
      ? `Would process ${stats.wouldProcess.length} URL(s).`
      : `Processed ${stats.processed}: ${stats.archived} archived (${stats.existing} existing, ${stats.saved} newly saved), ` +
          `${stats.pending} pending, ${stats.failed} failed${stats.rateLimited ? ", stopped on 429" : ""}.`,
  );
  console.log(
    `Ledger: ${count("archived")} archived, ${count("pending")} pending, ${count("failed")} failed of ${all.length}.`,
  );
  if (stats.rateLimited) warn("Internet Archive returned 429; stopped early, will retry next run.");
}

main().catch((err) => {
  warn(`Archiving skipped: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(0);
});
