import { describe, it, expect } from "vitest";
import {
  createRateLimiter,
  describeSubmission,
  escapeHtml,
  isPlausibleEmail,
  parseInterest,
} from "@/lib/alert-interest";

const valid = { kind: "submit", email: "a@b.org", page: "/outbreaks/measles-bangladesh-2026", website: "" };

describe("parseInterest", () => {
  it("accepts an open ping", () => {
    expect(parseInterest({ kind: "open" })).toEqual({ ok: true, value: { kind: "open" } });
  });

  it("accepts a submission and trims the email", () => {
    expect(parseInterest({ ...valid, email: "  a@b.org " })).toEqual({
      ok: true,
      value: { kind: "submit", email: "a@b.org", page: "/outbreaks/measles-bangladesh-2026" },
    });
  });

  it.each([
    ["missing", undefined],
    ["a full URL", "https://evil.example/x"],
    ["markup", "/<script>"],
    ["overlong", `/${"a".repeat(250)}`],
  ])("keeps the sign-up but drops a page that is %s", (_name, page) => {
    expect(parseInterest({ ...valid, page })).toMatchObject({ ok: true, value: { page: null } });
  });

  it("silently drops a filled honeypot", () => {
    expect(parseInterest({ ...valid, website: "http://spam.example" })).toEqual({ ok: true, drop: true });
  });

  it.each([
    ["non-object", "hello"],
    ["array", []],
    ["null", null],
    ["unknown kind", { kind: "delete" }],
    ["no email", { ...valid, email: "" }],
    ["bad email", { ...valid, email: "not-an-email" }],
    ["email of wrong type", { ...valid, email: 42 }],
    ["overlong email", { ...valid, email: `${"a".repeat(130)}@b.org` }],
  ])("rejects %s", (_name, body) => {
    expect(parseInterest(body).ok).toBe(false);
  });
});

describe("isPlausibleEmail", () => {
  it.each(["a@b.co", "first.last+tag@sub.example.org"])("accepts %s", (e) => expect(isPlausibleEmail(e)).toBe(true));
  it.each(["a@b", "a b@c.org", "@b.org", "a@@b.org", ""])("rejects %j", (e) => expect(isPlausibleEmail(e)).toBe(false));
});

describe("describeSubmission", () => {
  it("names the email and the page", () => {
    const text = describeSubmission({ kind: "submit", email: "a@b.org", page: null });
    expect(text).toContain("Email: a@b.org");
    expect(text).toContain("Page: unknown");
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
