import type { NextRequest } from "next/server";
import { getDefaultOutbreak } from "@/data/outbreaks";
import {
  API_ATTRIBUTION,
  csvResponse,
  errorResponse,
  jsonResponse,
  optionsResponse,
  parseTollQuery,
  selectSnapshots,
  toPublicSnapshot,
  tollToCsv,
} from "@/lib/api";
import { getTollData } from "@/lib/toll";

// GET /api/v1/toll?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=N&format=json|csv
// The daily record of reported cumulative figures, each tied to the exact
// source revision it was read from.

export function GET(request: NextRequest) {
  const query = parseTollQuery(request.nextUrl.searchParams);
  if ("error" in query) return errorResponse(query.error);

  // The un-prefixed API serves the default outbreak; per-outbreak URLs come with the route move.
  const outbreak = getDefaultOutbreak();
  const toll = getTollData(outbreak.slug);
  const snapshots = selectSnapshots(toll.snapshots, query);

  if (query.format === "csv") return csvResponse(tollToCsv(snapshots), `${outbreak.disease.toLowerCase()}-toll.csv`);

  const latest = toll.snapshots.length
    ? [...toll.snapshots].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!
    : null;
  return jsonResponse({
    meta: {
      outbreak: outbreak.title,
      description: "Cumulative reported figures, one reading per UTC day.",
      lastChecked: toll.lastChecked || null,
      count: snapshots.length,
      attribution: API_ATTRIBUTION,
      docs: "/data",
    },
    latest: latest ? toPublicSnapshot(latest) : null,
    snapshots: snapshots.map(toPublicSnapshot),
  });
}

export function OPTIONS() {
  return optionsResponse();
}
