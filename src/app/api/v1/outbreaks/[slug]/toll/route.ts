import { optionsResponse } from "@/lib/api";
import { forOutbreak, tollResponse } from "@/lib/api-handlers";

// GET /api/v1/outbreaks/<slug>/toll — same response as the un-prefixed /api/v1/toll, for any registered outbreak.

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return forOutbreak(slug, (outbreak) => tollResponse(outbreak, request));
}

export function OPTIONS() {
  return optionsResponse();
}
