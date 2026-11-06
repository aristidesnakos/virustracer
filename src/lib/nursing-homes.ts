// Nursing-home data layer: types, URL shapes and pure calculations. Client-safe (no fs).
// The data is written by scripts/update-nursing-homes.mjs into data/nursing-homes/ and read
// by src/lib/nursing-homes-data.ts. These are recurring measurements by state and by
// facility, NOT outbreaks: nothing here touches the outbreak registry or computeMetrics.

export const NURSING_HOMES_PATH = "/nursing-homes";
export const RESPIRATORY_PATH = "/nursing-homes/respiratory";
export const INFECTION_CONTROL_PATH = "/nursing-homes/infection-control";
export const stateCitationsPath = (state: string): string => `${INFECTION_CONTROL_PATH}/${state.toLowerCase()}`;

export const NURSING_HOMES_API_PATH = "/api/v1/nursing-homes";
export const RESPIRATORY_API_PATH = "/api/v1/nursing-homes/respiratory";
export const CITATIONS_API_PATH = "/api/v1/nursing-homes/infection-control-citations";

export const PATHOGENS = ["covid", "flu", "rsv"] as const;
export type Pathogen = (typeof PATHOGENS)[number];
export const PATHOGEN_LABEL: Record<Pathogen, string> = { covid: "COVID-19", flu: "Influenza", rsv: "RSV" };

export const NATIONAL = "USA";

export const STATE_NAMES: Record<string, string> = {
  USA: "United States", AK: "Alaska", AL: "Alabama", AR: "Arkansas", AS: "American Samoa", AZ: "Arizona",
  CA: "California", CO: "Colorado", CT: "Connecticut", DC: "District of Columbia", DE: "Delaware",
  FL: "Florida", GA: "Georgia", GU: "Guam", HI: "Hawaii", IA: "Iowa", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", MA: "Massachusetts", MD: "Maryland",
  ME: "Maine", MI: "Michigan", MN: "Minnesota", MO: "Missouri", MP: "Northern Mariana Islands",
  MS: "Mississippi", MT: "Montana", NC: "North Carolina", ND: "North Dakota", NE: "Nebraska",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NV: "Nevada", NY: "New York", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", PR: "Puerto Rico", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VA: "Virginia",
  VI: "U.S. Virgin Islands", VT: "Vermont", WA: "Washington", WI: "Wisconsin", WV: "West Virginia", WY: "Wyoming",
};
export const stateName = (code: string): string => STATE_NAMES[code] ?? code;

// ─── A. NHSN respiratory ────────────────────────────────────────────────────────────────

/** Columnar file as written by the reader: a head plus `fields` and `rows`. */
export interface ColumnarFile {
  lastChecked: string;
  fetchedAt: string;
  firstWeek: string;
  latestWeek: string;
  allPathogensFrom: string;
  rawPath: string;
  rawSha256: string;
  fields: string[];
  rows: (string | number | boolean | null)[][];
  versions: Record<string, unknown>[];
}

export interface CountsFile extends ColumnarFile {
  dataset: string;
  title: string;
  sourceUrl: string;
  sourceRowsUpdatedAt: string;
}

export interface RatesFile extends ColumnarFile {
  source: string;
  sourceUrl: string;
  dataUrl: string;
  unit: string;
  sourceLastModified: string | null;
}

export interface CountRow {
  week: string;
  jurisdiction: string;
  facilities: number;
  residents: number;
  covidCases: number | null;
  covidHosp: number | null;
  fluCases: number | null;
  fluHosp: number | null;
  rsvCases: number | null;
  rsvHosp: number | null;
  covidUpToDate: number | null;
  fluVaccinated: number | null;
  rsvVaccinated: number | null;
}

/** A count row plus weekly rates per 100,000 residents computed from it. */
export interface CountRowWithRates extends CountRow {
  covidCaseRate: number | null;
  covidHospRate: number | null;
  fluCaseRate: number | null;
  fluHospRate: number | null;
  rsvCaseRate: number | null;
  rsvHospRate: number | null;
}

