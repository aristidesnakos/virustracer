// Pure helpers for CMS inspection citations under tag F880 ("Provide and implement an
// infection prevention and control program") from the Provider Data Catalog dataset
// "Health Deficiencies" (r5ix-sfxw) on data.cms.gov. No network, no fs:
// scripts/update-nursing-homes.mjs fetches. Unit-tested in tests/cms-f880.test.ts.
//
// This is INSPECTION data: each row is a survey finding against a named nursing home. It
// says nothing about infections or outbreaks. A citation may since have been corrected, and
// the home may have disputed it (informal or independent dispute resolution, IDR / IIDR).
//
// The dataset holds about the last three standard inspection cycles per home (plus
// complaint surveys in that window), not a full history, and CMS refreshes it roughly
// monthly. Its metastore entry carries `modified` (the processing date that every row
// repeats as `processing_date`) and `released`. One release is fetched once.

export const CMS_DATASET_ID = "r5ix-sfxw";
export const CMS_DATASET_PAGE = "https://data.cms.gov/provider-data/dataset/r5ix-sfxw";
export const CMS_METASTORE_URL = "https://data.cms.gov/provider-data/api/1/metastore/schemas/dataset/items/r5ix-sfxw";
export const CMS_QUERY_URL = "https://data.cms.gov/provider-data/api/1/datastore/query/r5ix-sfxw/0";
export const CMS_DICTIONARY_URL = "https://data.cms.gov/provider-data/sites/default/files/data_dictionaries/nursing_home/NH_Data_Dictionary.pdf";
export const F880_TAG = "0880";
/** The query API's maximum page size (it answers 400 above it). */
export const CMS_PAGE_SIZE = 1500;
export const CMS_HOSTS = ["data.cms.gov"];

/** True for an https URL on data.cms.gov. */
export function isCmsUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && CMS_HOSTS.includes(u.hostname) && u.port === "";
  } catch {
    return false;
  }
}

/** One page of F880 rows, in a stable order (record_number) so paging cannot skip or repeat rows. */
export function cmsQueryUrl(offset) {
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error(`invalid offset ${offset}`);
  const p = new URLSearchParams({
    "conditions[0][property]": "deficiency_tag_number",
    "conditions[0][value]": F880_TAG,
    "conditions[0][operator]": "=",
    limit: String(CMS_PAGE_SIZE),
    offset: String(offset),
    "sorts[0][property]": "record_number",
    "sorts[0][order]": "asc",
  });
  return `${CMS_QUERY_URL}?${p}`;
}

/** Medicare Care Compare's page for a nursing home: https://www.medicare.gov/care-compare/details/nursing-home/<CCN>?state=<ST>. */
export function careCompareUrl(ccn, state) {
  return `https://www.medicare.gov/care-compare/details/nursing-home/${encodeURIComponent(ccn)}?state=${encodeURIComponent(state)}`;
}

function isoDay(text) {
  if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text ? text : null;
}

/**
 * Parse the dataset's metastore entry.
 * @returns {{ok: true, modified: string, released: string, nextUpdateDate: string|null, downloadURL: string|null} | {ok: false, reason: string}}
 */
export function parseCmsMetastore(json) {
  if (!json || typeof json !== "object") return { ok: false, reason: "metastore entry is not a JSON object" };
  if (json.identifier !== CMS_DATASET_ID) return { ok: false, reason: `metastore entry is for ${JSON.stringify(json.identifier)}` };
  const modified = isoDay(json.modified);
  const released = isoDay(json.released);
  if (!modified) return { ok: false, reason: `unreadable modified date ${JSON.stringify(json.modified)}` };
  if (!released) return { ok: false, reason: `unreadable released date ${JSON.stringify(json.released)}` };
  const url = json.distribution?.[0]?.downloadURL;
  return {
    ok: true,
    modified,
    released,
    nextUpdateDate: isoDay(json.nextUpdateDate) ?? null,
    downloadURL: typeof url === "string" && isCmsUrl(url) ? url : null,
  };
}

/** Every field of a row, in the dataset's order: the archived CSV keeps them all. */
export const CMS_FIELDS = [
  "cms_certification_number_ccn", "provider_name", "provider_address", "citytown", "state", "zip_code",
  "survey_date", "survey_footnote", "survey_type", "deficiency_prefix", "deficiency_category",
  "deficiency_tag_number", "deficiency_description", "scope_severity_code", "deficiency_corrected",
  "correction_date", "inspection_cycle", "standard_deficiency", "complaint_deficiency",
  "infection_control_inspection_deficiency", "citation_under_idr", "citation_under_iidr", "location",
  "processing_date",
];

