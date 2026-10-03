import type {
  CaseDataPoint,
  CaseLocation,
  MonitoringEntry,
  OutbreakDefinition,
  OutbreakSummary,
  SpreadStop,
} from "./types";

// Archived record. This site began as a tracker of this outbreak and was
// retargeted to Ebola on 2026-10-02 (commit e8dad5f). The rows up to 6 May and the
// voyage are the hand-curated data as last tracked (commit 249b983); everything
// from 13 May on, the country table and the final figures were re-checked on
// 2026-10-03 against WHO (DON601, DON604, DON611), ECDC, RIVM and UKHSA, with the
// Wikipedia case table for per-country counts. Nothing here is fetched
// automatically: there is no toll.json, and data/outbreaks/hantavirus-mv-hondius-2026/live.json
// is the frozen news record rebuilt from git history.
//
// Final (WHO DON611, 2 July 2026; ECDC): declared over on 2 July 2026; 12 confirmed
// + 1 probable = 13 cases; 3 deaths (2 confirmed, 1 probable: a Dutch passenger who
// died on board untested). Limited person-to-person transmission was confirmed
// (WHO DON604, DON611). `suspected` below is WHO's "probable".

// ─── Case timeline ───────────────────────────────────────────────────────────
// Each row carries the source it was taken from. The early rows keep the note made
// when this was tracked live: intermediate counts are estimates based on known events.
const casesTimeline: CaseDataPoint[] = [
  {
    date: "2026-04-11",
    label: "Apr 11",
    confirmed: 1,
    suspected: 0,
    deaths: 1,
    note: "First death — Dutch male passenger (on board)",
    source: "Oceanwide Expeditions / AP",
  },
  {
    date: "2026-04-26",
    label: "Apr 26",
    confirmed: 2,
    suspected: 0,
    deaths: 2,
    note: "Second death — Dutch female (index case, had disembarked St. Helena Apr 21–24)",
    source: "WHO DON599 / AP",
  },
  {
    date: "2026-04-27",
    label: "Apr 27",
    confirmed: 2,
    suspected: 2,
    deaths: 2,
    note: "2 symptomatic passengers medevaced via Ascension Island (British national P003 + American partner PUSPAR01)",
    source: "Oceanwide Expeditions",
  },
  {
    date: "2026-05-02",
    label: "May 2",
    confirmed: 3,
    suspected: 2,
    deaths: 3,
    note: "Third death — German female. WHO formally notified.",
    source: "WHO DON599",
  },
  {
    date: "2026-05-06",
    label: "May 6",
    confirmed: 6,
    suspected: 3,
    deaths: 3,
    note: "3 more evacuated to Netherlands. Ship departs Cape Verde.",
    source: "AP / WHO",
  },
  {
    date: "2026-05-13",
    label: "May 13",
    confirmed: 8,
    suspected: 2,
    deaths: 3,
    note: "Plus 1 inconclusive case in the US, ruled out on 15 May",
    source: "WHO DON601 (13 May 2026)",
  },
  {
    date: "2026-05-18",
    label: "May 18",
    confirmed: 9,
    suspected: 2,
    deaths: 3,
    note: "Canada (BC) case confirmed by the national lab. This record first showed 10 confirmed + 1 probable here; it counted the US case later ruled out.",
    source: "RIVM hantavirus update; WHO DON604 (28 May 2026)",
  },
  {
    date: "2026-05-22",
    label: "May 22",
    confirmed: 10,
    suspected: 2,
    deaths: 3,
    note: "Crew member in quarantine in the Netherlands tests positive",
    source: "RIVM (22 May 2026); NBC News (22 May 2026)",
  },
  {
    date: "2026-05-25",
    label: "May 25",
    confirmed: 11,
    suspected: 2,
    deaths: 3,
    note: "Second case in Spain, asymptomatic, in quarantine in Madrid",
    source: "Spanish Ministry of Health via Euronews (25 May 2026); WHO DON604 (28 May 2026)",
  },
  {
    date: "2026-06-10",
    label: "Jun 10",
    confirmed: 12,
    suspected: 1,
    deaths: 3,
    note: "Probable case on Tristan da Cunha lab-confirmed by UKHSA",
    source: "UKHSA (10 June 2026); ECDC (17 June 2026)",
  },
  {
    date: "2026-07-02",
    label: "Jul 2",
    confirmed: 12,
    suspected: 1,
    deaths: 3,
    note: "Final figures. WHO: all contacts completed 42-day follow-up; outbreak no longer a public health risk.",
    source: "WHO DON611 (2 July 2026); ECDC",
  },
];

