import { optionsResponse } from "@/lib/api";
import { citationsResponse } from "@/lib/nursing-homes-api";

// GET /api/v1/nursing-homes/infection-control-citations — CMS F880 citations by state or facility.

export function GET(request: Request) {
  return citationsResponse(request);
}

export function OPTIONS() {
  return optionsResponse();
}
