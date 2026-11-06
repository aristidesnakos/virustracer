// Pure helpers for reading CDC's weekly notifiable-disease table (NNDSS Weekly Data,
// Socrata dataset x9gk-5huc on data.cdc.gov). No network, no fs: scripts/update-toll.mjs
// fetches the rows and these functions only read them. Unit-tested in tests/nndss.test.ts.
//
// What the table holds (checked against the dataset's own column descriptions and CDC's
// "Reader's Guide" to the NNDSS weekly tables, 2026-11-06):
//  - one row per reporting area, condition (`label`), MMWR year and MMWR week;
//  - m1 = cases in the current week, m2 = maximum in any of the previous 52 weeks,
//    m3 = cumulative year-to-date for the current MMWR year, m4 = cumulative year-to-date
//    for the previous MMWR year at the same week;
//  - each measure is either a number ("91.0") or a flag in `<m>_flag`, never both:
//    "-" no reported cases, "U" unavailable, "N" not reportable, "NN" not nationally
//    notifiable, "NP" notifiable but not published, "NC" not calculated (m2 only);
//  - reporting areas: 50 states, DC, New York City and five territories, plus aggregate
//    rows: nine census regions, "U.S. Residents" (the 50 states, DC and NYC, excluding
//    territories), "U.S. Territories", "Non-U.S. Residents" and "Total".
// Counts are provisional and "presented as published each week": the cumulative count
// for an earlier week is not recomputed later, and CDC says cumulative counts "can
// increase or decrease" as states reconcile their data (2026 week 17 fell below week 16).
//
// Which sums hold (every 2026 week, both C. auris labels, checked 2026-11-06), for m1,
// m3 and m4, with a flag counted as 0: the states of each region add up to the region;
// the nine regions add up to "U.S. Residents"; "U.S. Residents" + "U.S. Territories" +
// "Non-U.S. Residents" = "Total"; the territories add up to "U.S. Territories". m2 is a
// maximum, so it does not add up and is not checked. The weekly m1 values do NOT add up
// to m3 (late reports land in the cumulative total only), so that is not checked either.
// A reading is accepted only when every one of these holds.

/** The only host a reading may be fetched from. */
export const NNDSS_HOSTS = ["data.cdc.gov"];

/** True for an https URL on data.cdc.gov. */
export function isNndssUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && NNDSS_HOSTS.includes(u.hostname) && u.username === "" && u.password === "";
  } catch {
    return false;
  }
}

/** Socrata id of "NNDSS Weekly Data". */
export const NNDSS_DATASET = "x9gk-5huc";

/** The census regions and the reporting areas in each, as the table lists them. */
export const REGIONS = {
  "New England": ["Connecticut", "Maine", "Massachusetts", "New Hampshire", "Rhode Island", "Vermont"],
  "Middle Atlantic": ["New Jersey", "New York", "New York City", "Pennsylvania"],
  "East North Central": ["Illinois", "Indiana", "Michigan", "Ohio", "Wisconsin"],
  "West North Central": ["Iowa", "Kansas", "Minnesota", "Missouri", "Nebraska", "North Dakota", "South Dakota"],
  "South Atlantic": [
    "Delaware", "District of Columbia", "Florida", "Georgia", "Maryland", "North Carolina", "South Carolina",
    "Virginia", "West Virginia",
  ],
  "East South Central": ["Alabama", "Kentucky", "Mississippi", "Tennessee"],
  "West South Central": ["Arkansas", "Louisiana", "Oklahoma", "Texas"],
  Mountain: ["Arizona", "Colorado", "Idaho", "Montana", "Nevada", "New Mexico", "Utah", "Wyoming"],
  Pacific: ["Alaska", "California", "Hawaii", "Oregon", "Washington"],
};
export const TERRITORIES = [
  "American Samoa", "Commonwealth of Northern Mariana Islands", "Guam", "Puerto Rico", "U.S. Virgin Islands",
];
const AGGREGATES = ["U.S. Residents", ...Object.keys(REGIONS), "U.S. Territories", "Non-U.S. Residents", "Total"];
/** Every reporting area a complete week has, once per label. */
export const ALL_AREAS = [...AGGREGATES, ...Object.values(REGIONS).flat(), ...TERRITORIES];

