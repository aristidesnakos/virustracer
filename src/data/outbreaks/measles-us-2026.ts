import type {
  CaseDataPoint,
  CaseLocation,
  MonitoringEntry,
  OutbreakDefinition,
  OutbreakSummary,
  SpreadStop,
} from "./types";

// Live outbreak. Headline totals are read automatically, once a week, from the US Centers
// for Disease Control and Prevention's measles page into data/outbreaks/measles-us-2026/toll.json
// (scripts/lib/cdc.mjs, run by .github/workflows/update-data.yml). Everything below is
// hand-maintained and was checked against the CDC's figures as of 29 October 2026 (page
// updated 30 October) on 2026-11-02.
//
// What the figures count: confirmed measles cases reported to the CDC in 2026 (a case
// belongs to the year of its rash onset), U.S. residents and international visitors alike.
// Probable cases are not counted nationally. This is the whole country, not one outbreak:
// the CDC counts 43 new outbreaks (3 or more related cases) in 2026, and 96% of cases are
// linked to one, 1,384 of them to outbreaks that began in 2025.
//
// DEATHS: the headline figure is the one the CDC's page displays, 3, marked "subject to
// change". The data file behind that page (measles_hosp.json) lists 5, a number the page
// does not show, and Pennsylvania's health department reports at least five
// measles-associated deaths in its own outbreak. How measles deaths are classified and
// counted is publicly disputed. By decision, this page tracks the displayed figure and says
// so wherever a hand-written field allows, so the headline never reads as a settled toll.
// scripts/update-toll.mjs logs a warning each run in which the page and its data file differ.
// Since 2026-11-10 every weekly snapshot also stores the data file's figure (deathsDataFile) and
// the dashboard prints both under the deaths figure (deathsGapNote in src/lib/toll.ts), so the
// current gap is always shown from data; the 3/5 below belong to the 29 Oct table row.
// Why the page lags: its 2026 deaths cell is typed by hand ("4*" on 2026-11-06), while the
// page's script fills only cells with ids from measles_hosp.json (2025's deaths cell has one).

const AS_OF = "2026-10-29";
const CDC_SOURCE = "CDC measles cases and outbreaks page, as of 29 Oct 2026";

const DEATHS_SENTENCE =
  "The CDC's page shows 3 deaths in 2026, marked “subject to change”. The data file behind the page lists 5, and Pennsylvania’s health department reports at least five measles-associated deaths in its own outbreak. " +
  "This page follows the figure the CDC displays.";

// ─── Case timeline ───────────────────────────────────────────────────────────
// Deliberately empty. The weekly snapshots in toll.json supply the series, starting with the
// CDC's counts as of 29 October 2026 (the first week this site read them), and a curated row
// would override the snapshot of the same date (see mergeTimeline).
const casesTimeline: CaseDataPoint[] = [];

// ─── Region table ─────────────────────────────────────────────────────────────
// One national row, then the 11 jurisdictions with at least 100 confirmed cases in 2026 as
// sub-rows (excluded from the total, like DR Congo's provinces). The CDC publishes cases by
// jurisdiction (MeaslesCasesMap.json) but no deaths by state, so the Deaths column is blank
// for them. The 11 hold 4,131 of the 4,834 cases reported by jurisdictions; the other 36
// jurisdictions with cases hold 703. "New York" is New York State, which the CDC reports
// apart from New York City (7 cases). [name, iso, cases 2026, cases 2025], both as of 29 Oct.
const STATES: readonly [name: string, iso: string, cases2026: number, cases2025: number][] = [
  ["Pennsylvania", "US-PA", 1411, 16],
  ["South Carolina", "US-SC", 670, 333],
  ["Utah", "US-UT", 535, 189],
  ["Wisconsin", "US-WI", 323, 36],
  ["Kentucky", "US-KY", 200, 13],
  ["Ohio", "US-OH", 195, 40],
  ["Texas", "US-TX", 192, 803],
  ["Virginia", "US-VA", 179, 6],
  ["New York", "US-NY", 168, 26],
  ["Florida", "US-FL", 148, 8],
  ["Arizona", "US-AZ", 110, 222],
];

