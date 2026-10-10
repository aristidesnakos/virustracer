import { NextResponse, type NextRequest } from "next/server";
import { apiCallLogLine } from "@/lib/api-call-log";

// Proxy runs before the CDN cache on Vercel, so this logs every public API call,
// cached or not. It only logs; the request goes on unchanged.

export function proxy(request: NextRequest) {
  console.info(apiCallLogLine(request));
  return NextResponse.next();
}

export const config = {
  matcher: "/api/v1/:path*",
};
