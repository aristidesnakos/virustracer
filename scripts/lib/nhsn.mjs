// Pure helpers for CDC NHSN's weekly respiratory data for nursing-home residents
// (COVID-19, influenza, RSV). No network, no fs: scripts/update-nursing-homes.mjs fetches
// and these functions only read what it fetched. Unit-tested in tests/nhsn.test.ts.
//
// Two official CDC sources, checked on 2026-11-06:
//  1. Socrata dataset tscn-ryh9 on data.cdc.gov, "Weekly Respiratory Pathogens and
//     Vaccination (RPV) Metrics for Nursing Home Residents by Jurisdiction": COUNTS per
//     state/territory, HHS region and the nation, per surveillance week (Monday-Sunday,
//     dated by the Sunday). Its newest week was 2026-03-29 (rows last updated 2026-08-24),
//     so it lags months behind.
//  2. The data file behind CDC's Nursing Home Data Dashboard
//     (https://www.cdc.gov/nhsn/ltc/ltc-report-overview.html, "updated weekly on Thursdays"):
//     /nhsn/modules/case-rates-covid-flu-rsv.json. RATES only (weekly cases and
//     hospitalisations per 100,000 residents) per state and the nation, newest week
//     2026-11-01. No counts, no resident or facility numbers. Its rates are close to but NOT
//     equal to rates computed from the dataset's counts (the dashboard is computed from a
//     later or differently filtered extract), so the two are never cross-checked against
//     each other; each is checked on its own.
//
// Definitions (from the dataset's column descriptions and its description text):
//  - numres: residents in the reporting nursing homes for at least one day of the week. It
//    is the denominator of the dataset's own percentages (pct_* = numerator / numres), and
//    the cases and hospitalisations are counted among those same residents, so it is the
//    right denominator for a weekly rate per 100,000 residents.
//  - num*postest: residents with a positive test during the week (new weekly cases).
//  - num*hosppos: residents hospitalised during the week with a positive test in the last 10 days.
//  - faccount: nursing homes that submitted complete data that week (COVID-19 only until
//    2025-01-05; COVID-19, influenza and RSV from 2025-01-12).
//  - Influenza and RSV became mandatory on 2025-01-01 but the dataset leaves them out up to
//    the week ending 2025-01-05; from 2025-01-12 all three are in. ALL_PATHOGENS_FROM marks
//    that break: series that compare the three start there.

export const NHSN_DATASET_ID = "tscn-ryh9";
export const NHSN_DATASET_TITLE =
  "Weekly Respiratory Pathogens and Vaccination (RPV) Metrics for Nursing Home Residents by Jurisdiction";
export const NHSN_DATASET_PAGE = "https://data.cdc.gov/d/tscn-ryh9";
export const NHSN_METADATA_URL = "https://data.cdc.gov/api/views/tscn-ryh9.json";
/** About 5,000 rows (64 jurisdictions a week since October 2024); the limit leaves decades of room. */
export const NHSN_ROWS_URL =
  "https://data.cdc.gov/resource/tscn-ryh9.json?$limit=50000&$order=survweekend,jurisdiction";
export const DASHBOARD_PAGE = "https://www.cdc.gov/nhsn/ltc/ltc-report-overview.html";
/** The case-rate chart's file. The hospitalisation chart's file (hospitalization-rates-flu-rsv-covid.json) held identical data on 2026-11-06, so one is read. */
export const DASHBOARD_DATA_URL = "https://www.cdc.gov/nhsn/modules/case-rates-covid-flu-rsv.json";

/** The only hosts these readers fetch from. */
export const NHSN_HOSTS = ["data.cdc.gov", "www.cdc.gov"];

/** True for an https URL on one of NHSN_HOSTS. */
export function isNhsnUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && NHSN_HOSTS.includes(u.hostname) && u.port === "";
  } catch {
    return false;
  }
}

/** First surveillance week with all three pathogens under one reporting rule. */
export const ALL_PATHOGENS_FROM = "2025-01-12";

export const PATHOGENS = /** @type {const} */ (["covid", "flu", "rsv"]);
export const PATHOGEN_LABEL = { covid: "COVID-19", flu: "Influenza", rsv: "RSV" };

