import { describe, it, expect } from "vitest";
import {
  extractCandidate,
  extractSummary,
  isoToFlag,
  failureCause,
  ModelResponseError,
  SUMMARY_PARAMS,
  CANDIDATE_PARAMS,
  headlinePrompt,
  summaryPrompt,
  splitHeadline,
} from "../scripts/lib/feed-model.mjs";

const cfg = { subject: "Ebola", extraction: { scope: "Return the country.", exclusions: "Else return nulls." } };
const noSleep = { sleep: async () => {}, random: () => 0 };

type Fake = string | Error | { choices: unknown[]; provider?: string; usage?: unknown };
function fakeClient(responses: Fake[]) {
  const calls: unknown[] = [];
  return {
    calls,
    chat: {
      completions: {
        create: async (req: unknown) => {
          calls.push(req);
          const r = responses.shift();
          if (r instanceof Error) throw r;
          if (typeof r === "object" && r) return r;
          return { choices: [{ message: { content: r }, finish_reason: "stop" }] };
        },
      },
    },
  };
}

describe("extractCandidate", () => {
  it("returns a candidate with flag and numeric fields", async () => {
    const c = fakeClient([JSON.stringify({ country: "Uganda", iso: "ug", casesMentioned: 4, deathsMentioned: "x", context: "Four cases." })]);
    const out = await extractCandidate(c, cfg, "t", "d", noSleep);
    expect(out).toEqual({ country: "Uganda", iso: "UG", flag: isoToFlag("UG"), casesMentioned: 4, deathsMentioned: null, context: "Four cases." });
  });

  it("returns null (not an error) when the model says there is no country", async () => {
    const c = fakeClient([JSON.stringify({ country: null, iso: null })]);
    expect(await extractCandidate(c, cfg, "t", "d", noSleep)).toBeNull();
  });

  it("retries a 429 then succeeds", async () => {
    const c = fakeClient([Object.assign(new Error("slow down"), { status: 429 }), JSON.stringify({ country: "Kenya", iso: "KE" })]);
    const out = await extractCandidate(c, cfg, "t", "d", noSleep);
    expect(out?.iso).toBe("KE");
    expect(c.calls).toHaveLength(2);
  });

  it("throws when the call keeps failing, on bad JSON, and on an empty answer", async () => {
    const down = Object.assign(new Error("down"), { status: 500 });
    await expect(extractCandidate(fakeClient([down, down, down, down]), cfg, "t", "d", { ...noSleep, retries: 3 })).rejects.toThrow("down");
    await expect(extractCandidate(fakeClient(["not json"]), cfg, "t", "d", noSleep)).rejects.toThrow();
    await expect(extractCandidate(fakeClient([""]), cfg, "t", "d", noSleep)).rejects.toThrow("empty");
  });
});

describe("extractSummary", () => {
  it("returns the model text and throws on failure", async () => {
    expect(await extractSummary(fakeClient([" Two deaths were reported on Friday. "]), cfg, "t", "d", noSleep)).toBe("Two deaths were reported on Friday.");
    await expect(extractSummary(fakeClient([Object.assign(new Error("bad"), { status: 400 })]), cfg, "t", "d", noSleep)).rejects.toThrow("bad");
  });
});

/** What a reasoning provider returned in the diagnostic: the whole budget spent on reasoning. */
const reasoningCutOff = {
  provider: "Baidu",
  choices: [{ message: { content: null, reasoning: "Let me think..." }, finish_reason: "length" }],
  usage: { completion_tokens: 150, completion_tokens_details: { reasoning_tokens: 150 } },
};

