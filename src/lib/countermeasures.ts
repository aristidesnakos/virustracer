/**
 * Vaccines, treatments and diagnostics for a pathogen: the hand-curated "Vaccines & treatments"
 * box (pilot: Bundibugyo virus only). Design, vocabulary and evidence tiers are argued in
 * docs/countermeasures-assessment.md; the public wording rules are on /methodology#countermeasures.
 *
 * The curated files live in src/data/countermeasures/<id>.json (JSON so that
 * scripts/check-countermeasures.mjs can read the same file). Automation never edits them: the
 * script only re-checks each line against its source and warns; a person updates the file.
 * Keyed by pathogen, not outbreak, because the same products apply to every outbreak of it.
 */

/** Closed list of milestones. Anything else is not shown. */
export const MILESTONES = [
  "registered",
  "first_enrolled",
  "phase_change",
  "status_change",
  "results_posted",
  "preprint",
  "peer_reviewed",
  "submission",
  "authorised",
  "withdrawn",
  "who_listed",
  "deployed",
] as const;
export type Milestone = (typeof MILESTONES)[number];

/** Short reader-facing label for each milestone. */
export const MILESTONE_LABEL: Record<Milestone, string> = {
  registered: "Trial registered",
  first_enrolled: "Enrolment started",
  phase_change: "New phase",
  status_change: "Trial status changed",
  results_posted: "Results posted to registry",
  preprint: "Results in a preprint",
  peer_reviewed: "Results in a peer-reviewed journal",
  submission: "Submitted to a regulator",
  authorised: "Authorised by a regulator",
  withdrawn: "Authorisation withdrawn",
  who_listed: "WHO listing",
  deployed: "Deployed in this outbreak",
};

/**
 * Evidence tiers: A regulator record, B trial registry, C peer-reviewed paper, D preprint,
 * E statement by WHO, a funder, a ministry or a sponsor.
 */
export const TIERS = ["A", "B", "C", "D", "E"] as const;
export type EvidenceTier = (typeof TIERS)[number];

export const TIER_LABEL: Record<EvidenceTier, string> = {
  A: "Regulator record",
  B: "Trial registry",
  C: "Peer-reviewed",
  D: "Preprint, not peer-reviewed",
  E: "Statement",
};

/** What each tier may claim. A statement (E) never claims an approval or a result. */
export const ALLOWED_MILESTONES: Record<EvidenceTier, readonly Milestone[]> = {
  A: ["authorised", "withdrawn", "who_listed", "submission"],
  B: ["registered", "phase_change", "status_change", "results_posted", "first_enrolled"],
  C: ["peer_reviewed"],
  D: ["preprint"],
  E: ["first_enrolled", "deployed", "submission"],
};

export const COUNTERMEASURE_KINDS = ["vaccine", "treatment", "prophylaxis", "diagnostic"] as const;
export type CountermeasureKind = (typeof COUNTERMEASURE_KINDS)[number];

export const KIND_HEADING: Record<CountermeasureKind, string> = {
  vaccine: "Vaccines",
  treatment: "Treatments",
  prophylaxis: "Prevention after exposure",
  diagnostic: "Tests",
};

/** ClinicalTrials.gov `overallStatus` codes, as the registry words them. */
export const REGISTRY_STATUS_LABEL: Record<string, string> = {
  NOT_YET_RECRUITING: "Not yet recruiting",
  RECRUITING: "Recruiting",
  ENROLLING_BY_INVITATION: "Enrolling by invitation",
  ACTIVE_NOT_RECRUITING: "Active, not recruiting",
  SUSPENDED: "Suspended",
  TERMINATED: "Terminated",
  COMPLETED: "Completed",
  WITHDRAWN: "Withdrawn",
  UNKNOWN: "Unknown status",
};

export type SourceKind = "clinicaltrials.gov" | "isrctn" | "ema-medicine" | "web";

export interface CountermeasureSource {
  kind: SourceKind;
  /** Who says it, named as the source names itself ("ClinicalTrials.gov", "CEPI", "WHO"). */
  issuer: string;
  url: string;
  /** Registry or regulator id: NCT number, ISRCTN number, EMA product number. */
  id?: string;
}

/**
 * What the source said on the file's `checked` date. Shown on the page and re-checked by
 * scripts/check-countermeasures.mjs, which warns on any difference.
 */
export interface CountermeasureExpect {
  /** ClinicalTrials.gov `overallStatus`. */
  registryStatus?: string;
  /** Registry record's last update (ClinicalTrials.gov last update posted, ISRCTN lastUpdated), YYYY-MM-DD. */
  recordUpdated?: string;
  phase?: string;
  enrollment?: number;
  /** EMA `medicine_status`. */
  medicineStatus?: string;
  /** Exact text that must appear on the cited page. */
  quotes?: string[];
}

export interface CountermeasureEvent {
  milestone: Milestone;
  tier: EvidenceTier;
  /** One plain sentence saying what the source says, nothing more. */
  text: string;
  /** When it happened according to the source (YYYY-MM-DD): registry first-posted date, publication date. */
  date: string;
  source: CountermeasureSource;
  expect?: CountermeasureExpect;
}

export interface CountermeasureProduct {
  id: string;
  name: string;
  kind: CountermeasureKind;
  /** Developer, sponsor or funders as the sources name them. */
  developer: string;
  note: string;
  /** Set when the product is licensed against a different species or strain. */
  licensedFor?: string;
  events: CountermeasureEvent[];
}

export interface CountermeasureStatement {
  text: string;
  /** The source's own words, shown in quotation marks. */
  quote: string;
  date: string;
  tier: EvidenceTier;
  source: CountermeasureSource;
  expect?: CountermeasureExpect;
}