/** Stored count fields, in order, with the dataset column each comes from. */
export const COUNT_COLUMNS = /** @type {const} */ ([
  ["facilities", "faccount"],
  ["residents", "numres"],
  ["covidCases", "numresc19postest"],
  ["covidHosp", "numresc19hosppos"],
  ["fluCases", "numresflupostest"],
  ["fluHosp", "numresfluhosppos"],
  ["rsvCases", "numresrsvpostest"],
  ["rsvHosp", "numresrsvhosppos"],
  ["covidUpToDate", "totresuptodate"],
  ["fluVaccinated", "numresfluvacc"],
  ["rsvVaccinated", "numresrsvvacc"],
]);
export const COUNT_FIELDS = ["week", "jurisdiction", ...COUNT_COLUMNS.map(([f]) => f)];

/** Every count column the cross-checks add up (all integer columns of the dataset). */
const SUMMED_COLUMNS = [
  "faccount", "numres", "totresuptodate",
  "numresc19postest", "numresc19posutd", "numresc19hosppos", "numresc19hosputd",
  "numresfluvacc", "numresflupostest", "numresfluposvacc", "numresfluhosppos", "numresfluhospvacc",
  "numresrsvvacc", "numresrsvpostest", "numresrsvposvacc", "numresrsvhosppos", "numresrsvhospvacc",
];
const FLU_RSV_COLUMNS = SUMMED_COLUMNS.filter((c) => /flu|rsv/.test(c));
/** [part, whole]: a part can never exceed its whole. */
const PART_OF = [
  ["numresc19posutd", "numresc19postest"],
  ["numresc19hosputd", "numresc19hosppos"],
  ["numresfluposvacc", "numresflupostest"],
  ["numresfluhospvacc", "numresfluhosppos"],
  ["numresrsvposvacc", "numresrsvpostest"],
  ["numresrsvhospvacc", "numresrsvhosppos"],
  ["totresuptodate", "numres"],
  ["numresfluvacc", "numres"],
  ["numresrsvvacc", "numres"],
  ["numresc19postest", "numres"],
  ["numresflupostest", "numres"],
  ["numresrsvpostest", "numres"],
];
const PCT_OF = [
  ["pct_totresuptodate", "totresuptodate"],
  ["pct_numresfluvacc", "numresfluvacc"],
  ["pct_numresrsvvacc", "numresrsvvacc"],
];

export const NATIONAL = "USA";
const REGION = /^Region (?:[1-9]|10)$/;
const STATE = /^[A-Z]{2}$/;

/** A real calendar day as YYYY-MM-DD, or null. */
export function isoDay(text) {
  if (typeof text !== "string") return null;
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z?)?$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === `${m[1]}-${m[2]}-${m[3]}` ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

const isSunday = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay() === 0;
const futureOf = (iso, nowISO) => nowISO && Date.parse(iso) > Date.parse(nowISO.slice(0, 10)) + 86_400_000;