describe("empty and cut-off answers", () => {
  it("asks for reasoning off and a generous token budget on both calls", async () => {
    const c = fakeClient(["Officials reported two new cases.", JSON.stringify({ country: null, iso: null })]);
    await extractSummary(c, cfg, "t", "d", noSleep);
    await extractCandidate(c, cfg, "t", "d", noSleep);
    const [sumReq, candReq] = c.calls as Array<Record<string, unknown>>;
    expect(sumReq).toMatchObject({ reasoning: { enabled: false }, max_tokens: SUMMARY_PARAMS.max_tokens });
    expect(candReq).toMatchObject({ reasoning: { enabled: false }, response_format: { type: "json_object" }, max_tokens: CANDIDATE_PARAMS.max_tokens });
    expect(SUMMARY_PARAMS.max_tokens).toBeGreaterThanOrEqual(500);
  });

  it("retries an empty answer once, then succeeds", async () => {
    const c = fakeClient([reasoningCutOff, "Two deaths were reported on Friday."]);
    expect(await extractSummary(c, cfg, "t", "d", noSleep)).toBe("Two deaths were reported on Friday.");
    expect(c.calls).toHaveLength(2);
  });

  it("names the cause after the one retry: finish_reason length used up by reasoning", async () => {
    const c = fakeClient([reasoningCutOff, reasoningCutOff, "never reached"]);
    const err = await extractSummary(c, cfg, "t", "d", noSleep).catch((e) => e);
    expect(err).toBeInstanceOf(ModelResponseError);
    expect(failureCause(err)).toBe("length_reasoning");
    expect(err.message).toMatch(/finish_reason=length/);
    expect(err.message).toMatch(/provider=Baidu/);
    expect(err.message).toMatch(/reasoning_tokens=150/);
    expect(c.calls).toHaveLength(2);
  });

  it("treats a cut-off answer without reasoning as 'length', even if some text came back", async () => {
    const cut = { provider: "Wafer", choices: [{ message: { content: "The outbreak has" }, finish_reason: "length" }], usage: { completion_tokens: 1000 } };
    const err = await extractSummary(fakeClient([cut, cut]), cfg, "t", "d", noSleep).catch((e) => e);
    expect(failureCause(err)).toBe("length");
    expect(err.message).toMatch(/no reasoning/);
  });

  it("an empty answer that finished normally is 'empty'; an empty string never becomes a summary", async () => {
    const err = await extractSummary(fakeClient(["", ""]), cfg, "t", "d", noSleep).catch((e) => e);
    expect(failureCause(err)).toBe("empty");
  });

  it("a truncated candidate JSON is retried once and then reported as invalid_json, never returned", async () => {
    const c = fakeClient(['{"country": "Uga', '{"country": "Uga']);
    const err = await extractCandidate(c, cfg, "t", "d", noSleep).catch((e) => e);
    expect(failureCause(err)).toBe("invalid_json");
    expect(c.calls).toHaveLength(2);
  });

  it("accepts a JSON answer wrapped in a code fence", async () => {
    const out = await extractCandidate(fakeClient(['```json\n{"country": "Kenya", "iso": "KE"}\n```']), cfg, "t", "d", noSleep);
    expect(out?.iso).toBe("KE");
  });

  it("a JSON null answer means no country", async () => {
    expect(await extractCandidate(fakeClient(["null"]), cfg, "t", "d", noSleep)).toBeNull();
  });

  it("HTTP and network errors keep their own cause codes", () => {
    expect(failureCause(Object.assign(new Error("x"), { status: 429 }))).toBe("http_429");
    expect(failureCause(Object.assign(new Error("x"), { name: "APIConnectionTimeoutError" }))).toBe("timeout");
    expect(failureCause(Object.assign(new Error("x"), { code: "ECONNRESET" }))).toBe("network");
  });
});

describe("headline-only items (summary prompt version 2)", () => {
  const gTitle = "Ebola death toll in DR Congo passes 5,000 - Al Jazeera";
  const gDesc = "Ebola death toll in DR Congo passes 5,000 Al Jazeera";

  it("uses the headline prompt for a Google News item and the text prompt for real text", async () => {
    const c = fakeClient(["The Ebola death toll in DR Congo has passed 5,000, Al Jazeera reported.", "WHO reported 412 new confirmed cases in the week to 20 October."]);
    expect(await extractSummary(c, cfg, gTitle, gDesc, noSleep)).toBe("The Ebola death toll in DR Congo has passed 5,000, Al Jazeera reported.");
    await extractSummary(c, cfg, "Ebola disease - DRC", "Since 8 October, 412 new confirmed cases and 96 deaths were reported across five provinces.", noSleep);
    const [first, second] = (c.calls as Array<{ messages: Array<{ content: string }> }>).map((r) => r.messages[0].content);
    expect(first).toContain("The article itself is not available");
    expect(first).toContain("Headline: Ebola death toll in DR Congo passes 5,000\nPublisher: Al Jazeera");
    expect(first).not.toMatch(/as-of date/i);
    expect(second).toContain("Content: Since 8 October");
  });

  it("the prompts forbid invented dates and comments on the source", () => {
    const h = headlinePrompt(cfg, gTitle);
    expect(h).toMatch(/add no figures, dates/);
    expect(h).toMatch(/Do not mention the headline, the article or anything that is missing/);
    expect(h).toMatch(/End with "Al Jazeera reported\."/);
    const t = summaryPrompt(cfg, "t", "d");
    expect(t).toMatch(/Give a date only if the text states one/);
    expect(t).toMatch(/Never describe the text or what it lacks/);
    expect(splitHeadline("Ebola disease - Uganda")).toEqual({ headline: "Ebola disease", publisher: "Uganda" });
    expect(headlinePrompt(cfg, "No publisher here")).not.toMatch(/Publisher:/);
  });

  it("rejects filler once, then accepts a real answer; two filler answers fail as 'meta'", async () => {
    const filler = "The article does not provide a cumulative death toll or confirmed case count.";
    const ok = fakeClient([filler, "The Ebola death toll in DR Congo has passed 5,000, Al Jazeera reported."]);
    expect(await extractSummary(ok, cfg, gTitle, gDesc, noSleep)).toMatch(/passed 5,000/);
    const err = await extractSummary(fakeClient([filler, filler]), cfg, gTitle, gDesc, noSleep).catch((e) => e);
    expect(failureCause(err)).toBe("meta");
    expect(err.message).toMatch(/model described the source/);
  });

  it("drops a vague 'As of the article' lead-in and quotes, and rejects a stub", async () => {
    expect(await extractSummary(fakeClient(['"As of the article\'s reporting, the toll passed 5,000 in DR Congo."']), cfg, gTitle, gDesc, noSleep)).toBe("The toll passed 5,000 in DR Congo.");
    const err = await extractSummary(fakeClient(["More than", "More than"]), cfg, gTitle, gDesc, noSleep).catch((e) => e);
    expect(failureCause(err)).toBe("too_short");
  });
});
