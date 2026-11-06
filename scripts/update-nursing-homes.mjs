#!/usr/bin/env node
/**
 * Nursing-home data layer updater. Runs in GitHub Actions (plain `node` 22, no deps).
 * Not an outbreak reader: these are recurring measurements by state and by facility, kept
 * under data/nursing-homes/, never in the outbreak registry and never fed to computeMetrics.
 *
 *  respiratory         CDC NHSN weekly respiratory data for nursing-home residents
 *                      (scripts/lib/nhsn.mjs): the open dataset tscn-ryh9 on data.cdc.gov
 *                      (counts) and the data file behind CDC's Nursing Home Data Dashboard
 *                      on www.cdc.gov (rates per 100,000 residents, fresher).
 *  infection-control   CMS inspection citations under tag F880 from the Provider Data
 *                      Catalog dataset r5ix-sfxw on data.cms.gov (scripts/lib/cms-f880.mjs).
 *                      Fetched only when the dataset's modified/released dates change.
 *
 *   node scripts/update-nursing-homes.mjs [--dataset=respiratory|infection-control] [--force]
 *
 * --force re-reads a source even when its metadata says nothing changed.
 *
 * Never fails the workflow: a fetch failure is a ::warning::, a failed cross-check an
 * ::error::, and in both cases that source's files are left untouched; exits 0.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  ALL_PATHOGENS_FROM, COUNT_FIELDS, DASHBOARD_DATA_URL, DASHBOARD_PAGE, NHSN_DATASET_ID, NHSN_DATASET_PAGE,
  NHSN_DATASET_TITLE, NHSN_METADATA_URL, NHSN_ROWS_URL, RATE_FIELDS, isNhsnUrl, nhsnRowsToCsv, parseDashboard,
  parseNhsnMetadata, parseNhsnRows, rateRowsToCsv,
} from "./lib/nhsn.mjs";
import {
  CMS_DATASET_ID, CMS_DATASET_PAGE, CMS_METASTORE_URL, buildStateFiles, citationsToCsv, cmsQueryUrl, isCmsUrl,
  parseCmsMetastore, validateCitationRows,
} from "./lib/cms-f880.mjs";
import { archiveGzipText } from "./lib/raw.mjs";
import { USER_AGENT } from "./lib/outbreak-registry.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DIR = join(ROOT, "data", "nursing-homes");
const PATHS = {
  counts: join(DIR, "respiratory", "counts.json"),
  rates: join(DIR, "respiratory", "rates.json"),
  f880Index: join(DIR, "infection-control", "index.json"),
  f880States: join(DIR, "infection-control", "states"),
};

const TIMEOUT_MS = 60_000;
/** Metadata documents are under 100 KB. */
const META_MAX_BYTES = 2 * 1024 * 1024;
/** The dataset's rows are about 2.4 MB of JSON. */
const NHSN_ROWS_MAX_BYTES = 40 * 1024 * 1024;
/** The dashboard file was 10 MB uncompressed on 2026-11-06 and grows about 90 KB a week. */
const DASHBOARD_MAX_BYTES = 60 * 1024 * 1024;
/** One page of 1,500 citations is about 1.3 MB. */
const CMS_PAGE_MAX_BYTES = 10 * 1024 * 1024;
/** More pages than this means the filter stopped working (24,413 rows = 17 pages on 2026-11-06). */
const CMS_MAX_PAGES = 80;

const oneLine = (s) => String(s).replace(/\s+/g, " ").slice(0, 400);
const flag = (name) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const FORCE = process.argv.includes("--force");

/** GET `url` (https, allowed host only, never followed off it), capped at `maxBytes`. Returns text and headers. */
async function fetchCapped(url, allowed, maxBytes, accept) {
  if (!allowed(url)) throw new Error(`refusing to fetch ${oneLine(url)}: not an allowed https host`);
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: accept },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!allowed(res.url)) throw new Error(`${oneLine(url)} redirected to ${oneLine(res.url)}, off the allowed host`);
  if (!res.ok) throw new Error(`${oneLine(url)} responded HTTP ${res.status}`);
  const declared = Number(res.headers.get("content-length"));
  if (declared > maxBytes && !res.headers.get("content-encoding")) throw new Error(`${oneLine(url)} is ${declared} bytes, over the ${maxBytes} limit`);
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body ?? []) {
    size += chunk.length;
    if (size > maxBytes) throw new Error(`${oneLine(url)} is over the ${maxBytes}-byte limit`);
    chunks.push(chunk);
  }
  const buf = Buffer.concat(chunks);
  return { text: buf.toString("utf8"), sha256: createHash("sha256").update(buf).digest("hex"), lastModified: res.headers.get("last-modified") };
}

