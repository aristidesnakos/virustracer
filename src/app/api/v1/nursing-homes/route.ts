import { optionsResponse } from "@/lib/api";
import { nursingHomesIndexResponse } from "@/lib/nursing-homes-api";

// GET /api/v1/nursing-homes — the nursing-home data layer: datasets and how fresh each is.

export function GET() {
  return nursingHomesIndexResponse();
}

export function OPTIONS() {
  return optionsResponse();
}
