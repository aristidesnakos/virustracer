// Shared by the alerts-interest widget and its API route. Pure and client-safe.
//
// Alerts do not exist yet. The widget is a demand test: one email field, so the
// signal is how many people who open it leave an address. The page they were on
// is recorded too, to see which outbreak the interest comes from. Keep the
// wording honest that alerts are not built.

export const MAX_EMAIL_LENGTH = 120;
export const MAX_PAGE_LENGTH = 200;
export const MAX_BODY_BYTES = 4096;

export type InterestPayload =
  | { kind: "open" }
  | { kind: "submit"; email: string; page: string | null };

export type ParseResult =
  | { ok: true; value: InterestPayload }
  /** `drop` is a bot (honeypot filled): answer success but do nothing. */
  | { ok: true; drop: true }
  | { ok: false; error: string };

// Deliberately simple: one @, something either side, a dot in the domain, no spaces.
export function isPlausibleEmail(value: string): boolean {
  return value.length <= MAX_EMAIL_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
  if (b.kind !== "submit") return { ok: false, error: "Invalid request." };

  const email = typeof b.email === "string" ? b.email.trim() : "";
  if (!isPlausibleEmail(email)) return { ok: false, error: "That email address does not look right." };

  return { ok: true, value: { kind: "submit", email, page: parsePage(b.page) } };
}

export function describeSubmission(p: Extract<InterestPayload, { kind: "submit" }>): string {
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