// ─── Country table ────────────────────────────────────────────────────────────
// Final counts by nationality, from the Wikipedia case table cross-checked with
// national sources (each row names them). Confirmed sums to 12 and deaths to 3,
// matching the final timeline row (tests/hantavirus-record.test.tsx checks it).
// Mid-May monitoring counts, which make up the "People monitored" figure, are
// kept in each row's detail.
const WIKI = "Wikipedia case table, cross-checked with";
const monitoringData: MonitoringEntry[] = [
  {
    country: "Netherlands",
    flag: "🇳🇱",
    iso: "NL",
    confirmed: 3,
    deaths: 2,
    status: "2 deaths",
    detail:
      "3 confirmed cases and 1 probable. Deaths: a Dutch passenger who died on board on 11 April without being tested (probable), and a Dutch woman who died on 26 April after disembarking at St. Helena. A crew member in quarantine in the Netherlands tested positive on 22 May. 8 Dutch guests + 5 Dutch crew were aboard (13 monitored in mid-May); 3 were evacuated to the Netherlands on 6 May. The ship reached Rotterdam on 18 May for full disinfection.",
    source: `${WIKI} RIVM, WHO DON604/DON611; WHO DON599 / Oceanwide Expeditions / Reuters (voyage)`,
    asOf: "2026-07-02",
  },
  {
    country: "United Kingdom",
    flag: "🇬🇧",
    iso: "GB",
    confirmed: 3,
    deaths: 0,
    status: "3 confirmed",
    detail:
      "Three British nationals confirmed, treated in South Africa, the Netherlands and on Tristan da Cunha (UKHSA). The Tristan da Cunha case, first counted as probable, was lab-confirmed by UKHSA on 10 June. A British passenger (P003) was medevaced with symptoms via Ascension Island on 27 April. 19 UK guests + 3 UK crew were aboard (22 monitored in mid-May).",
    source: `${WIKI} UKHSA (10 June 2026); Oceanwide Expeditions / CDC (May)`,
    asOf: "2026-06-10",
  },
  {
    country: "Spain",
    flag: "🇪🇸",
    iso: "ES",
    confirmed: 2,
    deaths: 0,
    status: "2 confirmed",
    detail:
      "Two Spanish cases. The second, reported on 25 May, was asymptomatic and in quarantine in Madrid.",
    source: `${WIKI} the Spanish Ministry of Health (25 May 2026)`,
    asOf: "2026-05-25",
  },
  {
    country: "Germany",
    flag: "🇩🇪",
    iso: "DE",
    confirmed: 1,
    deaths: 1,
    status: "1 death confirmed",
    detail:
      "German female death confirmed May 2 (on board). 5 German guests + 1 German crew aboard (5 monitored in mid-May). Spanish Air Force A310 transported patients to Madrid's Gómez Ulla Central Defense Hospital at Tenerife disembarkation.",
    source: `${WIKI} WHO DON599 / AP / Oceanwide Expeditions`,
    asOf: "2026-05-10",
  },
  {
    country: "Switzerland",
    flag: "🇨🇭",
    iso: "CH",
    confirmed: 1,
    deaths: 0,
    status: "1 confirmed",
    detail: "One Swiss case, positive on 5–6 May.",
    source: `${WIKI} national sources`,
    asOf: "2026-05-06",
  },
  {
    country: "France",
    flag: "🇫🇷",
    iso: "FR",
    confirmed: 1,
    deaths: 0,
    status: "Recovered",
    detail:
      "One French case, critically ill in Paris and discharged on 6 August (Le Monde, via Wikipedia). In mid-May all 26 close contacts had tested negative (French Health Minister Stéphanie Rist).",
    source: `${WIKI} Le Monde; French Health Minister Stéphanie Rist via X/Twitter (May)`,
    asOf: "2026-08-06",
  },
  {
    country: "Canada",
    flag: "🇨🇦",
    iso: "CA",
    confirmed: 1,
    deaths: 0,
    status: "Recovered",
    detail:
      "Canadian case confirmed May 18 (British Columbia); recovered by 9 June. 4 Canadian guests were aboard MV Hondius (4 monitored in mid-May). BC Provincial Health Officer Dr. Bonnie Henry: 'Clearly, this is not what we hoped for, but it is what we planned for.'",
    source: `${WIKI} PHAC / CBC / BBC (May 16–18 2026) and Global News (9 June 2026)`,
    asOf: "2026-06-09",
  },
  {
    country: "United States",
    flag: "🇺🇸",
    iso: "US",
    confirmed: 0,
    deaths: 0,
    status: "No cases",
    detail:
      "No confirmed cases. A case reported as inconclusive was ruled out on 15 May (WHO DON601). CDC ended its response on 24 June 2026. In mid-May 41 people were monitored and 18 quarantined: 16 at UNMC quarantine unit (incl. Dr. Kornfeld, moved from biocontainment after subsequent negative tests) · 2 at Emory (Atlanta) · 7 St. Helena returnees (state monitoring) · 16 Apr 25 Johannesburg flight contacts. 10 states: AZ, CA, GA, KS, MD, MN, NJ, TX, VA, WA.",
    source: `${WIKI} WHO DON601; Al Jazeera (24 June 2026); CDC press conference / Yahoo News (May)`,
    asOf: "2026-06-24",
  },
  {
    country: "Italy",
    flag: "🇮🇹",
    iso: "IT",
    confirmed: 0,
    deaths: 0,
    monitored: 4,
    quarantined: 4,
    status: "No cases",
    detail:
      "4 Italians monitored — KLM flight contacts of deceased Dutch woman. 1 young man (Calabria) developed symptoms May 13; samples sent to Lazzaro Spallanzani National Institute, Rome. 42-day quarantine + daily monitoring. Italian Health Ministry: 'maximum precaution' protocol. Not among the 13 cases in WHO's final count (DON611, 2 July 2026).",
    source: "Italian Health Ministry / AP, May 13 2026; WHO DON611 (2 July 2026)",
    asOf: "2026-07-02",
  },
];

