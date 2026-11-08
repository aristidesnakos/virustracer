#!/usr/bin/env node
/**
 * Diagnostic for the news-feed model calls that come back empty (see CLAUDE.md "Live feed data").
 * Run only through .github/workflows/diagnose-model.yml (workflow_dispatch): it needs the
 * OPENROUTER_API_KEY secret, which only workflow runs can read. Costs cents (hard cap below).
 *
 * 1. Prints the model's public metadata (keyless): /models entry and /models/<id>/endpoints.
 * 2. Builds ~30 real items with the production RSS helpers and prompts, then runs a probe matrix
 *    (production settings at concurrency 1 and 4, larger max_tokens, reasoning off, candidate
 *    without response_format, provider pinned). Every call is made with raw fetch so nothing is
 *    hidden, and printed as one `CALL ...` line. Never prints the key or any request header.
 * 3. Prints a table per configuration: failures by call type, finish_reason, provider, reasoning.
 */
import { OUTBREAKS, USER_AGENT } from "./lib/outbreak-registry.mjs";
import { parseRSSItems, isOutbreakRelated, isoDate } from "./lib/feed-items.mjs";
import { MODEL, SUMMARY_PARAMS, CANDIDATE_PARAMS, summaryPrompt, candidatePrompt } from "./lib/feed-model.mjs";
import { mapPool } from "./lib/pool.mjs";

const BASE = "https://openrouter.ai/api/v1";
const KEY = process.env.OPENROUTER_API_KEY;
const MAX_CALLS = 450;
const N_ITEMS = 30;
let callsMade = 0;

const clip = (v, n = 80) => String(v ?? "").replace(/\s+/g, " ").replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted]").slice(0, n);
const log = (...a) => console.log(...a);

async function publicJson(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(30_000) });
  const text = await res.text();
  if (!res.ok) return { status: res.status, error: clip(text, 160) };
  return { status: res.status, json: JSON.parse(text) };
}

async function metadata() {
  log("══ PUBLIC MODEL METADATA ══");
  const list = await publicJson("/models");
  let entry = null;
  if (list.json) {
    entry = (list.json.data ?? []).find((m) => m.id === MODEL) ?? null;
    if (!entry) {
      const near = (list.json.data ?? []).filter((m) => m.id.startsWith("deepseek/")).map((m) => m.id);
      log(`MODEL_ID_MISSING id=${MODEL} (not in /models). deepseek ids listed: ${near.join(", ")}`);
    } else {
      log(`MODEL id=${entry.id} canonical_slug=${entry.canonical_slug} context=${entry.context_length} max_completion=${entry.top_provider?.max_completion_tokens} expiration=${entry.expiration_date ?? "none"}`);
      log(`MODEL supported_parameters=${(entry.supported_parameters ?? []).join(",")}`);
      log(`MODEL pricing=${JSON.stringify(entry.pricing)} architecture=${clip(JSON.stringify(entry.architecture), 160)}`);
    }
  } else log(`MODELS_LIST_FAILED status=${list.status} ${list.error}`);
  const ep = await publicJson(`/models/${MODEL}/endpoints`);
  const endpoints = ep.json?.data?.endpoints ?? [];
  if (!ep.json) log(`ENDPOINTS_FAILED status=${ep.status} ${ep.error}`);
  for (const e of endpoints) {
    log(
      `ENDPOINT provider=${e.provider_name} tag=${e.tag} quant=${e.quantization} context=${e.context_length} max_completion=${e.max_completion_tokens} ` +
        `status=${e.status} uptime30m=${e.uptime_last_30m} pricing=${JSON.stringify(e.pricing)} params=${(e.supported_parameters ?? []).join(",")}`,
    );
  }
  return { entry, endpoints };
}

