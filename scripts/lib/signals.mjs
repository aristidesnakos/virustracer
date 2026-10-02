// Pure helper for the early-signal ledger (no network, no fs).
// Used by scripts/fetch-feeds.mjs and unit-tested in tests/signals.test.ts.
//
// The candidates list is pruned after 30 days, but "when did the news first
// mention this country?" has to outlive that. The ledger keeps one row per
// country and is never pruned. Whether a signal later became an official
// confirmation (and the resulting lead time) is worked out at read time in
// src/lib/signals.ts from the curated country table.

/**
 * @typedef {Object} Candidate
 * @property {string} id
 * @property {string} iso
 * @property {string} country
 * @property {string} flag
 * @property {number|null} casesMentioned
 * @property {number|null} deathsMentioned
 * @property {string} sourceTitle
 * @property {string} sourceUrl
 * @property {string} sourceName
 * @property {string} date          article date, ISO
 *
 * @typedef {Object} Signal
 * @property {string} iso
 * @property {string} country
 * @property {string} flag
 * @property {string} firstSeen     YYYY-MM-DD of the earliest article
 * @property {string} lastSeen      YYYY-MM-DD of the latest article
 * @property {string} firstSourceTitle
 * @property {string} firstSourceUrl
 * @property {string} firstSourceName
 * @property {number} mentions      distinct articles
 * @property {number|null} maxCasesMentioned
 * @property {number|null} maxDeathsMentioned
 * @property {string[]} seenIds     ids of counted articles (capped)
 *
 * @typedef {Object} Ledger
 * @property {string} lastUpdated
 * @property {Signal[]} signals
 */

const MAX_SEEN_IDS = 200;

/** @param {unknown} v @returns {string|null} */
function toDay(v) {
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

/** @param {number|null|undefined} a @param {number|null|undefined} b */
function maxOrNull(a, b) {
  const x = typeof a === "number" ? a : null;
  const y = typeof b === "number" ? b : null;
  return x === null ? y : y === null ? x : Math.max(x, y);
}

/**
 * Fold candidates into the ledger. Idempotent: an article already counted for a
 * country (by id) changes nothing. Never mutates its inputs.
 * @param {Ledger} ledger
 * @param {Candidate[]} candidates
 * @param {string} nowISO
 * @returns {Ledger}
 */
export function updateSignalLedger(ledger, candidates, nowISO) {
  /** @type {Map<string, Signal>} */
  const byIso = new Map((ledger?.signals ?? []).map((s) => [s.iso, { ...s, seenIds: [...(s.seenIds ?? [])] }]));

  for (const c of candidates ?? []) {
    const day = toDay(c.date);
    if (!c.iso || !c.id || !day) continue;
    const cur = byIso.get(c.iso);
    if (!cur) {
      byIso.set(c.iso, {
        iso: c.iso,
        country: c.country,
        flag: c.flag,
        firstSeen: day,
        lastSeen: day,
        firstSourceTitle: c.sourceTitle,
        firstSourceUrl: c.sourceUrl,
        firstSourceName: c.sourceName,
        mentions: 1,
        maxCasesMentioned: c.casesMentioned ?? null,
        maxDeathsMentioned: c.deathsMentioned ?? null,
        seenIds: [c.id],
      });
      continue;
    }
    if (cur.seenIds.includes(c.id)) continue;
    cur.mentions += 1;
    cur.seenIds = [...cur.seenIds, c.id].slice(-MAX_SEEN_IDS);
    cur.maxCasesMentioned = maxOrNull(cur.maxCasesMentioned, c.casesMentioned);
    cur.maxDeathsMentioned = maxOrNull(cur.maxDeathsMentioned, c.deathsMentioned);
    if (day > cur.lastSeen) cur.lastSeen = day;
    if (day < cur.firstSeen) {
      cur.firstSeen = day;
      cur.firstSourceTitle = c.sourceTitle;
      cur.firstSourceUrl = c.sourceUrl;
      cur.firstSourceName = c.sourceName;
    }
  }

  const signals = [...byIso.values()].sort((a, b) => a.firstSeen.localeCompare(b.firstSeen) || a.iso.localeCompare(b.iso));
  return { lastUpdated: nowISO, signals };
}
