import { getDefaultOutbreak } from "@/data/outbreaks";
import { optionsResponse } from "@/lib/api";
import { signalsResponse } from "@/lib/api-handlers";

// GET /api/v1/signals — permanent alias for the default outbreak. Same response
// as /api/v1/outbreaks/<default slug>/signals.

export function GET() {
  return signalsResponse(getDefaultOutbreak());
}

export function OPTIONS() {
  return optionsResponse();
}
