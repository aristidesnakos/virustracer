import { csvResponse, errorResponse, jsonResponse, toCsv } from "./api";
import {
  CITATIONS_API_PATH,
  INFECTION_CONTROL_PATH,
  NATIONAL,
  RESPIRATORY_API_PATH,
  RESPIRATORY_PATH,
  STATE_NAMES,
  STATUS_LABEL,
  careCompareUrl,
  citations,
  countRows,
  latestFullWeek,
  nationalSummary,
  rateRows,
  severityLevel,
  summarizeState,
  thinlyReportedWeeks,
  withRates,
  type Citation,
} from "./nursing-homes";
import { getF880Index, getF880State, getRespiratoryCounts, getRespiratoryRates, listF880States } from "./nursing-homes-data";
import { SITE_NAME, SITE_URL } from "./site";

// The /api/v1/nursing-homes endpoints. Same conventions as the outbreak API (keyless,
// CORS-open, JSON or CSV, cached by the CDN, errors as {error}), but a separate layer:
// the outbreak endpoints are untouched. Server-side only.

const ATTR_HEAD = `${SITE_NAME} (${new URL(SITE_URL).host}, unofficial). `;
const ATTR_TAIL = " Not an official public health resource.";

export const RESPIRATORY_ATTRIBUTION =
  ATTR_HEAD +
  "Source: CDC National Healthcare Safety Network (NHSN), dataset tscn-ryh9 on data.cdc.gov (counts) and the data file behind CDC's Nursing Home Data Dashboard (rates), read automatically; each extract is archived with a SHA-256 checksum. U.S. government data, public domain." +
  ATTR_TAIL;
export const CITATIONS_ATTRIBUTION =
  ATTR_HEAD +
  "Source: CMS Provider Data Catalog, Health Deficiencies (r5ix-sfxw), tag F880 only, read automatically once per CMS release; each release is archived with a SHA-256 checksum. U.S. government data, public domain. A citation is an inspection finding, not evidence of an outbreak; it may have been corrected and may be under dispute." +
  ATTR_TAIL;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
