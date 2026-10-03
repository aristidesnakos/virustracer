// Shapes shared by every outbreak definition. Data lives in one file per outbreak.

export interface CaseDataPoint {
  date: string;          // ISO 8601
  label: string;         // Display label
  /** Cumulative confirmed cases. Omit when the source does not report it. */
  confirmed?: number;
  /** Cumulative probable/suspected cases. Omit when the source does not report it. */
  suspected?: number;
  /** Cumulative deaths. Omit when the source does not report it. */
  deaths?: number;
  /** Cumulative recoveries. Omit when the source does not report it. */
  recovered?: number;
  note?: string;
  source: string;
}

export interface MonitoringEntry {
  country: string;
  flag: string;
  iso: string;
  /** Set on sub-national rows (e.g. DRC provinces). They are excluded from the table total. */
  parentIso?: string;
  confirmed: number;
  deaths: number;
  status: string;
  detail: string;
  source: string;
  asOf: string;
  /**
   * Date the first case in this country was officially confirmed (YYYY-MM-DD).
   * Optional; set it only when a source states it. Used to measure how far news
   * signals led the official confirmation (see src/lib/signals.ts).
   */
  firstConfirmed?: string;
}

export interface SpreadStop {
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
  type: "origin" | "case" | "monitoring";
  /** ISO date of the most recent verified data for this location. Drives the map recency gradient. */
  asOf: string;
}

export type OutbreakStatus = "active" | "waning" | "over" | "watch";

/**
 * Where an outbreak's headline figures come from. `wikipedia-infobox` is read by
 * the daily scripts (automation tier "auto"); `manual` is curated by hand and
 * must show its "last verified" date rather than look live.
 */
export interface OutbreakSource {
  kind: "wikipedia-infobox" | "manual";
  /** Wikipedia article title (underscored) for `wikipedia-infobox`; a free-text pointer otherwise. */
  ref: string;
}

export interface OutbreakLink {
  label: string;
  href: string;
}

/** Figures the timeline does not carry; shown in the stat strip. */
export interface OutbreakSummary {
  countriesAffected: number;
  provincesAffected: number;
  healthZonesAffected: number;
  contactsUnderFollowUp: number;
  healthWorkerDeaths: number;
  spreadStatus: string;
  lastReviewed: string;
  source: string;
}

/**
 * Everything the site needs to render and describe one outbreak. The scripts that
 * fetch data cannot import TypeScript, so they keep a matching entry in
 * scripts/lib/outbreak-registry.mjs; tests/outbreak-registry.test.ts keeps the two in step.
 */
export interface OutbreakDefinition {
  /** URL- and folder-safe id: lowercase letters, digits and hyphens. Names data/outbreaks/<slug>/. */
  slug: string;
  disease: string;
  /** Strain or variant when it matters to readers, e.g. "Bundibugyo virus". */
  pathogen?: string;
  status: OutbreakStatus;
  source: OutbreakSource;
  /** Heading of the dashboard and share card. */
  title: string;
  /** <title> for search results: the query words first, then the place. Keep it under ~60 characters. */
  seoTitle: string;
  keywords: readonly string[];
  subtitle: string;
  description: string;
  links: readonly OutbreakLink[];
  /** Short name used in generated text, e.g. "2026 Ebola outbreak". */
  shortName: string;
  /** Where it is happening, for generated text, e.g. "DR Congo, Uganda". */
  places: string;
  /** Full country names for structured data. */
  countries: readonly string[];
  /** schema.org Dataset text for this outbreak's daily series. */
  dataset: { name: string; description: string; isBasedOn: string };
  casesTimeline: CaseDataPoint[];
  monitoringData: MonitoringEntry[];
  spreadStops: SpreadStop[];
  caseLocations: CaseLocation[];
  summary: OutbreakSummary;
}
