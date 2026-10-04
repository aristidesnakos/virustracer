import type {
  CaseDataPoint,
  CaseLocation,
  MonitoringEntry,
  OutbreakDefinition,
  OutbreakSummary,
  SpreadStop,
} from "./types";

// Live outbreak, headline totals fetched automatically from the Wikipedia article's
// infobox (data/outbreaks/measles-bangladesh-2026/toll.json). Everything below is
// hand-maintained and was checked on 2026-10-03.
//
// Two death counts exist and they are not the same thing. Bangladesh's DGHS reports
// deaths among laboratory-CONFIRMED cases and, separately, deaths among SUSPECTED cases
// (children who died with measles symptoms, untested). The Wikipedia infobox gives both
// (confirmed: 100, all cases: 1,009). By decision, the headline `deaths` of this outbreak
// (the auto-tracked series, stat strip, table) is deaths among confirmed cases, as for
// Ebola. The further 909 deaths among suspected cases are real and are stated beside it
// everywhere a hand-written field allows (description, summary, the table row).
//
// Latest reading in the infobox: DGHS, 10 Sep 2026 (The Business Standard, 10 Sep 2026):
// 19,933 confirmed and 168,745 suspected cases; 100 deaths among confirmed cases and 909
// among suspected cases, 1,009 in all. DT Next reported newer DGHS totals on 3 Oct 2026
// (21,623 confirmed, 194,084 suspected, 102 + 1,012 = 1,114 deaths); the infobox lags, so
// the figures here move only when Wikipedia does.

const DEATHS_SENTENCE =
  "100 deaths among confirmed cases; DGHS counts 909 more among suspected cases (1,009 in all), as of 10 September 2026.";

// ─── Case timeline ───────────────────────────────────────────────────────────
// Deliberately empty. The daily snapshots in toll.json supply the series, and a
// curated row would override the snapshot of the same date (see mergeTimeline).
const casesTimeline: CaseDataPoint[] = [];

// ─── Country table ────────────────────────────────────────────────────────────
// One national row. Per-division confirmed and death counts were not found in a
// source that reports them consistently with the national confirmed-death definition
// (the division breakdowns in the press mix confirmed and suspected deaths), so no
// division rows are listed. `confirmed` and `deaths` are kept equal to the latest
// infobox reading (10 Sep 2026) and are hand-maintained: update them with `asOf`.
const monitoringData: MonitoringEntry[] = [
  {
    country: "Bangladesh",
    flag: "🇧🇩",
    iso: "BD",
    confirmed: 19933,
    deaths: 100,
    status: "Active",
    detail:
      `${DEATHS_SENTENCE} ` +
      "168,745 suspected cases have been recorded alongside the 19,933 laboratory-confirmed ones since 15 March. " +
      "The Deaths figure on this page counts only the 100 among confirmed cases. " +
      "DGHS figures reported by DT Next on 3 October 2026 are higher (21,623 confirmed cases; 102 confirmed deaths and 1,012 among suspected cases, 1,114 in all); " +
      "this page follows the Wikipedia infobox, which is updated later than DGHS. " +
      "Cases were reported in 58 of 64 districts by 14 April (WHO DON598) and in all 64 by 25 June (UN ICCG). " +
      "An emergency measles-rubella vaccination campaign for children aged 6 to 59 months began on 5 April and went nationwide on 20 April.",
    source:
      "DGHS Bangladesh via The Business Standard (10 Sep 2026) and the Wikipedia infobox; DT Next (3 Oct 2026); WHO DON598 (23 Apr 2026); UN Bangladesh ICCG situation report 5 (25 Jun 2026)",
    asOf: "2026-09-10",
  },
];

// ─── Map: early hotspots ──────────────────────────────────────────────────────
// Sub-districts and districts designated outbreak hotspots in the Ministry of Health
// and Family Welfare's assessment to 4 April 2026, as drawn on the Wikipedia article's
// map (names and coordinates are from its infobox). They show where the outbreak was
// first recognised, not where it is now: by 25 June all 64 districts had cases.
// No per-place case counts are sourced, so there are no case bubbles.
const HOTSPOT_DATE = "2026-04-04";
const HOTSPOT_EVENT =
  "Named an outbreak hotspot in the Ministry of Health's assessment to 4 April 2026 (location from the Wikipedia article's map).";
const HOTSPOTS: readonly [name: string, lng: number, lat: number][] = [
  ["Sreenagar", 90.26, 23.54],
  ["Zanjira", 90.33, 23.34],
  ["Nalchity", 90.27, 22.62],
  ["Bera", 89.61, 24.06],
  ["Munshiganj", 90.52, 23.54],
  ["Nawabganj (Dhaka)", 90.16, 23.66],
  ["Bakerganj", 90.33, 22.54],
  ["Madaripur", 90.19, 23.16],
  ["Tarakanda", 90.45, 24.86],
  ["Haimchar", 90.63, 23.06],
  ["Ramu", 92.1, 21.45],
  ["Louhajang", 90.34, 23.46],
  ["Bholahat", 88.2, 24.9],
  ["Natore", 88.98, 24.41],
  ["Jessore", 89.21, 23.17],
  ["Shibganj (Chapai Nawabganj)", 88.16, 24.68],
  ["Porsha", 88.49, 25.01],
  ["Mehendiganj", 90.52, 22.82],
  ["Godagari", 88.35, 24.47],
  ["Barguna", 90.13, 22.15],
  ["Atghoria", 89.25, 24.13],
  ["Chandpur", 90.66, 23.23],
  ["Moheshkhali", 91.92, 21.58],
  ["Gazipur", 90.42, 23.99],
  ["Chapai Nawabganj", 88.27, 24.59],
  ["Ishwardi", 89.06, 24.12],
  ["Atpara", 90.77, 24.85],
  ["Mymensingh", 90.41, 24.75],
  ["Trishal", 90.39, 24.58],
  ["Pabna", 89.24, 24.01],
];

