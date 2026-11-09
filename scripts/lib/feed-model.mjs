// Model calls for scripts/fetch-feeds.mjs. `client` is anything shaped like the OpenAI SDK
// (`client.chat.completions.create`), so tests pass a fake. Both functions retry 429/5xx and
// network errors with backoff and THROW when the call finally fails: "the model answered that
// there is nothing here" (null) is different from "the call failed", and only the first may be
// remembered as checked. Unit-tested in tests/feed-model.test.ts.
//
// Why reasoning is off (diagnosed 2026-11-08 with scripts/diagnose-model.mjs, workflow run
// 42482944426): OpenRouter spreads this model over many providers, and some of them (Baidu,
// Parasail, SiliconFlow, GMICloud, Venice) run it with reasoning ON by default while others
// (Wafer, DeepInfra) do not. Reasoning tokens count against max_tokens, so on a reasoning
// provider a 150-token summary budget was used up by reasoning (finish_reason "length",
// content null): 18 of 60 production-setting summaries failed that way, every one with
// reasoning tokens, none without. With `reasoning: {enabled: false}` 60/60 succeeded on the
// same items. max_tokens is generous (billed per token produced, not per token allowed) so a
// provider that ignored the flag would still have room to answer.
import { retry, isTransientError } from "./pool.mjs";
import { isHeadlineOnly, summaryProblem, cleanSummary } from "./feed-items.mjs";

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

// Visible answers in the diagnostic were at most 77 (summary) and 35 (candidate) tokens.
export const SUMMARY_PARAMS = { max_tokens: 1000, reasoning: { enabled: false } };
export const CANDIDATE_PARAMS = { max_tokens: 1000, reasoning: { enabled: false }, response_format: { type: "json_object" } };

/** What a chat completion says about itself, for error messages and logs. */
export function describeResponse(response) {
  const choice = response?.choices?.[0];
  const msg = choice?.message ?? {};
  const content = typeof msg.content === "string" ? msg.content.trim() : "";
  const reasoningTokens = response?.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
  const reasoningText = typeof msg.reasoning === "string" ? msg.reasoning.length : 0;
  return {
    content,
    finishReason: choice?.finish_reason ?? null,
    provider: response?.provider ?? null,
    completionTokens: response?.usage?.completion_tokens ?? null,
    reasoningTokens,
    usedReasoning: reasoningTokens > 0 || reasoningText > 0,
  };
}

/**
 * A call that came back but is unusable. `cause` is a short code counted in the run summary:
 * "length_reasoning" (budget used up by reasoning), "length" (answer cut off), "empty" (no text,
 * finished normally), "invalid_json" (candidate answer is not JSON), "meta" (a summary that
 * describes the source, e.g. "the article does not provide a toll"), "too_short" (a stub).
 */
export class ModelResponseError extends Error {
  constructor(cause, info) {
    const parts = [`finish_reason=${info.finishReason ?? "none"}`, `provider=${info.provider ?? "unknown"}`];
    parts.push(`reasoning_tokens=${info.reasoningTokens}${info.usedReasoning ? "" : " (no reasoning)"}`);
    if (info.completionTokens != null) parts.push(`completion_tokens=${info.completionTokens}`);
    const label =
      {
        invalid_json: "invalid JSON from model",
        meta: "model described the source instead of summarising it",
        too_short: "model answer too short",
      }[cause] ?? "empty model response";
    super(`${label}: ${cause} (${parts.join(", ")})`);
    this.name = "ModelResponseError";
    this.cause_code = cause;
    this.info = info;
  }
}

function classify(info) {
  if (info.finishReason === "length") return info.usedReasoning ? "length_reasoning" : "length";
  return "empty";
}

/** Short cause code for any error from a model call: the run summary counts these. */
export function failureCause(err) {
  if (err instanceof ModelResponseError) return err.cause_code;
  const status = /** @type {any} */ (err)?.status;
  if (typeof status === "number") return `http_${status}`;
  const name = String(/** @type {any} */ (err)?.name ?? "");
  if (/Timeout|Abort/i.test(name)) return "timeout";
  if (/Connection/i.test(name) || /** @type {any} */ (err)?.code) return "network";
  return "error";
}

// One extra try for an unusable answer (a different provider may be picked); transient
// HTTP/network errors keep the normal retry budget.
function withEmptyRetry(retryOpts) {
  let emptyRetries = 0;
  const base = retryOpts.isRetryable ?? isTransientError;
  return {
    ...retryOpts,
    isRetryable: (e) => {
      if (e instanceof ModelResponseError) return emptyRetries++ < 1;
      return base(e);
    },
  };
}