const PENNSYLVANIA_DETAIL =
  "The state with the most cases in 2026, and its largest measles outbreak in more than three decades. The outbreak began in the Lebanon County area in late April and had reached 44 counties by 23 October (Wikipedia, citing the Pennsylvania Department of Health, which publishes its own, more frequent counts). " +
  "Its death count has been publicly disputed.";

const stateRows: MonitoringEntry[] = STATES.map(([name, iso, c26, c25]) => ({
  country: name,
  flag: "🇺🇸",
  iso,
  parentIso: "US",
  confirmed: c26,
  deaths: 0,
  deathsUnreported: true,
  status: name === "Pennsylvania" ? "Epicentre" : "Cases reported",
  detail:
    `${c26.toLocaleString("en-US")} confirmed cases in 2026 on the CDC’s count as of 29 October (${c25.toLocaleString("en-US")} in all of 2025). ` +
    "The CDC publishes no deaths by state." +
    (name === "Pennsylvania" ? ` ${PENNSYLVANIA_DETAIL}` : ""),
  source: "CDC measles cases and outbreaks page, 29 Oct 2026 (cases by jurisdiction)",
  asOf: AS_OF,
}));

const monitoringData: MonitoringEntry[] = [
  {
    country: "United States",
    flag: "🇺🇸",
    iso: "US",
    confirmed: 4852,
    deaths: 3,
    status: "Active",
    detail:
      "4,852 confirmed cases in 2026 by 29 October: 4,834 reported by 47 jurisdictions and 18 among international visitors. That is more than twice the 2,289 confirmed in all of 2025, and 264 more than the week before. " +
      "511 people (11%) were hospitalized, 16% of children under 5 (130 of 812). 96% of cases were in people unvaccinated or of unknown vaccination status. " +
      "96% of cases are outbreak-associated: 3,282 with outbreaks that began in 2026 and 1,384 with outbreaks that began in 2025; the CDC counts 43 new outbreaks this year. " +
      `Deaths: ${DEATHS_SENTENCE} ` +
      "Kindergarten MMR coverage fell from 95.2% in 2019–20 to 92.4% in 2025–26, below the 95% that protects a community, and the CDC puts about 280,000 kindergartners at risk. " +
      "The CDC counts only confirmed cases reported by states by noon on Thursday, so state health departments’ own, more frequent counts run ahead of it.",
    source: `${CDC_SOURCE} (national totals, hospitalizations, outbreaks, deaths); Contagion Live, 30 Oct 2026 (week-on-week change)`,
    asOf: AS_OF,
  },
  ...stateRows,
];

// ─── Map: jurisdictions with 100+ cases ───────────────────────────────────────
// One marker per jurisdiction in the table, at the state's centre. They show where the
// cases are, not where the outbreaks started. No death-labelled bubbles: the CDC reports
// deaths nationally only, and a bubble would read as "0 deaths" in Pennsylvania.
const CENTRES: Record<string, readonly [lng: number, lat: number]> = {
  "US-PA": [-77.2, 41.0],
  "US-SC": [-80.9, 33.9],
  "US-UT": [-111.7, 39.3],
  "US-WI": [-89.8, 44.6],
  "US-KY": [-85.3, 37.5],
  "US-OH": [-82.8, 40.3],
  "US-TX": [-99.3, 31.5],
  "US-VA": [-78.5, 37.5],
  "US-NY": [-75.5, 42.9],
  "US-FL": [-82.4, 28.6],
  "US-AZ": [-111.7, 34.3],
};

const spreadStops: SpreadStop[] = STATES.map(([name, iso, c26, c25]) => ({
  name,
  location: "United States",
  coords: [...CENTRES[iso]] as [number, number],
  date: AS_OF,
  event: `${c26.toLocaleString("en-US")} confirmed cases in 2026 by 29 Oct (CDC); ${c25.toLocaleString("en-US")} in all of 2025.`,
}));

const caseLocations: CaseLocation[] = [];

