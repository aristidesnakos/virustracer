import type {
  CaseDataPoint,
  CaseLocation,
  MonitoringEntry,
  OutbreakDefinition,
  OutbreakSummary,
  SpreadStop,
} from "./types";

// Live outbreak. Headline totals are read automatically once a week from the West Nile
// virus report of Greece's National Public Health Organisation (EODY, in English NPHO)
// into data/outbreaks/west-nile-greece-2026/toll.json, by .github/workflows/update-west-nile.yml.
// Everything below is hand-maintained and was checked against the report of
// 1 October 2026 on 2026-10-07.
//
// What the figures count: laboratory-diagnosed cases of West Nile virus infection acquired
// in Greece this season ("locally acquired"), and deaths among them attributed to the
// virus. EODY lists separately, and excludes from its total, deaths of infected patients
// attributed to another cause (one as of 1 October). Imported cases are not counted.
//
// West Nile virus passes from birds to people through mosquito bites, not from person to
// person. Transmission in Greece runs from about July to November; the first case of 2026
// fell ill on 25 June. EODY notes that about 140 people are infected for each case with
// neuroinvasive disease, most without symptoms, so the counts are the visible fraction.

// ─── Case timeline ───────────────────────────────────────────────────────────
// Deliberately empty. The weekly snapshots in toll.json (backfilled from every report
// since 15 July; the 12 August report was not found) supply the series, and a curated
// row would override the snapshot of the same date (see mergeTimeline).
const casesTimeline: CaseDataPoint[] = [];

// ─── Country table ────────────────────────────────────────────────────────────
// One national row: EODY reports deaths nationally only, so per-region rows would show
// cases with no deaths figure. The regional breakdown (EODY Table 3, summed by region
// from the municipality rows, 1 Oct 2026) is in `detail` and on the map.
const monitoringData: MonitoringEntry[] = [
  {
    country: "Greece",
    flag: "🇬🇷",
    iso: "GR",
    confirmed: 423,
    deaths: 41,
    status: "Active",
    detail:
      "423 laboratory-diagnosed locally acquired cases by 1 October 2026, 271 of them with neuroinvasive disease (encephalitis, meningitis or acute flaccid paralysis); 27 were reported in the last week. " +
      "41 deaths, all in patients over 60 (median age 83). " +
      "On 1 October 52 patients were in hospital, 16 of them in intensive care, and 295 had been discharged. " +
      "Cases by region of probable exposure: Attica 214, Central Macedonia 98, Thessaly 92, Crete 6, Eastern Macedonia and Thrace 6, Central Greece 3, Peloponnese 1, Ionian Islands 1, Attica or South Aegean 1, under investigation 1. " +
      "Larissa (42 cases) and Spata-Artemida in East Attica (21) are the municipalities with the most.",
    source: "EODY weekly West Nile virus report, 1 Oct 2026 (Tables 1 to 3)",
    asOf: "2026-10-01",
  },
];

// ─── Map: regions with cases ──────────────────────────────────────────────────
// One marker per region (periphery) with cases, carrying the region's count from the
// 1 October report and naming the regional units where its cases were. A region whose
// cases were all in one place is marked there; the others at the regional capital.
// Not first-detection sites: EODY does not date the first case by region. Cases in
// "Attica or South Aegean" (1) and under investigation (1) have no marker.
const REPORT_DATE = "2026-10-01";
const REGIONS: readonly [name: string, where: string, lng: number, lat: number, cases: number, neuro: number][] = [
  ["Attica", "all four Athens sectors, East and West Attica, Piraeus", 23.73, 37.98, 214, 169],
  ["Central Macedonia", "Imathia, Pella, Thessaloniki, Pieria, Serres, Kilkis, Chalkidiki", 22.94, 40.64, 98, 43],
  ["Thessaly", "Larissa, Karditsa, Trikala", 22.42, 39.64, 92, 44],
  ["Crete", "Heraklion, Rethymno", 25.13, 35.34, 6, 6],
  ["Eastern Macedonia and Thrace", "Rhodope, Evros", 25.4, 41.12, 6, 3],
  ["Central Greece", "Boeotia (Thebes), Euboea (Chalkida)", 23.6, 38.46, 3, 3],
  ["Peloponnese", "Laconia (Evrotas)", 22.66, 36.85, 1, 0],
  ["Ionian Islands", "Lefkada", 20.71, 38.83, 1, 1],
];

