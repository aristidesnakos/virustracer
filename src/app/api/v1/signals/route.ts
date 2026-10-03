import { getDefaultOutbreak } from "@/data/outbreaks";
import { API_ATTRIBUTION, jsonResponse, optionsResponse } from "@/lib/api";
import { classifySignals, getSignalsLedger } from "@/lib/signals";

// GET /api/v1/signals
// Countries the news has mentioned in connection with the outbreak, with the
// date of the first mention and, once officially confirmed, how far the news
// led the confirmation. Unverified signals are leads, not confirmed cases.

export function GET() {
  const outbreak = getDefaultOutbreak();
  const ledger = getSignalsLedger(outbreak.slug);
  const signals = classifySignals(ledger.signals, outbreak.monitoringData);
  const lead = signals.filter((s) => s.leadDays !== null).map((s) => s.leadDays as number);

  return jsonResponse({
    meta: {
      outbreak: outbreak.title,
      description:
        "News-derived country signals, extracted automatically from news and WHO feeds. Unverified signals are NOT confirmed cases.",
      lastUpdated: ledger.lastUpdated || null,
      attribution: API_ATTRIBUTION,
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

export function OPTIONS() {
  return optionsResponse();
}
