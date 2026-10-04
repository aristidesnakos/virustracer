// Pure helpers for the death-toll tracker (no network, no fs).
// Used by scripts/update-toll.mjs and unit-tested in tests/toll.test.ts.

/**
 * @typedef {Object} ParsedInfobox
 * @property {number} confirmed
 * @property {number|null} suspected
 * @property {number} deaths
 * @property {number|null} recovered
 */

/**
 * @typedef {Object} Snapshot
 * @property {string} date        UTC date, YYYY-MM-DD
 * @property {number} confirmed
 * @property {number|null} suspected
 * @property {number} deaths
 * @property {number|null} recovered
 * @property {string} source
 * @property {string} sourceUrl
 * @property {number} [revid]
 * @property {string} [rawPath]    Repo-relative path of the archived infobox wikitext (data/raw/infobox/<revid>.txt)
 * @property {string} [rawSha256]  SHA-256 (hex) of that file's bytes
 */

/**
 * @typedef {Object} TollStore
 * @property {string} lastChecked   ISO timestamp (empty string if never checked)
 * @property {Snapshot[]} snapshots Sorted ascending by date
 */

export const MAX_SNAPSHOTS = 400;
/** Reject a jump bigger than this fraction over the previous snapshot... */
export const MAX_JUMP_RATIO = 0.25;
/** ...unless the previous snapshot is older than this many days. */
export const STALE_PREV_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Remove wiki noise from a raw field value: refs, comments, templates.
 * @param {string} raw
 * @returns {string}
 */
function cleanValue(raw) {
  let s = raw;
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<ref\b[^>]*\/\s*>/gi, ""); // self-closing <ref name="x" />
  s = s.replace(/<ref\b[^>]*>[\s\S]*?<\/ref\s*>/gi, ""); // <ref>...</ref>
  s = s.replace(/<[^>]+>/g, ""); // any other tag (e.g. <br />)
  // Unwrap number-formatting templates before the generic template strip.
  s = s.replace(/\{\{\s*(?:formatnum:|nowrap\s*\||val\s*\|)\s*([^{}|]*)[^{}]*\}\}/gi, "$1");
  // Strip remaining templates, innermost first.
  let prev;
  do {
    prev = s;
    s = s.replace(/\{\{[^{}]*\}\}/g, "");
  } while (s !== prev);
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Parse an integer out of a cleaned field value; null if blank/unparseable.
 * @param {string|undefined} raw
 * @returns {number|null}
 */
function parseCount(raw) {
  if (raw === undefined) return null;
  const s = cleanValue(raw).replace(/,/g, "").replace(/\s/g, " ");
  if (s === "") return null;
  const m = s.match(/^[^\d]*?(\d+)(\.\d+)?\s*(million|thousand|k\b)?/i);
  if (!m) return null;
  if (m[2] || m[3]) return null; // "1.2 million" etc. is not an exact count
  const n = Number.parseInt(m[1], 10);
  return Number.isSafeInteger(n) ? n : null;
}

/** Words that mark a figure as a wider count than "deaths among confirmed cases". */
const WIDER_LABEL = /\b(all|total|suspected|probable|overall|combined)\b/i;

/**
 * Parse the `deaths` field. Most infoboxes hold one figure, parsed exactly like any
 * other count. Some hold two, one per line, e.g. the Bangladesh measles article:
 * `100 {{small|(confirmed cases)}}<br>'''1,009 {{small|(all cases)}}'''`. The snapshot
 * definition is "deaths among confirmed cases" (the same as Ebola, so deaths <= confirmed),
 * so with several figures take the one whose label says "confirmed"; if none does, the
 * first figure that is not labelled as a wider count (all / total / suspected / ...).
 * A later bold "all cases" figure is never picked, whatever the order. If every figure is
 * labelled as wider, return null: the field cannot be read as deaths among confirmed cases.
 * The older `total (N suspected cases)` form is handled first (see the comment in the body).
 * @param {string|undefined} raw  field value with refs and comments already removed
 * @returns {number|null}
 */
