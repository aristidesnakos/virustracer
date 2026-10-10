import { describe, it, expect } from "vitest";
import { apiCallLogLine } from "@/lib/api-call-log";

const call = (url: string, headers: Record<string, string> = {}, method = "GET") =>
  apiCallLogLine({ method, url, headers: new Headers(headers) });

describe("apiCallLogLine", () => {
  it("logs path, accepted params, referrer host, country and user agent", () => {
    expect(
      call("https://outbreakfiles.com/api/v1/outbreaks/ebola-bundibugyo-2026/toll?format=csv&limit=10", {
        "user-agent": "python-requests/2.32.3",
        referer: "https://dash.example.org/flu/board?id=7",
        "x-vercel-ip-country": "US",
      }),
    ).toBe(
      '[api-call] GET path=/api/v1/outbreaks/ebola-bundibugyo-2026/toll q=format=csv&limit=10 ref=dash.example.org country=US ua="python-requests/2.32.3"',
    );
  });

  it("uses dashes when headers and params are missing", () => {
    expect(call("https://outbreakfiles.com/api/v1/outbreaks")).toBe(
      '[api-call] GET path=/api/v1/outbreaks q=- ref=- country=- ua="-"',
    );
  });

  it("leaves out unknown params, so nothing a caller adds ends up in the log", () => {
    expect(call("https://x.test/api/v1/toll?email=a@b.c&format=json&token=secret")).toContain(" q=format=json ");
  });

  // Header values cannot hold a raw newline, but they can hold tabs and quotes.
  it("keeps one call on one line whatever the headers hold", () => {
    const line = call("https://x.test/api/v1/toll?format=a%20b%26c", {
      "user-agent": 'Evil "bot"\t[api-call] GET path=/fake',
      referer: "not a url",
      "x-vercel-ip-country": "g\tr",
    });
    expect(line).not.toMatch(/[\t\n]/);
    expect(line.match(/"/g)).toHaveLength(2);
    expect(line).toContain(" q=format=abc ");
    expect(line).toContain(" ref=- ");
    expect(line).toContain(" country=- ");
  });

  it("caps a long user agent", () => {
    const line = call("https://x.test/api/v1/toll", { "user-agent": "a".repeat(500) });
    expect(line).toContain(`ua="${"a".repeat(160)}"`);
  });
});
