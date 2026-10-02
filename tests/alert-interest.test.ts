import { describe, it, expect } from "vitest";
import {
  createRateLimiter,
  describeSubmission,
  escapeHtml,
  isPlausibleEmail,
  parseInterest,
} from "@/lib/alert-interest";

const valid = {
  kind: "submit",
  events: ["new-country", "milestone"],
  channel: "email",
  role: "journalist",
  email: "a@b.org",
  website: "",
};

describe("parseInterest", () => {
  it("accepts an open ping", () => {
    expect(parseInterest({ kind: "open" })).toEqual({ ok: true, value: { kind: "open" } });
  });

  it("accepts a full submission and trims the email", () => {
    expect(parseInterest({ ...valid, email: "  a@b.org " })).toEqual({
      ok: true,
      value: { kind: "submit", events: ["new-country", "milestone"], channel: "email", role: "journalist", email: "a@b.org" },
    });
  });

  it("treats role and email as optional", () => {
    const out = parseInterest({ ...valid, role: "", email: "" });
    expect(out).toMatchObject({ ok: true, value: { role: null, email: null } });
  });

  it("silently drops a filled honeypot", () => {
    expect(parseInterest({ ...valid, website: "http://spam.example" })).toEqual({ ok: true, drop: true });
  });

  it.each([
    ["non-object", "hello"],
    ["array", []],
    ["null", null],
    ["unknown kind", { kind: "delete" }],
    ["no events", { ...valid, events: [] }],
    ["unknown event", { ...valid, events: ["new-country", "bogus"] }],
    ["events not an array", { ...valid, events: "new-country" }],
    ["no channel", { ...valid, channel: undefined }],
    ["unknown channel", { ...valid, channel: "carrier-pigeon" }],
    ["unknown role", { ...valid, role: "wizard" }],
    ["bad email", { ...valid, email: "not-an-email" }],
    ["email of wrong type", { ...valid, email: 42 }],
    ["overlong email", { ...valid, email: `${"a".repeat(130)}@b.org` }],
  ])("rejects %s", (_name, body) => {
    expect(parseInterest(body).ok).toBe(false);
  });

  it("de-duplicates repeated events", () => {
    const out = parseInterest({ ...valid, events: ["milestone", "milestone"] });
    expect(out).toMatchObject({ ok: true, value: { events: ["milestone"] } });
  });
});

describe("isPlausibleEmail", () => {
  it.each(["a@b.co", "first.last+tag@sub.example.org"])("accepts %s", (e) => expect(isPlausibleEmail(e)).toBe(true));
  it.each(["a@b", "a b@c.org", "@b.org", "a@@b.org", ""])("rejects %j", (e) => expect(isPlausibleEmail(e)).toBe(false));
});

describe("describeSubmission", () => {
  it("lists what was asked for in readable form", () => {
    const parsed = parseInterest(valid);
    if (!parsed.ok || "drop" in parsed || parsed.value.kind !== "submit") throw new Error("setup");
    const text = describeSubmission(parsed.value);
    expect(text).toContain("A new country reports cases; The death toll passes a milestone");
    expect(text).toContain("Via: Email");
    expect(text).toContain("Role: Journalist");
    expect(text).toContain("Email: a@b.org");
  });
});

describe("escapeHtml", () => {
  it("escapes markup", () => {
    expect(escapeHtml(`<b onclick="x">&'`)).toBe("&lt;b onclick=&quot;x&quot;&gt;&amp;&#39;");
  });
});

describe("createRateLimiter", () => {
  it("allows up to the limit per key within the window, then blocks", () => {
    const rl = createRateLimiter(2, 1000, () => 0);
    expect(rl.allow("a")).toBe(true);
    expect(rl.allow("a")).toBe(true);
    expect(rl.allow("a")).toBe(false);
    expect(rl.allow("b")).toBe(true);
  });
  it("starts a fresh window once the old one has passed", () => {
    let t = 0;
    const rl = createRateLimiter(1, 1000, () => t);
    expect(rl.allow("a")).toBe(true);
    expect(rl.allow("a")).toBe(false);
    t = 1500;
    expect(rl.allow("a")).toBe(true);
  });
});
