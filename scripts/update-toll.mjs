#!/usr/bin/env node
/**
 * Death-toll updater. Runs daily in GitHub Actions (plain `node` 22, no deps).
 *
 * Reads the headline numbers from the Wikipedia outbreak article's infobox
 * (which cites INSP DRC / WHO), sanity-checks them against the last stored
 * snapshot and appends to data/toll.json.
 *
 * Never fails the workflow: on any problem it logs a GitHub Actions
 * ::warning:: / ::error:: annotation, leaves data/toll.json untouched and
 * exits 0 so later workflow steps still run.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseInfobox, validateSnapshot, applySnapshot } from "./lib/toll.mjs";
import { PAGE_TITLE, USER_AGENT, SNAPSHOT_SOURCE } from "./lib/outbreak-config.mjs";

// The tracked Wikipedia article is configured in scripts/lib/outbreak-config.mjs.
const TIMEOUT_MS = 20_000;

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOLL_JSON = resolve(__dirname, "../data/toll.json");

const API_URL =
  "https://en.wikipedia.org/w/api.php?" +
  new URLSearchParams({
    action: "parse",
    page: PAGE_TITLE,
    prop: "wikitext|revid",
    section: "0",
    format: "json",
    formatversion: "2",
    redirects: "1",
  }).toString();

function readStore() {
  if (!existsSync(TOLL_JSON)) return { lastChecked: "", snapshots: [] };
  try {
    const parsed = JSON.parse(readFileSync(TOLL_JSON, "utf-8"));
    return {
      lastChecked: typeof parsed.lastChecked === "string" ? parsed.lastChecked : "",
      snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
    };
  } catch (err) {
    throw new Error(`data/toll.json is unreadable: ${err instanceof Error ? err.message : err}`);
  }
}

async function fetchWikitext() {
  const res = await fetch(API_URL, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Wikipedia API responded HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`Wikipedia API error: ${json.error.code} ${json.error.info}`);
  const wikitext = json.parse?.wikitext;
  const revid = json.parse?.revid;
  if (typeof wikitext !== "string") throw new Error("Wikipedia API response had no wikitext");
  return { wikitext, revid: Number.isInteger(revid) ? revid : undefined };
}

/**
 * When was this revision saved? Lets the API publish "what the page said, as of
 * when". Best effort: a failure here must never block the toll update.
 */
async function fetchRevisionTimestamp(revid) {
  if (revid === undefined) return undefined;
  try {
    const url =
      "https://en.wikipedia.org/w/api.php?" +
      new URLSearchParams({
        action: "query",
        prop: "revisions",
        revids: String(revid),
        rvprop: "timestamp",
        format: "json",
        formatversion: "2",
      });
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return undefined;
    const ts = (await res.json()).query?.pages?.[0]?.revisions?.[0]?.timestamp;
    return typeof ts === "string" ? ts : undefined;
  } catch {
    return undefined;
  }
}

async function main() {
  const now = new Date();
  const nowISO = now.toISOString();
  const today = nowISO.slice(0, 10);

  let store;
  try {
    store = readStore();
  } catch (err) {
    console.log(`::warning::Toll update skipped: ${err.message}`);
    return;
  }
  const prev = store.snapshots[store.snapshots.length - 1] ?? null;
  console.log(
    prev
      ? `Last stored snapshot: ${prev.date} confirmed=${prev.confirmed} deaths=${prev.deaths}`
      : "No stored snapshots yet.",
  );

  let fetched;
  try {
    console.log(`Fetching ${PAGE_TITLE} from Wikipedia...`);
    fetched = await fetchWikitext();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`::warning::Toll update skipped, could not fetch Wikipedia: ${msg}`);
    return;
  }

  const parsed = parseInfobox(fetched.wikitext);
  if (!parsed) {
    console.log(
      `::error::Could not parse confirmed_cases/deaths from the Infobox outbreak on ${PAGE_TITLE} (revid ${fetched.revid ?? "?"}). The infobox format may have changed; toll data was NOT updated.`,
    );
    return;
  }
  console.log(
    `Parsed infobox: confirmed=${parsed.confirmed} suspected=${parsed.suspected ?? "n/a"} deaths=${parsed.deaths} recovered=${parsed.recovered ?? "n/a"}`,
  );

  const revisionTimestamp = await fetchRevisionTimestamp(fetched.revid);

  const snapshot = {
    date: today,
    confirmed: parsed.confirmed,
    suspected: parsed.suspected,
    deaths: parsed.deaths,
    recovered: parsed.recovered,
    source: SNAPSHOT_SOURCE,
    sourceUrl:
      fetched.revid !== undefined
        ? `https://en.wikipedia.org/w/index.php?oldid=${fetched.revid}`
        : `https://en.wikipedia.org/wiki/${PAGE_TITLE}`,
    ...(fetched.revid !== undefined ? { revid: fetched.revid } : {}),
    ...(revisionTimestamp ? { revisionTimestamp } : {}),
  };

  const verdict = validateSnapshot(snapshot, prev, today);
  if (!verdict.ok) {
    console.log(`::warning::Toll update rejected by sanity check: ${verdict.reason}. Needs manual review; data/toll.json unchanged.`);
    return;
  }

  const next = applySnapshot(store, snapshot, nowISO);
  mkdirSync(dirname(TOLL_JSON), { recursive: true });
  writeFileSync(TOLL_JSON, JSON.stringify(next, null, 2) + "\n");

  const changed = next.snapshots.length !== store.snapshots.length ||
    JSON.stringify(next.snapshots) !== JSON.stringify(store.snapshots);
  console.log(
    changed
      ? `Updated data/toll.json: ${next.snapshots.length} snapshot(s), latest ${today} deaths=${snapshot.deaths} confirmed=${snapshot.confirmed}.`
      : `No change in figures; refreshed lastChecked only (${nowISO}).`,
  );
}

main().catch((err) => {
  // Last-resort guard: never fail the workflow.
  console.log(`::warning::Toll update crashed: ${err instanceof Error ? err.stack || err.message : err}`);
});