async function fetchJson(url, allowed, maxBytes) {
  const r = await fetchCapped(url, allowed, maxBytes, "application/json");
  try {
    return { ...r, json: JSON.parse(r.text) };
  } catch {
    throw new Error(`${oneLine(url)} did not return JSON`);
  }
}

function readJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value) + "\n");
}

/** Write a columnar file with one row per line: diffs stay readable and small. */
function writeColumnar(path, head, rows) {
  mkdirSync(dirname(path), { recursive: true });
  const body = JSON.stringify(head, null, 2).replace(/\n}$/, "");
  const lines = rows.map((r) => "    " + JSON.stringify(r)).join(",\n");
  writeFileSync(path, `${body},\n  "rows": [\n${lines}\n  ]\n}\n`);
}

// ─── A. NHSN respiratory ────────────────────────────────────────────────────────────────

async function updateNhsnCounts(nowISO) {
  const label = "data/nursing-homes/respiratory/counts.json";
  let stored;
  try {
    stored = readJson(PATHS.counts);
  } catch (err) {
    console.log(`::warning::${label} is unreadable (${oneLine(err.message)}); NHSN counts skipped.`);
    return;
  }
  let meta;
  try {
    const m = await fetchJson(NHSN_METADATA_URL, isNhsnUrl, META_MAX_BYTES);
    meta = parseNhsnMetadata(m.json);
  } catch (err) {
    console.log(`::warning::NHSN counts skipped, could not fetch the dataset's metadata: ${oneLine(err.message)}`);
    return;
  }
  if (!meta.ok) {
    console.log(`::error::NHSN dataset ${NHSN_DATASET_ID} metadata failed its checks: ${oneLine(meta.reason)}. ${label} NOT updated.`);
    return;
  }
  console.log(`NHSN ${NHSN_DATASET_ID}: rows last updated ${meta.rowsUpdatedAt}.`);
  if (stored && stored.sourceRowsUpdatedAt === meta.rowsUpdatedAt && !FORCE) {
    writeColumnar(PATHS.counts, { ...headOf(stored), lastChecked: nowISO }, stored.rows);
    console.log(`Unchanged since the stored extract (newest week ${stored.latestWeek}); refreshed lastChecked only.`);
    return;
  }

  let rows;
  try {
    rows = (await fetchJson(NHSN_ROWS_URL, isNhsnUrl, NHSN_ROWS_MAX_BYTES)).json;
  } catch (err) {
    console.log(`::warning::NHSN counts skipped, could not fetch the dataset's rows: ${oneLine(err.message)}`);
    return;
  }
  const parsed = parseNhsnRows(rows, { nowISO });
  if (!parsed.ok) {
    console.log(`::error::NHSN dataset ${NHSN_DATASET_ID} failed its cross-checks: ${oneLine(parsed.reason)}. ${label} NOT updated.`);
    return;
  }
  if (stored) {
    const have = new Set(parsed.weeks);
    const lost = [...new Set(stored.rows.map((r) => r[0]))].filter((w) => !have.has(w));
    if (lost.length) {
      console.log(`::error::NHSN dataset ${NHSN_DATASET_ID} no longer has week(s) ${lost.slice(0, 5).join(", ")} that are stored. Needs manual review; ${label} NOT updated.`);
      return;
    }
  }
  const csv = nhsnRowsToCsv(rows);
  const raw = archiveGzipText(ROOT, "nhsn-tscn-ryh9", parsed.latestWeek, csv);
  if (!raw.ok) {
    console.log(`::error::NHSN extract not archived (${oneLine(raw.reason)}); ${label} NOT updated.`);
    return;
  }
  const version = { fetchedAt: nowISO, sourceRowsUpdatedAt: meta.rowsUpdatedAt, latestWeek: parsed.latestWeek, rows: rows.length, rawPath: raw.rawPath, rawSha256: raw.rawSha256 };
  const same = stored?.rawSha256 === raw.rawSha256;
  const head = {
    dataset: NHSN_DATASET_ID,
    title: NHSN_DATASET_TITLE,
    sourceUrl: NHSN_DATASET_PAGE,
    lastChecked: nowISO,
    sourceRowsUpdatedAt: meta.rowsUpdatedAt,
    fetchedAt: same ? stored.fetchedAt : nowISO,
    firstWeek: parsed.firstWeek,
    latestWeek: parsed.latestWeek,
    allPathogensFrom: ALL_PATHOGENS_FROM,
    rawPath: raw.rawPath,
    rawSha256: raw.rawSha256,
    versions: same ? stored.versions : [...(stored?.versions ?? []), version],
    fields: COUNT_FIELDS,
  };
  writeColumnar(PATHS.counts, head, parsed.rows);
  console.log(`${label}: ${parsed.rows.length} rows, ${parsed.weeks.length} weeks (${parsed.firstWeek} to ${parsed.latestWeek}); raw ${raw.written ? "archived" : "already archived"} at ${raw.rawPath}.`);
}

