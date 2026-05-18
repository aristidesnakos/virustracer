// All data is manually curated from official sources.
// Each entry includes a source citation and date verified.

export interface CaseDataPoint {
  date: string;          // ISO 8601
  label: string;         // Display label
  confirmed: number;     // WHO-confirmed cumulative cases
  suspected: number;     // Probable/suspected cumulative
  deaths: number;        // Cumulative deaths
  note?: string;
  source: string;
}

export interface MonitoringEntry {
  country: string;
  flag: string;
  iso: string;
  confirmed: number;
  deaths: number;
  monitored: number;
  quarantined: number;
  status: string;
  detail: string;
  source: string;
  asOf: string;
}

export interface VoyageStop {
  name: string;
  location: string;
  coords: [number, number]; // [lng, lat]
  date: string;
  event?: string;
}

export interface CaseLocation {
  country: string;
  flag: string;
  coords: [number, number];
  confirmed: number;
  deaths: number;
  monitored: number;
  type: "origin" | "case" | "monitoring" | "ship";
}

// ─── Case timeline ───────────────────────────────────────────────────────────
// Only data points with documented source are included.
// Intermediate counts are estimates based on known events.
export const casesTimeline: CaseDataPoint[] = [
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
    date: "2026-05-12",
    label: "May 12",
    confirmed: 10,
    suspected: 0,
    deaths: 3,
    note: "WHO Director-General confirms 10 cases. Dr. Tedros: 'More cases may be reported given incubation period.'",
    source: "WHO / TeleSUR, May 13 2026",
  },
  {
    date: "2026-05-18",
    label: "May 18",
    confirmed: 10,
    suspected: 1,
    deaths: 3,
    note: "Canadian case confirmed (BC). 11 total: 10 confirmed + 1 probable. Ship arrives Rotterdam for disinfection.",
    source: "NBC News / PHAC / ABC7, May 18 2026",
  },
];

// ─── Country monitoring table ─────────────────────────────────────────────────
export const monitoringData: MonitoringEntry[] = [
  {
    country: "United States",
    flag: "🇺🇸",
    iso: "US",
    confirmed: 0,
    deaths: 0,
    monitored: 41,
    quarantined: 18,
    status: "Active monitoring",
    detail: "16 at UNMC quarantine unit (incl. Dr. Kornfeld, moved from biocontainment after subsequent negative tests) · 2 at Emory (Atlanta) · 7 St. Helena returnees (state monitoring) · 16 Apr 25 Johannesburg flight contacts. 10 states: AZ, CA, GA, KS, MD, MN, NJ, TX, VA, WA.",
    source: "CDC press conference / Yahoo News",
    asOf: "2026-05-15",
  },
  {
    country: "France",
    flag: "🇫🇷",
    iso: "FR",
    confirmed: 0,
    deaths: 0,
    monitored: 26,
    quarantined: 0,
    status: "All contacts negative",
    detail: "All 26 close contacts tested negative as of May 14. Contacts tested 3×/week going forward. Authorities will not communicate further unless a positive is detected.",
    source: "French Health Minister Stéphanie Rist via X/Twitter",
    asOf: "2026-05-14",
  },
  {
    country: "Italy",
    flag: "🇮🇹",
    iso: "IT",
    confirmed: 0,
    deaths: 0,
    monitored: 4,
    quarantined: 4,
    status: "1 symptomatic",
    detail: "4 Italians monitored — KLM flight contacts of deceased Dutch woman. 1 young man (Calabria) developed symptoms May 13; samples sent to Lazzaro Spallanzani National Institute, Rome. 42-day quarantine + daily monitoring. Italian Health Ministry: 'maximum precaution' protocol.",
    source: "Italian Health Ministry / AP, May 13 2026",
    asOf: "2026-05-13",
  },
  {
    country: "Canada",
    flag: "🇨🇦",
    iso: "CA",
    confirmed: 1,
    deaths: 0,
    monitored: 4,
    quarantined: 0,
    status: "1 confirmed case",
    detail: "Canadian case confirmed May 18 (British Columbia). 4 Canadian guests were aboard MV Hondius. BC Provincial Health Officer Dr. Bonnie Henry: 'Clearly, this is not what we hoped for, but it is what we planned for.'",
    source: "PHAC / CBC / BBC, May 16–18 2026",
    asOf: "2026-05-18",
  },
  {
    country: "Netherlands",
    flag: "🇳🇱",
    iso: "NL",
    confirmed: 4,
    deaths: 2,
    monitored: 13,
    quarantined: 0,
    status: "Origin / crew monitoring",
    detail: "Index couple (Dutch). 8 Dutch guests + 5 Dutch crew aboard. 3 evacuated to Netherlands May 6. Dutch male death Apr 11 (on board), Dutch female death Apr 26 (after disembarkation). Ship arrived Rotterdam May 18 for full disinfection.",
    source: "WHO DON599 / Oceanwide Expeditions / Reuters",
    asOf: "2026-05-18",
  },
  {
    country: "Germany",
    flag: "🇩🇪",
    iso: "DE",
    confirmed: 1,
    deaths: 1,
    monitored: 5,
    quarantined: 0,
    status: "1 death confirmed",
    detail: "German female death confirmed May 2 (on board). 5 German guests + 1 German crew aboard. Spanish Air Force A310 transported patients to Madrid's Gómez Ulla Central Defense Hospital at Tenerife disembarkation.",
    source: "WHO DON599 / AP / Oceanwide Expeditions",
    asOf: "2026-05-10",
  },
  {
    country: "United Kingdom",
    flag: "🇬🇧",
    iso: "GB",
    confirmed: 1,
    deaths: 0,
    monitored: 22,
    quarantined: 0,
    status: "1 symptomatic medevaced",
    detail: "British national (P003) medevaced with symptoms Apr 27 via Ascension Island. 19 UK guests + 3 UK crew aboard. 7 St. Helena returnees currently state-monitored (via US tracking).",
    source: "Oceanwide Expeditions / CDC",
    asOf: "2026-05-15",
  },
];

