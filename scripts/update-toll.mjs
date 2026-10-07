#!/usr/bin/env node
/**
 * Death-toll updater. Runs in GitHub Actions (plain `node` 22, no deps).
 *
 * Reads the headline numbers from the outbreak's source, sanity-checks them against
 * the last stored snapshot and appends to data/outbreaks/<slug>/toll.json. Two readers:
 *  - "wikipedia": the article's `{{Infobox outbreak}}` (which cites INSP DRC / WHO, ...)
 *  - "eody-report": the weekly report PDF of Greece's EODY, found via its RSS feed and
 *    read with `pdftotext -layout` (poppler-utils), parsed by scripts/lib/eody.mjs.
 * Runs for every automated outbreak in scripts/lib/outbreak-registry.mjs, or:
 *   --outbreak=<slug>          just one
 *   --adapter=<wikipedia|eody-report>  only outbreaks read that way
 *   --report=<pdf-url>         (eody-report, repeatable) read these reports instead of
 *                              the newest one in the feed: backfill or repair
 * For an eody-report outbreak it writes `season_over=true|false` to $GITHUB_OUTPUT
 * (see SEASON_OVER_AFTER_DAYS), which .github/workflows/update-west-nile.yml uses to
 * switch itself off once the season's reports stop.
 *
 * Never fails the workflow: on any problem it logs a GitHub Actions
 * ::warning:: / ::error:: annotation, leaves that outbreak's toll.json untouched and
 * exits 0 so later workflow steps (and the other outbreaks) still run.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  parseInfobox,
  validateSnapshot,
  applySnapshot,
  withoutIgnored,
  WEEKLY_STALE_PREV_DAYS,
} from "./lib/toll.mjs";
import { archiveInfobox, archiveReportText, sha256 } from "./lib/raw.mjs";
import { inspectReportFeed, isEodyUrl, normalizeUrl, parseReportText, seasonIsOver } from "./lib/eody.mjs";
import { USER_AGENT, dataFile, selectOutbreaksWith, tollAdapter } from "./lib/outbreak-registry.mjs";

const TIMEOUT_MS = 20_000;
const PDF_MAX_BYTES = 20 * 1024 * 1024;

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

async function updateFromWikipedia(outbreak) {
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

  const parsed = withoutIgnored(parseInfobox(fetched.wikitext), toll.ignoreFields);
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

/** One line, safe to print in an Actions log (no forged `::command::` lines). */
const oneLine = (s) => String(s).replace(/[\u0000-\u001f\u007f]+/g, " ");

/** Fetch from an EODY host only, without following a redirect to anywhere else. */
async function fetchOk(url, accept) {
  if (!isEodyUrl(url)) throw new Error(`refusing to fetch ${oneLine(url)}: not an https EODY URL`);
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: accept },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!isEodyUrl(res.url)) throw new Error(`${oneLine(url)} redirected off EODY to ${oneLine(res.url)}`);
  if (!res.ok) throw new Error(`${oneLine(url)} responded HTTP ${res.status}`);
  return res;
}

/** Download a report, stopping as soon as it passes PDF_MAX_BYTES. */
async function fetchPdf(url) {
  const res = await fetchOk(url, "application/pdf");
  const declared = Number(res.headers.get("content-length"));
  if (declared > PDF_MAX_BYTES) throw new Error(`report is ${declared} bytes, over the ${PDF_MAX_BYTES} limit`);
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body ?? []) {
    size += chunk.length;
    if (size > PDF_MAX_BYTES) throw new Error(`report is over the ${PDF_MAX_BYTES}-byte limit`);
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("response is not a PDF");
  return bytes;
}