/** "1,234" or "1234" or 1234 -> 1234; null for anything else. */
function int(value) {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? value : null;
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return null;
  const n = Number(value.trim());
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Parse the dataset's metadata (`/api/views/<id>.json`): when its rows last changed.
 * @returns {{ok: true, rowsUpdatedAt: string, name: string} | {ok: false, reason: string}}
 */
export function parseNhsnMetadata(json) {
  if (!json || typeof json !== "object") return { ok: false, reason: "metadata is not a JSON object" };
  if (json.id !== NHSN_DATASET_ID) return { ok: false, reason: `metadata is for ${JSON.stringify(json.id)}, not ${NHSN_DATASET_ID}` };
  const t = json.rowsUpdatedAt;
  if (!Number.isSafeInteger(t) || t <= 0) return { ok: false, reason: "metadata has no rowsUpdatedAt" };
  const names = new Set((json.columns ?? []).map((c) => c?.fieldName));
  const missing = ["jurisdiction", "survweekend", ...SUMMED_COLUMNS].filter((c) => !names.has(c));
  if (missing.length) return { ok: false, reason: `metadata lacks column(s) ${missing.join(", ")}; the dataset's layout changed` };
  return { ok: true, rowsUpdatedAt: new Date(t * 1000).toISOString(), name: String(json.name ?? "") };
}

/**
 * Read and cross-check the dataset's rows (as returned by the SODA endpoint).
 *
 * Checks that must all hold, or nothing is stored (each held for all 78 weeks on 2026-11-06):
 *  - each week is a Sunday, not in the future, with one row per jurisdiction;
 *  - every count is a non-negative integer, and a part never exceeds its whole
 *    (vaccinated positives <= positives, positives <= residents, ...);
 *  - the percentages equal numerator / residents to 0.1 point;
 *  - for every week and every count column, the states and territories add up exactly to
 *    the national (USA) row, and so do the ten HHS regions;
 *  - influenza and RSV are present for the nation in every week from ALL_PATHOGENS_FROM.
 *
 * @param {any[]} rows
 * @param {{nowISO?: string}} [opts]
 * @returns {{ok: true, weeks: string[], rows: (string|number|null)[][], firstWeek: string, latestWeek: string, notes: string[]} | {ok: false, reason: string}}
 */
export function parseNhsnRows(rows, { nowISO } = {}) {
  const fail = (reason) => ({ ok: false, reason });
  if (!Array.isArray(rows) || rows.length === 0) return fail("no rows");

  /** @type {Map<string, Map<string, Record<string, number|undefined>>>} */
  const byWeek = new Map();
  for (const r of rows) {
    const week = isoDay(r?.survweekend);
    const j = r?.jurisdiction;
    if (!week) return fail(`unreadable week ${JSON.stringify(r?.survweekend)}`);
    if (!isSunday(week)) return fail(`week ${week} does not end on a Sunday`);
    if (futureOf(week, nowISO)) return fail(`week ${week} is in the future`);
    if (typeof j !== "string" || !(j === NATIONAL || REGION.test(j) || STATE.test(j))) {
      return fail(`unexpected jurisdiction ${JSON.stringify(j)}`);
    }
    const values = {};
    for (const c of SUMMED_COLUMNS) {
      if (r[c] === undefined || r[c] === null || r[c] === "") continue; // missing, never zero
      const n = int(r[c]);
      if (n === null) return fail(`${j} ${week}: ${c} is ${JSON.stringify(r[c])}, not a count`);
      values[c] = n;
    }
    if (values.numres === undefined || values.faccount === undefined) return fail(`${j} ${week}: no residents or facilities`);
    for (const [part, whole] of PART_OF) {
      if (values[part] !== undefined && values[whole] !== undefined && values[part] > values[whole]) {
        return fail(`${j} ${week}: ${part} (${values[part]}) exceeds ${whole} (${values[whole]})`);
      }
    }
    for (const [pct, num] of PCT_OF) {
      if (values[num] === undefined || r[pct] === undefined || values.numres === 0) continue;
      const expected = Math.round((values[num] / values.numres) * 1000) / 10;
      if (Math.abs(expected - Number(r[pct])) > 0.11) {
        return fail(`${j} ${week}: ${pct} is ${r[pct]}, but ${num}/numres is ${expected}`);
      }
    }
    if (!byWeek.has(week)) byWeek.set(week, new Map());
    const wk = byWeek.get(week);
    if (wk.has(j)) return fail(`${j} ${week} appears twice`);
    wk.set(j, values);
  }

  const weeks = [...byWeek.keys()].sort();
  for (const week of weeks) {
    const wk = byWeek.get(week);
    const usa = wk.get(NATIONAL);
    if (!usa) return fail(`week ${week} has no national (USA) row`);
    if (week >= ALL_PATHOGENS_FROM && usa.numresflupostest === undefined) {
      return fail(`week ${week} has no influenza figures, though they are required from ${ALL_PATHOGENS_FROM}`);
    }
    const states = [...wk].filter(([k]) => STATE.test(k)).map(([, v]) => v);
    const regions = [...wk].filter(([k]) => REGION.test(k)).map(([, v]) => v);
    if (regions.length !== 10) return fail(`week ${week} has ${regions.length} HHS regions, not 10`);
    for (const c of SUMMED_COLUMNS) {
      if (usa[c] === undefined) {
        if (states.some((v) => v[c] !== undefined)) return fail(`week ${week}: states report ${c} but the nation does not`);
        continue;
      }
      const s = states.reduce((a, v) => a + (v[c] ?? 0), 0);
      const g = regions.reduce((a, v) => a + (v[c] ?? 0), 0);
      if (s !== usa[c]) return fail(`week ${week}: states add up to ${s} ${c}, the national row says ${usa[c]}`);
      if (g !== usa[c]) return fail(`week ${week}: HHS regions add up to ${g} ${c}, the national row says ${usa[c]}`);
    }
    if (week < ALL_PATHOGENS_FROM) {
      // Before the break flu/RSV are left out; if one week has them, keep them, but never mix.
      for (const v of states) for (const c of FLU_RSV_COLUMNS) if (usa[c] === undefined) delete v[c];
    }
  }

  const out = [];
  for (const week of weeks) {
    const wk = byWeek.get(week);
    const keys = [...wk.keys()].filter((k) => !REGION.test(k)).sort((a, b) => (a === NATIONAL ? -1 : b === NATIONAL ? 1 : a.localeCompare(b)));
    for (const j of keys) {
      const v = wk.get(j);
      out.push([week, j, ...COUNT_COLUMNS.map(([, col]) => v[col] ?? null)]);
    }
  }
  return { ok: true, weeks, rows: out, firstWeek: weeks[0], latestWeek: weeks.at(-1), notes: [] };
}

const DATASET_COLUMNS = [
  "jurisdiction", "survweekend", ...SUMMED_COLUMNS, "pct_totresuptodate", "pct_numresfluvacc", "pct_numresrsvvacc",
];

/**
 * The dataset's rows as one canonical CSV (fixed column order, sorted by week then
 * jurisdiction, values verbatim): what is archived and hashed. Re-readable with `csvToRows`.
 */
export function nhsnRowsToCsv(rows) {
  const sorted = [...rows].sort(
    (a, b) => String(a.survweekend).localeCompare(String(b.survweekend)) || String(a.jurisdiction).localeCompare(String(b.jurisdiction)),
  );
  return toCsv(DATASET_COLUMNS, sorted.map((r) => DATASET_COLUMNS.map((c) => r[c] ?? "")));
}

// ---------------------------------------------------------------------------------------
// Dashboard data file: weekly rates per 100,000 residents.

export const RATE_FIELDS = ["week", "jurisdiction", "covidCaseRate", "covidHospRate", "fluCaseRate", "fluHospRate", "rsvCaseRate", "rsvHospRate", "marked"];
const VIRUS_KEY = { "COVID-19": "covid", Influenza: "flu", RSV: "rsv" };

/** "11/1/2026" -> "2026-11-01"; null when not a real date. */
export function isoFromUsDate(text) {
  const m = typeof text === "string" ? text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/) : null;
  if (!m) return null;
  return isoDay(`${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`);
}

