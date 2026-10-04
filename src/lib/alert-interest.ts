// Shared by the alerts-interest widget and its API route. Pure and client-safe.
//
// Alerts do not exist yet. The widget is a demand test: it records which alerts
// people would want, how they want to receive them, and (optionally) an email
// to tell them if the feature ships. Keep the wording honest about that.

export const ALERT_EVENTS = [
  { id: "new-country", label: "A new country reports cases" },
  { id: "new-province", label: "A new region or district within a country is affected" },
  { id: "trend-change", label: "Cases start rising again, or Rt goes above 1" },
  { id: "milestone", label: "The death toll passes a milestone" },
  { id: "summary", label: "A short weekly summary" },
] as const;

export const ALERT_CHANNELS = [
  { id: "email", label: "Email" },
  { id: "whatsapp-sms", label: "WhatsApp or SMS" },
  { id: "slack-teams", label: "Slack or Teams" },
  { id: "webhook", label: "A webhook for my own system" },
  { id: "rss", label: "An RSS feed" },
] as const;

export const ALERT_ROLES = [
  { id: "journalist", label: "Journalist" },
  { id: "health-professional", label: "Health professional" },
  { id: "researcher", label: "Researcher" },
  { id: "aid-worker", label: "Aid or NGO worker" },
  { id: "government", label: "Government or public sector" },
  { id: "business-travel", label: "Business or travel" },
  { id: "following", label: "Just following the news" },
] as const;

export type AlertEventId = (typeof ALERT_EVENTS)[number]["id"];
export type AlertChannelId = (typeof ALERT_CHANNELS)[number]["id"];
export type AlertRoleId = (typeof ALERT_ROLES)[number]["id"];

export const MAX_EMAIL_LENGTH = 120;
export const MAX_BODY_BYTES = 4096;

export type InterestPayload =
  | { kind: "open" }
  | {
      kind: "submit";
      events: AlertEventId[];
      channel: AlertChannelId;
      role: AlertRoleId | null;
      email: string | null;
    };

export type ParseResult =
  | { ok: true; value: InterestPayload }
  /** `drop` is a bot (honeypot filled): answer success but do nothing. */
  | { ok: true; drop: true }
  | { ok: false; error: string };

// Deliberately simple: one @, something either side, a dot in the domain, no spaces.
export function isPlausibleEmail(value: string): boolean {
  return value.length <= MAX_EMAIL_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

const ids = <T extends readonly { id: string }[]>(list: T): string[] => list.map((x) => x.id);

export function parseInterest(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Invalid request." };
  }
  const b = body as Record<string, unknown>;

  // Honeypot: a field real visitors never see or fill.
  if (typeof b.website === "string" && b.website.trim() !== "") return { ok: true, drop: true };

  if (b.kind === "open") return { ok: true, value: { kind: "open" } };
  if (b.kind !== "submit") return { ok: false, error: "Invalid request." };

  if (!Array.isArray(b.events) || b.events.length === 0) {
    return { ok: false, error: "Pick at least one alert you would want." };
  }
  const known = new Set(ids(ALERT_EVENTS));
  const events = [...new Set(b.events)].filter((e): e is AlertEventId => typeof e === "string" && known.has(e));
  if (events.length === 0 || events.length !== new Set(b.events).size) {
    return { ok: false, error: "Unknown alert type." };
  }

  if (typeof b.channel !== "string" || !ids(ALERT_CHANNELS).includes(b.channel)) {
    return { ok: false, error: "Pick how you would want to be alerted." };
  }

  let role: AlertRoleId | null = null;
  if (b.role !== undefined && b.role !== null && b.role !== "") {
    if (typeof b.role !== "string" || !ids(ALERT_ROLES).includes(b.role)) {
      return { ok: false, error: "Unknown role." };
    }
    role = b.role as AlertRoleId;
  }

  let email: string | null = null;
  if (b.email !== undefined && b.email !== null && b.email !== "") {
    if (typeof b.email !== "string") return { ok: false, error: "That email address does not look right." };
    const trimmed = b.email.trim();
    if (!isPlausibleEmail(trimmed)) return { ok: false, error: "That email address does not look right." };
    email = trimmed;
  }

  return { ok: true, value: { kind: "submit", events, channel: b.channel as AlertChannelId, role, email } };
}

const label = (list: readonly { id: string; label: string }[], id: string | null) =>
  list.find((x) => x.id === id)?.label ?? "—";

export function describeSubmission(p: Extract<InterestPayload, { kind: "submit" }>): string {
  return [
    "New interest in outbreak alerts",
    `Wants: ${p.events.map((e) => label(ALERT_EVENTS, e)).join("; ")}`,
    `Via: ${label(ALERT_CHANNELS, p.channel)}`,
    `Role: ${p.role ? label(ALERT_ROLES, p.role) : "not given"}`,
    `Email: ${p.email ?? "not given"}`,
  ].join("\n");
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
