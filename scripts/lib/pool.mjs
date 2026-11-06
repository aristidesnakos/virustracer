// Small dependency-free concurrency helpers (no network, no fs). Unit-tested in tests/pool.test.ts.

/**
 * Run `fn(item, index)` over `items` with at most `limit` in flight at once.
 * Results keep the input order and are settled-style, so one failing item never loses the
 * others: `{ status: "fulfilled", value }` or `{ status: "rejected", reason }`.
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R> | R} fn
 * @returns {Promise<Array<{status: "fulfilled", value: R} | {status: "rejected", reason: unknown}>>}
 */
export async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i], i) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}

/** Statuses and network failures worth another try: timeouts, conflicts, 429 and 5xx. */
export function isTransientError(err) {
  if (!err || typeof err !== "object") return false;
  const status = /** @type {any} */ (err).status;
  if (typeof status === "number") return status === 408 || status === 409 || status === 429 || status >= 500;
  const name = String(/** @type {any} */ (err).name ?? "");
  const code = String(/** @type {any} */ (err).code ?? "");
  return (
    /Connection|Timeout|Abort/i.test(name) ||
    /^(ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|EPIPE|UND_ERR)/.test(code)
  );
}

/** Retry-After (seconds or an HTTP date) from an error's headers, in ms, or null. */
export function retryAfterMs(err, nowMs = Date.now()) {
  const h = /** @type {any} */ (err)?.headers;
  if (!h) return null;
  const raw = typeof h.get === "function" ? h.get("retry-after") : (h["retry-after"] ?? h["Retry-After"]);
  if (raw == null || raw === "") return null;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(String(raw));
  return Number.isNaN(at) ? null : Math.max(0, at - nowMs);
}

/**
 * Call `fn` up to `retries + 1` times, with exponential backoff and jitter between attempts
 * while `isRetryable(err)`. Rethrows the last error. `sleep` and `random` are injectable.
 * @template T
 * @param {(attempt: number) => Promise<T>} fn
 * @param {{retries?: number, baseDelayMs?: number, maxDelayMs?: number,
 *   isRetryable?: (e: unknown) => boolean, sleep?: (ms: number) => Promise<void>,
 *   random?: () => number, onRetry?: (e: unknown, attempt: number, delayMs: number) => void}} [opts]
 * @returns {Promise<T>}
 */
export async function retry(fn, opts = {}) {
  const {
    retries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 20_000,
    isRetryable = isTransientError,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    random = Math.random,
    onRetry,
  } = opts;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= retries || !isRetryable(err)) throw err;
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt) * (0.5 + random() / 2);
      const delay = Math.min(maxDelayMs, Math.max(backoff, retryAfterMs(err) ?? 0));
      onRetry?.(err, attempt + 1, delay);
      await sleep(delay);
    }
  }
}
