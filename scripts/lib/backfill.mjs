// Pure helpers for importing historical toll snapshots from a Wikipedia
// page's revision history (no network, no fs). Used by scripts/backfill-toll.mjs
// and unit-tested in tests/backfill.test.ts.

/**
 * @typedef {Object} Revision
 * @property {number} revid
 * @property {string} timestamp  ISO 8601, UTC
 */

/**
 * Keep only the last revision of each UTC day: the page's end-of-day state.
 * Input order does not matter; output is ascending by time.
 * @param {Revision[]} revisions
 * @returns {(Revision & {date: string})[]}
 */
export function lastRevisionPerDay(revisions) {
  /** @type {Map<string, Revision>} */
  const byDay = new Map();
  for (const rev of revisions) {
    const t = Date.parse(rev.timestamp);
    if (Number.isNaN(t)) continue;
    const day = new Date(t).toISOString().slice(0, 10);
    const cur = byDay.get(day);
    if (!cur || Date.parse(cur.timestamp) < t) byDay.set(day, rev);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rev]) => ({ ...rev, date }));
}

/** Cumulative fields that can only grow. `suspected` is excluded: it is routinely reclassified. */
const MONOTONE_FIELDS = /** @type {const} */ (["confirmed", "deaths", "recovered"]);

/**
 * Can `b` follow `a` in a cumulative series? Every field both report must not decrease.
 * @param {Record<string, any>} a
 * @param {Record<string, any>} b
 */
function follows(a, b) {
  for (const k of MONOTONE_FIELDS) {
    if (a[k] != null && b[k] != null && b[k] < a[k]) return false;
  }
  return true;
}

/**
 * Wikipedia history contains vandalism, typos and mid-edit states, and the
 * last revision of a day can be one of them. Cumulative counts never fall, so
 * keep the longest chain of snapshots that never decreases. An isolated spike
 * (up or down) costs the chain more points than dropping it, so it is
 * removed; a one-off low reading on the final day cannot wipe out the history
 * the way a simple "must be below every later value" filter would.
 *
 * @template {{date: string}} S
 * @param {S[]} snapshots ascending by date
 * @returns {{kept: S[], dropped: S[]}}
 */
export function keepLongestMonotoneChain(snapshots) {
  const n = snapshots.length;
  if (n === 0) return { kept: [], dropped: [] };
  const len = new Array(n).fill(1);
  const prev = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      // Strictly longer wins; on a tie prefer the closer predecessor so that
      // runs of identical readings stay together.
      if (follows(snapshots[j], snapshots[i]) && len[j] + 1 >= len[i]) {
        len[i] = len[j] + 1;
        prev[i] = j;
      }
    }
  }
  let end = 0;
  for (let i = 1; i < n; i++) if (len[i] >= len[end]) end = i;
  const keep = new Set();
  for (let i = end; i !== -1; i = prev[i]) keep.add(i);
  return {
    kept: snapshots.filter((_, i) => keep.has(i)),
    dropped: snapshots.filter((_, i) => !keep.has(i)),
  };
}

/**
 * Merge stored snapshots with imported daily readings. Pass 1: stored snapshots plus imported
 * readings for dates with nothing stored go through the longest never-decreasing chain; a stored
 * snapshot is never displaced by a same-day reading that merely ties with it. A stored snapshot
 * the chain drops is returned in `supersededExisting`, so the caller keeps it (with a reason)
 * rather than lose it: that is how a figure the source later withdrew leaves the series. Pass 2:
 * the imported reading of each such date is offered in its place and kept if it fits.
 * @template {{date: string, confirmed: number, deaths: number|null, recovered?: number|null}} S
 * @param {S[]} existing
 * @param {S[]} imported
 * @returns {{kept: S[], supersededExisting: S[], droppedImported: S[]}}
 */
export function mergeBackfill(existing, imported) {
  const byDate = (a, b) => a.date.localeCompare(b.date);
  const storedDates = new Set(existing.map((s) => s.date));
  const pass1 = keepLongestMonotoneChain([...existing, ...imported.filter((s) => !storedDates.has(s.date))].sort(byDate));
  const keptSet = new Set(pass1.kept);
  const supersededExisting = existing.filter((s) => !keptSet.has(s));
  const freedDates = new Set(supersededExisting.map((s) => s.date));
  const offered = imported.filter((s) => freedDates.has(s.date));
  const pass2 = keepLongestMonotoneChain([...pass1.kept, ...offered].sort(byDate));
  // Pass 2 must not trade away anything pass 1 kept: accept it only if it is a superset.
  const kept = pass1.kept.every((s) => pass2.kept.includes(s)) ? pass2.kept : pass1.kept;
  const keptAll = new Set(kept);
  return {
    kept,
    supersededExisting,
    droppedImported: imported.filter((s) => !keptAll.has(s) && !(storedDates.has(s.date) && !freedDates.has(s.date))),
  };
}
