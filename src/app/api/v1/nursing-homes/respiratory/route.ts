import { optionsResponse } from "@/lib/api";
import { respiratoryResponse } from "@/lib/nursing-homes-api";

// GET /api/v1/nursing-homes/respiratory — CDC NHSN weekly respiratory figures for nursing-home residents.

export function GET(request: Request) {
  return respiratoryResponse(request);
}

export function OPTIONS() {
  return optionsResponse();
}
