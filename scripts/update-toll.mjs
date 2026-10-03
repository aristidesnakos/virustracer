#!/usr/bin/env node
/**
 * Death-toll updater. Runs daily in GitHub Actions (plain `node` 22, no deps).
 *
 * Reads the headline numbers from the Wikipedia outbreak article's infobox
 * (which cites INSP DRC / WHO), sanity-checks them against the last stored
 * snapshot and appends to data/outbreaks/<slug>/toll.json. Runs for every automated
 * outbreak in scripts/lib/outbreak-registry.mjs, or just one with `--outbreak=<slug>`.
 *
 * Never fails the workflow: on any problem it logs a GitHub Actions
 * ::warning:: / ::error:: annotation, leaves that outbreak's toll.json untouched and
 * exits 0 so later workflow steps (and the other outbreaks) still run.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseInfobox, validateSnapshot, applySnapshot } from "./lib/toll.mjs";
import { archiveInfobox } from "./lib/raw.mjs";
import { USER_AGENT, dataFile, selectOutbreaks } from "./lib/outbreak-registry.mjs";

const TIMEOUT_MS = 20_000;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const apiUrl = (page) =>
  "https://en.wikipedia.org/w/api.php?" +
  new URLSearchParams({
    action: "parse",
    page,
    prop: "wikitext|revid",
    section: "0",
    format: "json",
    formatversion: "2",
    redirects: "1",
  }).toString();

function readStore(tollJson) {
  if (!existsSync(tollJson)) return { lastChecked: "", snapshots: [] };
  try {
    const parsed = JSON.parse(readFileSync(tollJson, "utf-8"));
    return {
      lastChecked: typeof parsed.lastChecked === "string" ? parsed.lastChecked : "",
      snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
    };
  } catch (err) {
    throw new Error(`${tollJson} is unreadable: ${err instanceof Error ? err.message : err}`);
  }
}

async function fetchWikitext(page) {
  const res = await fetch(apiUrl(page), {
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

async function updateOutbreak(outbreak) {
  const { slug, toll } = outbreak;
  const PAGE_TITLE = toll.page;
  const tollJson = dataFile(ROOT, slug, "toll");
  const tollLabel = `data/outbreaks/${slug}/toll.json`;
  const now = new Date();
  const nowISO = now.toISOString();
  const today = nowISO.slice(0, 10);

  let store;
  try {
    store = readStore(tollJson);
  } catch (err) {
    console.log(`::warning::Toll update for ${slug} skipped: ${err.message}`);
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
    fetched = await fetchWikitext(PAGE_TITLE);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`::warning::Toll update for ${slug} skipped, could not fetch Wikipedia: ${msg}`);
    return;
  }

  const parsed = parseInfobox(fetched.wikitext);
  if (!parsed) {
    console.log(
      `::error::Could not parse confirmed_cases/deaths from the Infobox outbreak on ${PAGE_TITLE} (revid ${fetched.revid ?? "?"}). The infobox format may have changed; toll data for ${slug} was NOT updated.`,
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
    source: toll.source,
    sourceUrl:
      fetched.revid !== undefined
        ? `https://en.wikipedia.org/w/index.php?oldid=${fetched.revid}`
        : `https://en.wikipedia.org/wiki/${PAGE_TITLE}`,
    ...(fetched.revid !== undefined ? { revid: fetched.revid } : {}),
    ...(revisionTimestamp ? { revisionTimestamp } : {}),
  };

  const verdict = validateSnapshot(snapshot, prev, today);
  if (!verdict.ok) {
    console.log(`::warning::Toll update for ${slug} rejected by sanity check: ${verdict.reason}. Needs manual review; ${tollLabel} unchanged.`);
    return;
  }

  let next = applySnapshot(store, snapshot, nowISO);
  const changed = JSON.stringify(next.snapshots) !== JSON.stringify(store.snapshots);

  // Archive the exact infobox this reading was parsed from (append-only, keyed
  // by revid; data/raw/infobox/ is shared by every outbreak since revids are
  // globally unique). Only when the snapshot is actually stored, so unchanged
  // readings leave no orphan files. A failure here must not block the toll update.
  if (changed && fetched.revid !== undefined) {
    const raw = archiveInfobox(ROOT, fetched.revid, fetched.wikitext);
    if (raw.ok) {
      console.log(`Raw infobox ${raw.written ? "archived" : "already archived"}: ${raw.rawPath}`);
      next = applySnapshot(store, { ...snapshot, rawPath: raw.rawPath, rawSha256: raw.rawSha256 }, nowISO);
    } else {
      console.log(`::warning::Raw infobox for revid ${fetched.revid} not archived: ${raw.reason}. Snapshot stored without rawPath.`);
    }
  }

  mkdirSync(dirname(tollJson), { recursive: true });
  writeFileSync(tollJson, JSON.stringify(next, null, 2) + "\n");

  console.log(
    changed
      ? `Updated ${tollLabel}: ${next.snapshots.length} snapshot(s), latest ${today} deaths=${snapshot.deaths} confirmed=${snapshot.confirmed}.`
      : `No change in figures; refreshed lastChecked only (${nowISO}).`,
  );
}

async function main() {
  // Only outbreaks with an automated toll source are updated here.
  const outbreaks = selectOutbreaks().filter((o) => o.toll);
  for (const outbreak of outbreaks) {
    console.log(`── ${outbreak.slug} ──`);
    try {
      await updateOutbreak(outbreak);
    } catch (err) {
      // One outbreak failing must not stop the others.
      console.log(
        `::warning::Toll update for ${outbreak.slug} crashed: ${err instanceof Error ? err.stack || err.message : err}`,
      );
    }
  }
}

main().catch((err) => {
  // Last-resort guard: never fail the workflow.
  console.log(`::warning::Toll update crashed: ${err instanceof Error ? err.stack || err.message : err}`);
});
