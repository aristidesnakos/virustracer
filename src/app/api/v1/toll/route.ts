import { getDefaultOutbreak } from "@/data/outbreaks";
import { optionsResponse } from "@/lib/api";
import { tollResponse } from "@/lib/api-handlers";

// GET /api/v1/toll — permanent alias for the default outbreak. Same response as
// /api/v1/outbreaks/<default slug>/toll; parameters are documented on /data.

export function GET(request: Request) {
  return tollResponse(getDefaultOutbreak(), request);
}

export function OPTIONS() {
  return optionsResponse();
}
