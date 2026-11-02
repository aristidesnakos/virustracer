// Pure helpers for reading the national measles page of the US Centers for Disease
// Control and Prevention (CDC): https://www.cdc.gov/measles/data-research/index.html.
// No network, no fs: scripts/update-toll.mjs fetches the three documents below and these
// functions only read them. Unit-tested in tests/cdc.test.ts.
//
// What the page publishes, once a week (confirmed cases reported to CDC as of noon on
// Thursday; the page is updated the day after):
//  1. The page itself (HTML). Its first paragraph is a sentence with the total:
//     "As of October 29, 2026, 4,852 confirmed* measles cases were reported in the United
//     States in 2026. Among these, 4,834 measles cases were reported by 47 jurisdictions:
//     ... A total of 18 measles cases were reported among international visitors ...".
//     Its "Total Deaths" cell is typed into the HTML by hand ("3*", footnoted "subject to
//     change"); the other summary cells are filled in by script from the JSON below.
//  2. /wcms/vizdata/measles/measles_hosp.json: the summary table's data (total cases, ages,
//     vaccination, hospitalised) AND a `total_deaths` that the page does not display. On
//     29 Oct 2026 the page showed 3 and this file said 5. The page's figure is the one a
//     reader sees on cdc.gov, so it is the tracked one; a disagreement is noted, never hidden.
//  3. /wcms/vizdata/measles/MeaslesCasesMap.json: confirmed cases per jurisdiction.
//
// A reading is accepted only when the three agree with each other (see parseCdcReading),
// so a page caught half-way through its weekly update, or a changed layout, stores nothing.

/** CDC's own host, the only one a reading may be fetched from. */
export const CDC_HOSTS = ["www.cdc.gov"];

/** True for an https URL on a CDC host. */
export function isCdcUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && CDC_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

const MONTHS = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};

