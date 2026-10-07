// Archive of the raw `{{Infobox outbreak}}` wikitext behind every toll snapshot,
// so each reading can be re-parsed and verified even if the parser or the
// infobox format changes. Plain node, no deps. Unit-tested in tests/raw.test.ts.
//
// Layout: data/raw/infobox/<revid>.txt  (append-only, immutable, one file per
// Wikipedia revision, containing exactly the block parseInfobox consumed), and
// data/raw/report/<source>-<date>-<sha>.txt for official reports (the full text the
// report parser read; see archiveReportText).

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { extractInfobox, parseInfobox, withoutIgnored } from "./toll.mjs";
import { parseReportText, reportRawRelPath } from "./eody.mjs";

export const RAW_DIR = "data/raw/infobox";

/** @param {string} text */
export function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Repo-relative archive path for a revision.
 * @param {number} revid
 */
export function rawRelPath(revid) {
  if (!Number.isSafeInteger(revid) || revid <= 0) throw new Error(`invalid revid: ${revid}`);
  return `${RAW_DIR}/${revid}.txt`;
}

/**
 * Re-parse archived infobox text and check it still yields the snapshot's
 * numbers (and, when the snapshot records one, the stored checksum).
 * @param {{confirmed:number, suspected?:number|null, deaths:number, recovered?:number|null, rawSha256?:string}} snapshot
 * @param {string} rawText
 * @param {readonly string[]} [ignore]  The outbreak's `toll.ignoreFields`, blanked before comparing.
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function verifyRaw(snapshot, rawText, ignore = []) {
  if (typeof rawText !== "string") return { ok: false, reason: "no raw text" };
  if (snapshot.rawSha256 && sha256(rawText) !== snapshot.rawSha256) {
    return { ok: false, reason: "sha256 of raw text does not match rawSha256" };
  }
  const parsed = withoutIgnored(parseInfobox(rawText), ignore);
  if (!parsed) return { ok: false, reason: "raw text does not parse as an Infobox outbreak" };
  for (const k of /** @type {const} */ (["confirmed", "suspected", "deaths", "recovered"])) {
    if ((parsed[k] ?? null) !== (snapshot[k] ?? null)) {
      return { ok: false, reason: `${k}: raw parses to ${parsed[k]}, snapshot has ${snapshot[k] ?? null}` };
    }
  }
  return { ok: true };
}

/**
 * The same check for an official report's archived text: the checksum matches, and
 * re-parsing gives the snapshot's date, cases and deaths.
 * @param {{date: string, confirmed: number, deaths: number, rawSha256?: string}} snapshot
 * @param {string} rawText
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function verifyReportRaw(snapshot, rawText) {
  if (typeof rawText !== "string") return { ok: false, reason: "no raw text" };
  if (snapshot.rawSha256 && sha256(rawText) !== snapshot.rawSha256) {
    return { ok: false, reason: "sha256 of raw text does not match rawSha256" };
  }
  const parsed = parseReportText(rawText);
  if (!parsed.ok) return { ok: false, reason: `raw text does not parse as a report: ${parsed.reason}` };
  const { asOf, confirmed, deaths } = parsed.report;
  if (asOf !== snapshot.date) return { ok: false, reason: `date: raw parses to ${asOf}, snapshot has ${snapshot.date}` };
  if (confirmed !== snapshot.confirmed) return { ok: false, reason: `confirmed: raw parses to ${confirmed}, snapshot has ${snapshot.confirmed}` };
  if (deaths !== snapshot.deaths) return { ok: false, reason: `deaths: raw parses to ${deaths}, snapshot has ${snapshot.deaths}` };
  return { ok: true };
}

/**
 * Write the infobox for `revid` unless its file already exists (never rewrites).
 * `wikitext` may be the whole lead section or the bare infobox; the infobox
 * block is extracted. Returns the fields to put on the snapshot.
 *
 * ok:false when nothing could be archived (no infobox, fs error, or an
 * existing file for this revid whose content differs, which is never overwritten).
 *
 * @param {string} repoRoot
 * @param {number} revid
 * @param {string} wikitext
 * @returns {{ok: true, rawPath: string, rawSha256: string, written: boolean} | {ok: false, reason: string}}
 */