const MEASURES = ["m1", "m2", "m3", "m4"];
/** Measures that are counts and so must add up. */
const SUMMED = ["m1", "m3", "m4"];
const FLAGS = new Set(["-", "U", "N", "NN", "NP", "NC"]);
/** Fields kept in the archived rows; the rest (Socrata's computed region columns) are dropped. */
const KEPT = [
  "states", "year", "week", "label", "m1", "m1_flag", "m2", "m2_flag", "m3", "m3_flag", "m4", "m4_flag",
  "location1", "location2", "sort_order", "geocode",
];

/**
 * The query that returns every row for `labels` from `year` on (later years too, so a
 * reader can see the table has moved on). Ordered so the result is stable.
 * @param {{year: number, labels: readonly string[], limit: number}} q
 */
export function nndssQueryUrl({ year, labels, limit }) {
  const quoted = labels.map((l) => `'${String(l).replace(/'/g, "''")}'`).join(", ");
  const params = new URLSearchParams({
    $where: `label in (${quoted}) AND year >= '${Number(year)}'`,
    $order: "year, week, label, sort_order",
    $limit: String(limit),
  });
  return `https://${NNDSS_HOSTS[0]}/resource/${NNDSS_DATASET}.json?${params}`;
}

/** A link to one week's rows for `labels`, the snapshot's `sourceUrl`. */
export function nndssWeekUrl({ year, week, labels }) {
  const quoted = labels.map((l) => `'${String(l).replace(/'/g, "''")}'`).join(", ");
  const params = new URLSearchParams({
    $where: `label in (${quoted}) AND year = '${Number(year)}' AND week = '${Number(week)}'`,
    $order: "label, sort_order",
  });
  return `https://${NNDSS_HOSTS[0]}/resource/${NNDSS_DATASET}.json?${params}`;
}

const DAY = 86_400_000;

/**
 * Saturday that ends MMWR week 1 of `year`: MMWR weeks run Sunday to Saturday, and week 1
 * is the first week with at least four days in the calendar year, so it ends on the first
 * Saturday on or after 4 January. (Checked against CDC's own weekly datasets: 2026 week 1
 * ran 4-10 January, 2025 had 53 weeks.)
 */
function week1End(year) {
  const jan4 = Date.UTC(year, 0, 4);
  const dow = new Date(jan4).getUTCDay(); // 0 = Sunday
  return jan4 + ((6 - dow + 7) % 7) * DAY;
}

/** 52 or 53. */
export function mmwrWeeksInYear(year) {
  return Math.round((week1End(year + 1) - week1End(year)) / (7 * DAY));
}

/** YYYY-MM-DD of the Saturday ending MMWR `week` of `year`; null for a week that does not exist. */
export function mmwrWeekEnding(year, week) {
  if (!Number.isInteger(year) || !Number.isInteger(week) || year < 1900 || year > 9999) return null;
  if (week < 1 || week > mmwrWeeksInYear(year)) return null;
  return new Date(week1End(year) + (week - 1) * 7 * DAY).toISOString().slice(0, 10);
}

/** "91.0" -> 91; null for anything that is not a whole non-negative count. */
function count(v) {
  if (typeof v !== "string" || !/^\d+(?:\.0+)?$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : null;
}

/** One row cut to the kept fields, so the archive holds only what was read. */
function keep(row) {
  const out = {};
  for (const k of KEPT) if (row?.[k] !== undefined) out[k] = row[k];
  return out;
}

/**
 * Split the fetched rows into weeks of `year` (oldest first), and list the later years the
 * table already has. Rows of another label or an earlier year are ignored.
 * @param {any[]} rows
 * @param {{year: number, labels: readonly string[]}} opts
 * @returns {{weeks: {year: number, week: number, rows: object[]}[], laterYears: number[]}}
 */
export function groupWeeks(rows, { year, labels }) {
  const byWeek = new Map();
  const later = new Set();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!labels.includes(r?.label)) continue;
    const y = Number(r.year);
    const w = Number(r.week);
    if (!Number.isInteger(y) || !Number.isInteger(w)) continue;
    if (y > year) later.add(y);
    if (y !== year) continue;
    if (!byWeek.has(w)) byWeek.set(w, []);
    byWeek.get(w).push(keep(r));
  }
  const weeks = [...byWeek.entries()].sort((a, b) => a[0] - b[0]).map(([week, rs]) => ({ year, week, rows: rs }));
  return { weeks, laterYears: [...later].sort((a, b) => a - b) };
}