export interface CountermeasureFile {
  /** Pathogen id, also the file name: src/data/countermeasures/<id>.json. */
  id: string;
  /** Pathogen as readers know it, e.g. "Bundibugyo virus". */
  name: string;
  /** Date (YYYY-MM-DD) every line was last checked against its source. */
  checked: string;
  statement: CountermeasureStatement;
  products: CountermeasureProduct[];
}

/** After this many days without a check, the box says it may be out of date. */
export const STALE_AFTER_DAYS = 14;

/** Words the box never uses about a candidate in its own text (quotes from sources are exempt). */
export const BANNED_WORDS = /\b(promising|breakthrough|effective|efficacious|safe|cure|cures|miracle|game[- ]changer)\b/i;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isStale(checked: string, now: Date = new Date()): boolean {
  const t = Date.parse(`${checked}T00:00:00Z`);
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > STALE_AFTER_DAYS * 86_400_000;
}

/**
 * Every rule a curated file must follow; returns the problems found (empty when valid).
 * Run by tests/countermeasures.test.ts on every file.
 */
export function validateCountermeasures(file: CountermeasureFile): string[] {
  const problems: string[] = [];
  const at = (where: string, msg: string) => problems.push(`${file.id} ${where}: ${msg}`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(file.id)) at("id", "not a slug");
  if (!ISO_DATE.test(file.checked)) at("checked", "not YYYY-MM-DD");

  const checkSource = (where: string, s: CountermeasureSource, tier: EvidenceTier, expect?: CountermeasureExpect) => {
    let url: URL | null = null;
    try {
      url = new URL(s.url);
    } catch {
      at(where, `bad url ${s.url}`);
    }
    if (url && url.protocol !== "https:") at(where, "source must be https");
    if (!s.issuer) at(where, "source needs an issuer");
    if (s.kind === "clinicaltrials.gov") {
      if (!/^NCT\d{8}$/.test(s.id ?? "")) at(where, "ClinicalTrials.gov source needs an NCT id");
      else if (s.url !== `https://clinicaltrials.gov/study/${s.id}`) at(where, "url must be the study page for its NCT id");
      if (tier !== "B") at(where, "a registry record is tier B");
      if (!expect?.registryStatus || !(expect.registryStatus in REGISTRY_STATUS_LABEL)) at(where, "needs a known registryStatus");
      if (!expect?.recordUpdated || !ISO_DATE.test(expect.recordUpdated)) at(where, "needs recordUpdated (YYYY-MM-DD)");
    } else if (s.kind === "isrctn") {
      if (!/^ISRCTN\d{8}$/.test(s.id ?? "")) at(where, "ISRCTN source needs an ISRCTN id");
      else if (s.url !== `https://www.isrctn.com/${s.id}`) at(where, "url must be the record page for its ISRCTN id");
      if (tier !== "B") at(where, "a registry record is tier B");
      if (!expect?.recordUpdated || !ISO_DATE.test(expect.recordUpdated)) at(where, "needs recordUpdated (YYYY-MM-DD)");
    } else if (s.kind === "ema-medicine") {
      if (!/^EMEA\/H\/C\/\d{6}$/.test(s.id ?? "")) at(where, "EMA source needs a product number");
      if (tier !== "A") at(where, "a regulator record is tier A");
      if (!expect?.medicineStatus) at(where, "needs medicineStatus");
    } else if (s.kind === "web") {
      if (!expect?.quotes?.length) at(where, "a web source needs at least one quote to re-check");
      if (tier === "A" || tier === "B") at(where, "a web page is not a registry or regulator record");
    } else {
      at(where, `unknown source kind ${String((s as { kind: unknown }).kind)}`);
    }
  };

  const s = file.statement;
  if (!s?.text || !s.quote) at("statement", "needs text and quote");
  else {
    if (!ISO_DATE.test(s.date)) at("statement", "date not YYYY-MM-DD");
    if (BANNED_WORDS.test(s.text)) at("statement", `banned word in text: ${s.text}`);
    checkSource("statement", s.source, s.tier, s.expect);
  }

  const ids = new Set<string>();
  for (const p of file.products) {
    const where = `product ${p.id}`;
    if (ids.has(p.id)) at(where, "duplicate id");
    ids.add(p.id);
    if (!(COUNTERMEASURE_KINDS as readonly string[]).includes(p.kind)) at(where, `unknown kind ${p.kind}`);
    if (!p.developer) at(where, "needs a developer or sponsor");
    if (BANNED_WORDS.test(p.note) || BANNED_WORDS.test(p.name)) at(where, `banned word: ${p.name} / ${p.note}`);
    if (!p.events.length) at(where, "needs at least one sourced line");
    for (const [i, e] of p.events.entries()) {
      const w = `${where} line ${i + 1}`;
      if (!(MILESTONES as readonly string[]).includes(e.milestone)) at(w, `unknown milestone ${e.milestone}`);
      if (!(TIERS as readonly string[]).includes(e.tier)) at(w, `unknown tier ${e.tier}`);
      else if (!ALLOWED_MILESTONES[e.tier].includes(e.milestone)) at(w, `tier ${e.tier} may not claim ${e.milestone}`);
      if (!ISO_DATE.test(e.date)) at(w, "date not YYYY-MM-DD");
      else if (e.date > file.checked) at(w, "dated after the file was checked");
      if (BANNED_WORDS.test(e.text)) at(w, `banned word in text: ${e.text}`);
      checkSource(w, e.source, e.tier, e.expect);
    }
  }
  return problems;
}
