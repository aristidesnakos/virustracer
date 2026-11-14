import { NextRequest, NextResponse } from "next/server";
import { cleanMetadata, isGoalName, isVisitorId } from "@/lib/analytics-goals";

// Same-origin proxy to DataFast's server API (from the datafast-goal-tracking skill template,
// narrowed): the browser never sees the secret key. The client (src/lib/analytics.ts) POSTs goals
// here and we forward them with `DATAFAST_API_KEY`. Only goals listed in src/lib/analytics-goals.ts
// and their metadata keys are forwarded; payments and visitor lookups are not offered (this site
// sells nothing and has no use for visitor profiles).
//
// Required env (Vercel → Project → Settings → Environment Variables, Production):
//   DATAFAST_API_KEY=...   (DataFast → Settings → API). Server-only; never NEXT_PUBLIC_.
// Without it, goal POSTs return 503 and goals read empty.

const DATAFAST_GOALS = "https://datafa.st/api/v1/goals";
const MAX_BODY = 4_000;

export async function POST(request: NextRequest) {
  if (!process.env.DATAFAST_API_KEY) {
    return NextResponse.json({ error: "DataFast API key not configured" }, { status: 503 });
  }
  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return NextResponse.json({ error: "Request too large" }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body?.type !== "goal") return NextResponse.json({ error: 'Only type "goal" is accepted' }, { status: 400 });
  if (!isGoalName(body.name)) return NextResponse.json({ error: "Unknown goal" }, { status: 400 });
  if (!isVisitorId(body.datafast_visitor_id)) {
    return NextResponse.json({ error: "Missing or invalid visitor id" }, { status: 400 });
  }

  const payload = {
    datafast_visitor_id: body.datafast_visitor_id,
    name: body.name,
    metadata: cleanMetadata(body.name, body.metadata),
  };
  try {
    const response = await fetch(DATAFAST_GOALS, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.DATAFAST_API_KEY}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error(`[datafast] goal ${payload.name} failed: HTTP ${response.status}`);
      return NextResponse.json({ error: "DataFast request failed" }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[datafast] proxy error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Failed to reach DataFast" }, { status: 502 });
  }
}
