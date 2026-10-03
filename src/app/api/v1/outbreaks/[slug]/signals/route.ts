import { optionsResponse } from "@/lib/api";
import { forOutbreak, signalsResponse } from "@/lib/api-handlers";

// GET /api/v1/outbreaks/<slug>/signals — same response as the un-prefixed /api/v1/signals, for any registered outbreak.

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return forOutbreak(slug, (outbreak) => signalsResponse(outbreak));
}

export function OPTIONS() {
  return optionsResponse();
}