async function updateNhsnRates(nowISO) {
  const label = "data/nursing-homes/respiratory/rates.json";
  let stored;
  try {
    stored = readJson(PATHS.rates);
  } catch (err) {
    console.log(`::warning::${label} is unreadable (${oneLine(err.message)}); dashboard rates skipped.`);
    return;
  }
  let file;
  try {
    file = await fetchJson(DASHBOARD_DATA_URL, isNhsnUrl, DASHBOARD_MAX_BYTES);
  } catch (err) {
    console.log(`::warning::Dashboard rates skipped, could not fetch ${DASHBOARD_DATA_URL}: ${oneLine(err.message)}`);
    return;
  }
  const parsed = parseDashboard(file.json, { nowISO });
  if (!parsed.ok) {
    console.log(`::error::The NHSN dashboard data file failed its checks: ${oneLine(parsed.reason)}. ${label} NOT updated.`);
    return;
  }
  if (stored) {
    const have = new Set(parsed.weeks);
    const lost = [...new Set(stored.rows.map((r) => r[0]))].filter((w) => !have.has(w));
    if (lost.length) {
      console.log(`::error::The NHSN dashboard data file no longer has week(s) ${lost.slice(0, 5).join(", ")} that are stored. Needs manual review; ${label} NOT updated.`);
      return;
    }
  }
  const csv = rateRowsToCsv(parsed.rows);
  const raw = archiveGzipText(ROOT, "nhsn-dashboard", parsed.latestWeek, csv);
  if (!raw.ok) {
    console.log(`::error::Dashboard extract not archived (${oneLine(raw.reason)}); ${label} NOT updated.`);
    return;
  }
  const same = stored?.rawSha256 === raw.rawSha256;
  const version = { fetchedAt: nowISO, sourceLastModified: file.lastModified, latestWeek: parsed.latestWeek, sourceSha256: file.sha256, rawPath: raw.rawPath, rawSha256: raw.rawSha256 };
  const head = {
    source: "CDC NHSN Nursing Home Data Dashboard",
    sourceUrl: DASHBOARD_PAGE,
    dataUrl: DASHBOARD_DATA_URL,
    unit: "weekly cases or hospitalisations per 100,000 residents",
    lastChecked: nowISO,
    fetchedAt: same ? stored.fetchedAt : nowISO,
    sourceLastModified: same ? stored.sourceLastModified : file.lastModified,
    firstWeek: parsed.firstWeek,
    latestWeek: parsed.latestWeek,
    allPathogensFrom: ALL_PATHOGENS_FROM,
    rawPath: raw.rawPath,
    rawSha256: raw.rawSha256,
    versions: same ? stored.versions : [...(stored?.versions ?? []), version],
    fields: RATE_FIELDS,
  };
  writeColumnar(PATHS.rates, head, parsed.rows);
  console.log(
    same
      ? `Dashboard rates unchanged (newest week ${parsed.latestWeek}); refreshed lastChecked only.`
      : `${label}: ${parsed.rows.length} rows, newest week ${parsed.latestWeek}; raw ${raw.written ? "archived" : "already archived"} at ${raw.rawPath}.`,
  );
}

/** A stored columnar file without its rows. */
function headOf(stored) {
  const { rows: _rows, ...head } = stored;
  void _rows;
  return head;
}

// ─── B. CMS F880 citations ──────────────────────────────────────────────────────────────

