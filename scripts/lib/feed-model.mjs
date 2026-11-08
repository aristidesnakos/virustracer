// Model calls for scripts/fetch-feeds.mjs. `client` is anything shaped like the OpenAI SDK
// (`client.chat.completions.create`), so tests pass a fake. Both functions retry 429/5xx and
// network errors with backoff and THROW when the call finally fails: "the model answered that
// there is nothing here" (null) is different from "the call failed", and only the first may be
// remembered as checked. Unit-tested in tests/feed-model.test.ts.
import { retry } from "./pool.mjs";

export const MODEL = "deepseek/deepseek-v4-flash";

// ── ISO 3166-1 alpha-2 → flag emoji ───────────────────────────────────────────
export function isoToFlag(iso) {
  if (!iso || typeof iso !== "string" || iso.length !== 2) return "";
  const A = 0x1F1E6;
  const code = iso.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return (
    String.fromCodePoint(A + code.charCodeAt(0) - 65) +
    String.fromCodePoint(A + code.charCodeAt(1) - 65)
  );
}

export const SUMMARY_PARAMS = { max_tokens: 150 };
export const CANDIDATE_PARAMS = { max_tokens: 250, response_format: { type: "json_object" } };

export function candidatePrompt(feedConfig, title, description) {
  return `You extract structured signals from news articles about ${feedConfig.subject}.

Read the title and content. ${feedConfig.extraction.scope}

{"country": "<English country name>", "iso": "<ISO 3166-1 alpha-2>", "casesMentioned": <integer or null>, "deathsMentioned": <integer or null>, "context": "<one short factual sentence from the article>"}

${feedConfig.extraction.exclusions}

{"country": null, "iso": null, "casesMentioned": null, "deathsMentioned": null, "context": null}

Title: ${title}
Content: ${description}

Respond with JSON only.`;
}

export function summaryPrompt(feedConfig, title, description) {
  return `Summarize this news item about ${feedConfig.subject} in 1–2 factual sentences. If the article states the latest cumulative death toll or confirmed case count, LEAD with it (include the as-of date if given). Otherwise include any key figures or official statements. No preamble.

Title: ${title}
Content: ${description}`;
}

/**
 * @returns {Promise<null | {country: string, iso: string, flag: string, casesMentioned: number|null, deathsMentioned: number|null, context: string}>}
 */
export async function extractCandidate(client, feedConfig, title, description, retryOpts = {}) {
  const prompt = candidatePrompt(feedConfig, title, description);

  const raw = await retry(async () => {
    const response = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 250,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });
    return response.choices?.[0]?.message?.content?.trim() ?? "";
  }, retryOpts);
  if (!raw) throw new Error("empty model response");
  const parsed = JSON.parse(raw); // a malformed answer throws: not remembered as checked
  if (!parsed.country || !parsed.iso) return null;
  return {
    country: String(parsed.country),
    iso: String(parsed.iso).toUpperCase(),
    flag: isoToFlag(parsed.iso),
    casesMentioned: typeof parsed.casesMentioned === "number" ? parsed.casesMentioned : null,
    deathsMentioned: typeof parsed.deathsMentioned === "number" ? parsed.deathsMentioned : null,
    context: parsed.context ? String(parsed.context) : "",
  };
}

/** @returns {Promise<string>} the summary; throws when the call fails (callers fall back to the description). */
export async function extractSummary(client, feedConfig, title, description, retryOpts = {}) {
  const prompt = summaryPrompt(feedConfig, title, description);

  const text = await retry(async () => {
    const response = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 150,
      messages: [{ role: "user", content: prompt }],
    });
    return response.choices?.[0]?.message?.content?.trim() ?? "";
  }, retryOpts);
  if (!text) throw new Error("empty model response");
  return text;
}
