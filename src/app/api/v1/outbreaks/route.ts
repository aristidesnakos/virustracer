import { optionsResponse } from "@/lib/api";
import { outbreaksListResponse } from "@/lib/api-handlers";

// GET /api/v1/outbreaks — every outbreak the site tracks, with latest figures and links.

export function GET() {
  return outbreaksListResponse();
}

export function OPTIONS() {
  return optionsResponse();
}
