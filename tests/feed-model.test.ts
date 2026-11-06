import { describe, it, expect } from "vitest";
import { extractCandidate, extractSummary, isoToFlag } from "../scripts/lib/feed-model.mjs";

const cfg = { subject: "Ebola", extraction: { scope: "Return the country.", exclusions: "Else return nulls." } };
const noSleep = { sleep: async () => {}, random: () => 0 };

function fakeClient(responses: Array<string | Error>) {
  const calls: unknown[] = [];
  return {
    calls,
    chat: {
      completions: {
        create: async (req: unknown) => {
          calls.push(req);
          const r = responses.shift();
          if (r instanceof Error) throw r;
          return { choices: [{ message: { content: r } }] };
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
    expect(await extractSummary(fakeClient([" Two deaths. "]), cfg, "t", "d", noSleep)).toBe("Two deaths.");
    await expect(extractSummary(fakeClient([Object.assign(new Error("bad"), { status: 400 })]), cfg, "t", "d", noSleep)).rejects.toThrow("bad");
  });
});