/**
 * CMS's correction-status wording -> a short stable code. An unknown wording stops the
 * reader (the field's vocabulary changed and needs a human look).
 */
export const STATUS_CODES = {
  "Deficient, Provider has date of correction": "corrected",
  "Deficient, Provider has plan of correction": "plan",
  "Deficient, Provider has no plan of correction": "no-plan",
  "Past Non-Compliance": "past-noncompliance",
  "No revisit needed": "no-revisit",
};

/** Plain words for each status code, as the site prints them. */
export const STATUS_LABEL = {
  corrected: "Corrected (CMS has a date of correction)",
  plan: "Plan of correction accepted, not yet marked corrected",
  "no-plan": "No plan of correction on file",
  "past-noncompliance": "Past non-compliance (already corrected when found)",
  "no-revisit": "Corrected; no revisit needed",
};

/**
 * The scope and severity grid. Severity rises by row (1 = potential for minimal harm,
 * 4 = immediate jeopardy), scope by column (isolated, pattern, widespread).
 */
export const SEVERITY = {
  A: [1, "isolated"], B: [1, "pattern"], C: [1, "widespread"],
  D: [2, "isolated"], E: [2, "pattern"], F: [2, "widespread"],
  G: [3, "isolated"], H: [3, "pattern"], I: [3, "widespread"],
  J: [4, "isolated"], K: [4, "pattern"], L: [4, "widespread"],
};
export const SEVERITY_LEVEL_LABEL = {
  1: "No actual harm, potential for minimal harm",
  2: "No actual harm, potential for more than minimal harm",
  3: "Actual harm (not immediate jeopardy)",
  4: "Immediate jeopardy to resident health or safety",
};
/** G and above: actual harm or immediate jeopardy. */
export const isHarmLevel = (code) => (SEVERITY[code]?.[0] ?? 0) >= 3;

const YN = new Set(["Y", "N"]);

/**
 * Check every row of one release. Each must hold, or nothing is stored:
 *  - the API's reported count equals the rows received;
 *  - every row is tag 0880, prefix F, category "Infection Control Deficiencies", a Health survey;
 *  - every row's processing_date equals the metastore's `modified` (the rows are the release
 *    the metadata describes);
 *  - CCN is six characters, state two letters, survey date a real day not after processing,
 *    correction date blank or a real day, severity A-L, cycle 1-3, flags Y or N, status known;
 *  - no row appears twice.
 * @param {any[]} rows
 * @param {{modified: string, reportedCount: number}} opts
 * @returns {{ok: true, notes: string[]} | {ok: false, reason: string}}
 */
export function validateCitationRows(rows, { modified, reportedCount }) {
  const fail = (reason) => ({ ok: false, reason });
  if (!Array.isArray(rows) || rows.length === 0) return fail("no rows");
  if (rows.length !== reportedCount) return fail(`the API reported ${reportedCount} F880 rows but ${rows.length} were received`);
  const seen = new Set();
  const names = new Map();
  for (const [i, r] of rows.entries()) {
    const at = `row ${i + 1} (${r?.cms_certification_number_ccn ?? "?"} ${r?.survey_date ?? "?"})`;
    const missing = CMS_FIELDS.filter((f) => typeof r?.[f] !== "string");
    if (missing.length) return fail(`${at} lacks ${missing.join(", ")}`);
    if (r.deficiency_tag_number !== F880_TAG) return fail(`${at} is tag ${r.deficiency_tag_number}, not ${F880_TAG}`);
    if (r.deficiency_prefix !== "F") return fail(`${at} has prefix ${r.deficiency_prefix}`);
    if (r.deficiency_category !== "Infection Control Deficiencies") return fail(`${at} has category ${JSON.stringify(r.deficiency_category)}`);
    if (r.survey_type !== "Health") return fail(`${at} has survey type ${JSON.stringify(r.survey_type)}`);
    if (r.processing_date !== modified) return fail(`${at} was processed ${r.processing_date}, the release is ${modified}`);
    if (!/^[0-9A-Z]{6}$/.test(r.cms_certification_number_ccn)) return fail(`${at} has an unreadable CCN`);
    if (!/^[A-Z]{2}$/.test(r.state)) return fail(`${at} has state ${JSON.stringify(r.state)}`);
    const survey = isoDay(r.survey_date);
    if (!survey || survey > modified) return fail(`${at} has survey date ${JSON.stringify(r.survey_date)}`);
    if (r.correction_date !== "" && !isoDay(r.correction_date)) return fail(`${at} has correction date ${JSON.stringify(r.correction_date)}`);
    if (!(r.scope_severity_code in SEVERITY)) return fail(`${at} has scope/severity ${JSON.stringify(r.scope_severity_code)}`);
    if (!["1", "2", "3"].includes(r.inspection_cycle)) return fail(`${at} has inspection cycle ${JSON.stringify(r.inspection_cycle)}`);
    for (const f of ["standard_deficiency", "complaint_deficiency", "infection_control_inspection_deficiency", "citation_under_idr", "citation_under_iidr"]) {
      if (!YN.has(r[f])) return fail(`${at} has ${f} ${JSON.stringify(r[f])}`);
    }
    if (!(r.deficiency_corrected in STATUS_CODES)) return fail(`${at} has an unknown correction status ${JSON.stringify(r.deficiency_corrected)}`);
    const key = CMS_FIELDS.map((f) => r[f]).join("\u0001");
    if (seen.has(key)) return fail(`${at} appears twice`);
    seen.add(key);
    const n = names.get(r.cms_certification_number_ccn);
    if (n && n !== r.provider_name) names.set(r.cms_certification_number_ccn, `${n}|`);
    else if (!n) names.set(r.cms_certification_number_ccn, r.provider_name);
  }
  const renamed = [...names.values()].filter((v) => v.endsWith("|")).length;
  return { ok: true, notes: renamed ? [`${renamed} CCN(s) appear under more than one name; the newest survey's name is shown.`] : [] };
}