// ─── Ship voyage stops ────────────────────────────────────────────────────────
// The route of voyage HDS2526, in order; the map joins them into a line.
const spreadStops: SpreadStop[] = [
  {
    name: "Ushuaia",
    location: "Argentina",
    coords: [-68.303, -54.802],
    date: "2026-04-01",
    event: "Departed. Index couple believed infected here during wildlife excursion.",
  },
  {
    name: "South Georgia Island",
    location: "British Overseas Territory",
    coords: [-36.5, -54.283],
    date: "2026-04-04",
    event: "Stop Apr 4–7",
  },
  {
    name: "Tristan da Cunha",
    location: "British Overseas Territory",
    coords: [-12.278, -37.105],
    date: "2026-04-13",
    event: "Stop Apr 13–16. 6 island guests embark.",
  },
  {
    name: "Gough Island",
    location: "British Overseas Territory",
    coords: [-9.883, -40.35],
    date: "2026-04-17",
    event: "Stop Apr 17",
  },
  {
    name: "St. Helena",
    location: "British Overseas Territory",
    coords: [-5.709, -15.965],
    date: "2026-04-21",
    event: "Stop Apr 21–24. Dutch index couple (P002/PEDB43) disembark with 32 others.",
  },
  {
    name: "Ascension Island",
    location: "British Overseas Territory",
    coords: [-14.356, -7.947],
    date: "2026-04-27",
    event: "British national (P003) and American partner medevaced.",
  },
  {
    name: "Praia",
    location: "Cape Verde",
    coords: [-23.514, 14.932],
    date: "2026-05-04",
    event: "Original voyage end. Ship detained by authorities.",
  },
  {
    name: "Tenerife",
    location: "Canary Islands, Spain",
    coords: [-16.629, 28.292],
    date: "2026-05-10",
    event:
      "Docked. Disembarkation underway. French medical charter + Spanish Air Force A310 evacuate patients.",
  },
  {
    name: "Rotterdam",
    location: "Netherlands",
    coords: [4.479, 51.923],
    date: "2026-05-18",
    event: "Ship arrives ~10:30 CET. Full disinfection underway. 26 crew + captain aboard.",
  },
];

// ─── Map markers ──────────────────────────────────────────────────────────────
// Case markers match the country table; the US and Italy keep monitoring markers.
const caseLocations: CaseLocation[] = [
  {
    country: "Argentina (Origin)",
    flag: "🇦🇷",
    coords: [-65.0, -35.0],
    confirmed: 0,
    deaths: 0,
    type: "origin",
    asOf: "2026-04-01",
  },
  { country: "Netherlands", flag: "🇳🇱", coords: [4.9, 52.37], confirmed: 3, deaths: 2, type: "case", asOf: "2026-07-02" },
  { country: "United Kingdom", flag: "🇬🇧", coords: [-1.177, 52.374], confirmed: 3, deaths: 0, type: "case", asOf: "2026-06-10" },
  { country: "Spain", flag: "🇪🇸", coords: [-3.703, 40.417], confirmed: 2, deaths: 0, type: "case", asOf: "2026-05-25" },
  { country: "Germany", flag: "🇩🇪", coords: [10.45, 51.165], confirmed: 1, deaths: 1, type: "case", asOf: "2026-05-10" },
  { country: "Switzerland", flag: "🇨🇭", coords: [8.227, 46.818], confirmed: 1, deaths: 0, type: "case", asOf: "2026-05-06" },
  { country: "France", flag: "🇫🇷", coords: [2.352, 48.857], confirmed: 1, deaths: 0, type: "case", asOf: "2026-08-06" },
  { country: "Canada", flag: "🇨🇦", coords: [-96.0, 56.0], confirmed: 1, deaths: 0, type: "case", asOf: "2026-06-09" },
  { country: "United States", flag: "🇺🇸", coords: [-98.0, 39.0], confirmed: 0, deaths: 0, type: "monitoring", asOf: "2026-06-24" },
  {
    country: "Italy",
    flag: "🇮🇹",
    coords: [12.567, 41.872],
    confirmed: 0,
    deaths: 0,
    monitored: 4,
    type: "monitoring",
    asOf: "2026-05-13",
  },
];

