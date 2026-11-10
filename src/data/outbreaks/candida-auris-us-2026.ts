import type {
  CaseDataPoint,
  CaseLocation,
  MonitoringEntry,
  OutbreakDefinition,
  OutbreakSummary,
  SpreadStop,
} from "./types";

// Live outbreak. Headline totals are read automatically from CDC's weekly notifiable-disease
// table (NNDSS Weekly Data, dataset x9gk-5huc on data.cdc.gov) into
// data/outbreaks/candida-auris-us-2026/toll.json (scripts/lib/nndss.mjs, run by
// .github/workflows/update-data.yml). Everything below is hand-maintained and was copied from
// that table for MMWR week 43 of 2026 (the week ending Saturday 31 October 2026; the rows were
// updated on 4 November) on 2026-11-06.
//
// What the figures count:
//  - Clinical cases: C. auris found in a sample taken to find the cause of a suspected
//    infection (blood, urine, a wound...). This is the headline ("confirmed" in toll.json).
//  - Screening cases: C. auris found on a swab taken to look for colonisation, people who carry
//    it on their skin without being ill. Never added to clinical and never shown as "suspected".
//    (Both definitions: CDC, "Tracking C. auris", and the CSTE case definitions it cites.)
//  - The year's cumulative count among U.S. residents (50 states, DC and New York City; the
//    territories and non-U.S. residents are separate rows, all 0 this year).
//  - No deaths: NNDSS does not collect them.
// The counts are provisional. CDC presents each week's table as published, and a cumulative
// count can fall when states reconcile their data: week 17 (1,816) and week 18 (1,881) were
// below week 16 (2,022), so the reader skipped them for manual review and never stored them.
// A jurisdiction shown as "-" submitted no cases to NNDSS, which is not the same as having none;
// C. auris is not reportable in Florida or Alabama ("N"), and Arkansas and Oklahoma were
// "unavailable" ("U") this year.

const AS_OF = "2026-10-31";
const TABLE_SOURCE = "CDC NNDSS weekly table, week 43 of 2026 (to 31 Oct 2026)";

// ─── Case timeline ───────────────────────────────────────────────────────────
// Deliberately empty. The weekly snapshots in toll.json (backfilled from week 1) supply the
// series, and a curated row would override the snapshot of the same date (see mergeTimeline).
const casesTimeline: CaseDataPoint[] = [];

// ─── Region table ─────────────────────────────────────────────────────────────
// One national row, then the 15 states with at least 100 clinical cases in 2026 as sub-rows
// (excluded from the total, like DR Congo's provinces). They hold 6,226 of the 6,572 clinical
// cases; 14 other states hold the remaining 346. NNDSS has no deaths, so every row is marked
// deathsUnreported. [name, iso, clinical YTD, screening YTD, clinical same week of 2025 (m4)],
// all from the week 43 table.
const STATES: readonly [name: string, iso: string, clinical: number, screening: number | null, previousYear: number][] = [
  ["California", "US-CA", 1478, null, 1100],
  ["Nevada", "US-NV", 878, 1775, 672],
  ["Texas", "US-TX", 786, 1274, 757],
  ["Georgia", "US-GA", 426, 87, 396],
  ["Ohio", "US-OH", 416, 323, 308],
  ["Tennessee", "US-TN", 414, 56, 363],
  ["Illinois", "US-IL", 265, 654, 577],
  ["Arizona", "US-AZ", 260, 262, 208],
  ["Michigan", "US-MI", 254, 903, 198],
  ["Louisiana", "US-LA", 251, 23, 159],
  ["Pennsylvania", "US-PA", 196, 87, 259],
  ["Virginia", "US-VA", 196, 161, 122],
  ["Mississippi", "US-MS", 146, 108, 112],
  ["Indiana", "US-IN", 141, 341, 159],
  ["Maryland", "US-MD", 119, 268, 94],
];

const fmt = (n: number) => n.toLocaleString("en-US");

