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
  "PAID IDEA: egg and poultry buyers (H5N1 feed)": {
    seed: "",
    full: ["bird flu egg prices", "bird flu egg prices 2026", "egg prices forecast", "egg prices forecast 2026", "avian influenza egg prices",
      "egg price tracker", "wholesale egg prices today", "egg futures", "usda egg markets overview", "h5n1 egg supply",
      "bird flu egg shortage", "avian flu poultry outbreak tracker", "h5n1 poultry outbreak map", "hpai outbreak map",
      "avian influenza detections commercial poultry", "h5n1 dairy cattle tracker", "egg market data subscription",
      "poultry disease alert service", "egg price risk avian flu", "egg supply chain avian influenza"],
  },
  "PAID IDEA: nursing-home and post-acute infection data": {
    seed: "",
    full: ["nursing home infection control software", "nursing home antibiotic stewardship program", "antibiotic stewardship nursing home cost",
      "nursing home infection prevention consultant", "nursing home quality data for aco", "snf infection control compliance software",
      "nursing home f880 citation", "nursing home infection control training cost", "nursing home survey readiness infection control",
      "skilled nursing facility antibiotic stewardship", "c auris screening nursing home cost", "nursing home infection surveillance software",
      "nursing home infection rates data", "snf quality reporting infection data", "post acute care infection data aco"],
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

// Gate heuristics from the keyword-family-gate skill.
const FREE = /\b(free|open source|no cost)\b|\$0/i; // G1: free-attached
const PAID = /\b(fee|fees|cost|costs|price|prices|pricing|calculator|filing)\b/i; // G3: paid intent
const gates = {};
let n = 0;
let errors = 0;
for (const [name, fam] of Object.entries(FAMILIES)) {
  console.log(`\n## ${name}`);
  gates[name] = { queries: 0, answered: 0, free: 0, paid: 0 };
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
      const g = gates[name];
      g.queries++;
      if (r.list.length) g.answered++;
      const free = r.list.some((s) => FREE.test(s));
      const paid = r.list.some((s) => PAID.test(s) && !FREE.test(s));
      if (free) g.free++;
      if (paid) g.paid++;
      console.log(`Q: ${q}${free ? " [G1:free]" : ""}${paid ? " [G3:paid]" : ""} => ${r.list.length ? r.list.join(" | ") : "(nothing)"}`);
    }
    await sleep(700);
  }
}
console.log("\n## GATE SUMMARY (G1 = a completion contains free/open source/no cost; G3 = a clean completion contains fee/cost/price/pricing/calculator/filing)");
for (const [name, g] of Object.entries(gates)) {
  console.log(`G: ${name} | queries ${g.queries} | answered ${g.answered} | with free ${g.free} | with clean paid-intent ${g.paid} (${g.queries ? Math.round((100 * g.paid) / g.queries) : 0}%)`);
}
console.log(`\n${n} queries, ${errors} errors`);
