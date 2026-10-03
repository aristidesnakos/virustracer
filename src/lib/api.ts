import type { TollSnapshot } from "./toll";
import type { DailyPoint } from "./metrics";

// Pure helpers shared by the /api/v1 route handlers (no fs, no Next imports),
// so query parsing and CSV output can be unit-tested.

export const API_ATTRIBUTION =
  "Ebola Outbreak Tracker (unofficial). Figures come from the Wikipedia article's infobox " +
  "(CC BY-SA 4.0), which cites INSP DRC and WHO; every reading links to the exact revision it was read from. " +
  "Shared under CC BY-SA 4.0. Not an official public health resource.";

/** Everything is read-only and public, so any origin may call it from the browser. */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

/** Data only changes when a new deployment goes out, which purges the CDN cache. */
const CACHE_CONTROL = "public, s-maxage=900, stale-while-revalidate=3600";

export function jsonResponse(body: unknown, status = 200): Response {
  const cacheable = status === 200;
  return new Response(JSON.stringify(body, null, 2) + "\n", {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheable ? CACHE_CONTROL : "no-store",
      ...CORS_HEADERS,
    },
  });
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": CACHE_CONTROL,
      ...CORS_HEADERS,
    },
  });
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

export function optionsResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isRealDay(value: string): boolean {
  if (!ISO_DAY.test(value)) return false;
  const t = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === value;
}

export type Format = "json" | "csv";

export interface TollQuery {
  from?: string;
  to?: string;
  limit?: number;
  format: Format;
}

export const MAX_LIMIT = 1000;

/** Validate `?from=&to=&limit=&format=`. Returns an error string for the caller to send as a 400. */
export function parseTollQuery(params: URLSearchParams): TollQuery | { error: string } {
  const from = params.get("from") ?? undefined;
  const to = params.get("to") ?? undefined;
  if (from !== undefined && !isRealDay(from)) return { error: "`from` must be a date as YYYY-MM-DD." };
  if (to !== undefined && !isRealDay(to)) return { error: "`to` must be a date as YYYY-MM-DD." };
  if (from && to && from > to) return { error: "`from` must not be after `to`." };

  let limit: number | undefined;
  const rawLimit = params.get("limit");
  if (rawLimit !== null) {
    limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      return { error: `\`limit\` must be an integer from 1 to ${MAX_LIMIT}.` };
    }
  }

  const format = params.get("format") ?? "json";
  if (format !== "json" && format !== "csv") return { error: "`format` must be `json` or `csv`." };

  return { from, to, limit, format };
}

/** Filter by inclusive date range, then keep the most recent `limit` rows. Ascending by date. */
export function selectSnapshots(
  snapshots: readonly TollSnapshot[],
  { from, to, limit }: Pick<TollQuery, "from" | "to" | "limit">,
): TollSnapshot[] {
  const rows = snapshots
    .filter((s) => (!from || s.date >= from) && (!to || s.date <= to))
    .sort((a, b) => a.date.localeCompare(b.date));
  return limit ? rows.slice(-limit) : rows;
}

/** A snapshot as the public API returns it: the internal archive path is dropped, the checksum is kept. */
export function toPublicSnapshot(snapshot: TollSnapshot): Omit<TollSnapshot, "rawPath"> {
  const { rawPath: _rawPath, ...rest } = snapshot;
  void _rawPath;
  return rest;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // Quote anything containing a delimiter/quote/newline. Also neutralise cells that a
  // spreadsheet would treat as a formula.
  const safe = /^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function tollToCsv(snapshots: readonly TollSnapshot[]): string {
  return toCsv(
    ["date", "confirmed", "suspected", "deaths", "recovered", "revid", "revision_timestamp", "source_url"],
    snapshots.map((s) => [
      s.date,
      s.confirmed,
      s.suspected,
      s.deaths,
      s.recovered,
      s.revid,
      s.revisionTimestamp,
      s.sourceUrl,
    ]),
  );
}

export function dailyToCsv(daily: readonly DailyPoint[]): string {
  return toCsv(
    ["date", "confirmed", "deaths", "new_confirmed", "new_deaths", "new_confirmed_7d_avg", "interpolated"],
    daily.map((d) => [
      d.date,
      d.confirmed,
      d.deaths,
      d.newConfirmed,
      d.newDeaths,
      d.newConfirmed7dAvg,
      d.interpolated,
    ]),
  );
}
