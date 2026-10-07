import type { NextRequest } from "next/server";
import {
  MAX_BODY_BYTES,
  createRateLimiter,
  describeSubmission,
  escapeHtml,
  parseInterest,
  type InterestPayload,
} from "@/lib/alert-interest";
import { SITE_NAME } from "@/lib/site";

// POST /api/alert-interest
// Demand test for outbreak alerts. Alerts are not built: this only records that
// someone would want them. A sign-up must reach a human, so unless a delivery
// channel is configured the route refuses (503) in production instead of
// telling people their interest was saved when it was not.
//
//   INTEREST_WEBHOOK_URL        Slack/Discord-style incoming webhook (optional)
//   RESEND_API_KEY              \
//   ALERT_INTEREST_EMAIL_TO      } all three enable email delivery (optional)
//   ALERT_INTEREST_EMAIL_FROM   /

const submitLimiter = createRateLimiter(4, 10 * 60 * 1000);
const openLimiter = createRateLimiter(30, 10 * 60 * 1000);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

function channels() {
  const webhook = process.env.INTEREST_WEBHOOK_URL;
  const key = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_INTEREST_EMAIL_TO;
  const from = process.env.ALERT_INTEREST_EMAIL_FROM;
  return {
    webhook: webhook || null,
    email: key && to && from ? { key, to, from } : null,
  };
}

async function deliver(p: Extract<InterestPayload, { kind: "submit" }>): Promise<void> {
  const { webhook, email } = channels();
  const text = describeSubmission(p);
  const jobs: Promise<void>[] = [];

  if (webhook) {
    jobs.push(
      fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `text` for Slack, `content` for Discord.
        // Discord parses @everyone/@here anywhere in `content` unless told not to.
        body: JSON.stringify({ text, content: text, allowed_mentions: { parse: [] }, event: "alert-interest", ...p }),
        signal: AbortSignal.timeout(8000),
      }).then((r) => {
        if (!r.ok) throw new Error(`Webhook responded ${r.status}`);
      }),
    );
  }

  if (email) {
    jobs.push(
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${email.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: email.from,
          to: email.to,
          subject: `${SITE_NAME}: someone wants alerts`,
          html: `<pre style="font:14px/1.5 monospace;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
          reply_to: p.email,
        }),
        signal: AbortSignal.timeout(8000),
      }).then(async (r) => {
        // Resend's body says why (unverified domain, bad key), and holds no visitor data.
        if (!r.ok) throw new Error(`Resend responded ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`);
      }),
    );
  }

  const results = await Promise.allSettled(jobs);
  const failed = results.filter((r) => r.status === "rejected");
  // Succeed if at least one channel got it.
  if (failed.length === results.length) throw (failed[0] as PromiseRejectedResult).reason;
  for (const f of failed) console.error("[alert-interest] one channel failed:", (f as PromiseRejectedResult).reason);
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "Request too large." }, 413);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const parsed = parseInterest(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  if ("drop" in parsed) return json({ ok: true });

  const key = clientKey(request);
  const { value } = parsed;

  if (value.kind === "open") {
    if (!openLimiter.allow(key)) return json({ ok: true });
    // Counts how often the prompt is opened, to compare with sign-ups. No personal data.
    console.info("[alert-interest] open");
    return json({ ok: true });
  }

  if (!submitLimiter.allow(key)) return json({ error: "Too many attempts. Please try again later." }, 429);

  // Log the page but never the email address.
  console.info(`[alert-interest] submit page=${value.page ?? "-"}`);

  const { webhook, email } = channels();
  if (!webhook && !email) {
    if (process.env.NODE_ENV === "production") {
      console.error("[alert-interest] no delivery channel configured; sign-up refused");
      return json({ error: "Sign-ups are not available right now. Please try again later." }, 503);
    }
    console.warn("[alert-interest] no delivery channel configured (set INTEREST_WEBHOOK_URL or the Resend variables)");
    return json({ ok: true });
  }

  try {
    await deliver(value);
  } catch (err) {
    console.error("[alert-interest] delivery failed:", err);
    return json({ error: "Could not save that. Please try again." }, 502);
  }
  return json({ ok: true });
}