/**
 * Call the model and return `parse(answer, info)`, or throw ModelResponseError. `parse` may throw
 * a ModelResponseError of its own (kept as is); any other error from it becomes "invalid_json".
 */
async function callModel(client, params, prompt, retryOpts, parse = (t) => t) {
  return retry(async () => {
    const response = await client.chat.completions.create({
      model: MODEL,
      ...params,
      messages: [{ role: "user", content: prompt }],
    });
    const info = describeResponse(response);
    // A cut-off answer is unusable even when some text came back.
    if (!info.content || info.finishReason === "length") throw new ModelResponseError(classify(info), info);
    try {
      return parse(info.content, info);
    } catch (err) {
      if (err instanceof ModelResponseError) throw err;
      throw new ModelResponseError("invalid_json", info);
    }
  }, withEmptyRetry(retryOpts));
}

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

// Summary prompts, version SUMMARY_VERSION in feed-items.mjs. The version-1 prompt told the model
// to "LEAD with [the toll] (include the as-of date if given)" and was used on bare Google News
// headlines too: it invented dates ("As of March 2026" on a November headline) and wrote filler
// ("the article does not provide a death toll") in 32 of 100 displayed summaries (2026-11-09).

/** For an item with real text (a WHO report, a CIDRAP lead, an article body). */
export function summaryPrompt(feedConfig, title, description) {
  return `Summarize this news item about ${feedConfig.subject} in 1–2 factual sentences, using only facts stated below.
- If it states a cumulative death toll or confirmed case count, lead with that figure. Give a date only if the text states one; never write "as of the article" or "as of the report".
- Otherwise give the key figures or official statements it contains.
- Never describe the text or what it lacks (no "the article does not provide…", "no toll was given"), and never refuse: summarize what is there.
- No preamble.

Title: ${title}
Content: ${description}`;
}

/** Headline and publisher of a Google News style title ("Headline - Publisher"). */
export function splitHeadline(title) {
  const m = String(title ?? "").match(/^(.*\S)\s+[-–—|]\s+([^-–—|]{2,60})$/);
  return m ? { headline: m[1], publisher: m[2].trim() } : { headline: String(title ?? "").trim(), publisher: "" };
}

/** For an item whose only text is its headline (Google News RSS): restate it, add nothing. */
export function headlinePrompt(feedConfig, title) {
  const { headline, publisher } = splitHeadline(title);
  return `Below is a news headline about ${feedConfig.subject}. The article itself is not available.
Rewrite the headline as one plain, factual English sentence of at most 35 words.
- Use only what the headline says: add no figures, dates, places, names or context it does not contain.
- Do not mention the headline, the article or anything that is missing, and do not refuse.
${publisher ? `- End with "${publisher} reported." if the sentence does not already name a source.
` : ""}- Reply with the sentence only: no preamble, no quotation marks.

Headline: ${headline}${publisher ? `
Publisher: ${publisher}` : ""}`;
}

/**
 * @returns {Promise<null | {country: string, iso: string, flag: string, casesMentioned: number|null, deathsMentioned: number|null, context: string}>}
 */
export async function extractCandidate(client, feedConfig, title, description, retryOpts = {}) {
  const prompt = candidatePrompt(feedConfig, title, description);

  // Not JSON: throws, never remembered as checked. A ```json fence (some models add one) is accepted.
  const parsed = await callModel(client, CANDIDATE_PARAMS, prompt, retryOpts, (t) =>
    JSON.parse(t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")),
  );
  if (!parsed || typeof parsed !== "object" || !parsed.country || !parsed.iso) return null;
  return {
    country: String(parsed.country),
    iso: String(parsed.iso).toUpperCase(),
    flag: isoToFlag(parsed.iso),
    casesMentioned: typeof parsed.casesMentioned === "number" ? parsed.casesMentioned : null,
    deathsMentioned: typeof parsed.deathsMentioned === "number" ? parsed.deathsMentioned : null,
    context: parsed.context ? String(parsed.context) : "",
  };
}

/**
 * @returns {Promise<string>} the summary; throws when the call fails or the answer is unusable
 * (filler or a stub, after one retry), and callers fall back to the description. An item whose
 * only text is its headline (isHeadlineOnly) gets headlinePrompt, any other summaryPrompt.
 */
export async function extractSummary(client, feedConfig, title, description, retryOpts = {}) {
  const prompt = isHeadlineOnly(title, description)
    ? headlinePrompt(feedConfig, title)
    : summaryPrompt(feedConfig, title, description);
  return callModel(client, SUMMARY_PARAMS, prompt, retryOpts, (answer, info) => {
    const text = cleanSummary(answer);
    const problem = summaryProblem(text);
    if (problem) throw new ModelResponseError(problem, info);
    return text;
  });
}