async function updateF880(nowISO) {
  const label = "data/nursing-homes/infection-control";
  let index;
  try {
    index = readJson(PATHS.f880Index) ?? { dataset: CMS_DATASET_ID, sourceUrl: CMS_DATASET_PAGE, lastChecked: "", latest: null, releases: [] };
  } catch (err) {
    console.log(`::warning::${label}/index.json is unreadable (${oneLine(err.message)}); F880 skipped.`);
    return;
  }
  let meta;
  try {
    meta = parseCmsMetastore((await fetchJson(CMS_METASTORE_URL, isCmsUrl, META_MAX_BYTES)).json);
  } catch (err) {
    console.log(`::warning::F880 citations skipped, could not fetch the CMS metastore entry: ${oneLine(err.message)}`);
    return;
  }
  if (!meta.ok) {
    console.log(`::error::CMS dataset ${CMS_DATASET_ID} metastore entry failed its checks: ${oneLine(meta.reason)}. ${label} NOT updated.`);
    return;
  }
  console.log(`CMS ${CMS_DATASET_ID}: modified ${meta.modified}, released ${meta.released}, next update ${meta.nextUpdateDate ?? "?"}.`);
  const latest = index.releases.at(-1);
  if (latest && latest.release === meta.modified && latest.released === meta.released && !FORCE) {
    writeJson(PATHS.f880Index, { ...index, lastChecked: nowISO, nextUpdateDate: meta.nextUpdateDate });
    console.log(`Release ${meta.modified} is already stored; refreshed lastChecked only.`);
    return;
  }

  const rows = [];
  let reportedCount = null;
  try {
    for (let page = 0; ; page++) {
      if (page >= CMS_MAX_PAGES) throw new Error(`more than ${CMS_MAX_PAGES} pages; the tag filter may have stopped working`);
      const { json } = await fetchJson(cmsQueryUrl(page * 1500), isCmsUrl, CMS_PAGE_MAX_BYTES);
      if (!Array.isArray(json?.results) || !Number.isSafeInteger(json?.count)) throw new Error("a query page had no results/count");
      if (reportedCount !== null && json.count !== reportedCount) throw new Error(`the row count changed while paging (${reportedCount} -> ${json.count})`);
      reportedCount = json.count;
      rows.push(...json.results);
      if (json.results.length < 1500 || rows.length >= reportedCount) break;
    }
    // The release must not have changed under us while paging.
    const after = parseCmsMetastore((await fetchJson(CMS_METASTORE_URL, isCmsUrl, META_MAX_BYTES)).json);
    if (!after.ok || after.modified !== meta.modified || after.released !== meta.released) {
      throw new Error("the dataset's release changed while it was being read; trying again next run");
    }
  } catch (err) {
    console.log(`::warning::F880 citations skipped, could not read the CMS query API: ${oneLine(err.message)}`);
    return;
  }

  const check = validateCitationRows(rows, { modified: meta.modified, reportedCount });
  if (!check.ok) {
    console.log(`::error::CMS F880 citations (release ${meta.modified}) failed their checks: ${oneLine(check.reason)}. ${label} NOT updated.`);
    return;
  }
  for (const n of check.notes) console.log(`::notice::${n}`);
  const raw = archiveGzipText(ROOT, "cms-f880", meta.modified, citationsToCsv(rows));
  if (!raw.ok) {
    console.log(`::error::F880 extract not archived (${oneLine(raw.reason)}); ${label} NOT updated.`);
    return;
  }

  const files = buildStateFiles(rows, { release: meta.modified, released: meta.released });
  mkdirSync(PATHS.f880States, { recursive: true });
  for (const f of readdirSync(PATHS.f880States)) {
    if (/^[A-Z]{2}\.json$/.test(f) && !(f.slice(0, 2) in files)) rmSync(join(PATHS.f880States, f));
  }
  for (const [st, file] of Object.entries(files)) writeJson(join(PATHS.f880States, `${st}.json`), file);

  const record = {
    release: meta.modified,
    released: meta.released,
    fetchedAt: nowISO,
    citations: rows.length,
    facilities: new Set(rows.map((r) => r.cms_certification_number_ccn)).size,
    states: Object.keys(files).length,
    rawPath: raw.rawPath,
    rawSha256: raw.rawSha256,
    downloadURL: meta.downloadURL,
  };
  const releases = index.releases.filter((r) => !(r.release === record.release && r.rawSha256 === record.rawSha256));
  writeJson(PATHS.f880Index, {
    dataset: CMS_DATASET_ID,
    sourceUrl: CMS_DATASET_PAGE,
    lastChecked: nowISO,
    nextUpdateDate: meta.nextUpdateDate,
    latest: record.release,
    releases: [...releases, record],
  });
  console.log(`${label}: release ${record.release} (released ${record.released}), ${record.citations} citations at ${record.facilities} homes in ${record.states} states; raw ${raw.written ? "archived" : "already archived"} at ${raw.rawPath}.`);
}

async function main() {
  const dataset = flag("dataset");
  if (dataset && !["respiratory", "infection-control"].includes(dataset)) {
    console.log(`::warning::Unknown --dataset=${oneLine(dataset)} (respiratory or infection-control); nothing done.`);
    return;
  }
  const nowISO = new Date().toISOString();
  const steps = [
    ["respiratory", "NHSN counts (data.cdc.gov)", updateNhsnCounts],
    ["respiratory", "NHSN dashboard rates (www.cdc.gov)", updateNhsnRates],
    ["infection-control", "CMS F880 citations (data.cms.gov)", updateF880],
  ];
  for (const [kind, name, fn] of steps) {
    if (dataset && dataset !== kind) continue;
    console.log(`── ${name} ──`);
    try {
      await fn(nowISO);
    } catch (err) {
      console.log(`::warning::${name} crashed: ${oneLine(err instanceof Error ? err.stack || err.message : err)}`);
    }
  }
}

main().catch((err) => console.log(`::warning::Nursing-home update crashed: ${oneLine(err?.stack ?? err)}`));