function parseDeaths(raw) {
  if (raw === undefined) return null;
  // Older Bangladesh measles revisions (until 2026-09-08) wrote an all-cases total with
  // the suspected part in brackets: `997 (897 suspected cases)`. The 100 that followed on
  // 2026-09-10 (`100 (confirmed cases)`) is exactly 997 - 897, so the bracket means "of
  // which suspected" and deaths among confirmed cases is the difference.
  const split = cleanValue(raw)
    .replace(/,/g, "")
    .match(/^(\d+)(\+?)\s*\(\s*(\d+)\s*suspected(?:\s+(?:cases?|deaths?))?\s*\)\s*$/i);
  if (split) {
    const [, total, approx, suspected] = split;
    // "300+ (98 suspected)" is a lower bound minus an exact figure: not a reading.
    if (approx || Number(suspected) > Number(total)) return null;
    return Number(total) - Number(suspected);
  }
  // Lines are separated by <br> (or a real newline, or ";"). Keep {{small|(label)}} text
  // so the label survives; every other template is dropped by parseCount/cleanValue.
  const segments = raw
    .split(/<br\s*\/?>|\n|;/i)
    .map((seg) => ({
      count: parseCount(seg),
      label: seg
        .replace(/\{\{\s*small\s*\|([^{}]*)\}\}/gi, "$1")
        .replace(/<[^>]+>/g, "")
        .toLowerCase(),
    }))
    .filter((x) => x.count !== null);
  if (segments.length <= 1) return parseCount(raw); // the usual single-figure case, unchanged
  const confirmed = segments.find((x) => /\bconfirmed\b/.test(x.label) && !WIDER_LABEL.test(x.label));
  if (confirmed) return confirmed.count;
  const firstNarrow = segments.find((x) => !WIDER_LABEL.test(x.label));
  return firstNarrow ? firstNarrow.count : null;
}

/**
 * Extract the `{{Infobox outbreak ...}}` block (brace-balanced), exactly as it
 * appears in the wikitext. This is the text the parser consumes and the text
 * archived under data/raw/infobox/, so parseInfobox(extractInfobox(x)) equals
 * parseInfobox(x).
 * @param {string} wikitext
 * @returns {string|null}
 */
export function extractInfobox(wikitext) {
  if (typeof wikitext !== "string") return null;
  const start = wikitext.search(/\{\{\s*Infobox[ _]outbreak\b/i);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < wikitext.length - 1; i++) {
    const two = wikitext[i] + wikitext[i + 1];
    if (two === "{{") {
      depth++;
      i++;
    } else if (two === "}}") {
      depth--;
      i++;
      if (depth === 0) return wikitext.slice(start, i + 1);
    }
  }
  return null; // unbalanced
}

/**
 * Parse the Wikipedia `{{Infobox outbreak` fields we care about.
 * Returns null when the infobox is missing or confirmed/deaths can't be read.
 * @param {string} wikitext
 * @returns {ParsedInfobox|null}
 */
export function parseInfobox(wikitext) {
  if (typeof wikitext !== "string") return null;
  const block = extractInfobox(wikitext);
  if (!block) return null;

  // Refs may span lines and contain "|" at line start, so strip them from the
  // whole block before splitting it into fields.
  const stripped = block
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref\b[^>]*\/\s*>/gi, "")
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref\s*>/gi, "");

  /** @type {Record<string,string>} */
  const fields = {};
  let current = null;
  for (const line of stripped.split(/\r?\n/)) {
    const m = line.match(/^\s*\|\s*([A-Za-z0-9_ ]+?)\s*=(.*)$/);
    if (m) {
      current = m[1].toLowerCase().replace(/ /g, "_");
      fields[current] = m[2];
    } else if (current && !/^\s*\|/.test(line)) {
      fields[current] += " " + line; // continuation line
    } else {
      current = null;
    }
  }

  const confirmed = parseCount(fields.confirmed_cases);
  const deaths = parseDeaths(fields.deaths);
  if (confirmed === null || deaths === null) return null;
  return {
    confirmed,
    suspected: parseCount(fields.suspected_cases),
    deaths,
    recovered: parseCount(fields.recovery_cases),
  };
}

/**
 * Blank the fields an outbreak's registry entry says not to trust (`toll.ignoreFields`),
 * e.g. an infobox `recovery_cases` that counts hospital discharges rather than recoveries
 * among confirmed cases. Passes null through. Every reader of an infobox for a snapshot
 * (daily updater, backfill, raw verification) applies the same list.
 * @param {ParsedInfobox|null} parsed
 * @param {readonly string[]} [ignore]
 * @returns {ParsedInfobox|null}
 */