async function buildItems() {
  const per = Math.ceil(N_ITEMS / OUTBREAKS.filter((o) => o.feed).length);
  const items = [];
  for (const o of OUTBREAKS.filter((x) => x.feed)) {
    const got = [];
    for (const src of o.feed.sources) {
      try {
        const res = await fetch(src.url, { headers: { "User-Agent": `virustracer/1.0 (${o.disease} outbreak tracker; public health surveillance)` }, signal: AbortSignal.timeout(20_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rel = parseRSSItems(await res.text()).filter((it) => isOutbreakRelated(it, o.feed));
        rel.sort((a, b) => isoDate(b.pubDate).localeCompare(isoDate(a.pubDate)));
        for (const it of rel.slice(0, per)) if (!got.some((g) => g.title === it.title)) got.push({ ...it, feed: o.feed, slug: o.slug });
      } catch (e) {
        log(`ITEMS_FEED_FAILED ${o.slug} ${src.name}: ${clip(e.message)}`);
      }
    }
    items.push(...got.slice(0, per));
  }
  const out = items.slice(0, N_ITEMS);
  log(`ITEMS built=${out.length} by_outbreak=${JSON.stringify(out.reduce((m, i) => ((m[i.slug] = (m[i.slug] ?? 0) + 1), m), {}))} avg_description_chars=${Math.round(out.reduce((s, i) => s + i.description.length, 0) / Math.max(1, out.length))}`);
  return out;
}

/** One raw call. Returns a flat record; never throws. */
async function probe(cfgName, type, item, extra, pricing) {
  if (callsMade >= MAX_CALLS) return { cfg: cfgName, type, skipped: true };
  callsMade++;
  const base = type === "summary" ? SUMMARY_PARAMS : CANDIDATE_PARAMS;
  const prompt = (type === "summary" ? summaryPrompt : candidatePrompt)(item.feed, item.title, item.description);
  const body = { model: MODEL, messages: [{ role: "user", content: prompt }], ...base, ...extra(type) };
  const rec = { cfg: cfgName, type, slug: item.slug, inputChars: prompt.length };
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "HTTP-Referer": "https://github.com/aristidesnakos/virustracer", "X-Title": "virustracer - diagnose" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    rec.http = res.status;
    const text = await res.text();
    let j = null;
    try { j = JSON.parse(text); } catch { /* keep null */ }
    if (!res.ok || j?.error) {
      rec.error = clip(j?.error ? `${j.error.code ?? ""} ${j.error.message ?? ""}` : text, 120);
    }
    if (j) {
      const ch = j.choices?.[0];
      const msg = ch?.message ?? {};
      const content = typeof msg.content === "string" ? msg.content : "";
      rec.id = clip(j.id, 40); rec.model = j.model; rec.provider = j.provider ?? "unknown";
      rec.finish = ch?.finish_reason ?? "none"; rec.native = ch?.native_finish_reason ?? "none";
      rec.contentNull = msg.content == null;
      rec.contentLen = content.trim().length;
      rec.reasoningLen = typeof msg.reasoning === "string" ? msg.reasoning.length : 0;
      rec.reasoningDetails = Array.isArray(msg.reasoning_details) ? JSON.stringify(msg.reasoning_details).length : 0;
      rec.completionTokens = j.usage?.completion_tokens ?? null;
      rec.reasoningTokens = j.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
      rec.promptTokens = j.usage?.prompt_tokens ?? null;
      rec.cost = j.usage?.cost ?? null;
      rec.listCost = pricing && rec.promptTokens != null ? rec.promptTokens * Number(pricing.prompt) + (rec.completionTokens ?? 0) * Number(pricing.completion) : null;
      rec.sample = clip(content);
      if (!rec.error && !rec.contentLen) rec.error = "empty content";
      if (!rec.error && type === "candidate") {
        try { JSON.parse(content); } catch { rec.error = "invalid JSON"; }
      }
    } else if (!rec.error) rec.error = "non-JSON body";
  } catch (e) {
    rec.error = clip(`${e.name}: ${e.message}`, 120);
  }
  rec.ms = Date.now() - t0;
  rec.bad = Boolean(rec.error);
  log(
    `CALL cfg=${cfgName} type=${type} outbreak=${item.slug} http=${rec.http ?? "-"} bad=${rec.bad} provider=${rec.provider ?? "-"} model=${rec.model ?? "-"} id=${rec.id ?? "-"} ` +
      `finish=${rec.finish ?? "-"} native=${rec.native ?? "-"} content_null=${rec.contentNull ?? "-"} content_len=${rec.contentLen ?? "-"} reasoning_len=${rec.reasoningLen ?? "-"} ` +
      `reasoning_details_len=${rec.reasoningDetails ?? "-"} completion_tokens=${rec.completionTokens ?? "-"} reasoning_tokens=${rec.reasoningTokens ?? "-"} ` +
      `input_chars=${rec.inputChars} ms=${rec.ms}${rec.error ? ` error="${rec.error}"` : ""} sample="${rec.sample ?? ""}"`,
  );
  return rec;
}

async function runConfig(name, items, { types = ["summary", "candidate"], concurrency, extra = () => ({}), pricing }) {
  log(`\n── CONFIG ${name}: concurrency=${concurrency} types=${types.join("+")} items=${items.length} ──`);
  const pairs = [];
  // One item's calls are adjacent so concurrency=4 over pairs mimics production's 2 parallel calls x 2 items... production is 4 items x 2 calls; use 4 items in flight.
  const results = await mapPool(items, concurrency, (item) =>
    Promise.all(types.map((t) => probe(name, t, item, extra, pricing))),
  );
  for (const r of results) if (r.status === "fulfilled") pairs.push(...r.value);
  return pairs.filter((r) => !r.skipped);
}

const tally = (recs, keyFn) => {
  const m = new Map();
  for (const r of recs) {
    const k = keyFn(r);
    const c = m.get(k) ?? { n: 0, bad: 0 };
    c.n++; if (r.bad) c.bad++;
    m.set(k, c);
  }
  return [...m].map(([k, c]) => `${k}: ${c.bad}/${c.n}`).join(" | ") || "-";
};

function report(all) {
  log("\n══ SUMMARY TABLE (bad/total) ══");
  const cfgs = [...new Set(all.map((r) => r.cfg))];
  for (const cfg of cfgs) {
    const rs = all.filter((r) => r.cfg === cfg);
    log(`CFG ${cfg}`);
    log(`  by_type:      ${tally(rs, (r) => r.type)}`);
    log(`  all_by_finish:     ${tally(rs, (r) => r.finish ?? `http${r.http ?? "-"}`)}`);
    log(`  bad_only_finish:   ${[...rs.filter((r) => r.bad).reduce((m, r) => m.set(`${r.finish ?? "http" + (r.http ?? "-")}/${r.error}`, (m.get(`${r.finish ?? "http" + (r.http ?? "-")}/${r.error}`) ?? 0) + 1), new Map())].map(([k, v]) => `${k}=${v}`).join(" | ") || "-"}`);
    log(`  by_provider:  ${tally(rs, (r) => r.provider ?? "none")}`);
    log(`  by_reasoning: ${tally(rs, (r) => ((r.reasoningTokens ?? 0) > 0 || (r.reasoningLen ?? 0) > 0 ? "reasoning_used" : "no_reasoning"))}`);
    const cost = rs.reduce((s, r) => s + (r.cost ?? 0), 0);
    const listCost = rs.reduce((s, r) => s + (r.listCost ?? 0), 0);
    const avgTok = Math.round(rs.reduce((s, r) => s + (r.completionTokens ?? 0), 0) / Math.max(1, rs.length));
    log(`  cost_usage_cost=$${cost.toFixed(5)} cost_from_list_pricing=$${listCost.toFixed(5)} avg_completion_tokens=${avgTok} avg_ms=${Math.round(rs.reduce((s, r) => s + r.ms, 0) / Math.max(1, rs.length))}`);
  }
  const total = all.reduce((s, r) => s + (r.cost ?? 0), 0);
  const totalList = all.reduce((s, r) => s + (r.listCost ?? 0), 0);
  log(`\nTOTAL calls=${all.length} (cap ${MAX_CALLS}) usage_cost=$${total.toFixed(5)} list_pricing_cost=$${totalList.toFixed(5)}`);
}

async function main() {
  const { entry, endpoints } = await metadata();
  if (!KEY) { log("OPENROUTER_API_KEY not set: metadata only."); return; }
  const items = await buildItems();
  if (items.length < 10) { log("Too few items built; aborting probes."); process.exitCode = 1; return; }
  const pricing = entry?.pricing ?? endpoints[0]?.pricing;
  const params = new Set(entry?.supported_parameters ?? []);
  const all = [];
  all.push(...(await runConfig("A_prod_c1", items, { concurrency: 1, pricing })));
  all.push(...(await runConfig("B_prod_c4", items, { concurrency: 4, pricing })));
  all.push(...(await runConfig("C_max1500_c4", items, { concurrency: 4, pricing, extra: (t) => ({ max_tokens: 1500 }) })));
  if (params.has("reasoning") || params.has("include_reasoning")) {
    all.push(...(await runConfig("D_reasoning_off_c4", items, { concurrency: 4, pricing, extra: () => ({ reasoning: { enabled: false } }) })));
  } else log("\nCONFIG D skipped: supported_parameters has no reasoning option, so the parameter would be ignored.");
  all.push(...(await runConfig("E_candidate_no_response_format_c4", items, {
    types: ["candidate"], concurrency: 4, pricing, extra: () => ({ response_format: undefined }),
  })));
  // F: pin the best provider, only if more than one provider answered at all.
  const seen = new Map();
  for (const r of all) if (r.provider && r.provider !== "unknown") { const c = seen.get(r.provider) ?? { n: 0, ok: 0 }; c.n++; if (!r.bad) c.ok++; seen.set(r.provider, c); }
  const ranked = [...seen].filter(([, c]) => c.n >= 5).sort((a, b) => b[1].ok / b[1].n - a[1].ok / a[1].n);
  if (seen.size > 1 && ranked.length) {
    const best = ranked[0][0];
    log(`\nCONFIG F pins provider "${best}" (ok rate ${(ranked[0][1].ok / ranked[0][1].n * 100).toFixed(0)}% of ${ranked[0][1].n}); providers seen: ${[...seen].map(([k, c]) => `${k}=${c.ok}/${c.n}`).join(", ")}`);
    all.push(...(await runConfig(`F_pinned_${best}_c4`, items, { concurrency: 4, pricing, extra: () => ({ provider: { order: [best], allow_fallbacks: false } }) })));
  } else log(`\nCONFIG F skipped: only ${seen.size} provider(s) answered (${[...seen.keys()].join(", ") || "none"}).`);
  report(all);
}

main().catch((e) => { console.error("Fatal:", clip(e?.message, 200)); process.exit(1); });