// ─── Summary stats ────────────────────────────────────────────────────────────
// Vessel, operator, voyage and status live in the spread text. "People monitored"
// is the mid-May total across the seven countries then reporting (US 41, France 26,
// Italy 4, Canada 4, Netherlands 13, Germany 5, UK 22), as in each row's detail.
const summary: OutbreakSummary = {
  countriesAffected: 7,
  contactsUnderFollowUp: 41 + 26 + 4 + 4 + 13 + 5 + 22,
  contactsLabel: "People monitored",
  contactsNote: "passengers, crew & contacts, mid-May",
  spreadStatus: "Declared over by WHO, 2 July 2026",
  // One of the 3 deaths is a probable case, so WHO's 23% divides by all 13 cases.
  fatalityBasis: "all-cases",
  spreadNote: "MV Hondius · Oceanwide Expeditions voyage HDS2526 · 7 countries",
  // Date this record was last checked against its sources (not the last data date).
  lastReviewed: "2026-10-03",
  source: "WHO DON599/601/604/611 / ECDC / RIVM / UKHSA / PHAC / Wikipedia / AP",
};

export const hantavirusMvHondius2026: OutbreakDefinition = {
  slug: "hantavirus-mv-hondius-2026",
  disease: "Hantavirus",
  pathogen: "Andes virus",
  status: "over",
  source: { kind: "manual", ref: "Hand-curated from WHO DON599–DON611, ECDC, RIVM, UKHSA, PHAC (2026)" },
  title: "Hantavirus Outbreak 2026",
  seoTitle: "Hantavirus Outbreak 2026: MV Hondius Cruise Ship Cases & Deaths",
  keywords: [
    "hantavirus outbreak 2026",
    "hantavirus cruise ship",
    "MV Hondius hantavirus",
    "Andes virus",
    "hantavirus deaths",
    "hantavirus cases",
    "Oceanwide Expeditions hantavirus",
  ],
  subtitle: "2026 · MV Hondius cruise ship · Andes virus · Declared over by WHO on 2 July 2026",
  description:
    "Archived record of the 2026 Andes hantavirus outbreak on the expedition cruise ship MV Hondius. WHO declared it over on 2 July 2026: 13 cases (12 confirmed, 1 probable) and 3 deaths, with limited person-to-person transmission. Hand-curated from WHO, ECDC, national health agencies and news reports.",
  links: [
    { label: "WHO DON611", href: "https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON611" },
    { label: "WHO DON604", href: "https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON604" },
    {
      label: "ECDC",
      href: "https://www.ecdc.europa.eu/en/infectious-disease-topics/hantavirus-infection/surveillance-and-updates/andes-hantavirus-outbreak",
    },
    { label: "UKHSA", href: "https://www.gov.uk/government/news/ukhsa-update-on-the-hantavirus-cruise-ship-outbreak" },
    { label: "RIVM", href: "https://www.rivm.nl/hantavirus/actueel" },
    { label: "Wikipedia", href: "https://en.wikipedia.org/wiki/MV_Hondius_hantavirus_outbreak" },
  ],
  shortName: "2026 MV Hondius hantavirus outbreak",
  places: "South Atlantic, Europe, Canada",
  countries: ["Netherlands", "United Kingdom", "Spain", "Germany", "Switzerland", "France", "Canada"],
  dataset: {
    name: "2026 MV Hondius hantavirus outbreak: cumulative cases and deaths",
    description:
      "Hand-curated cumulative confirmed cases, probable cases and deaths for the 2026 Andes hantavirus outbreak on the cruise ship MV Hondius, 11 April to 2 July 2026, each point tied to the source it was taken from.",
    isBasedOn: "https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON611",
  },
  credit: "hand-curated from WHO, ECDC and national health agencies",
  map: { route: true, stopsLabel: "Voyage stop" },
  tableSources: "WHO · ECDC · RIVM · UKHSA · Wikipedia case table",
  corrections: [
    {
      date: "2026-10-03",
      note: "figures shown in May counted a US case later ruled out and missed cases in France, Switzerland and Spain.",
    },
  ],
  casesTimeline,
  monitoringData,
  spreadStops,
  caseLocations,
  summary,
};