const spreadStops: SpreadStop[] = REGIONS.map(([name, where, lng, lat, cases, neuro]) => ({
  name,
  location: `${where}, Greece`,
  coords: [lng, lat],
  date: REPORT_DATE,
  event: `${cases} case${cases === 1 ? "" : "s"} by 1 Oct 2026, ${neuro} with neuroinvasive disease (EODY weekly report).`,
}));

// ─── Map markers ──────────────────────────────────────────────────────────────
// None: the map's bubbles are labelled with deaths, which EODY does not report by region.
const caseLocations: CaseLocation[] = [];

// ─── Summary stats ────────────────────────────────────────────────────────────
// West Nile virus has no person-to-person spread, so there are no contacts to follow.
// The "contacts" tile is relabelled to the clinically important count EODY reports:
// cases with neuroinvasive disease.
const summary: OutbreakSummary = {
  countriesAffected: 1,
  contactsUnderFollowUp: 271,
  contactsLabel: "Neuroinvasive cases",
  contactsNote: "encephalitis, meningitis or paralysis, to 1 Oct",
  spreadStatus: "Active · 27 new cases in the week to 1 Oct",
  spreadNote:
    "EODY, 1 Oct 2026: cases in 8 of 13 regions, most in Attica (214), Central Macedonia (98) and Thessaly (92) · 52 in hospital, 16 in intensive care",
  lastReviewed: "2026-10-07",
  source: "EODY weekly West Nile virus report",
};

export const westNileGreece2026: OutbreakDefinition = {
  slug: "west-nile-greece-2026",
  disease: "West Nile virus",
  pathogen: "West Nile virus",
  status: "active",
  source: {
    kind: "official-report",
    ref: "the weekly West Nile virus report of Greece's National Public Health Organisation (EODY)",
  },
  title: "Greece West Nile Virus Outbreak 2026",
  seoTitle: "West Nile Virus Greece 2026: Cases, Deaths & Map",
  keywords: [
    "west nile virus greece",
    "west nile virus greece 2026",
    "west nile greece cases",
    "west nile virus deaths greece",
    "west nile virus attica",
    "ιός του δυτικού νείλου",
    "west nile virus outbreak tracker",
  ],
  subtitle: "2026 Greece · West Nile virus · Unofficial surveillance dashboard",
  description:
    "Unofficial surveillance dashboard tracking the 2026 West Nile virus season in Greece, with the case and death counts read each week from the report of the National Public Health Organisation (EODY). " +
    "As of 1 October 2026 EODY counted 423 laboratory-diagnosed locally acquired cases, 271 of them with neuroinvasive disease (encephalitis, meningitis or paralysis), and 41 deaths. " +
    "Attica has the most cases, followed by Central Macedonia and Thessaly.",
  links: [
    {
      label: "EODY weekly report",
      href: "https://eody.gov.gr/el/anakoinoseis/ebdomadiaia-ekthese-epitereses-tes-loimoxes-apo-io-tou-dytikou-neilou-01-10-2030.html",
    },
    {
      label: "EODY: West Nile virus",
      href: "https://eody.gov.gr/el/nosimata/metadotika/nosimata-kai-themata-ygeias/ios-dytikou-neilou.html",
    },
    { label: "ECDC weekly update", href: "https://wnv-weekly.ecdc.europa.eu/" },
    { label: "WHO fact sheet", href: "https://www.who.int/news-room/fact-sheets/detail/west-nile-virus" },
  ],
  shortName: "2026 West Nile virus season in Greece",
  places: "Greece",
  countries: ["Greece"],
  dataset: {
    name: "2026 West Nile virus season in Greece: weekly cumulative cases and deaths",
    description:
      "Weekly cumulative laboratory-diagnosed locally acquired West Nile virus cases and deaths in Greece in 2026, each dated by the day the report's totals run to and tied to the EODY report it was read from.",
    isBasedOn: "https://eody.gov.gr/el/nosimata/metadotika/nosimata-kai-themata-ygeias/ios-dytikou-neilou.html",
  },
  credit: "figures from EODY's weekly report",
  map: { center: [23.4, 38.6], zoom: 5.4, stopsLabel: "Region with cases (to 1 Oct)" },
  tableSources: "EODY weekly West Nile virus report",
  metrics: {
    serialInterval: null,
    rtNote:
      "Rt is not reported for West Nile virus: it passes from birds to people through mosquitoes, not from person to person, so there is no serial interval between human cases.",
    rtShortNote: "it does not spread from person to person",
    caseToDeathDays: null,
    reportingCadence: "weekly",
  },
  casesTimeline,
  monitoringData,
  spreadStops,
  caseLocations,
  summary,
};
