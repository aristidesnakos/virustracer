#!/usr/bin/env node
/**
 * Throwaway probe: Google autocomplete for the search terms our pages could target.
 * Step 1 of the keyword-family-gate method. Keyless, read-only, ~100 short requests spaced out.
 * Autocomplete shows what people type and in what order Google offers it; it is NOT search volume.
 * Run it from a GitHub runner (the cloud sandbox cannot reach suggestqueries.google.com).
 */
const FAMILIES = {
  "ebola (death toll, cases, map)": {
    seed: "ebola",
    mods: ["death toll", "death toll today", "outbreak 2026", "outbreak map", "cases", "cases today", "outbreak uganda",
      "outbreak congo", "bundibugyo", "bundibugyo virus", "symptoms", "vaccine", "outbreak latest", "tracker",
      "how many deaths", "outbreak who", "travel", "outbreak news", "death toll 2026"],
  },
  "measles US": {
    seed: "measles",
    mods: ["cases 2026", "cases us", "outbreak", "outbreak map", "tracker", "cases by state", "cases today", "cdc",
      "outbreak 2026", "deaths 2026", "cases this year", "outbreak united states", "cases update", "map", "cases usa"],
  },
  "west nile virus Greece": {
    seed: "west nile virus greece",
    mods: ["", "2026", "cases", "deaths", "attica", "travel", "symptoms", "mosquito", "latest", "map", "eody", "athens",
      "cases today", "warning", "tourists", "safe to travel", "total cases"],
  },
  "west nile virus (general)": {
    seed: "west nile virus",
    mods: ["cases 2026", "europe", "cases europe", "outbreak", "map", "greece", "deaths 2026", "tracker"],
  },
  "outbreaks around the world": {
    seed: "",
    full: ["outbreak tracker", "disease outbreak map", "outbreaks around the world", "current outbreaks", "disease outbreaks 2026",
      "outbreak map", "global outbreak tracker", "outbreak news today", "who disease outbreak news", "epidemic tracker",
      "disease tracker", "outbreaks in the world right now", "current outbreaks in the us", "disease outbreak news today",
      "live outbreak map", "virus outbreak map", "outbreak tracker 2026"],
  },
  "candida auris": {
    seed: "candida auris",
    mods: ["cases", "cases by state", "map", "2026", "outbreak", "symptoms", "nursing home", "tracker", "us", "cases 2026",
      "deaths", "hospital", "cases us", "states"],
  },
  "bangladesh measles": {
    seed: "bangladesh measles",
    mods: ["outbreak", "deaths", "cases", "2026", "vaccine", "children", "dhaka", "outbreak 2026", "death toll"],
  },
  "hantavirus cruise ship": {
    seed: "hantavirus",
    mods: ["cruise ship", "outbreak 2026", "mv hondius", "cases", "deaths", "cruise ship outbreak", "outbreak"],
  },
  "nursing home infection data": {
    seed: "",
    full: ["nursing home infection control citations", "nursing home f880", "nursing home covid cases", "nursing home flu cases",
      "nursing home respiratory outbreak", "nursing home infection rates by state", "nursing home inspection citations",
      "nursing home deficiencies by state", "nursing home infection control violations", "nursing home outbreak data",
      "nursing home covid cases by state", "nursing home inspection results lookup"],
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = "Mozilla/5.0 (compatible; outbreakfiles-keyword-probe; +https://github.com/aristidesnakos/virustracer)";

async function suggest(q) {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=us&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const body = await res.json();
    return { list: Array.isArray(body?.[1]) ? body[1] : [] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

let n = 0;
let errors = 0;
for (const [name, fam] of Object.entries(FAMILIES)) {
  console.log(`\n## ${name}`);
  const queries = fam.full ?? fam.mods.map((m) => `${fam.seed} ${m}`.trim());
  for (const q of queries) {
    const r = await suggest(q);
    n++;
    if (r.error) {
      errors++;
      console.log(`Q: ${q} => ERROR ${r.error}`);
      if (errors >= 5) {
        console.log("::warning::5 errors; stopping");
        process.exit(0);
      }
    } else {
      console.log(`Q: ${q} => ${r.list.length ? r.list.join(" | ") : "(nothing)"}`);
    }
    await sleep(700);
  }
}
console.log(`\n${n} queries, ${errors} errors`);