const spreadStops: SpreadStop[] = HOTSPOTS.map(([name, lng, lat]) => ({
  name,
  location: "Bangladesh",
  coords: [lng, lat],
  date: HOTSPOT_DATE,
  event: HOTSPOT_EVENT,
}));

// ─── Map markers ──────────────────────────────────────────────────────────────
// None. A single national bubble would show only the 100 deaths among confirmed
// cases and hide the 909 among suspected ones, and no per-place counts are sourced.
const caseLocations: CaseLocation[] = [];

// ─── Summary stats ────────────────────────────────────────────────────────────
// The stat strip's "contacts" tile is relabelled to the one response figure with an
// official source: children vaccinated in the emergency measles-rubella campaign
// (UN Bangladesh Inter-Cluster Coordination Group situation report 5, 25 June 2026:
// "more than 18.4 million", against a target of 18 million). Al Jazeera (14 Sep 2026)
// cites 19.75 million; that is a news figure and not used.
const summary: OutbreakSummary = {
  countriesAffected: 1,
  contactsUnderFollowUp: 18_400_000,
  contactsLabel: "Children vaccinated",
  contactsNote: "measles-rubella campaign, more than 18.4M by 25 Jun",
  deathsQualifier: "among confirmed cases",
  spreadStatus: "Active · 909 more deaths among suspected cases",
  spreadNote:
    "DGHS, 10 Sep 2026: 1,009 deaths in all, 100 among confirmed cases (the Deaths figure) and 909 among suspected cases · 64 of 64 districts (UN, 25 Jun)",
  lastReviewed: "2026-10-03",
  source: "DGHS Bangladesh / WHO DON598 / UN Bangladesh ICCG / Wikipedia",
};

export const measlesBangladesh2026: OutbreakDefinition = {
  slug: "measles-bangladesh-2026",
  disease: "Measles",
  pathogen: "Measles virus",
  status: "active",
  source: { kind: "wikipedia-infobox", ref: "2026_Bangladesh_measles_outbreak" },
  title: "Bangladesh Measles Outbreak 2026",
  seoTitle: "Measles Outbreak Bangladesh 2026: Cases, Deaths & Map",
  keywords: [
    "bangladesh measles outbreak",
    "measles outbreak 2026",
    "bangladesh measles deaths",
    "bangladesh measles cases",
    "measles death toll bangladesh",
    "measles vaccination campaign bangladesh",
    "measles outbreak tracker",
  ],
  subtitle: "2026 Bangladesh · Measles virus · Unofficial surveillance dashboard",
  description:
    "Unofficial surveillance dashboard tracking the 2026 measles outbreak in Bangladesh, with the confirmed-case and death counts read from Wikipedia's article on it. " +
    "As of 10 September 2026 the Directorate General of Health Services (DGHS) counted 19,933 confirmed and 168,745 suspected cases. " +
    "Deaths: 100 among confirmed cases; DGHS counts 909 more among suspected cases (1,009 in all). " +
    "The headline death figure here is the 100 among confirmed cases.",
  links: [
    { label: "DGHS", href: "https://dghs.gov.bd" },
    { label: "WHO DON598", href: "https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON598" },
    {
      label: "UN situation report",
      href: "https://bangladesh.un.org/sites/default/files/2026-07/SitRep_ICCG_MeaslesOutbreak_25%20June26.pdf",
    },
    { label: "UNICEF Bangladesh", href: "https://www.unicef.org/bangladesh" },
    { label: "ReliefWeb", href: "https://reliefweb.int/disaster/ep-2026-000048-bgd" },
    { label: "Wikipedia", href: "https://en.wikipedia.org/wiki/2026_Bangladesh_measles_outbreak" },
  ],
  shortName: "2026 Bangladesh measles outbreak",
  places: "Bangladesh",
  countries: ["Bangladesh"],
  dataset: {
    name: "2026 Bangladesh measles outbreak: daily cumulative confirmed cases, suspected cases and deaths",
    description:
      "Daily cumulative confirmed cases, suspected cases and deaths among confirmed cases for the 2026 measles outbreak in Bangladesh, each tied to the Wikipedia revision it was read from. Deaths among suspected cases are not part of the series.",
    isBasedOn: "https://en.wikipedia.org/wiki/2026_Bangladesh_measles_outbreak",
  },
  credit: "figures from DGHS Bangladesh via Wikipedia",
  chartReference: { date: "2026-04-05", label: "MR vaccination begins" },
  map: { center: [90.3, 23.7], zoom: 6, stopsLabel: "Early hotspot (to 4 Apr)" },
  tableSources: "DGHS Bangladesh · WHO · UN Bangladesh",
  metrics: {
    serialInterval: null,
    rtNote:
      "Rt is not reported for measles: no serial interval with a verified mean and standard deviation has been sourced, and lab-confirmed counts here depend on testing capacity, so their growth is an unreliable guide to transmission.",
    caseToDeathDays: null,
  },
  casesTimeline,
  monitoringData,
  spreadStops,
  caseLocations,
  summary,
};
