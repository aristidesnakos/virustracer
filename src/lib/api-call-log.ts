// One log line per public API call, written by `src/proxy.ts` before the CDN
// cache answers, so cached calls are counted too. Vercel's request logs carry the
// path and status but not who called, so this line adds the user agent, referrer
// host and country. No IP address is logged. Pure (no Next imports) for testing.

/** Query parameters the API accepts; anything else is left out of the log. */
const LOGGED_PARAMS = ["format", "include", "from", "to", "limit"] as const;

const MAX_PATH = 120;
const MAX_PARAM = 20;
const MAX_UA = 160;

/** Collapse quotes, backslashes and whitespace so one call is one parseable line. */
function clean(value: string, max: number): string {
  return value.replace(/["\\\s]+/g, " ").trim().slice(0, max);
}

/** Host of the Referer header, or "-" when absent or unparseable. */
function referrerHost(referer: string | null): string {
  if (!referer) return "-";
  try {
    return new URL(referer).host || "-";
  } catch {
    return "-";
  }
}

/**
 * `[api-call] GET path=/api/v1/toll q=format=csv ref=example.org country=GR ua="curl/8.7.1"`.
 * The user agent goes last, in quotes, because it holds spaces.
 */
export function apiCallLogLine(request: { method: string; url: string; headers: Headers }): string {
  const url = new URL(request.url);
  const query = LOGGED_PARAMS.filter((key) => url.searchParams.has(key))
    .map((key) => `${key}=${clean(url.searchParams.get(key) ?? "", MAX_PARAM).replace(/[ &]/g, "")}`)
    .join("&");
  const country = (request.headers.get("x-vercel-ip-country") ?? "").replace(/[^A-Z]/g, "").slice(0, 2);
  const ua = clean(request.headers.get("user-agent") ?? "", MAX_UA);
  return [
    "[api-call]",
    request.method.replace(/[^A-Z]/g, "").slice(0, 7) || "-",
    `path=${clean(url.pathname, MAX_PATH).replace(/ /g, "") || "-"}`,
    `q=${query || "-"}`,
    `ref=${referrerHost(request.headers.get("referer"))}`,
    `country=${country || "-"}`,
    `ua="${ua || "-"}"`,
  ].join(" ");
}
