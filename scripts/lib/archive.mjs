// Link-rot protection: archive every source we cite with the Internet Archive and
// record the result in data/archive.json. Network access is injected (`fetchImpl`)
// so everything here is unit-testable with no network (tests/archive.test.ts).
// Used by scripts/archive-sources.mjs, which runs as its own workflow step and
// must never fail the pipeline.
//
// Both endpoints are keyless:
//   availability: https://archive.org/wayback/available?url=<url>
//   Save Page Now: https://web.archive.org/save/<url>

export const AVAILABILITY_ENDPOINT = "https://archive.org/wayback/available";
export const SAVE_ENDPOINT = "https://web.archive.org/save/";
export const DEFAULT_MAX_PER_RUN = 15;
export const DEFAULT_MAX_ATTEMPTS = 5;
export const DEFAULT_SAVE_DELAY_MS = 5_000;
export const DEFAULT_BUDGET_MS = 10 * 60_000;
/** Our own pages change daily, so they are re-captured this often (kind "site"). */
export const SITE_REFRESH_DAYS = 7;
/** Minimum gap between attempts on a site page, so a down domain is not hammered. */
export const SITE_RETRY_HOURS = 12;
const SAVE_TIMEOUT_MS = 60_000;
const LOOKUP_TIMEOUT_MS = 15_000;

/**
 * @typedef {"archived"|"pending"|"failed"} ArchiveStatus
 * @typedef {Object} ArchiveEntry
 * @property {string|null} archivedUrl   Wayback URL of the capture
 * @property {string|null} archivedAt    ISO timestamp of the capture
 * @property {ArchiveStatus} status
 * @property {number} attempts
 * @property {string|null} lastAttempt   ISO timestamp
 * @property {string} title              as seen when first collected
 * @property {string|null} publishedAt   ISO date/timestamp, if known
 * @property {string} source             publisher / feed name
 * @property {string} kind               "news" | "toll" | "curated" | "site"
 * @property {string} [outbreak]         slug of the outbreak that first cited it (absent for "site")
 * @property {string|null} resolvedUrl   publisher URL behind a Google News link
 * @property {string} [contentHash]      optional, reserved
 *
 * @typedef {Object} ArchiveLedger
 * @property {string} lastRun
 * @property {Record<string, ArchiveEntry>} entries
 *
 * @typedef {Object} SourceItem
 * @property {string} url
 * @property {string} title
 * @property {string|null} publishedAt
 * @property {string} source
 * @property {string} kind
 * @property {string} [outbreak]
 *
 * @typedef {Object} OutbreakSources
 * @property {string} slug
 * @property {any} [live]       data/outbreaks/<slug>/live.json
 * @property {any} [toll]       data/outbreaks/<slug>/toll.json
 * @property {string} [source]  text of src/data/outbreaks/<slug>.ts
 */

const ENTRY_KEYS = [
  "archivedUrl",
  "archivedAt",
  "status",
  "attempts",
  "lastAttempt",
  "title",
  "publishedAt",
  "source",
  "kind",
  "outbreak",
  "resolvedUrl",
  "contentHash",
];

export class RateLimitedError extends Error {}

/** @returns {ArchiveLedger} */
export function emptyLedger() {
  return { lastRun: "", entries: {} };
}

/**
 * Tolerant parse: anything unexpected becomes an empty ledger.
 * @param {any} raw
 * @returns {ArchiveLedger}
 */
export function normalizeLedger(raw) {
  if (!raw || typeof raw !== "object" || !raw.entries || typeof raw.entries !== "object") {
    return emptyLedger();
  }
  return {
    lastRun: typeof raw.lastRun === "string" ? raw.lastRun : "",
    entries: { ...raw.entries },
  };
}

/**
 * Deterministic JSON: entries sorted by URL, fixed field order.
 * @param {ArchiveLedger} ledger
 */
export function serializeLedger(ledger) {
  /** @type {Record<string, any>} */
  const entries = {};
  for (const url of Object.keys(ledger.entries).sort()) {
    /** @type {any} */
    const e = ledger.entries[url];
    /** @type {Record<string, any>} */
    const out = {};
    for (const k of ENTRY_KEYS) if (e[k] !== undefined) out[k] = e[k];
    entries[url] = out;
  }
  return JSON.stringify({ lastRun: ledger.lastRun, entries }, null, 2) + "\n";
}

