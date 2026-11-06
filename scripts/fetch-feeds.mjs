#!/usr/bin/env node
/**
 * virustracer — Outbreak feed updater
 * Runs on a GitHub Actions cron. For each automated outbreak in
 * scripts/lib/outbreak-registry.mjs (or just `--outbreak=<slug>`), fetches the
 * outbreak's RSS feeds, keyword-filters them, summarizes via OpenRouter (DeepSeek)
 * and writes data/outbreaks/<slug>/{live,candidates,signals}.json.
 *
 * The work lives in scripts/lib/feed-run.mjs (pure and injectable, tested); this file wires
 * the real HTTP, OpenRouter client and files. Progress is saved after every finished item,
 * atomically, so a run killed by the step timeout keeps what it did.
 *
 * Optional env: OPENROUTER_API_KEY (without it, raw descriptions are saved)
 * Exit code: 1 if any outbreak failed (the workflow's commit step still runs, see update-data.yml).
 */

import OpenAI from "openai";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { dataFile, selectOutbreaksWith } from "./lib/outbreak-registry.mjs";
import { runOutbreakFeeds } from "./lib/feed-run.mjs";
import { writeFileAtomic, removeStaleTemps } from "./lib/atomic.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function createClient() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn("OPENROUTER_API_KEY not set — saving raw descriptions.");
    return null;
  }
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    // Retries (429/5xx/network, with backoff) are done in scripts/lib/pool.mjs `retry`, not twice.
    maxRetries: 0,
    timeout: 60_000,
    defaultHeaders: {
      "HTTP-Referer": "https://github.com/aristidesnakos/virustracer",
      // HTTP headers must be ASCII (an em dash here made every OpenRouter call fail).
      "X-Title": "virustracer - Outbreak Tracker",
    },
  });
}

async function fetchText(url, { userAgent }) {
  const res = await fetch(url, {
    headers: { "User-Agent": userAgent, Accept: "application/rss+xml, application/xml, text/xml" },
    signal: AbortSignal.timeout(20_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch (err) {
    console.error(`Failed to parse ${path}:`, err.message);
    return fallback;
  }
}

function fileStore(slug) {
  const live = dataFile(ROOT, slug, "live");
  const candidates = dataFile(ROOT, slug, "candidates");
  const signals = dataFile(ROOT, slug, "signals");
  mkdirSync(dirname(live), { recursive: true });
  const removed = removeStaleTemps(dirname(live));
  if (removed.length) console.warn(`Removed stale temp files: ${removed.join(", ")}`);
  return {
    readLive: () => readJson(live, null),
    readCandidates: () => readJson(candidates, null),
    readLedger: () => readJson(signals, null),
    writeLive: (v) => writeFileAtomic(live, JSON.stringify(v, null, 2)),
    writeCandidates: (v) => writeFileAtomic(candidates, JSON.stringify(v, null, 2)),
    writeLedger: (v) => writeFileAtomic(signals, JSON.stringify(v, null, 2) + "\n"),
  };
}

async function main() {
  const outbreaks = selectOutbreaksWith("feed");
  const client = createClient();
  let failed = 0;
  for (const outbreak of outbreaks) {
    console.log(`\n══ ${outbreak.slug} ══`);
    try {
      await runOutbreakFeeds({
        outbreak,
        client,
        fetchText,
        store: fileStore(outbreak.slug),
        retryOptions: {
          retries: 3,
          onRetry: (e, attempt, ms) => console.warn(`  model call retry ${attempt} in ${Math.round(ms)} ms: ${e?.status ?? e?.message}`),
        },
      });
    } catch (err) {
      // One outbreak failing must not stop the others; the annotation flags it in the run.
      failed++;
      console.log(`::error::Feed update for ${outbreak.slug} failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  // Any failed outbreak fails the step. That is safe because update-data.yml marks this step
  // continue-on-error, so the commit step still runs and saves everything that did work, and a
  // final guard step turns the failure into a red run (which GitHub emails).
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