export interface RateRow {
  week: string;
  jurisdiction: string;
  covidCaseRate: number | null;
  covidHospRate: number | null;
  fluCaseRate: number | null;
  fluHospRate: number | null;
  rsvCaseRate: number | null;
  rsvHospRate: number | null;
  /** CDC's dashboard marks some weeks (its "Trigger" column, "Dotted"); the file does not say why. */
  marked: boolean;
}

function toObjects<T>(file: Pick<ColumnarFile, "fields" | "rows">): T[] {
  return file.rows.map((r) => Object.fromEntries(file.fields.map((f, i) => [f, r[i]])) as T);
}

export const countRows = (file: CountsFile): CountRow[] => toObjects<CountRow>(file);
export const rateRows = (file: RatesFile): RateRow[] => toObjects<RateRow>(file);

/** Weekly rate per 100,000 residents to one decimal; null when the count is missing or there are no residents. Same rule as scripts/lib/nhsn.mjs. */
export function per100k(count: number | null | undefined, residents: number | null | undefined): number | null {
  if (count === null || count === undefined || !residents) return null;
  return Math.round((count / residents) * 1e6) / 10;
}

export function withRates(r: CountRow): CountRowWithRates {
  return {
    ...r,
    covidCaseRate: per100k(r.covidCases, r.residents),
    covidHospRate: per100k(r.covidHosp, r.residents),
    fluCaseRate: per100k(r.fluCases, r.residents),
    fluHospRate: per100k(r.fluHosp, r.residents),
    rsvCaseRate: per100k(r.rsvCases, r.residents),
    rsvHospRate: per100k(r.rsvHosp, r.residents),
  };
}

/** A week counts as thinly reported when fewer than this share of the usual facilities reported. */
export const THIN_REPORTING_SHARE = 0.9;

/**
 * Weeks of the national counts in which fewer nursing homes reported than usual: under
 * THIN_REPORTING_SHARE of the median of the 8 weeks before. CDC's dataset includes only
 * homes that submitted complete data, so a late week can hold a fraction of them; its
 * counts are not comparable and must not be read as a fall.
 */
export function thinlyReportedWeeks(rows: readonly CountRow[]): Set<string> {
  const national = rows.filter((r) => r.jurisdiction === NATIONAL).sort((a, b) => a.week.localeCompare(b.week));
  const thin = new Set<string>();
  national.forEach((r, i) => {
    const prior = national.slice(Math.max(0, i - 8), i).map((p) => p.facilities).sort((a, b) => a - b);
    if (prior.length < 4) return;
    const median = prior.length % 2 ? prior[(prior.length - 1) / 2] : (prior[prior.length / 2 - 1] + prior[prior.length / 2]) / 2;
    if (r.facilities < THIN_REPORTING_SHARE * median) thin.add(r.week);
  });
  return thin;
}

/** The newest week of the counts that is not thinly reported (null when there is none). */
export function latestFullWeek(rows: readonly CountRow[]): string | null {
  const thin = thinlyReportedWeeks(rows);
  const weeks = [...new Set(rows.filter((r) => r.jurisdiction === NATIONAL).map((r) => r.week))].sort();
  return weeks.filter((w) => !thin.has(w)).at(-1) ?? null;
}

// ─── B. CMS F880 citations ──────────────────────────────────────────────────────────────

export type CitationStatus = "corrected" | "plan" | "no-plan" | "past-noncompliance" | "no-revisit";
export type SeverityCode = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L";