function rate(value) {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const s = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(s)) return undefined;
  return Number(s);
}

/**
 * Read the dashboard's chart file. Its `data` repeats every case rate once per virus of the
 * hospitalisation column (a cross product), so each (week, state, virus) appears up to three
 * times; all copies must agree. Checks, any failure stores nothing:
 *  - the chart is the "per 100,000 residents" one (title or axis label says so);
 *  - each week is a real Sunday, not in the future, and has a national (USA) row;
 *  - jurisdictions are two-letter codes or USA, viruses are COVID-19, Influenza or RSV;
 *  - rates are blank (missing) or non-negative numbers, and every copy of a rate agrees.
 * `marked` is CDC's "Trigger" column ("Dotted" for some weeks); the file does not say why.
 * @returns {{ok: true, rows: (string|number|boolean|null)[][], weeks: string[], firstWeek: string, latestWeek: string} | {ok: false, reason: string}}
 */
export function parseDashboard(json, { nowISO } = {}) {
  const fail = (reason) => ({ ok: false, reason });
  if (!json || typeof json !== "object" || !Array.isArray(json.data)) return fail("the dashboard file has no data array");
  const unit = `${json.title ?? ""} ${json.yAxis?.label ?? ""}`;
  if (!/per 100,000 residents/i.test(unit)) return fail(`the dashboard chart no longer says "per 100,000 residents" (${JSON.stringify(unit.trim())})`);
  if (json.data.length === 0) return fail("the dashboard file has no rows");

  /** @type {Map<string, {week: string, j: string, marked: boolean, v: Record<string, number|null>}>} */
  const cells = new Map();
  const put = (cell, key, value, where) => {
    if (value === undefined) return `unreadable rate ${where}`;
    if (key in cell.v && cell.v[key] !== value) return `two different values for ${key} ${where}: ${cell.v[key]} and ${value}`;
    cell.v[key] = value;
    return null;
  };
  for (const r of json.data) {
    const week = isoFromUsDate(r?.week_end);
    if (!week) return fail(`unreadable week ${JSON.stringify(r?.week_end)}`);
    if (!isSunday(week)) return fail(`week ${week} does not end on a Sunday`);
    if (futureOf(week, nowISO)) return fail(`week ${week} is in the future`);
    const j = r.state;
    if (typeof j !== "string" || !(j === NATIONAL || STATE.test(j))) return fail(`unexpected jurisdiction ${JSON.stringify(j)}`);
    const vc = VIRUS_KEY[r["Virus (Case)"]];
    const vh = VIRUS_KEY[r["Virus (Hosp)"]];
    if (!vc || !vh) return fail(`unexpected virus ${JSON.stringify(r["Virus (Case)"])} / ${JSON.stringify(r["Virus (Hosp)"])}`);
    const id = `${week}|${j}`;
    if (!cells.has(id)) cells.set(id, { week, j, marked: false, v: {} });
    const cell = cells.get(id);
    if (r.Trigger) cell.marked = true;
    const where = `for ${j} in the week ending ${week}`;
    const e1 = put(cell, `${vc}CaseRate`, rate(r["Case Rate"]), where);
    const e2 = put(cell, `${vh}HospRate`, rate(r["Hosp Rate"]), where);
    if (e1 || e2) return fail(e1 ?? e2);
  }
  const weeks = [...new Set([...cells.values()].map((c) => c.week))].sort();
  for (const w of weeks) if (!cells.has(`${w}|${NATIONAL}`)) return fail(`week ${w} has no national (USA) row`);
  const rows = [...cells.values()]
    .sort((a, b) => a.week.localeCompare(b.week) || (a.j === NATIONAL ? -1 : b.j === NATIONAL ? 1 : a.j.localeCompare(b.j)))
    .map((c) => [c.week, c.j, ...RATE_FIELDS.slice(2, 8).map((k) => c.v[k] ?? null), c.marked]);
  return { ok: true, rows, weeks, firstWeek: weeks[0], latestWeek: weeks.at(-1) };
}

