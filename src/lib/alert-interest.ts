// Shared by the alerts-interest widget, the /commercial-data form and their API
// route. Pure and client-safe.
//
// Alerts do not exist yet. The widget is a demand test: one email field, so the
// signal is how many people who open it leave an address. The page they were on
// is recorded too, to see which outbreak the interest comes from. Keep the
// wording honest that alerts are not built. The commercial kinds are the same
// test for a paid data feed (see src/lib/commercial.ts).

import { PILOT_PRICE_USD_PER_MONTH, parseSegment, parseUse, segmentLabel, type BuyerSegment } from "@/lib/commercial";

export const MAX_EMAIL_LENGTH = 120;
export const MAX_PAGE_LENGTH = 200;
export const MAX_BODY_BYTES = 4096;

export type InterestPayload =
  | { kind: "open" }
  | { kind: "submit"; email: string; page: string | null }
  | { kind: "commercial-open" }
  | { kind: "commercial"; email: string; segment: BuyerSegment; use: string | null };

/** The kinds that carry an email address and are delivered to a human. */
export type Submission = Extract<InterestPayload, { kind: "submit" | "commercial" }>;

export type ParseResult =
  | { ok: true; value: InterestPayload }
  /** `drop` is a bot (honeypot filled): answer success but do nothing. */
  | { ok: true; drop: true }
  | { ok: false; error: string };

// Deliberately simple: one @, a dot in the domain, and only characters a real
// address uses. The address goes into Resend's `reply_to` and a chat webhook, so
// quotes, angle brackets, commas, colons, semicolons, backslashes, whitespace and
// control characters are refused: no display names, address lists or `<!channel>`.
const EMAIL_PATTERN = /^[\p{L}\p{N}.!#$%&'*+/=?^_`{|}~-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+$/u;

export function isPlausibleEmail(value: string): boolean {
  return value.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(value);
}

// A same-site path such as "/outbreaks/measles-bangladesh-2026"; anything else is dropped.
function parsePage(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_PAGE_LENGTH) return null;
  return /^\/[\w\-/.]*$/.test(value) ? value : null;
}

export function parseInterest(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Invalid request." };
  }
  const b = body as Record<string, unknown>;

  // Honeypot: a field real visitors never see or fill.
  if (typeof b.website === "string" && b.website.trim() !== "") return { ok: true, drop: true };

  if (b.kind === "open") return { ok: true, value: { kind: "open" } };
  if (b.kind === "commercial-open") return { ok: true, value: { kind: "commercial-open" } };
  if (b.kind !== "submit" && b.kind !== "commercial") return { ok: false, error: "Invalid request." };

  const email = typeof b.email === "string" ? b.email.trim() : "";
  if (!isPlausibleEmail(email)) return { ok: false, error: "That email address does not look right." };

  if (b.kind === "submit") return { ok: true, value: { kind: "submit", email, page: parsePage(b.page) } };

  const segment = parseSegment(b.segment);
  if (!segment) return { ok: false, error: "Please choose what describes you best." };
  return { ok: true, value: { kind: "commercial", email, segment, use: parseUse(b.use) } };
}

export function describeSubmission(p: Submission): string {
  if (p.kind === "commercial") {
    return [
      "New interest in commercial H5N1 data",
      `Email: ${p.email}`,
      `Describes them: ${segmentLabel(p.segment)}`,
      `Price shown: $${PILOT_PRICE_USD_PER_MONTH}/month`,
      `Would help them decide: ${p.use ?? "-"}`,
    ].join("\n");
  }
  return ["New interest in outbreak alerts", `Email: ${p.email}`, `Page: ${p.page ?? "unknown"}`].join("\n");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Fixed-window counter per key, with an injectable clock for tests. In-memory, so
 * it is per server instance: a speed bump for abuse, not a guarantee.
 */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { count: number; start: number }>();
  return {
    /** True if this call is allowed. */
    allow(key: string): boolean {
      const t = now();
      for (const [k, v] of hits) if (t - v.start > windowMs) hits.delete(k);
      const cur = hits.get(key);
      if (!cur) {
        hits.set(key, { count: 1, start: t });
        return true;
      }
      cur.count += 1;
      return cur.count <= limit;
    },
  };
}