/** One state's file: facilities once, citations as arrays in `fields` order (scripts/lib/cms-f880.mjs CITATION_FIELDS). */
export interface StateCitationsFile {
  state: string;
  /** CMS processing date of the release (the dataset's `modified`). */
  release: string;
  /** Date CMS published the release. */
  released: string;
  fields: string[];
  /** CCN -> [name, address, city, ZIP] */
  facilities: Record<string, [string, string, string, string]>;
  citations: [string, string, SeverityCode, number, boolean, boolean, boolean, CitationStatus, string | null, boolean, boolean][];
}

export interface F880Release {
  release: string;
  released: string;
  fetchedAt: string;
  citations: number;
  facilities: number;
  states: number;
  rawPath: string;
  rawSha256: string;
  downloadURL: string | null;
}

export interface F880Index {
  dataset: string;
  sourceUrl: string;
  lastChecked: string;
  nextUpdateDate: string | null;
  latest: string | null;
  releases: F880Release[];
}

export interface Citation {
  ccn: string;
  facility: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  surveyDate: string;
  severity: SeverityCode;
  inspectionCycle: number;
  complaint: boolean;
  standard: boolean;
  infectionControlInspection: boolean;
  status: CitationStatus;
  correctionDate: string | null;
  underIdr: boolean;
  underIidr: boolean;
  release: string;
  released: string;
}

export function citations(file: StateCitationsFile): Citation[] {
  return file.citations.map(([ccn, surveyDate, severity, inspectionCycle, complaint, standard, ic, status, correctionDate, underIdr, underIidr]) => {
    const [facility, address, city, zip] = file.facilities[ccn] ?? ["", "", "", ""];
    return {
      ccn, facility, address, city, state: file.state, zip, surveyDate, severity, inspectionCycle, complaint, standard,
      infectionControlInspection: ic, status, correctionDate, underIdr, underIidr, release: file.release, released: file.released,
    };
  });
}

/** The scope/severity grid, as CMS defines it: severity level (rows) by scope (columns). */
export const SEVERITY_LEVELS = [
  { level: 4, label: "Immediate jeopardy to resident health or safety", codes: ["J", "K", "L"] },
  { level: 3, label: "Actual harm that is not immediate jeopardy", codes: ["G", "H", "I"] },
  { level: 2, label: "No actual harm, potential for more than minimal harm", codes: ["D", "E", "F"] },
  { level: 1, label: "No actual harm, potential for minimal harm", codes: ["A", "B", "C"] },
] as const;
export const SCOPES = ["Isolated", "Pattern", "Widespread"] as const;

export function severityLevel(code: SeverityCode): number {
  return SEVERITY_LEVELS.find((l) => (l.codes as readonly string[]).includes(code))?.level ?? 0;
}

/** Plain words for a scope/severity letter, e.g. "E: pattern, no actual harm, potential for more than minimal harm". */
export function severityWords(code: SeverityCode): string {
  const l = SEVERITY_LEVELS.find((x) => (x.codes as readonly string[]).includes(code));
  if (!l) return code;
  const scope = SCOPES[(l.codes as readonly string[]).indexOf(code)].toLowerCase();
  return `${scope}; ${l.label.charAt(0).toLowerCase()}${l.label.slice(1)}`;
}

/** Actual harm or immediate jeopardy (G to L). */
export const isHarm = (code: SeverityCode): boolean => severityLevel(code) >= 3;

export const STATUS_LABEL: Record<CitationStatus, string> = {
  corrected: "Corrected (CMS has a date of correction)",
  plan: "Plan of correction accepted, not yet marked corrected",
  "no-plan": "No plan of correction on file",
  "past-noncompliance": "Past non-compliance (already corrected when found)",
  "no-revisit": "Corrected; no revisit needed",
};