/** The parsed dashboard rows as canonical CSV (what is archived and hashed). */
export function rateRowsToCsv(rows) {
  return toCsv(RATE_FIELDS, rows.map((r) => r.map((v) => (v === null ? "" : typeof v === "boolean" ? (v ? "1" : "0") : v))));
}

/** Read `rateRowsToCsv` output back into rows. */
export function csvToRateRows(text) {
  const [header, ...lines] = csvToRows(text);
  if (header.join(",") !== RATE_FIELDS.join(",")) throw new Error("not a dashboard rate extract");
  return lines.map((c) => [c[0], c[1], ...c.slice(2, 8).map((v) => (v === "" ? null : Number(v))), c[8] === "1"]);
}

// ---------------------------------------------------------------------------------------
// Minimal CSV (values here never hold newlines; quotes are handled anyway).

export function toCsv(header, rows) {
  const cell = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\n") + "\n";
}

export function csvToRows(text) {
  const out = [];
  let row = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); out.push(row); row = []; cur = ""; }
    else if (ch !== "\r") cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); out.push(row); }
  return out;
}

/** Read `nhsnRowsToCsv` output back into SODA-shaped rows (blank cells left out, as SODA does). */
export function csvToNhsnRows(text) {
  const [header, ...lines] = csvToRows(text);
  if (header.join(",") !== DATASET_COLUMNS.join(",")) throw new Error("not an NHSN dataset extract");
  return lines.map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i]]).filter(([, v]) => v !== "")));
}

/** Weekly rate per 100,000 residents, one decimal; null when either part is missing or residents is 0. */
export function per100k(count, residents) {
  if (count === null || count === undefined || !residents) return null;
  return Math.round((count / residents) * 1e6) / 10;
}