// ─── Summary stats ────────────────────────────────────────────────────────────
// Measles has no contacts list at national level, so the "contacts" tile is relabelled to
// the response figure the CDC publishes: people hospitalized.
const summary: OutbreakSummary = {
  countriesAffected: 1,
  contactsUnderFollowUp: 511,
  contactsLabel: "Hospitalized",
  contactsNote: "11% of cases, to 29 Oct",
  deathsQualifier: "in the CDC’s count",
  spreadStatus: "Active · 43 new outbreaks reported in 2026",
  spreadNote:
    "CDC, 29 Oct 2026: cases in 47 jurisdictions, most in Pennsylvania (1,411), South Carolina (670) and Utah (535) · 96% of cases are linked to an outbreak",
  lastReviewed: "2026-11-02",
  source: "CDC measles cases and outbreaks page",
};

export const measlesUs2026: OutbreakDefinition = {
  slug: "measles-us-2026",
  disease: "Measles",
  pathogen: "Measles virus",
  status: "active",
  source: {
    kind: "official-report",
    ref: "the national measles cases and outbreaks page of the US Centers for Disease Control and Prevention (CDC)",
  },
  title: "US Measles Outbreaks 2026",
  seoTitle: "US Measles Tracker 2026: Cases, Deaths & Outbreak Map",
  searchLabel: "Measles tracker, United States",
  keywords: [
    "measles tracker",
    "us measles cases 2026",
    "measles cases by state",
    "measles outbreak map",
    "measles cases this year",
    "cdc measles cases",
    "measles deaths 2026",
    "pennsylvania measles outbreak",
  ],
  subtitle: "2026 United States · Measles virus · Unofficial surveillance dashboard",
  description:
    "Unofficial surveillance dashboard tracking measles in the United States in 2026, with the case and death counts read each week from the CDC’s national measles page. " +
    "As of 29 October 2026 the CDC counted 4,852 confirmed cases in 47 jurisdictions, more than twice all of 2025, and 43 new outbreaks. Pennsylvania has the most cases (1,411), followed by South Carolina and Utah. " +
    "Deaths: the headline is the figure the CDC’s page displays, marked subject to change while CDC reviews are completed; the data file behind the page lists more, and Pennsylvania reports deaths of its own. Both CDC figures are shown with every weekly reading.",
  links: [
    { label: "CDC measles cases", href: "https://www.cdc.gov/measles/data-research/index.html" },
    { label: "CDC measles", href: "https://www.cdc.gov/measles/index.html" },
    { label: "CDC about measles", href: "https://www.cdc.gov/measles/about/index.html" },
    { label: "CDC measles vaccines", href: "https://www.cdc.gov/measles/vaccines/index.html" },
    { label: "Wikipedia: Pennsylvania outbreak", href: "https://en.wikipedia.org/wiki/2026_Pennsylvania_measles_outbreak" },
    { label: "Wikipedia: US resurgence", href: "https://en.wikipedia.org/wiki/Measles_resurgence_in_the_United_States" },
  ],
  shortName: "2026 US measles outbreaks",
  places: "United States",
  countries: ["United States"],
  dataset: {
    name: "2026 measles outbreaks in the United States: weekly cumulative confirmed cases and deaths",
    description:
      "Weekly cumulative confirmed measles cases and deaths in the United States in 2026, each dated by the Thursday the CDC’s counts run to and tied to the archived CDC page and data files it was read from. The death figure is the one the CDC’s page displays.",
    isBasedOn: "https://www.cdc.gov/measles/data-research/index.html",
  },
  credit: "figures from the CDC’s weekly measles page",
  map: { stopsLabel: "State with 100+ cases (to 29 Oct)" },
  tableSources: "CDC · no deaths published by state",
  metrics: {
    serialInterval: null,
    rtNote:
      "Rt is not reported for measles: no serial interval with a verified mean and standard deviation has been sourced, and the CDC’s weekly total mixes many separate outbreaks counted by rash-onset year, so its growth is an unreliable guide to transmission.",
    caseToDeathDays: null,
    reportingCadence: "weekly",
  },
  casesTimeline,
  monitoringData,
  spreadStops,
  caseLocations,
  summary,
};