/**
 * The one document that is both parsed and archived (data/raw/report/...), so what was
 * verified is exactly what is kept: one week's rows for the two labels.
 * @param {{year: number, week: number, rows: object[], labels: {clinical: string, screening: string}}} parts
 */
export function buildNndssReading({ year, week, rows, labels }) {
  const sorted = rows
    .map(keep)
    .sort((a, b) => String(a.label).localeCompare(String(b.label)) || String(a.sort_order).localeCompare(String(b.sort_order)));
  return { version: 1, dataset: NNDSS_DATASET, year, week, labels: { ...labels }, rows: sorted };
}

/** The archived form of a reading: one row per line, so a diff between weeks stays readable. */
export function serializeNndssReading(doc) {
  const { rows, ...head } = doc;
  const top = JSON.stringify(head, null, 2).replace(/\n}$/, "");
  return `${top},\n  "rows": [\n${rows.map((r) => `    ${JSON.stringify(r)}`).join(",\n")}\n  ]\n}\n`;
}

/**
 * @typedef {Object} NndssArea
 * @property {string} name
 * @property {number} cumulative        m3 (flags count as 0)
 * @property {number} week              m1 (flags count as 0)
 * @property {string|null} flag          m3's flag, e.g. "N" (not reportable), "U" (unavailable)
 * @property {[number, number]|null} coords  [lng, lat] from the row's geocode, when it has one
 *
 * @typedef {Object} NndssLabelReading
 * @property {number} cumulative        U.S. Residents, cumulative year to date (m3)
 * @property {number} week              U.S. Residents, cases in the week (m1)
 * @property {number|null} previousYearCumulative  U.S. Residents, the year before to the same week (m4)
 * @property {number} total             "Total" row, m3 (U.S. Residents + territories + non-U.S. residents)
 * @property {NndssArea[]} areas        the 50 states, DC and NYC, most cases first
 *
 * @typedef {Object} NndssReading
 * @property {number} year
 * @property {number} week
 * @property {string} weekEnding        YYYY-MM-DD, the Saturday ending the MMWR week
 * @property {NndssLabelReading} clinical
 * @property {NndssLabelReading} screening
 */

/**
 * Read one week's document (see buildNndssReading). ok:false with a reason when a row is
 * missing, malformed, from another week, or when any of the sums listed at the top of this
 * file fails. `nowISO`, when given, rejects a week that ends more than a day in the future.
 * @param {any} doc
 * @param {{nowISO?: string}} [opts]
 * @returns {{ok: true, reading: NndssReading} | {ok: false, reason: string}}
 */
