import type { NextRequest } from "next/server";
import { outbreak } from "@/data/outbreak";
import { API_ATTRIBUTION, csvResponse, dailyToCsv, errorResponse, jsonResponse, optionsResponse } from "@/lib/api";
import { computeMetrics } from "@/lib/metrics";
import { getTollData } from "@/lib/toll";

// GET /api/v1/metrics[?include=daily][&format=csv]
// Derived indicators (weekly incidence, growth, Rt, fatality ratios). The
// response always carries the assumptions behind them; the method is described
// on /data.

export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const format = params.get("format") ?? "json";
  if (format !== "json" && format !== "csv") return errorResponse("`format` must be `json` or `csv`.");
  const include = params.get("include");
  if (include !== null && include !== "daily") return errorResponse("`include` may only be `daily`.");

  const toll = getTollData();
  const metrics = computeMetrics(toll.snapshots);

  if (format === "csv") return csvResponse(dailyToCsv(metrics.daily), "ebola-daily.csv");

  const { daily, ...summary } = metrics;
  return jsonResponse({
    meta: {
      outbreak: outbreak.title,
      description:
        "Indicators derived from the cumulative toll. Estimates, not official statistics: see `assumptions` and /data.",
      attribution: API_ATTRIBUTION,
      docs: "/data#method",
    },
    ...summary,
    ...(include === "daily" ? { daily } : {}),
  });
}

export function OPTIONS() {
  return optionsResponse();
}