const stateRows: MonitoringEntry[] = STATES.map(([name, iso, clinical, screening, previousYear]) => ({
  country: name,
  flag: "🇺🇸",
  iso,
  parentIso: "US",
  confirmed: clinical,
  deaths: 0,
  deathsUnreported: true,
  status: "Clinical cases reported",
  detail:
    `${fmt(clinical)} clinical cases in 2026 to 31 October (${fmt(previousYear)} by the same week of 2025). ` +
    (screening === null
      ? "No screening cases submitted to NNDSS this year."
      : `${fmt(screening)} screening (colonisation) cases, counted separately.`) +
    " NNDSS has no deaths.",
  source: `${TABLE_SOURCE} (clinical, screening and previous-year columns)`,
  asOf: AS_OF,
}));

const monitoringData: MonitoringEntry[] = [
  {
    country: "United States",
    flag: "🇺🇸",
    iso: "US",
    confirmed: 6572,
    deaths: 0,
    deathsUnreported: true,
    status: "Active",
    detail:
      "6,572 clinical cases of Candida auris reported to CDC's notifiable-disease system in 2026 by 31 October (MMWR week 43), against 5,733 by the same week of 2025, and 91 in week 43 itself. " +
      "Separately, 7,202 screening cases: people found to carry the fungus on a swab, without an infection. " +
      "Clinical cases were reported from 29 states. C. auris is not reportable in Florida or Alabama, Arkansas and Oklahoma were unavailable, and a jurisdiction marked “-” (including New York State and New York City this year) submitted no cases, which does not mean it had none. " +
      "The counts are provisional and can be revised up or down; NNDSS does not collect deaths.",
    source: `${TABLE_SOURCE} (U.S. Residents row, clinical and screening labels)`,
    asOf: AS_OF,
  },
  ...stateRows,
];

// ─── Map: states with 100+ clinical cases ─────────────────────────────────────
// One marker per state in the table, at the point the NNDSS table itself gives for the state
// (its `geocode`, the state capital), not where cases were found. No death-labelled bubbles:
// NNDSS has no deaths, and a bubble would read as "0 deaths".
const POINTS: Record<string, readonly [lng: number, lat: number]> = {
  "US-CA": [-121.49086, 38.57944],
  "US-NV": [-119.76698, 39.16505],
  "US-TX": [-97.743, 30.26759],
  "US-GA": [-84.39111, 33.74831],
  "US-OH": [-83.00276, 39.96199],
  "US-TN": [-86.77799, 36.16792],
  "US-IL": [-89.64361, 39.8013],
  "US-AZ": [-112.07581, 33.44825],
  "US-MI": [-84.55226, 42.73194],
  "US-LA": [-91.18665, 30.44335],
  "US-PA": [-76.88224, 40.25986],
  "US-VA": [-77.43367, 37.54068],
  "US-MS": [-90.18045, 32.29896],
  "US-IN": [-86.15013, 39.76691],
  "US-MD": [-76.49015, 38.97678],
};

const spreadStops: SpreadStop[] = STATES.map(([name, iso, clinical]) => ({
  name,
  location: "United States",
  coords: [...POINTS[iso]] as [number, number],
  date: AS_OF,
  event: `${fmt(clinical)} clinical cases in 2026 to 31 Oct (CDC NNDSS).`,
}));

const caseLocations: CaseLocation[] = [];

// ─── Summary stats ────────────────────────────────────────────────────────────
// No contact tracing at national level, so the "contacts" tile shows how many states
// reported clinical cases.
const summary: OutbreakSummary = {
  countriesAffected: 1,
  contactsUnderFollowUp: 29,
  contactsLabel: "States with clinical cases",
  contactsNote: "in 2026, to 31 Oct",
  deathsNotReported: "NNDSS does not collect deaths",
  casesLabel: "Clinical cases",
  screeningLabel: "Screening cases",
  spreadStatus: "Active · cases in 29 states in 2026",
  spreadNote:
    "CDC NNDSS, week 43 (to 31 Oct 2026): most clinical cases in California (1,478), Nevada (878) and Texas (786) · not reportable in Florida or Alabama · counts are provisional",
  lastReviewed: "2026-11-06",
  source: "CDC NNDSS weekly table (Candida auris)",
};

