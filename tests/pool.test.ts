import { describe, it, expect } from "vitest";
import { mapPool, retry, isTransientError, retryAfterMs } from "../scripts/lib/pool.mjs";

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe("mapPool", () => {
  it("keeps input order whatever the completion order", async () => {
    const out = await mapPool([30, 1, 15], 3, async (ms: number) => {
      await tick(ms);
      return ms;
    });
    expect(out.map((r) => (r as { value: number }).value)).toEqual([30, 1, 15]);
  });

  it("never runs more than `limit` at once, and does use the limit", async () => {
    let active = 0;
    let peak = 0;
    await mapPool(Array.from({ length: 12 }, (_, i) => i), 4, async () => {
      active++;
      peak = Math.max(peak, active);
      await tick(2);
      active--;
    });
    expect(peak).toBe(4);
  });

  it("isolates errors: a rejected item does not lose the others", async () => {
    const out = await mapPool([1, 2, 3], 2, async (n: number) => {
      if (n === 2) throw new Error("boom");
      return n * 10;
    });
    expect(out[0]).toEqual({ status: "fulfilled", value: 10 });
    expect(out[1]).toMatchObject({ status: "rejected" });
    expect(out[2]).toEqual({ status: "fulfilled", value: 30 });
  });

  it("handles an empty list and a bad limit", async () => {
    expect(await mapPool([], 4, async () => 1)).toEqual([]);
    const out = await mapPool([1, 2], 0, async (n: number) => n);
    expect(out).toHaveLength(2);
  });
});

describe("retry", () => {
  const noSleep = async () => {};

  it("retries transient errors with growing delays, then succeeds", async () => {
    const delays: number[] = [];
    let calls = 0;
    const v = await retry(
      async () => {
        calls++;
        if (calls < 3) throw Object.assign(new Error("rate"), { status: 429 });
        return "ok";
      },
      { sleep: async (ms: number) => void delays.push(ms), random: () => 1, baseDelayMs: 100 },
    );
    expect(v).toBe("ok");
    expect(calls).toBe(3);
    expect(delays).toEqual([100, 200]);
  });

  it("gives up after `retries` and rethrows the last error", async () => {
    let calls = 0;
    await expect(
      retry(
        async () => {
          calls++;
          throw Object.assign(new Error("down"), { status: 503 });
        },
        { retries: 2, sleep: noSleep },
      ),
    ).rejects.toThrow("down");
    expect(calls).toBe(3);
  });

  it("does not retry a 400/401 or a plain error", async () => {
    let calls = 0;
    await expect(
      retry(async () => {
        calls++;
        throw Object.assign(new Error("bad key"), { status: 401 });
      }, { sleep: noSleep }),
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it("honours Retry-After, capped at maxDelayMs", async () => {
    const delays: number[] = [];
    let calls = 0;
    await retry(
      async () => {
        calls++;
        if (calls === 1) throw Object.assign(new Error("429"), { status: 429, headers: { "retry-after": "5" } });
      },
      { sleep: async (ms: number) => void delays.push(ms), random: () => 0, baseDelayMs: 10, maxDelayMs: 3000 },
    );
    expect(delays).toEqual([3000]);
  });
});

describe("isTransientError / retryAfterMs", () => {
  it("classifies statuses and connection errors", () => {
    for (const status of [408, 409, 429, 500, 502, 503]) expect(isTransientError({ status })).toBe(true);
    for (const status of [400, 401, 403, 404]) expect(isTransientError({ status })).toBe(false);
    expect(isTransientError({ name: "APIConnectionError" })).toBe(true);
    expect(isTransientError({ code: "ECONNRESET" })).toBe(true);
    expect(isTransientError(new SyntaxError("Unexpected token"))).toBe(false);
    expect(isTransientError(null)).toBe(false);
  });

  it("reads Retry-After from plain objects and Headers", () => {
    expect(retryAfterMs({ headers: { "retry-after": "2" } })).toBe(2000);
    expect(retryAfterMs({ headers: new Headers({ "retry-after": "7" }) })).toBe(7000);
    expect(retryAfterMs({ headers: {} })).toBeNull();
    expect(retryAfterMs(new Error("x"))).toBeNull();
  });
});