/** The first day of the 12-month window that ends on `release` (inclusive of both ends). */
export function twelveMonthsBefore(release: string): string {
  const d = new Date(`${release}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export interface StateSummary {
  state: string;
  release: string;
  released: string;
  /** First survey date counted in the last-12-months figures. */
  since: string;
  citations12m: number;
  facilities12m: number;
  harm12m: number;
  /** Share of the last 12 months' citations at severity G or above, 0-1; null with no citations. */
  harmShare12m: number | null;
  complaint12m: number;
  citationsAll: number;
  facilitiesAll: number;
  /** Citations per scope/severity letter, whole file. */
  grid: Record<SeverityCode, number>;
  /** The same, last 12 months. */
  grid12m: Record<SeverityCode, number>;
}

const emptyGrid = (): Record<SeverityCode, number> =>
  Object.fromEntries("ABCDEFGHIJKL".split("").map((c) => [c, 0])) as Record<SeverityCode, number>;

/**
 * Per-state figures. "Last 12 months" counts surveys dated within the year that ends on the
 * release's processing date, so the figure is reproducible from the release alone (CMS adds
 * surveys weeks after they happen, so the newest months are usually incomplete).
 */
export function summarizeState(file: StateCitationsFile): StateSummary {
  const since = twelveMonthsBefore(file.release);
  const grid = emptyGrid();
  const grid12m = emptyGrid();
  const fac = new Set<string>();
  const fac12 = new Set<string>();
  let n12 = 0;
  let harm = 0;
  let complaint = 0;
  for (const [ccn, date, sev, , isComplaint] of file.citations) {
    grid[sev]++;
    fac.add(ccn);
    if (date >= since && date <= file.release) {
      n12++;
      grid12m[sev]++;
      fac12.add(ccn);
      if (isHarm(sev)) harm++;
      if (isComplaint) complaint++;
    }
  }
  return {
    state: file.state,
    release: file.release,
    released: file.released,
    since,
    citations12m: n12,
    facilities12m: fac12.size,
    harm12m: harm,
    harmShare12m: n12 ? harm / n12 : null,
    complaint12m: complaint,
    citationsAll: file.citations.length,
    facilitiesAll: fac.size,
    grid,
    grid12m,
  };
}

/** National totals from the per-state summaries. */
export function nationalSummary(states: readonly StateSummary[]): Omit<StateSummary, "state"> & { state: "USA" } {
  const grid = emptyGrid();
  const grid12m = emptyGrid();
  for (const s of states) for (const c of Object.keys(grid) as SeverityCode[]) {
    grid[c] += s.grid[c];
    grid12m[c] += s.grid12m[c];
  }
  const sum = (k: "citations12m" | "facilities12m" | "harm12m" | "complaint12m" | "citationsAll" | "facilitiesAll") =>
    states.reduce((a, s) => a + s[k], 0);
  const n12 = sum("citations12m");
  return {
    state: "USA",
    release: states[0]?.release ?? "",
    released: states[0]?.released ?? "",
    since: states[0]?.since ?? "",
    citations12m: n12,
    facilities12m: sum("facilities12m"),
    harm12m: sum("harm12m"),
    harmShare12m: n12 ? sum("harm12m") / n12 : null,
    complaint12m: sum("complaint12m"),
    citationsAll: sum("citationsAll"),
    facilitiesAll: sum("facilitiesAll"),
    grid,
    grid12m,
  };
}

/** Medicare Care Compare's page for a nursing home (same form as scripts/lib/cms-f880.mjs careCompareUrl). */
export function careCompareUrl(ccn: string, state: string): string {
  return `https://www.medicare.gov/care-compare/details/nursing-home/${encodeURIComponent(ccn)}?state=${encodeURIComponent(state)}`;
}

// ─── Formatting ─────────────────────────────────────────────────────────────────────────

/** "2026-11-01" -> "1 November 2026" (UTC, the site's date style). */
export function longDate(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export const fmtInt = (n: number | null | undefined): string => (n === null || n === undefined ? "—" : n.toLocaleString("en-US"));
export const fmtRate = (n: number | null | undefined): string =>
  n === null || n === undefined ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const fmtPct = (share: number | null | undefined): string =>
  share === null || share === undefined ? "—" : `${(share * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