export function archiveInfobox(repoRoot, revid, wikitext) {
  try {
    const block = extractInfobox(wikitext);
    if (!block) return { ok: false, reason: "no Infobox outbreak block to archive" };
    return writeOnce(repoRoot, rawRelPath(revid), block);
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Archive the text an official report was parsed from (`pdftotext` output) under
 * data/raw/report/, named by source, date and checksum (see `reportRawRelPath`).
 * Same write-once rules as `archiveInfobox`.
 * @param {string} repoRoot
 * @param {string} prefix  e.g. "eody-wnv"
 * @param {string} asOf    YYYY-MM-DD the report's totals run to
 * @param {string} text
 * @returns {{ok: true, rawPath: string, rawSha256: string, written: boolean} | {ok: false, reason: string}}
 */
export function archiveReportText(repoRoot, prefix, asOf, text) {
  try {
    if (typeof text !== "string" || text === "") return { ok: false, reason: "no report text to archive" };
    return writeOnce(repoRoot, reportRawRelPath(prefix, asOf, sha256(text)), text);
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Write `content` to `rawPath` unless the file exists; an existing file is only
 * accepted when its bytes are identical, and is never overwritten.
 * @param {string} repoRoot
 * @param {string} rawPath  repo-relative
 * @param {string} content
 * @returns {{ok: true, rawPath: string, rawSha256: string, written: boolean} | {ok: false, reason: string}}
 */
function writeOnce(repoRoot, rawPath, content) {
  const abs = resolve(repoRoot, rawPath);
  const hash = sha256(content);
  const existing = () => {
    if (sha256(readFileSync(abs, "utf8")) !== hash) {
      return { ok: false, reason: `${rawPath} already exists with different content; left untouched` };
    }
    return { ok: true, rawPath, rawSha256: hash, written: false };
  };
  if (existsSync(abs)) return existing();
  mkdirSync(dirname(abs), { recursive: true });
  try {
    writeFileSync(abs, content, { encoding: "utf8", flag: "wx" }); // wx: fail rather than overwrite
  } catch (err) {
    if (err?.code === "EEXIST") return existing();
    throw err;
  }
  return { ok: true, rawPath, rawSha256: hash, written: true };
}

/**
 * Attach raw archive fields to snapshots that lack them. A snapshot is changed
 * ONLY by adding rawPath and rawSha256, and only when the re-parsed infobox
 * equals its numbers. Archive files are not written when `dryRun`.
 *
 * @template {{snapshots: any[]}} T
 * @param {T} store
 * @param {{
 *   repoRoot: string,
 *   fetchLead: (revid: number) => Promise<string|null|undefined>,
 *   ignore?: readonly string[],
 *   dryRun?: boolean,
 *   delayMs?: number,
 *   sleep?: (ms: number) => Promise<void>,
 *   log?: (msg: string) => void,
 * }} opts
 * @returns {Promise<{store: T, stats: Record<string, number>}>}
 */
export async function backfillRawForStore(store, opts) {
  const { repoRoot, fetchLead, ignore = [], dryRun = false, delayMs = 0, log = () => {} } = opts;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const stats = { alreadyHave: 0, noRevid: 0, fetchFailed: 0, noInfobox: 0, mismatch: 0, writeFailed: 0, archived: 0, wouldArchive: 0 };
  const snapshots = [];
  let first = true;
  for (const snap of store.snapshots) {
    if (snap.rawPath) {
      stats.alreadyHave++;
      snapshots.push(snap);
      continue;
    }
    if (!Number.isSafeInteger(snap.revid)) {
      stats.noRevid++;
      log(`skip ${snap.date}: no revid`);
      snapshots.push(snap);
      continue;
    }
    if (!first && delayMs > 0) await sleep(delayMs);
    first = false;

    let lead;
    try {
      lead = await fetchLead(snap.revid);
    } catch (err) {
      stats.fetchFailed++;
      log(`skip ${snap.date} (rev ${snap.revid}): fetch failed: ${err instanceof Error ? err.message : err}`);
      snapshots.push(snap);
      continue;
    }
    const block = typeof lead === "string" ? extractInfobox(lead) : null;
    if (!block) {
      stats.noInfobox++;
      log(`skip ${snap.date} (rev ${snap.revid}): no infobox in fetched revision`);
      snapshots.push(snap);
      continue;
    }
    const check = verifyRaw(snap, block, ignore);
    if (!check.ok) {
      stats.mismatch++;
      log(`MISMATCH ${snap.date} (rev ${snap.revid}): ${check.reason}; not stored, numbers untouched`);
      snapshots.push(snap);
      continue;
    }
    if (dryRun) {
      stats.wouldArchive++;
      log(`ok ${snap.date} (rev ${snap.revid}): would store ${rawRelPath(snap.revid)}`);
      snapshots.push(snap);
      continue;
    }
    const res = archiveInfobox(repoRoot, snap.revid, block);
    if (!res.ok) {
      stats.writeFailed++;
      log(`skip ${snap.date} (rev ${snap.revid}): ${res.reason}`);
      snapshots.push(snap);
      continue;
    }
    stats.archived++;
    log(`stored ${snap.date} (rev ${snap.revid}): ${res.rawPath}${res.written ? "" : " (already on disk)"}`);
    snapshots.push({ ...snap, rawPath: res.rawPath, rawSha256: res.rawSha256 });
  }
  return { store: { ...store, snapshots }, stats };
}