export function withoutIgnored(parsed, ignore = []) {
  if (!parsed) return parsed;
  const next = { ...parsed };
  for (const k of ignore) {
    if (k === "suspected" || k === "recovered") next[k] = null;
  }
  return next;
}

/** @param {unknown} n */
const isCount = (n) => typeof n === "number" && Number.isInteger(n) && n >= 0;

/**
 * Sanity-check a candidate snapshot against the previous one.
 * Note: `suspected` is only range-checked, not monotonic, because suspected
 * cases are routinely reclassified (to confirmed or discarded).
 * @param {Snapshot} next
 * @param {Snapshot|null|undefined} prev
 * @param {string} todayISO  YYYY-MM-DD or full ISO timestamp
 * @returns {{ok: boolean, reason?: string}}
 */
export function validateSnapshot(next, prev, todayISO) {
  if (!next || typeof next !== "object") return { ok: false, reason: "no snapshot" };
  if (!isCount(next.confirmed)) return { ok: false, reason: `confirmed is not a non-negative integer (${next.confirmed})` };
  if (!isCount(next.deaths)) return { ok: false, reason: `deaths is not a non-negative integer (${next.deaths})` };
  for (const k of /** @type {const} */ (["suspected", "recovered"])) {
    if (next[k] !== null && next[k] !== undefined && !isCount(next[k])) {
      return { ok: false, reason: `${k} is not a non-negative integer (${next[k]})` };
    }
  }
  if (next.deaths > next.confirmed) {
    return { ok: false, reason: `deaths (${next.deaths}) exceed confirmed (${next.confirmed})` };
  }
  if (!prev) return { ok: true };

  for (const k of /** @type {const} */ (["confirmed", "deaths", "recovered"])) {
    const a = next[k];
    const b = prev[k];
    if (a !== null && a !== undefined && b !== null && b !== undefined && a < b) {
      return { ok: false, reason: `${k} decreased from ${b} (${prev.date}) to ${a}` };
    }
  }

  const ageDays = (Date.parse(todayISO.slice(0, 10)) - Date.parse(prev.date)) / MS_PER_DAY;
  const prevIsStale = Number.isFinite(ageDays) && ageDays > STALE_PREV_DAYS;
  if (!prevIsStale) {
    for (const k of /** @type {const} */ (["confirmed", "deaths"])) {
      if (prev[k] > 0 && next[k] > prev[k] * (1 + MAX_JUMP_RATIO)) {
        return {
          ok: false,
          reason: `${k} jumped ${prev[k]} -> ${next[k]} (>${MAX_JUMP_RATIO * 100}%) within ${STALE_PREV_DAYS} days of the last snapshot (${prev.date})`,
        };
      }
    }
  }
  return { ok: true };
}

/**
 * @param {Snapshot} a
 * @param {Snapshot} b
 */
function sameValues(a, b) {
  return (
    a.confirmed === b.confirmed &&
    a.deaths === b.deaths &&
    (a.suspected ?? null) === (b.suspected ?? null) &&
    (a.recovered ?? null) === (b.recovered ?? null)
  );
}

/**
 * Return a new store with `snap` applied. Never mutates the input.
 *  - always sets lastChecked
 *  - identical values to the latest snapshot -> nothing else changes
 *  - same date as the latest snapshot -> replace it
 *  - otherwise append; snapshots stay sorted by date and capped.
 * @param {TollStore} store
 * @param {Snapshot} snap
 * @param {string} nowISO
 * @returns {TollStore}
 */
export function applySnapshot(store, snap, nowISO) {
  const existing = [...(store?.snapshots ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const last = existing[existing.length - 1];

  if (last && sameValues(last, snap)) {
    return { ...store, lastChecked: nowISO, snapshots: existing };
  }

  const snapshots =
    last && last.date === snap.date
      ? [...existing.slice(0, -1), { ...snap }]
      : [...existing.filter((s) => s.date !== snap.date), { ...snap }];
  snapshots.sort((a, b) => a.date.localeCompare(b.date));

  return {
    ...store,
    lastChecked: nowISO,
    snapshots: snapshots.slice(-MAX_SNAPSHOTS),
  };
}