const sortKey = (r) => [r.state, r.cms_certification_number_ccn, r.survey_date, ...CMS_FIELDS.map((f) => r[f])].join("\u0001");

/** Every row, every field, as canonical CSV (sorted by state, CCN, survey date): what is archived and hashed. */
export function citationsToCsv(rows) {
  const sorted = [...rows].sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0));
  const cell = (v) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [CMS_FIELDS.join(","), ...sorted.map((r) => CMS_FIELDS.map((f) => cell(r[f])).join(","))].join("\n") + "\n";
}

/** Fields of each compact citation in a per-state file. */
export const CITATION_FIELDS = [
  "ccn", "surveyDate", "severity", "cycle", "complaint", "standard", "infectionControlInspection",
  "status", "correctionDate", "idr", "iidr",
];

/**
 * Split one release into compact per-state files: facilities once (name, address, city, ZIP),
 * citations as arrays in CITATION_FIELDS order, newest survey first. Lossless for every field
 * the site uses; the archived CSV keeps the rest.
 * @param {any[]} rows  validated rows
 * @param {{release: string, released: string}} meta
 * @returns {Record<string, {state: string, release: string, released: string, fields: string[], facilities: Record<string, string[]>, citations: any[][]}>}
 */
export function buildStateFiles(rows, { release, released }) {
  const out = {};
  const newestName = new Map();
  for (const r of rows) {
    const prev = newestName.get(r.cms_certification_number_ccn);
    if (!prev || r.survey_date > prev.survey_date) newestName.set(r.cms_certification_number_ccn, r);
  }
  for (const r of rows) {
    const st = (out[r.state] ??= { state: r.state, release, released, fields: CITATION_FIELDS, facilities: {}, citations: [] });
    const f = newestName.get(r.cms_certification_number_ccn);
    st.facilities[r.cms_certification_number_ccn] ??= [f.provider_name, f.provider_address, f.citytown, f.zip_code];
    st.citations.push([
      r.cms_certification_number_ccn,
      r.survey_date,
      r.scope_severity_code,
      Number(r.inspection_cycle),
      r.complaint_deficiency === "Y",
      r.standard_deficiency === "Y",
      r.infection_control_inspection_deficiency === "Y",
      STATUS_CODES[r.deficiency_corrected],
      r.correction_date || null,
      r.citation_under_idr === "Y",
      r.citation_under_iidr === "Y",
    ]);
  }
  for (const st of Object.values(out)) {
    st.citations.sort((a, b) => b[1].localeCompare(a[1]) || a[0].localeCompare(b[0]) || a[2].localeCompare(b[2]));
    st.facilities = Object.fromEntries(Object.entries(st.facilities).sort(([a], [b]) => a.localeCompare(b)));
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

/** Read `citationsToCsv` output back into row objects. */
export function csvToCitations(text) {
  const rows = [];
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
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  const [header, ...body] = rows;
  if (header?.join(",") !== CMS_FIELDS.join(",")) throw new Error("not a CMS F880 extract");
  return body.map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i]])));
}
