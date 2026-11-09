#!/usr/bin/env node
/**
 * Keyless investigation aid: print every revision of a tracked Wikipedia article in a date range
 * with its editor, edit summary and the infobox figures parsed by the same parser as the daily
 * updater, so a disputed reading (a decrease rejected by the sanity check) can be traced to the
 * edit that introduced or removed it. Writes nothing.
 *
 *   node scripts/toll-history.mjs --outbreak=<slug> --from=2026-10-30 [--to=2026-11-09]
 *
 * The build sandbox cannot reach Wikipedia; run it from a GitHub runner or a local machine.
 */
import { parseInfobox, extractInfobox } from "./lib/toll.mjs";
import { OUTBREAKS, USER_AGENT } from "./lib/outbreak-registry.mjs";

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const slug = arg("outbreak");
const from = arg("from");
const to = arg("to") ?? new Date().toISOString().slice(0, 10);
const outbreak = OUTBREAKS.find((o) => o.slug === slug);
if (!outbreak?.toll?.page || !from) {
  console.error("usage: node scripts/toll-history.mjs --outbreak=<slug with a Wikipedia toll> --from=YYYY-MM-DD [--to=YYYY-MM-DD]");
  process.exit(2);
}

const API = "https://en.wikipedia.org/w/api.php";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(params) {
  const res = await fetch(`${API}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`${json.error.code} ${json.error.info}`);
  await sleep(400);
  return json;
}

const clip = (s, n) => String(s ?? "").replace(/\s+/g, " ").slice(0, n);
let cont = {};
let prev = null;
let count = 0;
do {
  const json = await api({
    action: "query",
    prop: "revisions",
    titles: outbreak.toll.page,
    redirects: "1",
    rvprop: "ids|timestamp|user|comment|content",
    rvslots: "main",
    rvdir: "newer",
    rvstart: `${from}T00:00:00Z`,
    rvend: `${to}T23:59:59Z`,
    rvlimit: "50",
    ...cont,
  });
  for (const rev of json.query?.pages?.[0]?.revisions ?? []) {
    count++;
    const text = rev.slots?.main?.content ?? "";
    let figures = "unparsed";
    let deathsLine = "";
    try {
      const p = parseInfobox(text);
      figures = `confirmed=${p.confirmed ?? "-"} suspected=${p.suspected ?? "-"} deaths=${p.deaths ?? "-"} recovered=${p.recovered ?? "-"}`;
      deathsLine = clip((extractInfobox(text) ?? "").match(/\|\s*deaths\s*=([^\n]*)/)?.[1], 160);
    } catch (e) {
      figures = `unparsed (${clip(e.message, 60)})`;
    }
    const changed = figures !== prev;
    console.log(
      `${changed ? "CHANGE" : "same  "} ${rev.timestamp} oldid=${rev.revid} user="${clip(rev.user, 30)}" ${figures}` +
        `${changed ? ` | deaths field: "${deathsLine}"` : ""} | comment: "${clip(rev.comment, 140)}"`,
    );
    prev = figures;
  }
  cont = json.continue ?? null;
} while (cont);
console.log(`${count} revisions of ${outbreak.toll.page} from ${from} to ${to}.`);