/**
 * "20260102030405" -> "2026-01-02T03:04:05Z" (null if malformed).
 * @param {string|undefined} ts
 */
export function waybackTimestampToIso(ts) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(ts ?? ""));
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
}

/**
 * Parse the availability API body. Returns the closest successful capture or null.
 * @param {any} body
 * @returns {{archivedUrl: string, archivedAt: string|null}|null}
 */
export function parseAvailability(body) {
  const snap = body?.archived_snapshots?.closest;
  if (!snap || snap.available !== true || typeof snap.url !== "string") return null;
  if (snap.status && !/^2\d\d$/.test(String(snap.status))) return null;
  return {
    archivedUrl: snap.url.replace(/^http:\/\//, "https://"),
    archivedAt: waybackTimestampToIso(snap.timestamp),
  };
}

/** @param {unknown} err */
function errMessage(err) {
  const name = err && typeof err === "object" && "name" in err ? String(err.name) : "";
  if (/Timeout|Abort/.test(name)) return "timeout";
  return err instanceof Error ? err.message : String(err);
}

/**
 * Is there already a capture? Returns null for "no capture"; throws on network or
 * HTTP errors (RateLimitedError for 429) so callers can count the attempt.
 * @param {string} url
 * @param {typeof fetch} fetchImpl
 */
export async function availability(url, fetchImpl) {
  const res = await fetchImpl(`${AVAILABILITY_ENDPOINT}?url=${encodeURIComponent(url)}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });
  if (res.status === 429) throw new RateLimitedError("availability API returned 429");
  if (!res.ok) throw new Error(`availability HTTP ${res.status}`);
  return parseAvailability(await res.json());
}

/**
 * Ask Save Page Now to capture `url`. Never throws.
 * `ok: true` with `archivedUrl: null` means the request was accepted but the
 * capture URL is not known yet; the next run's availability check picks it up.
 * @param {string} url
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<
 *   {ok: true, archivedUrl: string|null, archivedAt: string|null} |
 *   {ok: false, rateLimited: boolean, error: string}>}
 */
export async function requestSave(url, fetchImpl) {
  let res;
  try {
    res = await fetchImpl(SAVE_ENDPOINT + url, {
      headers: { Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(SAVE_TIMEOUT_MS),
    });
  } catch (err) {
    return { ok: false, rateLimited: false, error: errMessage(err) };
  }
  if (res.status === 429) return { ok: false, rateLimited: true, error: "HTTP 429" };
  if (!res.ok) return { ok: false, rateLimited: false, error: `HTTP ${res.status}` };

  const header = res.headers?.get?.("content-location") ?? "";
  const candidate = /^\/web\/\d{14}/.test(header)
    ? `https://web.archive.org${header}`
    : /\/web\/\d{14}/.test(res.url ?? "")
      ? res.url
      : null;
  if (!candidate) return { ok: true, archivedUrl: null, archivedAt: null };
  const ts = /\/web\/(\d{14})/.exec(candidate)?.[1];
  return { ok: true, archivedUrl: candidate, archivedAt: waybackTimestampToIso(ts) };
}

// ── Google News links ─────────────────────────────────────────────────────────

/** @param {string} url */
export function isGoogleNewsUrl(url) {
  try {
    return new URL(url).hostname === "news.google.com";
  } catch {
    return false;
  }
}

/** @param {string} url */
function isGoogleHost(url) {
  try {
    return /(^|\.)google\.[a-z.]+$/.test(new URL(url).hostname);
  } catch {
    return true;
  }
}

/**
 * Old-style Google News article ids embed the publisher URL in base64. Current
 * ids (the "AU_yq..." form) are opaque and need Google's JS endpoint, so this
 * returns null for them.
 * @param {string} url
 */
export function decodeGoogleNewsUrl(url) {
  try {
    const id = new URL(url).pathname.split("/").pop() ?? "";
    const bytes = Buffer.from(id.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    const m = /https?:\/\/[\x21-\x7e]+/.exec(bytes.toString("latin1"));
    return m && !isGoogleHost(m[0]) ? m[0] : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a Google News link to the publisher URL: try decoding, then follow
 * redirects. Returns null when it cannot (the usual case for current ids, since
 * Google serves a JS page rather than an HTTP redirect). Never throws.
 * @param {string} url
 * @param {typeof fetch} fetchImpl
 */
export async function resolveGoogleNewsUrl(url, fetchImpl) {
  const decoded = decodeGoogleNewsUrl(url);
  if (decoded) return decoded;
  try {
    const res = await fetchImpl(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; virustracer-archiver)" },
      signal: AbortSignal.timeout(10_000),
    });
    const finalUrl = res.url ?? "";
    return finalUrl && !isGoogleHost(finalUrl) ? finalUrl : null;
  } catch {
    return null;
  }
}

// ── Collecting sources ────────────────────────────────────────────────────────

/** @param {unknown} u */
function isPublicHttpsUrl(u) {
  if (typeof u !== "string") return false;
  try {
    const { protocol, hostname } = new URL(u);
    return protocol === "https:" && hostname.includes(".") && !/(^|\.)localhost$/.test(hostname);
  } catch {
    return false;
  }
}

/** @param {unknown} v */
const str = (v) => (typeof v === "string" ? v : "");
/** Host name of a URL, or "" when it does not parse. */
const hostOf = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
};

/**
 * Gather every URL we cite, across every outbreak. Pure. A URL cited by several
 * outbreaks appears once, tagged with the first.
 * @param {{outbreaks?: OutbreakSources[], siteUrl?: string, sitePages?: string[]}} [input]
 * @returns {SourceItem[]} priority order: our own pages (re-captured on a schedule), news (rots soonest), toll, curated
 */
export function collectSources({ outbreaks, siteUrl, sitePages } = {}) {
  /** @type {SourceItem[]} */
  const out = [];
  const seen = new Set();
  /** @param {SourceItem} item */
  const add = (item) => {
    if (!/^https?:\/\//.test(item.url) || seen.has(item.url)) return;
    seen.add(item.url);
    out.push(item);
  };

  // Our own pages: only for a real public https host, never localhost or a preview.
  const host = isPublicHttpsUrl(siteUrl) ? String(siteUrl).replace(/\/+$/, "") : "";
  if (host) {
    for (const path of sitePages ?? []) {
      add({
        url: `${host}${path === "/" ? "" : path}`,
        title: `${new URL(host).hostname}${path}`,
        publishedAt: null,
        source: "Own site",
        kind: "site",
      });
    }
  }

  const list = outbreaks ?? [];

  // Newest first across every outbreak, so one outbreak's backlog cannot starve another's.
  const news = list
    .flatMap((o) => (o.live?.recentItems ?? []).map((/** @type {any} */ it) => ({ it, slug: o.slug })))
    .sort((a, b) => str(b.it.date).localeCompare(str(a.it.date)));
  for (const { it, slug } of news) {
    add({
      url: str(it.url),
      title: str(it.title),
      publishedAt: str(it.date) || null,
      source: str(it.source),
      kind: "news",
      outbreak: slug,
    });
  }

  const snaps = list
    .flatMap((o) => (o.toll?.snapshots ?? []).map((/** @type {any} */ s) => ({ s, slug: o.slug })))
    .sort((a, b) => str(b.s.date).localeCompare(str(a.s.date)));
  for (const { s, slug } of snaps) {
    const wiki = /(^|\.)wikipedia\.org$/.test(hostOf(str(s.sourceUrl)));
    add({
      url: str(s.sourceUrl),
      title: `${wiki ? "Wikipedia toll snapshot" : `${str(s.source) || "Toll"} snapshot`} ${str(s.date)}: ${s.confirmed} confirmed, ${s.deaths} deaths`,
      publishedAt: str(s.revisionTimestamp) || str(s.date) || null,
      // An official report (e.g. EODY's weekly PDF) is credited by its own name.
      source: wiki ? "Wikipedia" : str(s.source) || "Official report",
      kind: "toll",
      outbreak: slug,
    });
  }

  // Curated data is TypeScript; rather than import it we read URLs from its text.
  // Limitation: the free-text `source` strings are not URLs, so only literal URLs
  // (today the `links` hrefs and the dataset's `isBasedOn`) are found.
  for (const o of list) {
    const text = str(o.source);
    const curated = `Curated (src/data/outbreaks/${o.slug}.ts)`;
    for (const m of text.matchAll(/label:\s*"([^"]+)"\s*,\s*href:\s*"(https?:\/\/[^"]+)"/g)) {
      add({ url: m[2], title: m[1], publishedAt: null, source: curated, kind: "curated", outbreak: o.slug });
    }
    for (const m of text.matchAll(/https?:\/\/[^\s"'`)<>\\]+/g)) {
      add({ url: m[0], title: m[0], publishedAt: null, source: curated, kind: "curated", outbreak: o.slug });
    }
  }
  return out;
}

/**
 * Record metadata for every collected item, so title/date/source survive even if
 * the archive copy is missing and live.json rotates. Existing entries keep their
 * state; empty metadata fields are back-filled. Never mutates its input.
 * @param {ArchiveLedger} ledger
 * @param {SourceItem[]} items
 * @returns {ArchiveLedger}
 */
export function recordMetadata(ledger, items) {
  const entries = { ...ledger.entries };
  for (const it of items) {
    const prev = entries[it.url];
    entries[it.url] = prev
      ? {
          ...prev,
          title: prev.title || it.title,
          publishedAt: prev.publishedAt ?? it.publishedAt,
          source: prev.source || it.source,
          kind: prev.kind || it.kind,
          ...(prev.outbreak || it.outbreak ? { outbreak: prev.outbreak || it.outbreak } : {}),
        }
      : {
          archivedUrl: null,
          archivedAt: null,
          status: "pending",
          attempts: 0,
          lastAttempt: null,
          title: it.title,
          publishedAt: it.publishedAt,
          source: it.source,
          kind: it.kind,
          ...(it.outbreak ? { outbreak: it.outbreak } : {}),
          resolvedUrl: null,
        };
  }
  return { ...ledger, entries };
}

/**
 * Which URLs to process this run: not archived, attempts left, in `order`
 * (collection priority), unresolvable Google News links last, at most `max`.
 * @param {ArchiveLedger} ledger
 * @param {string[]} order
 * @param {number} max
 * @param {number} maxAttempts
 */
export function selectBatch(ledger, order, max, maxAttempts, now = null) {
  const eligible = order.filter((url) => {
    const e = ledger.entries[url];
    if (!e) return false;
    if (e.kind === "site") return now !== null && siteDue(e, now);
    return e.status !== "archived" && e.attempts < maxAttempts;
  });
  const rank = (/** @type {string} */ url) =>
    isGoogleNewsUrl(url) && !ledger.entries[url].resolvedUrl ? 1 : 0;
  return eligible
    .map((url, i) => ({ url, i }))
    .sort((a, b) => rank(a.url) - rank(b.url) || a.i - b.i)
    .slice(0, max)
    .map((x) => x.url);
}

/**
 * A site page is due when it has never been captured or the capture is older
 * than SITE_REFRESH_DAYS, and we have not tried in the last SITE_RETRY_HOURS.
 * Site pages are never marked "failed": the domain may simply not be live yet.
 * @param {ArchiveEntry} e
 * @param {string} now ISO timestamp
 */
export function siteDue(e, now) {
  const t = Date.parse(now);
  const age = (/** @type {string|null} */ iso) => (iso ? t - Date.parse(iso) : Infinity);
  const stale = !(age(e.archivedAt) < SITE_REFRESH_DAYS * 86_400_000);
  const settled = age(e.lastAttempt) >= SITE_RETRY_HOURS * 3_600_000;
  return stale && settled;
}

/**
 * One archiving pass. Never throws: a failed item is recorded, a 429 stops the
 * run. Pure aside from the injected fetch/sleep.
 * @param {Object} o
 * @param {ArchiveLedger} o.ledger
 * @param {SourceItem[]} o.items
 * @param {typeof fetch} o.fetchImpl
 * @param {string} o.now ISO timestamp
 * @param {number} [o.max]
 * @param {number} [o.maxAttempts]
 * @param {number} [o.delayMs]  minimum gap between Save Page Now requests
 * @param {number} [o.budgetMs] stop starting new work after this long
 * @param {boolean} [o.dryRun]  no network; only metadata is recorded
 * @param {(ms:number)=>Promise<void>} [o.sleep]
 * @param {()=>number} [o.clock]
 * @param {(msg:string)=>void} [o.log]
 */
export async function runArchive({
  ledger,
  items,
  fetchImpl,
  now,
  max = DEFAULT_MAX_PER_RUN,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  delayMs = DEFAULT_SAVE_DELAY_MS,
  budgetMs = DEFAULT_BUDGET_MS,
  dryRun = false,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  clock = Date.now,
  log = () => {},
}) {
  const withMeta = recordMetadata(ledger, items);
  const stats = {
    processed: 0,
    archived: 0,
    saved: 0,
    existing: 0,
    failed: 0,
    pending: 0,
    rateLimited: false,
    /** @type {string[]} */
    wouldProcess: [],
  };
  const batch = selectBatch(withMeta, items.map((i) => i.url), max, maxAttempts, now);

  if (dryRun) {
    stats.wouldProcess = batch;
    for (const url of batch) log(`[dry-run] would archive ${url}`);
    return { ledger: withMeta, stats };
  }

  const started = clock();
  /** @type {number|null} */
  let lastSaveAt = null;
  const entries = { ...withMeta.entries };

  for (const url of batch) {
    if (clock() - started > budgetMs) {
      log("time budget reached; stopping");
      break;
    }
    const prev = entries[url];
    let resolvedUrl = prev.resolvedUrl ?? null;
    if (!resolvedUrl && isGoogleNewsUrl(url)) {
      resolvedUrl = await resolveGoogleNewsUrl(url, fetchImpl);
    }
    const target = resolvedUrl || url;
    const base = { ...prev, resolvedUrl, lastAttempt: now, attempts: prev.attempts + 1 };

    /** @param {Partial<ArchiveEntry>} patch */
    const finish = (patch) => {
      const next = { ...base, ...patch };
      if (prev.kind === "site") {
        // A failed refresh keeps the previous capture; nothing is ever "failed".
        if (next.status !== "archived") {
          next.status = prev.archivedUrl ? "archived" : "pending";
          next.archivedUrl = prev.archivedUrl;
          next.archivedAt = prev.archivedAt;
        }
        next.attempts = next.status === "archived" && next.archivedAt !== prev.archivedAt ? 0 : prev.attempts + 1;
      } else if (next.status !== "archived" && next.attempts >= maxAttempts) {
        next.status = "failed";
      }
      entries[url] = next;
      stats.processed++;
    };

    try {
      // A site page must be freshly saved: an old capture would defeat the refresh.
      const existing = prev.kind === "site" ? null : await availability(target, fetchImpl);
      if (existing) {
        finish({ status: "archived", ...existing });
        stats.archived++;
        stats.existing++;
        log(`existing capture for ${url}`);
        continue;
      }
    } catch (err) {
      if (err instanceof RateLimitedError) {
        stats.rateLimited = true;
        log("rate limited (429); stopping run");
        break;
      }
      log(`availability check failed for ${url}: ${errMessage(err)}`);
      // fall through: still try to save
    }

    if (lastSaveAt !== null) {
      const wait = delayMs - (clock() - lastSaveAt);
      if (wait > 0) await sleep(wait);
    }
    const saved = await requestSave(target, fetchImpl);
    lastSaveAt = clock();

    if (saved.ok) {
      if (saved.archivedUrl) {
        finish({ status: "archived", archivedUrl: saved.archivedUrl, archivedAt: saved.archivedAt });
        stats.archived++;
        stats.saved++;
        log(`saved ${url}`);
      } else {
        finish({ status: "pending" });
        stats.pending++;
        log(`save accepted, capture not confirmed yet: ${url}`);
      }
    } else if (saved.rateLimited) {
      stats.rateLimited = true;
      log("rate limited (429); stopping run");
      break;
    } else {
      finish({ status: "failed" });
      stats.failed++;
      log(`save failed for ${url}: ${saved.error}`);
    }
  }

  return { ledger: { lastRun: now, entries }, stats };
}
