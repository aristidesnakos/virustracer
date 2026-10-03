import { optionsResponse } from "@/lib/api";
import { forOutbreak, metricsResponse } from "@/lib/api-handlers";

// GET /api/v1/outbreaks/<slug>/metrics — same response as the un-prefixed /api/v1/metrics, for any registered outbreak.

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return forOutbreak(slug, (outbreak) => metricsResponse(outbreak, request));
}

export function OPTIONS() {
  return optionsResponse();
}