/** Text of a PDF via `pdftotext -layout` (poppler-utils), the layout Table 1 is parsed from. */
function pdfToText(bytes) {
  const dir = mkdtempSync(join(tmpdir(), "report-"));
  try {
    const file = join(dir, "report.pdf");
    writeFileSync(file, bytes);
    const r = spawnSync("pdftotext", ["-layout", "-enc", "UTF-8", file, "-"], {
      encoding: "utf8",
      timeout: 60_000,
      maxBuffer: 20 * 1024 * 1024,
    });
    if (r.error) {
      throw new Error(r.error.code === "ENOENT" ? "pdftotext is not installed (apt-get install poppler-utils)" : r.error.message);
    }
    if (r.status !== 0) throw new Error(`pdftotext exited ${r.status}: ${oneLine(String(r.stderr).trim()).slice(0, 300)}`);
    return r.stdout;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Tell the workflow whether the season's reports have stopped (no-op outside Actions). */
function setOutput(name, value) {
  // Values are "true"/"false" or a YYYY-MM-DD date; anything else is dropped, not written.
  if (process.env.GITHUB_OUTPUT && /^[\w-]*$/.test(value)) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

/** Most days a report's "up to" date may differ from the date in its feed title. */
const MAX_TITLE_DATE_GAP_DAYS = 7;

/**
 * Read one official weekly report into a snapshot dated by the day its totals run to.
 * Throws on a fetch or pdftotext failure; returns ok:false when the text cannot be read,
 * or when its date is far from `titleDate` (the date in the feed item's title), if given.
 */
async function readReport(toll, pdfUrl, titleDate) {
  const bytes = await fetchPdf(pdfUrl);
  const text = pdfToText(bytes);
  const parsed = parseReportText(text, new Date().toISOString());
  if (!parsed.ok) return parsed;
  const { asOf, confirmed, deaths, neuroinvasive } = parsed.report;
  if (titleDate && Math.abs(Date.parse(asOf) - Date.parse(titleDate)) > MAX_TITLE_DATE_GAP_DAYS * 86_400_000) {
    return { ok: false, reason: `report runs to ${asOf} but its feed title says ${titleDate}` };
  }
  console.log(`Parsed report to ${asOf}: confirmed=${confirmed} deaths=${deaths} neuroinvasive=${neuroinvasive}`);
  return {
    ok: true,
    text,
    snapshot: {
      date: asOf,
      confirmed,
      suspected: null,
      deaths,
      recovered: null,
      source: toll.source,
      sourceUrl: pdfUrl,
      sourceSha256: sha256(bytes),
    },
  };
}

async function updateFromEodyReport(outbreak, reportUrls) {
  const { slug, toll } = outbreak;
  const tollJson = dataFile(ROOT, slug, "toll");
  const tollLabel = `data/outbreaks/${slug}/toll.json`;
  const nowISO = new Date().toISOString();

  let store;
  try {
    store = readStore(tollJson);
  } catch (err) {
    console.log(`::warning::Toll update for ${slug} skipped: ${err.message}`);
    return;
  }
  const last = store.snapshots.at(-1) ?? null;
  console.log(last ? `Last stored report: ${last.date} confirmed=${last.confirmed} deaths=${last.deaths}` : "No stored reports yet.");

  /** @type {{pdfUrl: string, titleDate?: string}[]} */
  let reports = reportUrls.map((u) => ({ pdfUrl: normalizeUrl(u) }));
  if (reports.length === 0) {
    let feed;
    try {
      console.log(`Fetching the report feed ${toll.feedUrl}...`);
      const xml = await (await fetchOk(toll.feedUrl, "application/rss+xml, application/xml")).text();
      feed = inspectReportFeed(xml, toll.titleIncludes);
    } catch (err) {
      // A failed fetch says nothing about the season; never let it switch the workflow off.
      setOutput("season_over", "false");
      console.log(`::warning::Toll update for ${slug} skipped, could not read the report feed: ${oneLine(err instanceof Error ? err.message : err)}`);
      return;
    }
    if (feed.itemCount === 0) {
      // An error or maintenance page served with HTTP 200, not an empty season.
      setOutput("season_over", "false");
      console.log(`::warning::The ${slug} report feed has no items at all (an error page?); nothing read.`);
      return;
    }
    // Only a feed whose matching items all read cleanly can say the reports have stopped.
    const feedHealthy = feed.unreadable === 0;
    if (!feedHealthy) {
      console.log(
        `::warning::${feed.unreadable} ${slug} report item(s) in the feed could not be read (title date or PDF link format changed?). They need a look; the season will not be closed meanwhile.`,
      );
    }
    // Known: the same PDF, or a report for a date already on file (a reissue under a new
    // URL is repaired by hand with --report, not downloaded twice a day).
    const storedUrls = new Set(store.snapshots.map((s) => normalizeUrl(s.sourceUrl)));
    const storedDates = new Set(store.snapshots.map((s) => s.date));
    const pending = feed.items
      .filter((i) => !storedUrls.has(normalizeUrl(i.pdfUrl)) && !storedDates.has(i.reportDate))
      .reverse(); // oldest first, so a week missed earlier is read before the newest
    if (pending.length === 0) {
      const newest = feed.items[0];
      console.log(newest ? `Newest report in the feed (${newest.reportDate}) is already stored.` : "No report in the feed right now.");
      const over = feedHealthy && seasonIsOver(last?.date ?? null, nowISO);
      setOutput("season_over", String(over));
      setOutput("last_report", last?.date ?? "");
      if (over) console.log(`::notice::No new ${slug} report since ${last.date}: the season looks over.`);
      store = { ...store, lastChecked: nowISO };
      mkdirSync(dirname(tollJson), { recursive: true });
      writeFileSync(tollJson, JSON.stringify(store, null, 2) + "\n");
      return;
    }
    for (const i of pending) console.log(`New report in the feed: ${oneLine(i.title)}`);
    reports = pending.map((i) => ({ pdfUrl: i.pdfUrl, titleDate: i.reportDate }));
  }
  setOutput("season_over", "false");

  const read = [];
  for (const { pdfUrl: url, titleDate } of reports) {
    try {
      const r = await readReport(toll, url, titleDate);
      if (!r.ok) {
        console.log(`::error::Could not read the ${slug} report ${oneLine(url)}: ${oneLine(r.reason)}. The report format may have changed; ${tollLabel} NOT updated from it.`);
        continue;
      }
      read.push(r);
    } catch (err) {
      console.log(`::warning::Could not fetch or convert the ${slug} report ${oneLine(url)}: ${oneLine(err instanceof Error ? err.message : err)}`);
    }
  }

  let next = store;
  let stored = 0;
  for (const { snapshot, text } of read.sort((a, b) => a.snapshot.date.localeCompare(b.snapshot.date))) {
    const prev = next.snapshots.filter((s) => s.date < snapshot.date).at(-1) ?? null;
    const later = next.snapshots.find(
      (s) => s.date > snapshot.date && (s.confirmed < snapshot.confirmed || s.deaths < snapshot.deaths),
    );
    const verdict = later
      ? { ok: false, reason: `a later report (${later.date}) has lower totals` }
      : validateSnapshot(snapshot, prev, snapshot.date, { stalePrevDays: WEEKLY_STALE_PREV_DAYS });
    if (!verdict.ok) {
      console.log(`::warning::Report to ${snapshot.date} for ${slug} rejected by sanity check: ${verdict.reason}. Needs manual review.`);
      continue;
    }
    // Archive only a reading that changes the store, so a repeat leaves no orphan file.
    const trial = applySnapshot(next, snapshot, nowISO, { appendUnchanged: true });
    if (JSON.stringify(trial.snapshots) === JSON.stringify(next.snapshots)) {
      console.log(`Report to ${snapshot.date} has the figures already stored for that date; nothing to add.`);
      continue;
    }
    const raw = archiveReportText(ROOT, toll.rawPrefix, snapshot.date, text);
    if (!raw.ok) console.log(`::warning::Report text for ${snapshot.date} not archived: ${raw.reason}. Snapshot stored without rawPath.`);
    else console.log(`Report text ${raw.written ? "archived" : "already archived"}: ${raw.rawPath}`);
    const full = raw.ok ? { ...snapshot, rawPath: raw.rawPath, rawSha256: raw.rawSha256 } : snapshot;
    next = applySnapshot(next, full, nowISO, { appendUnchanged: true });
    stored++;
  }
  next = { ...next, lastChecked: nowISO };

  mkdirSync(dirname(tollJson), { recursive: true });
  writeFileSync(tollJson, JSON.stringify(next, null, 2) + "\n");
  const latest = next.snapshots.at(-1);
  console.log(
    `${tollLabel}: ${stored} report(s) stored, ${next.snapshots.length} snapshot(s)` +
      (latest ? `, latest ${latest.date} deaths=${latest.deaths} confirmed=${latest.confirmed}.` : "."),
  );
}

function flagValues(name, argv = process.argv.slice(2)) {
  return argv.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3));
}

async function main() {
  // Only outbreaks with an automated toll source are updated here.
  const adapter = flagValues("adapter")[0];
  const reportUrls = flagValues("report");
  const outbreaks = selectOutbreaksWith("toll").filter((o) => !adapter || tollAdapter(o) === adapter);
  if (adapter && outbreaks.length === 0) {
    console.log(`::warning::No automated outbreak is read with --adapter=${oneLine(adapter)} (wikipedia or eody-report); nothing done.`);
  }
  if (reportUrls.length && !(outbreaks.length === 1 && tollAdapter(outbreaks[0]) === "eody-report")) {
    console.log("::warning::--report needs --outbreak=<slug> naming one eody-report outbreak; nothing done.");
    return;
  }
  for (const outbreak of outbreaks) {
    console.log(`── ${outbreak.slug} ──`);
    try {
      if (tollAdapter(outbreak) === "eody-report") await updateFromEodyReport(outbreak, reportUrls);
      else await updateFromWikipedia(outbreak);
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
