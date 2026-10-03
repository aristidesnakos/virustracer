import { getDefaultOutbreak } from "@/data/outbreaks";
import { optionsResponse } from "@/lib/api";
import { metricsResponse } from "@/lib/api-handlers";

// GET /api/v1/metrics — permanent alias for the default outbreak. Same response
// as /api/v1/outbreaks/<default slug>/metrics; the method is described on /data.

export function GET(request: Request) {
  return metricsResponse(getDefaultOutbreak(), request);
}

export function OPTIONS() {
  return optionsResponse();
}