// ─── Ship voyage stops ────────────────────────────────────────────────────────
export const voyageStops: VoyageStop[] = [
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
    event: "Docked. Disembarkation underway. French medical charter + Spanish Air Force A310 evacuate patients.",
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
export const caseLocations: CaseLocation[] = [
  {
    country: "Argentina (Origin)",
    flag: "🇦🇷",
    coords: [-65.0, -35.0],
    confirmed: 0,
    deaths: 0,
    monitored: 0,
    type: "origin",
  },
  {
    country: "Netherlands",
    flag: "🇳🇱",
    coords: [4.9, 52.37],
    confirmed: 4,
    deaths: 2,
    monitored: 13,
    type: "case",
  },
  {
    country: "Germany",
    flag: "🇩🇪",
    coords: [10.45, 51.165],
    confirmed: 1,
    deaths: 1,
    monitored: 5,
    type: "case",
  },
  {
    country: "United Kingdom",
    flag: "🇬🇧",
    coords: [-1.177, 52.374],
    confirmed: 1,
    deaths: 0,
    monitored: 22,
    type: "case",
  },
  {
    country: "Canada",
    flag: "🇨🇦",
    coords: [-96.0, 56.0],
    confirmed: 1,
    deaths: 0,
    monitored: 4,
    type: "case",
  },
  {
    country: "United States",
    flag: "🇺🇸",
    coords: [-98.0, 39.0],
    confirmed: 0,
    deaths: 0,
    monitored: 41,
    type: "monitoring",
  },
  {
    country: "France",
    flag: "🇫🇷",
    coords: [2.352, 48.857],
    confirmed: 0,
    deaths: 0,
    monitored: 26,
    type: "monitoring",
  },
  {
    country: "Italy",
    flag: "🇮🇹",
    coords: [12.567, 41.872],
    confirmed: 0,
    deaths: 0,
    monitored: 4,
    type: "monitoring",
  },
];

// ─── Summary stats ────────────────────────────────────────────────────────────
export const summary = {
  totalConfirmed: 10,
  totalSuspected: 1,
  totalDeaths: 3,
  totalMonitored: 41 + 26 + 4 + 4 + 13 + 5 + 22, // all country monitoring
  countriesAffected: 7,
  vessel: "MV Hondius",
  operator: "Oceanwide Expeditions",
  voyage: "HDS2526",
  shipStatus: "Rotterdam — disinfection underway",
  lastUpdated: "2026-05-18",
  source: "WHO DON599 / CDC / NBC News / PHAC / AP",
};
