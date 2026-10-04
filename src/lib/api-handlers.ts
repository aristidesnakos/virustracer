import type { OutbreakDefinition } from "@/data/outbreaks";
import { getOutbreak, listOutbreaks } from "@/data/outbreaks";
import {
  attributionFor,
  csvResponse,
  dailyToCsv,
  errorResponse,
  jsonResponse,
  parseTollQuery,
  selectSnapshots,
  toPublicSnapshot,
  tollToCsv,
  unknownOutbreakResponse,
} from "./api";
import { computeMetrics } from "./metrics";
import { OUTBREAKS_API_PATH, outbreakApiPath, outbreakPath } from "./outbreak-paths";
import { classifySignals, getSignalsLedger } from "./signals";
import { mergeTimeline } from "./timeline";
import { getTollData } from "./toll";

// The one implementation behind every /api/v1 endpoint. The per-outbreak routes
// (/api/v1/outbreaks/<slug>/...) and the permanent un-prefixed aliases
// (/api/v1/toll, ...) both call these, so the two can never drift apart.
// Server-side only (reads the data files). Handlers take a plain Request.

/**
 * A hand-curated outbreak has no daily readings, so its toll is empty and its
 * metrics insufficient. Say why in `meta`, rather than leave an empty list unexplained.
 */
function manualNote(outbreak: OutbreakDefinition): { note?: string } {
  return outbreak.source.kind === "manual"
    ? {
        note: `This outbreak is curated by hand and has no daily readings. Its sourced timeline is on ${outbreakPath(outbreak.slug)}; the latest figures are in ${OUTBREAKS_API_PATH}.`,
      }
    : {};
}

/** Look up `slug` and run `handler`, or answer 404 JSON when no such outbreak is registered. */
export function forOutbreak(slug: string, handler: (outbreak: OutbreakDefinition) => Response): Response {
  const outbreak = getOutbreak(slug);
  return outbreak ? handler(outbreak) : unknownOutbreakResponse(slug);
}

// GET .../toll?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=N&format=json|csv
// The daily record of reported cumulative figures, each tied to the exact
// source revision it was read from.
export function tollResponse(outbreak: OutbreakDefinition, request: Request): Response {
  const query = parseTollQuery(new URL(request.url).searchParams);
  if ("error" in query) return errorResponse(query.error);

  const toll = getTollData(outbreak.slug);
  const snapshots = selectSnapshots(toll.snapshots, query);

  if (query.format === "csv") return csvResponse(tollToCsv(snapshots), `${outbreak.disease.toLowerCase()}-toll.csv`);

  const latest = toll.snapshots.length
    ? [...toll.snapshots].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!
    : null;
  return jsonResponse({
    meta: {
      slug: outbreak.slug,
      outbreak: outbreak.title,
      description: "Cumulative reported figures, one reading per UTC day.",
      lastChecked: toll.lastChecked || null,
      count: snapshots.length,
      ...manualNote(outbreak),
      attribution: attributionFor(outbreak),
      docs: "/data",
    },
    latest: latest ? toPublicSnapshot(latest) : null,
    snapshots: snapshots.map(toPublicSnapshot),
  });
}

// GET .../metrics[?include=daily][&format=csv]
// Derived indicators (weekly incidence, growth, Rt, fatality ratios). The
// response always carries the assumptions behind them; the method is described
// on /data.
export function metricsResponse(outbreak: OutbreakDefinition, request: Request): Response {
  const params = new URL(request.url).searchParams;
  const format = params.get("format") ?? "json";
  if (format !== "json" && format !== "csv") return errorResponse("`format` must be `json` or `csv`.");
  const include = params.get("include");
  if (include !== null && include !== "daily") return errorResponse("`include` may only be `daily`.");

  const toll = getTollData(outbreak.slug);
  const metrics = computeMetrics(toll.snapshots, outbreak.metrics);

  if (format === "csv") return csvResponse(dailyToCsv(metrics.daily), `${outbreak.disease.toLowerCase()}-daily.csv`);

  const { daily, ...summary } = metrics;
  return jsonResponse({
    meta: {
      slug: outbreak.slug,
      outbreak: outbreak.title,
      description:
        "Indicators derived from the cumulative toll. Estimates, not official statistics: see `assumptions` and /data.",
      ...manualNote(outbreak),
      attribution: attributionFor(outbreak),
      docs: "/data#method",
    },
    ...summary,
    ...(include === "daily" ? { daily } : {}),
  });
}

// GET .../signals
// Countries the news has mentioned in connection with the outbreak, with the
// date of the first mention and, once officially confirmed, how far the news
// led the confirmation. Unverified signals are leads, not confirmed cases.
export function signalsResponse(outbreak: OutbreakDefinition): Response {
  const ledger = getSignalsLedger(outbreak.slug);
  const signals = classifySignals(ledger.signals, outbreak.monitoringData);
  const lead = signals.filter((s) => s.leadDays !== null).map((s) => s.leadDays as number);

  return jsonResponse({
    meta: {
      slug: outbreak.slug,
      outbreak: outbreak.title,
      description:
        "News-derived country signals, extracted automatically from news and WHO feeds. Unverified signals are NOT confirmed cases.",
      lastUpdated: ledger.lastUpdated || null,
      attribution: attributionFor(outbreak),
      docs: "/data#signals",
    },
    summary: {
      total: signals.length,
      confirmed: signals.filter((s) => s.status === "confirmed").length,
      unverified: signals.filter((s) => s.status === "unverified").length,
      withLeadTime: lead.length,
      medianLeadDays: lead.length
        ? [...lead].sort((a, b) => a - b)[Math.floor((lead.length - 1) / 2)]
        : null,
    },
    signals,
  });
}

/** Latest figures from the merged timeline (curated rows win on a shared date), the same series the dashboard shows. */
function latestFigures(outbreak: OutbreakDefinition) {
  const timeline = mergeTimeline(outbreak.casesTimeline, getTollData(outbreak.slug).snapshots);
  const point = timeline.at(-1);
  return point
    ? { date: point.date.slice(0, 10), confirmed: point.confirmed ?? null, deaths: point.deaths ?? null }
    : null;
}

// GET /api/v1/outbreaks
// Every outbreak the site tracks, with its latest headline figures and links
// to its page and endpoints.
export function outbreaksListResponse(): Response {
  const outbreaks = listOutbreaks().map((o) => ({
    slug: o.slug,
    title: o.title,
    disease: o.disease,
    status: o.status,
    places: o.places,
    source: { kind: o.source.kind, ref: o.source.ref },
    latest: latestFigures(o),
    links: {
      page: outbreakPath(o.slug),
      toll: outbreakApiPath(o.slug, "toll"),
      metrics: outbreakApiPath(o.slug, "metrics"),
      signals: outbreakApiPath(o.slug, "signals"),
    },
  }));
  return jsonResponse({
    meta: {
      description:
        "Outbreaks tracked by the site. `latest` is the newest point of the merged timeline shown on the dashboard.",
      count: outbreaks.length,
      attribution:
        "Each outbreak's endpoints carry their own `meta.attribution`; all figures are shared under CC BY-SA 4.0.",
      docs: "/data",
    },
    outbreaks,
  });
}