/** "October 29, 2026" -> "2026-10-29"; null when it is not a real date. */
export function isoFromLongDate(text) {
  const m = typeof text === "string" ? text.trim().match(/^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/) : null;
  if (!m || !(m[1] in MONTHS)) return null;
  const [month, day, year] = [MONTHS[m[1]], Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

const NAMED_ENTITIES = {
  nbsp: " ", emsp: " ", ensp: " ", thinsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘",
};

function decodeEntities(s) {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** The visible text of an HTML fragment on one line: no scripts, styles or tags. */
function textOf(html) {
  return decodeEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** "4,852" -> 4852; null for anything that is not a plain count. */
function count(text) {
  if (typeof text === "number") return Number.isSafeInteger(text) && text >= 0 ? text : null;
  if (typeof text !== "string") return null;
  const s = text.trim();
  if (!/^\d{1,3}(?:,\d{3})+$|^\d+$/.test(s)) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isSafeInteger(n) ? n : null;
}

/** A value the page's JSON stores either bare or as a one-element array. */
const first = (v) => (Array.isArray(v) ? v[0] : v);

const HEADLINE_START = /As of [A-Z][a-z]+ \d{1,2}, \d{4}, [\d,]+ confirmed\*{0,2} measles cases were reported in the United States in \d{4}\./;

/** Longest headline paragraph accepted: the real one (with 47 jurisdiction names) is about 900 characters. */
const MAX_HEADLINE_CHARS = 3000;

/**
 * Pick the facts the reading needs out of the page's HTML: the headline paragraph
 * (verbatim, from the "As of" sentence to the outbreaks sentence), the "Updated on" line
 * and the "Total Deaths" row with the table's column headings.
 * @param {string} html
 * @returns {{ok: true, page: {headline: string, updated: string|null, deaths: {header: string[], row: string[]}}} | {ok: false, reason: string}}
 */
export function extractPageExcerpt(html) {
  if (typeof html !== "string" || html.trim() === "") return { ok: false, reason: "empty page" };
  const flat = textOf(html);
  const start = flat.search(HEADLINE_START);
  if (start === -1) {
    return { ok: false, reason: "no 'As of <date>, N confirmed measles cases were reported in the United States' sentence" };
  }
  const rest = flat.slice(start);
  const end =
    rest.match(/outbreak-associated \([^)]*\)\./) ?? rest.match(/international visitors to the United States\./);
  if (!end) return { ok: false, reason: "the headline paragraph has no international-visitors or outbreaks sentence" };
  const headline = rest.slice(0, end.index + end[0].length);
  if (headline.length > MAX_HEADLINE_CHARS) return { ok: false, reason: "the headline paragraph is unexpectedly long" };

  const updated = flat.match(/Updated on ([A-Z][a-z]+ \d{1,2}, \d{4})\./)?.[1] ?? null;

  const deaths = readDeathsTable(html);
  if (!deaths) return { ok: false, reason: "no 'Total Deaths' row with year columns" };
  return { ok: true, page: { headline, updated, deaths } };
}

/** The year column headings and the "Total Deaths" row of the page's U.S. Deaths table. */
function readDeathsTable(html) {
  for (const table of html.match(/<table\b[\s\S]*?<\/table>/gi) ?? []) {
    if (!/Total Deaths/i.test(table)) continue;
    const rows = (table.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? []).map((r) =>
      (r.match(/<t[hd]\b[\s\S]*?<\/t[hd]>/gi) ?? []).map(textOf),
    );
    const header = rows.find((r) => r.some((c) => /^20\d{2}$/.test(c)));
    const row = rows.find((r) => /^Total Deaths$/i.test(r[0] ?? ""));
    if (header && row) return { header, row };
  }
  return null;
}

/**
 * Put the three documents together into the one JSON document that is both parsed and
 * archived (data/raw/report/...), so what was verified is exactly what is kept. Only the
 * parts the reading uses are kept: the page excerpt, the summary data for the year, and
 * the year's case count per jurisdiction.
 * @param {{page: object, hosp: any, map: any, year: number}} parts
 */
export function buildReading({ page, hosp, map, year }) {
  const cases = {};
  const rows = Array.isArray(map?.data) ? map.data : [];
  for (const r of rows) {
    if (String(r?.year) !== String(year) || typeof r.geography !== "string") continue;
    cases[r.geography] = String(r[`cases_${year}`] ?? "");
  }
  return {
    version: 1,
    year,
    page,
    hosp: { lastUpdated: hosp?.lastUpdated ?? null, data: hosp?.data?.[String(year)] ?? null },
    map: { lastUpdated: map?.lastUpdated ?? null, cases },
  };
}

/** The archived form of a reading: stable key order, one trailing newline. */
export function serializeReading(doc) {
  return JSON.stringify(doc, null, 2) + "\n";
}

/**
 * @typedef {Object} CdcReading
 * @property {string} asOf             YYYY-MM-DD the counts run to (the Thursday noon cut-off)
 * @property {string|null} updated     YYYY-MM-DD of the page's "Updated on" line
 * @property {number} year
 * @property {number} confirmed        Confirmed cases in the year, U.S. residents plus international visitors
 * @property {number} deaths           Deaths as the page displays them
 * @property {number|null} deathsDataFile  Deaths in measles_hosp.json, which the page does not display
 * @property {number} residents        Cases reported by jurisdictions
 * @property {number} jurisdictions    Jurisdictions with at least one case
 * @property {number} visitors         Cases among international visitors
 * @property {{count: number, of: number}|null} hospitalized
 * @property {number|null} newOutbreaks
 * @property {{count: number, of: number}|null} outbreakAssociated
 * @property {{name: string, cases: number}[]} states   Jurisdictions with cases, most first
 */

/**
 * Read a reading document (see buildReading). Returns ok:false with a reason when it is
 * incomplete or the sources disagree, `code: "other-year"` when the page has moved on to
 * another year, and `notes` for differences worth a human's attention that do not block it.
 * `nowISO`, when given, rejects an as-of date more than a day in the future.
 * @param {any} doc
 * @param {{nowISO?: string}} [opts]
 * @returns {{ok: true, reading: CdcReading, notes: string[]} | {ok: false, reason: string, code?: "other-year"}}
 */
export function parseCdcReading(doc, { nowISO } = {}) {
  const fail = (reason, code) => ({ ok: false, reason, ...(code ? { code } : {}) });
  const year = doc?.year;
  if (!Number.isInteger(year)) return fail("the reading has no year");
  const headline = doc?.page?.headline;
  if (typeof headline !== "string") return fail("the reading has no headline paragraph");
  const deathsTable = doc?.page?.deaths;
  const hosp = doc?.hosp?.data;
  const cases = doc?.map?.cases;
  if (!hosp || typeof hosp !== "object") return fail(`measles_hosp.json has no data for ${year}`);
  if (!cases || typeof cases !== "object" || Object.keys(cases).length === 0) {
    return fail(`MeaslesCasesMap.json has no jurisdictions for ${year}`);
  }

  const lead = headline.match(
    /^As of ([A-Z][a-z]+ \d{1,2}, \d{4}), ([\d,]+) confirmed\*{0,2} measles cases were reported in the United States in (\d{4})\./,
  );
  if (!lead) return fail("the headline does not start with the 'As of <date>, N confirmed measles cases' sentence");
  if (Number(lead[3]) !== year) return fail(`the page now reports ${lead[3]}, not ${year}`, "other-year");
  const asOf = isoFromLongDate(lead[1]);
  if (!asOf) return fail(`invalid date "${lead[1]}"`);
  if (nowISO && Date.parse(asOf) > Date.parse(nowISO.slice(0, 10)) + 86_400_000) {
    return fail(`the as-of date ${asOf} is in the future`);
  }
  const confirmed = count(lead[2]);
  if (confirmed === null) return fail(`unreadable case total "${lead[2]}"`);

  const among = headline.match(/Among these, ([\d,]+) measles cases were reported by (\d+) jurisdictions/);
  if (!among) return fail("no 'Among these, N measles cases were reported by K jurisdictions' sentence");
  const residents = count(among[1]);
  const jurisdictions = count(among[2]);
  if (residents === null || jurisdictions === null) return fail("unreadable jurisdiction totals");

  // Absent when there were no visitors' cases; the sum below still has to match the total.
  const visitorsM = headline.match(/A total of ([\d,]+) measles cases? (?:were|was) reported among international visitors/);
  const visitors = visitorsM ? count(visitorsM[1]) : 0;
  if (visitors === null) return fail("unreadable international-visitor count");
  if (residents + visitors !== confirmed) {
    return fail(`the total does not add up: ${residents} from jurisdictions + ${visitors} international visitors != ${confirmed}`);
  }

  const outbreaksM = headline.match(/There have been ([\d,]+) new outbreaks\*{0,2} reported in \d{4}/);
  const associatedM = headline.match(/\(([\d,]+) of ([\d,]+)\) are outbreak-associated/);
  const newOutbreaks = outbreaksM ? count(outbreaksM[1]) : null;
  const outbreakAssociated = associatedM ? { count: count(associatedM[1]) ?? 0, of: count(associatedM[2]) ?? 0 } : null;

  // measles_hosp.json: same total, same date.
  const hospTotal = count(first(hosp.total_cases));
  if (hospTotal === null) return fail("measles_hosp.json has no total_cases");
  if (hospTotal !== confirmed) return fail(`total differs: page ${confirmed}, measles_hosp.json ${hospTotal}`);
  const hospDate = isoFromLongDate(doc.hosp.lastUpdated);
  if (hospDate !== asOf) return fail(`measles_hosp.json is dated ${hospDate ?? "?"}, the page's counts run to ${asOf}`);
  const hospM = typeof first(hosp.hospitalized_sentence) === "string" ? first(hosp.hospitalized_sentence).match(/\(([\d,]+) of ([\d,]+) cases\)/) : null;
  const hospitalized = hospM ? { count: count(hospM[1]) ?? 0, of: count(hospM[2]) ?? 0 } : null;
  if (hospitalized && hospitalized.of !== confirmed) {
    return fail(`hospitalisations are out of ${hospitalized.of} cases, not ${confirmed}`);
  }
  const deathsDataFile = hosp.total_deaths === undefined ? null : count(first(hosp.total_deaths));

  // MeaslesCasesMap.json: the jurisdictions add up to the page's figure.
  const mapDate = isoFromLongDate(doc.map.lastUpdated);
  if (mapDate !== asOf) return fail(`MeaslesCasesMap.json is dated ${mapDate ?? "?"}, the page's counts run to ${asOf}`);
  const states = [];
  let mapSum = 0;
  for (const [name, raw] of Object.entries(cases)) {
    const n = count(raw);
    if (n === null) return fail(`unreadable case count for ${name}: "${raw}"`);
    mapSum += n;
    if (n > 0) states.push({ name, cases: n });
  }
  if (mapSum !== residents) return fail(`the jurisdictions add up to ${mapSum}, the page says ${residents}`);
  if (states.length !== jurisdictions) {
    return fail(`${states.length} jurisdictions have cases in MeaslesCasesMap.json, the page says ${jurisdictions}`);
  }
  states.sort((a, b) => b.cases - a.cases || a.name.localeCompare(b.name));

  // The displayed deaths: the "Total Deaths" cell under the year's column.
  const col = Array.isArray(deathsTable?.header) ? deathsTable.header.indexOf(String(year)) : -1;
  const cell = col === -1 ? undefined : deathsTable.row?.[col];
  const deathsM = typeof cell === "string" ? cell.match(/^(\d[\d,]*)\*?$/) : null;
  const deaths = deathsM ? count(deathsM[1]) : null;
  if (deaths === null) return fail(`the page's Total Deaths cell for ${year} is ${JSON.stringify(cell ?? null)}, not a count`);
  if (deaths > confirmed) return fail(`deaths (${deaths}) exceed confirmed cases (${confirmed})`);

  const notes = [];
  if (deathsDataFile !== null && deathsDataFile !== deaths) {
    notes.push(
      `The page displays ${deaths} deaths for ${year}, but measles_hosp.json (the data file behind it) lists ${deathsDataFile}. The page's figure is tracked.`,
    );
  }
  const updated = isoFromLongDate(doc.page.updated ?? "");
  return {
    ok: true,
    reading: {
      asOf, updated, year, confirmed, deaths, deathsDataFile, residents, jurisdictions, visitors,
      hospitalized, newOutbreaks, outbreakAssociated, states,
    },
    notes,
  };
}

/**
 * The toll snapshot a reading gives: dated by the day its counts run to. CDC publishes
 * confirmed cases only (probable cases are reported by states, not counted nationally)
 * and no recoveries.
 * @param {CdcReading} reading
 * @param {{source: string, pageUrl: string}} toll
 */
export function snapshotFromReading(reading, toll) {
  return {
    date: reading.asOf,
    confirmed: reading.confirmed,
    suspected: null,
    deaths: reading.deaths,
    recovered: null,
    source: toll.source,
    sourceUrl: toll.pageUrl,
  };
}