function isRealDay(v: string): boolean {
  if (!ISO_DAY.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
}

type Parsed<T> = T | { error: string };

function common(params: URLSearchParams): Parsed<{ from?: string; to?: string; format: "json" | "csv"; state?: string }> {
  const from = params.get("from") ?? undefined;
  const to = params.get("to") ?? undefined;
  if (from !== undefined && !isRealDay(from)) return { error: "`from` must be a date as YYYY-MM-DD." };
  if (to !== undefined && !isRealDay(to)) return { error: "`to` must be a date as YYYY-MM-DD." };
  if (from && to && from > to) return { error: "`from` must not be after `to`." };
  const format = params.get("format") ?? "json";
  if (format !== "json" && format !== "csv") return { error: "`format` must be `json` or `csv`." };
  const rawState = params.get("state");
  let state: string | undefined;
  if (rawState !== null) {
    state = rawState.toUpperCase();
    if (!(state in STATE_NAMES)) return { error: "`state` must be a two-letter state or territory code (or USA for the nation)." };
  }
  return { from, to, format, state };
}

const inRange = (d: string, from?: string, to?: string) => (!from || d >= from) && (!to || d <= to);

// GET /api/v1/nursing-homes — what this layer holds and how fresh each part is.
export function nursingHomesIndexResponse(): Response {
  const counts = getRespiratoryCounts();
  const rates = getRespiratoryRates();
  const f880 = getF880Index();
  const latest = f880?.releases.at(-1) ?? null;
  return jsonResponse({
    meta: {
      description:
        "Nursing-home data: CDC NHSN weekly respiratory figures for residents (by state and nationally) and CMS inspection citations for infection control (tag F880, by facility). Recurring measurements, not outbreaks.",
      docs: "/data#nursing-homes",
    },
    datasets: [
      {
        id: "respiratory",
        title: "COVID-19, influenza and RSV among nursing-home residents (CDC NHSN)",
        page: RESPIRATORY_PATH,
        endpoint: RESPIRATORY_API_PATH,
        series: {
          counts: counts && {
            source: counts.sourceUrl,
            latestWeek: counts.latestWeek,
            sourceRowsUpdatedAt: counts.sourceRowsUpdatedAt,
            lastChecked: counts.lastChecked,
          },
          rates: rates && {
            source: rates.sourceUrl,
            latestWeek: rates.latestWeek,
            sourceLastModified: rates.sourceLastModified,
            lastChecked: rates.lastChecked,
          },
        },
        attribution: RESPIRATORY_ATTRIBUTION,
      },
      {
        id: "infection-control-citations",
        title: "Infection-control citations (CMS tag F880)",
        page: INFECTION_CONTROL_PATH,
        endpoint: CITATIONS_API_PATH,
        release: latest && { release: latest.release, released: latest.released, citations: latest.citations, facilities: latest.facilities },
        lastChecked: f880?.lastChecked ?? null,
        nextUpdateDate: f880?.nextUpdateDate ?? null,
        attribution: CITATIONS_ATTRIBUTION,
      },
    ],
  });
}

const COUNT_CSV = [
  "week", "jurisdiction", "facilities", "residents",
  "covidCases", "covidCaseRate", "covidHosp", "covidHospRate",
  "fluCases", "fluCaseRate", "fluHosp", "fluHospRate",
  "rsvCases", "rsvCaseRate", "rsvHosp", "rsvHospRate",
  "covidUpToDate", "fluVaccinated", "rsvVaccinated", "thinReporting",
] as const;
const RATE_CSV = ["week", "jurisdiction", "covidCaseRate", "covidHospRate", "fluCaseRate", "fluHospRate", "rsvCaseRate", "rsvHospRate", "marked"] as const;

// GET /api/v1/nursing-homes/respiratory?series=counts|rates&state=XX&from=&to=&format=json|csv
export function respiratoryResponse(request: Request): Response {
  const params = new URL(request.url).searchParams;
  const q = common(params);
  if ("error" in q) return errorResponse(q.error);
  const series = params.get("series") ?? "counts";
  if (series !== "counts" && series !== "rates") return errorResponse("`series` must be `counts` or `rates`.");

  if (series === "rates") {
    const file = getRespiratoryRates();
    if (!file) return errorResponse("The dashboard rates have not been fetched yet.", 503);
    const rows = rateRows(file).filter((r) => (!q.state || r.jurisdiction === q.state) && inRange(r.week, q.from, q.to));
    if (q.format === "csv") return csvResponse(toCsv(RATE_CSV, rows.map((r) => RATE_CSV.map((k) => r[k]))), "nursing-home-respiratory-rates.csv");
    return jsonResponse({
      meta: {
        series: "rates",
        description:
          "Weekly new COVID-19, influenza and RSV cases and hospitalisations per 100,000 nursing-home residents, by state and nationally, as CDC's Nursing Home Data Dashboard publishes them. Rates only: CDC's file has no counts. A null is missing data, never zero.",
        source: file.source,
        sourceUrl: file.sourceUrl,
        dataUrl: file.dataUrl,
        unit: file.unit,
        latestWeek: file.latestWeek,
        sourceLastModified: file.sourceLastModified,
        lastChecked: file.lastChecked,
        allPathogensFrom: file.allPathogensFrom,
        notes: [
          `Influenza and RSV reporting became mandatory on 1 January 2025; weeks before ${file.allPathogensFrom} are COVID-19 only.`,
          "CDC marks the most recent weeks as preliminary on its dashboard; they are revised in later releases.",
          "`marked` is CDC's own flag on some weeks (drawn dotted on its chart); the data file does not say why.",
          "These rates are close to, but not the same as, rates computed from the counts series: CDC computes them from a different extract.",
        ],
        rawSha256: file.rawSha256,
        count: rows.length,
        attribution: RESPIRATORY_ATTRIBUTION,
        docs: "/data#nursing-homes",
      },
      rows,
    });
  }

  const file = getRespiratoryCounts();
  if (!file) return errorResponse("The NHSN counts have not been fetched yet.", 503);
  const all = countRows(file);
  const thin = thinlyReportedWeeks(all);
  const rows = all
    .filter((r) => (!q.state || r.jurisdiction === q.state) && inRange(r.week, q.from, q.to))
    .map((r) => ({ ...withRates(r), thinReporting: thin.has(r.week) }));
  if (q.format === "csv") return csvResponse(toCsv(COUNT_CSV, rows.map((r) => COUNT_CSV.map((k) => r[k]))), "nursing-home-respiratory-counts.csv");
  return jsonResponse({
    meta: {
      series: "counts",
      description:
        "Weekly new COVID-19, influenza and RSV cases and hospitalisations among residents of reporting nursing homes, by state and nationally, from CDC NHSN's open dataset, with rates per 100,000 residents computed from the dataset's resident count. A null is missing data, never zero.",
      dataset: file.dataset,
      title: file.title,
      sourceUrl: file.sourceUrl,
      latestWeek: file.latestWeek,
      latestFullWeek: latestFullWeek(all),
      sourceRowsUpdatedAt: file.sourceRowsUpdatedAt,
      lastChecked: file.lastChecked,
      allPathogensFrom: file.allPathogensFrom,
      notes: [
        "`residents` counts residents present for at least one day of the week in the reporting homes; cases and hospitalisations are counted among them, so it is the rate's denominator.",
        "`facilities` counts homes that submitted complete data that week (COVID-19 only before 12 January 2025; all three pathogens after).",
        `Influenza and RSV are left out of the dataset up to the week ending 5 January 2025; series that compare the three start at ${file.allPathogensFrom}.`,
        "`thinReporting` is true for weeks in which fewer than 90% of the usual number of homes reported nationally; their counts are not comparable with other weeks.",
      ],
      rawSha256: file.rawSha256,
      count: rows.length,
      attribution: RESPIRATORY_ATTRIBUTION,
      docs: "/data#nursing-homes",
    },
    rows,
  });
}

const CITATION_CSV = [
  "ccn", "facility", "address", "city", "state", "zip", "surveyDate", "severity", "severityLevel", "complaint", "standard",
  "infectionControlInspection", "inspectionCycle", "status", "correctionDate", "underIdr", "underIidr", "release", "released", "careCompareUrl",
] as const;

const SEVERITY_RE = /^[A-L]$/;

// GET /api/v1/nursing-homes/infection-control-citations?state=XX|ccn=NNNNNN&from=&to=&min_severity=G&format=json|csv
// Without state or ccn: the per-state summary (the full list is about 24,000 rows; ask per state).
export function citationsResponse(request: Request): Response {
  const params = new URL(request.url).searchParams;
  const q = common(params);
  if ("error" in q) return errorResponse(q.error);
  if (q.state === NATIONAL) return errorResponse("`state` must be a state or territory; omit it for the national summary.");
  const ccn = params.get("ccn")?.toUpperCase();
  if (ccn !== undefined && !/^[0-9A-Z]{6}$/.test(ccn)) return errorResponse("`ccn` must be a six-character CMS Certification Number.");
  const minSeverity = params.get("min_severity")?.toUpperCase();
  if (minSeverity !== undefined && !SEVERITY_RE.test(minSeverity)) return errorResponse("`min_severity` must be a scope/severity letter from A to L.");

  const index = getF880Index();
  const release = index?.releases.at(-1);
  if (!index || !release) return errorResponse("The CMS citations have not been fetched yet.", 503);
  const meta = {
    description:
      "Nursing homes cited for an infection-control deficiency (CMS tag F880, \"Provide and implement an infection prevention and control program\") in health inspections, from CMS's Health Deficiencies dataset, which covers about the last three inspection cycles per home. A citation is a survey finding: it may have been corrected since and may be under dispute (IDR/IIDR). It is not evidence of an outbreak.",
    dataset: index.dataset,
    sourceUrl: index.sourceUrl,
    release: release.release,
    released: release.released,
    lastChecked: index.lastChecked,
    nextUpdateDate: index.nextUpdateDate,
    rawSha256: release.rawSha256,
    attribution: CITATIONS_ATTRIBUTION,
    docs: "/data#nursing-homes",
  };

  if (!q.state && !ccn) {
    const summaries = listF880States().flatMap((st) => {
      const f = getF880State(st);
      return f ? [summarizeState(f)] : [];
    });
    const strip = ({ grid: _g, grid12m: _g12, ...rest }: ReturnType<typeof summarizeState>) => (void _g, void _g12, rest);
    if (q.format === "csv") {
      const head = ["state", "release", "since", "citations12m", "facilities12m", "harm12m", "harmShare12m", "complaint12m", "citationsAll", "facilitiesAll"] as const;
      return csvResponse(toCsv(head, summaries.map((s) => head.map((k) => s[k]))), "nursing-home-f880-by-state.csv");
    }
    return jsonResponse({
      meta: {
        ...meta,
        note: `Per-state summary. "12m" figures count surveys dated within the year ending on the release's processing date (${release.release}). Ask for one state (?state=CA) or one home (?ccn=...) to get the citations.`,
      },
      national: nationalSummary(summaries),
      states: summaries.map((s) => ({ ...strip(s), grid12m: s.grid12m })),
    });
  }

  let rows: Citation[] = [];
  if (q.state) {
    const f = getF880State(q.state);
    rows = f ? citations(f) : [];
  } else {
    for (const st of listF880States()) {
      const f = getF880State(st);
      if (f && ccn && ccn in f.facilities) rows.push(...citations(f));
    }
  }
  rows = rows.filter(
    (r) =>
      (!ccn || r.ccn === ccn) &&
      inRange(r.surveyDate, q.from, q.to) &&
      // Letters run A to L in rising severity, so "G or above" is G..L.
      (!minSeverity || r.severity >= minSeverity),
  );
  const out = rows.map((r) => ({ ...r, severityLevel: severityLevel(r.severity), statusText: STATUS_LABEL[r.status], careCompareUrl: careCompareUrl(r.ccn, r.state) }));
  if (q.format === "csv") return csvResponse(toCsv(CITATION_CSV, out.map((r) => CITATION_CSV.map((k) => r[k]))), `nursing-home-f880-${(q.state ?? ccn ?? "").toLowerCase()}.csv`);
  return jsonResponse({ meta: { ...meta, count: out.length }, citations: out });
}