export const candidaAurisUs2026: OutbreakDefinition = {
  slug: "candida-auris-us-2026",
  disease: "Candida auris",
  pathogen: "Candida auris (Candidozyma auris)",
  status: "active",
  source: {
    kind: "official-report",
    ref: "the weekly notifiable-disease table (NNDSS Weekly Data) of the US Centers for Disease Control and Prevention (CDC)",
  },
  title: "Candida auris in the US 2026",
  seoTitle: "Candida auris Cases & US Map 2026: Weekly Tracker",
  searchLabel: "Candida auris cases, United States",
  keywords: [
    "candida auris cases",
    "candida auris map",
    "candida auris us map",
    "candida auris cases by state",
    "candida auris states",
    "candida auris 2026",
    "candida auris tracker",
    "cdc candida auris data",
  ],
  headings: {
    figures: "Candida auris cases in the US",
    map: "Candida auris US map",
    table: "Candida auris cases by state (states with 100+ clinical cases)",
  },
  answerTemplate: "As of {date}, the CDC’s weekly NNDSS table counted {cases} of Candida auris in the United States in 2026; the table does not report deaths.",
  subtitle: "2026 United States · Candida auris · Unofficial surveillance dashboard",
  description:
    "Unofficial surveillance dashboard tracking Candida auris in the United States in 2026, read each week from the CDC’s notifiable-disease table. " +
    "C. auris is a drug-resistant fungus (a yeast) that spreads between patients in healthcare settings, above all in nursing homes, long-term acute care hospitals and ventilator units, and mostly harms people who are already very sick. " +
    "Clinical cases are people in whom it was found while looking for the cause of an infection; screening cases are people found to carry it on their skin without being ill, counted separately. " +
    "As of 31 October 2026 the CDC’s table counted 6,572 clinical cases in 29 states, and 7,202 screening cases. The counts are provisional and can be revised; NNDSS does not collect deaths.",
  links: [
    { label: "CDC C. auris", href: "https://www.cdc.gov/candida-auris/index.html" },
    { label: "CDC tracking C. auris", href: "https://www.cdc.gov/candida-auris/tracking-c-auris/index.html" },
    { label: "CDC about C. auris", href: "https://www.cdc.gov/candida-auris/about/index.html" },
    { label: "CDC colonization screening", href: "https://www.cdc.gov/candida-auris/hcp/screening-hcp/index.html" },
    { label: "NNDSS Weekly Data (data.cdc.gov)", href: "https://data.cdc.gov/NNDSS/NNDSS-Weekly-Data/x9gk-5huc" },
    { label: "NNDSS reader’s guide", href: "https://www.cdc.gov/nndss/docs/Readers-Guide-WONDER-Tables-20210421-508.pdf" },
  ],
  shortName: "2026 US Candida auris cases",
  places: "United States",
  countries: ["United States"],
  dataset: {
    name: "Candida auris in the United States, 2026: weekly cumulative clinical and screening cases",
    description:
      "Weekly cumulative clinical Candida auris cases among U.S. residents in 2026, with screening (colonisation) cases carried separately, each dated by the Saturday ending its MMWR week and tied to the archived rows of CDC’s NNDSS weekly table it was read from. Provisional; no deaths.",
    isBasedOn: "https://data.cdc.gov/NNDSS/NNDSS-Weekly-Data/x9gk-5huc",
  },
  credit: "figures from the CDC’s weekly NNDSS table",
  map: { stopsLabel: "State with 100+ clinical cases (to 31 Oct)" },
  tableSources: "CDC NNDSS · no deaths collected",
  metrics: {
    serialInterval: null,
    rtNote:
      "Rt is not reported for Candida auris: it spreads through contaminated surfaces, devices and hands in healthcare facilities, often from people who carry it for months without symptoms, so there is no serial interval to base Rt on. No case-to-death delay is used either, because NNDSS collects no deaths.",
    rtShortNote: "C. auris spreads in healthcare settings with no serial interval",
    caseToDeathDays: null,
    reportingCadence: "weekly",
  },
  casesTimeline,
  monitoringData,
  spreadStops,
  caseLocations,
  summary,
};
