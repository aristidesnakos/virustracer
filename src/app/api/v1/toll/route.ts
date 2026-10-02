import type { NextRequest } from "next/server";
import { outbreak } from "@/data/outbreak";
import {
  API_ATTRIBUTION,
  csvResponse,
  errorResponse,
  jsonResponse,
  optionsResponse,
  parseTollQuery,
  selectSnapshots,
  tollToCsv,
} from "@/lib/api";
import { getTollData } from "@/lib/toll";

// GET /api/v1/toll?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=N&format=json|csv
// The daily record of reported cumulative figures, each tied to the exact
// source revision it was read from.

export function GET(request: NextRequest) {
  const query = parseTollQuery(request.nextUrl.searchParams);
  if ("error" in query) return errorResponse(query.error);

  const toll = getTollData();
  const snapshots = selectSnapshots(toll.snapshots, query);

  if (query.format === "csv") return csvResponse(tollToCsv(snapshots), "ebola-toll.csv");

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
    latest,
    snapshots,
  });
}

export function OPTIONS() {
  return optionsResponse();
}