export function parseNndssReading(doc, { nowISO } = {}) {
  const fail = (reason) => ({ ok: false, reason });
  const { year, week } = doc ?? {};
  const weekEnding = mmwrWeekEnding(year, week);
  if (!weekEnding) return fail(`MMWR week ${week} of ${year} does not exist`);
  if (nowISO && Date.parse(weekEnding) > Date.parse(nowISO.slice(0, 10)) + DAY) {
    return fail(`week ${week} of ${year} ends ${weekEnding}, in the future`);
  }
  const labels = doc?.labels;
  if (typeof labels?.clinical !== "string" || typeof labels?.screening !== "string" || labels.clinical === labels.screening) {
    return fail("the reading does not name its clinical and screening labels");
  }
  if (!Array.isArray(doc.rows)) return fail("the reading has no rows");

  /** @type {Record<string, Map<string, any>>} */
  const byLabel = { [labels.clinical]: new Map(), [labels.screening]: new Map() };
  for (const r of doc.rows) {
    const where = `${r?.states ?? "?"} (${r?.label ?? "?"})`;
    if (!(r?.label in byLabel)) return fail(`unexpected label "${r?.label}"`);
    if (String(r.year) !== String(year) || String(r.week) !== String(week)) {
      return fail(`${where} is for week ${r.week} of ${r.year}, not week ${week} of ${year}`);
    }
    if (!ALL_AREAS.includes(r.states)) return fail(`unknown reporting area "${r.states}"`);
    if (byLabel[r.label].has(r.states)) return fail(`${where} appears twice`);
    const values = {};
    for (const m of MEASURES) {
      const hasValue = r[m] !== undefined;
      const flag = r[`${m}_flag`];
      if (hasValue && flag !== undefined) return fail(`${where} has both a value and a flag for ${m}`);
      if (hasValue) {
        const n = count(r[m]);
        if (n === null) return fail(`${where} has an unreadable ${m}: ${JSON.stringify(r[m])}`);
        values[m] = n;
      } else if (flag !== undefined) {
        if (!FLAGS.has(flag)) return fail(`${where} has an unknown ${m} flag ${JSON.stringify(flag)}`);
        values[m] = 0;
        values[`${m}Flag`] = flag;
      } else {
        return fail(`${where} has neither a value nor a flag for ${m}`);
      }
    }
    byLabel[r.label].set(r.states, { ...values, row: r });
  }

  const readLabel = (label) => {
    const rows = byLabel[label];
    const missing = ALL_AREAS.filter((a) => !rows.has(a));
    if (missing.length) return fail(`${label}: ${missing.length} reporting area(s) missing, e.g. ${missing.slice(0, 3).join(", ")}`);
    const v = (area, m) => rows.get(area)[m];
    for (const m of SUMMED) {
      const check = (parts, whole) => {
        const sum = parts.reduce((s, a) => s + v(a, m), 0);
        return sum === v(whole, m) ? null : `${label}, ${m}: ${parts.length > 3 ? `the areas of ${whole}` : parts.join(" + ")} add up to ${sum}, "${whole}" says ${v(whole, m)}`;
      };
      const problems = [
        ...Object.entries(REGIONS).map(([region, states]) => check(states, region)),
        check(TERRITORIES, "U.S. Territories"),
        check(Object.keys(REGIONS), "U.S. Residents"),
        check(["U.S. Residents", "U.S. Territories", "Non-U.S. Residents"], "Total"),
      ].filter(Boolean);
      if (problems.length) return fail(problems[0]);
    }
    const us = rows.get("U.S. Residents");
    if (us.m3Flag !== undefined || us.m1Flag !== undefined) return fail(`${label}: U.S. Residents has no count (flag ${us.m3Flag ?? us.m1Flag})`);
    const areas = Object.values(REGIONS)
      .flat()
      .map((name) => {
        const a = rows.get(name);
        const c = a.row.geocode?.coordinates;
        const coords = Array.isArray(c) && c.length === 2 && c.every((x) => typeof x === "number" && Number.isFinite(x)) ? [c[0], c[1]] : null;
        return { name, cumulative: a.m3, week: a.m1, flag: a.m3Flag ?? null, coords };
      })
      .sort((a, b) => b.cumulative - a.cumulative || a.name.localeCompare(b.name));
    return {
      ok: true,
      value: {
        cumulative: us.m3,
        week: us.m1,
        previousYearCumulative: us.m4Flag === undefined ? us.m4 : null,
        total: v("Total", "m3"),
        areas,
      },
    };
  };

  const clinical = readLabel(labels.clinical);
  if (!clinical.ok) return clinical;
  const screening = readLabel(labels.screening);
  if (!screening.ok) return screening;
  return { ok: true, reading: { year, week, weekEnding, clinical: clinical.value, screening: screening.value } };
}

/**
 * The toll snapshot a reading gives, dated by the Saturday ending its MMWR week.
 * `confirmed` is the year's cumulative clinical cases among U.S. residents. Screening
 * cases (colonisation found by screening, not illness) are carried in their own field and
 * never added to clinical or put in `suspected`. NNDSS collects no deaths or recoveries.
 * @param {NndssReading} reading
 * @param {{source: string, labels: {clinical: string, screening: string}}} toll
 */
export function snapshotFromNndssReading(reading, toll) {
  return {
    date: reading.weekEnding,
    confirmed: reading.clinical.cumulative,
    suspected: null,
    deaths: null,
    recovered: null,
    screening: reading.screening.cumulative,
    mmwrYear: reading.year,
    mmwrWeek: reading.week,
    source: toll.source,
    sourceUrl: nndssWeekUrl({ year: reading.year, week: reading.week, labels: [toll.labels.clinical, toll.labels.screening] }),
  };
}
