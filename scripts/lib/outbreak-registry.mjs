// Script-side registry of every outbreak in src/data/outbreaks/. Plain `.mjs`
// (the scripts run on bare `node`, no TypeScript), so it mirrors the slug, status
// and source of src/data/outbreaks/*.ts; tests/outbreak-registry.test.ts fails if
// the two drift apart. Only entries with `toll` are read from Wikipedia and only
// entries with `feed` get a news feed; a hand-curated record has neither.

import { resolve } from "node:path";

export const USER_AGENT =
  "virustracer/1.0 (https://outbreakfiles.com; https://github.com/aristidesnakos/virustracer; death-toll tracker)";

const gnews = (q) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

/** Statuses the scheduled workflow keeps fetching. `over` and `watch` are left alone. */
export const AUTOMATED_STATUSES = ["active", "waning"];

export const OUTBREAKS = [
  {
    slug: "ebola-bundibugyo-2026",
    status: "active",
    disease: "Ebola",
    toll: {
      // Exact title of the English Wikipedia article whose lead section holds an
      // `{{Infobox outbreak}}` with confirmed_cases / deaths fields. Redirects are followed.
      page: "2026_Ebola_epidemic",
      source: "Wikipedia infobox (cites INSP DRC / WHO)",
    },
    feed: {
      sources: [
        {
          name: "WHO News",
          // WHO general news RSS: not outbreak-specific, so keyword filtered.
          url: "https://www.who.int/rss-feeds/news-english.xml",
          source: "WHO",
        },
        { name: "Google News — Ebola death toll", url: gnews("Ebola Congo death toll"), source: "News" },
        { name: "Google News — Bundibugyo outbreak", url: gnews("Ebola Bundibugyo outbreak"), source: "News" },
        {
          name: "Google News — WHO DON",
          // Specifically tracks WHO disease outbreak news.
          url: gnews('WHO "disease outbreak news" Ebola Bundibugyo'),
          source: "WHO",
        },
      ],
      // Strong terms match on their own; each contextual term also needs outbreak context.
      strongKeywords: ["ebola", "bundibugyo", "ebola virus disease", "filovirus"],
      contextualKeywords: [{ term: "ituri", needsOneOf: ["outbreak", "virus", "cases", "deaths"] }],
      // Used in the summary and extraction prompts.
      subject: "the 2026 Bundibugyo Ebola outbreak (DR Congo & Uganda)",
      extraction: {
        scope: `If — and only if — the article reports a SPECIFIC COUNTRY OTHER THAN DR CONGO (which is already curated) with Ebola cases, deaths, suspected cases, or contacts RELATED TO THE 2026 BUNDIBUGYO OUTBREAK (e.g. Uganda, Rwanda, Burundi, South Sudan, Kenya, Tanzania, or an imported/medevac case in Europe or the US), return JSON:`,
        exclusions: `If the article is only about DR Congo, OR does not mention a specific country, OR the data is from a historical/different outbreak (2014–16 West Africa, 2018–20 Kivu, 2025 Kasai/Uganda Sudan-virus), OR the country is merely "on alert" or preparing without reported cases/deaths/contacts, return:`,
      },
    },
  },
  {
    // Archived, hand-curated record (src/data/outbreaks/hantavirus-mv-hondius-2026.ts).
    // No `toll` and no `feed`: nothing here is fetched, and status "over" keeps it
    // out of the scheduled runs. Its live.json is a frozen news record.
    slug: "hantavirus-mv-hondius-2026",
    status: "over",
    disease: "Hantavirus",
  },
];

export function getOutbreak(slug) {
  return OUTBREAKS.find((o) => o.slug === slug);
}

/**
 * Outbreaks to process: the one named by `--outbreak=<slug>`, otherwise every
 * outbreak whose status is automated. Throws on an unknown slug so a typo in the
 * workflow is loud rather than a silent no-op.
 */
export function selectOutbreaks(argv = process.argv.slice(2)) {
  const flag = argv.find((a) => a.startsWith("--outbreak="));
  if (flag) {
    const slug = flag.slice("--outbreak=".length);
    const found = getOutbreak(slug);
    if (!found) throw new Error(`Unknown outbreak "${slug}". Known: ${OUTBREAKS.map((o) => o.slug).join(", ")}`);
    return [found];
  }
  return OUTBREAKS.filter((o) => AUTOMATED_STATUSES.includes(o.status));
}

/**
 * `selectOutbreaks`, keeping only entries that have `key` ("toll" or "feed").
 * An outbreak named with --outbreak that lacks it (e.g. a hand-curated record) is
 * skipped with a log line rather than an error, so the run still exits cleanly.
 * @param {"toll" | "feed"} key
 * @param {string[]} [argv]
 * @param {(msg: string) => void} [log]
 */
export function selectOutbreaksWith(key, argv = process.argv.slice(2), log = console.log) {
  const selected = selectOutbreaks(argv);
  const kept = selected.filter((o) => o[key]);
  for (const o of selected) {
    if (!o[key]) log(`Skipping ${o.slug}: it has no ${key} source configured.`);
  }
  return kept;
}

/** data/outbreaks/<slug>/<file>.json under `root` (the repository root). */
export function dataFile(root, slug, file) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`Invalid outbreak slug: ${slug}`);
  return resolve(root, "data", "outbreaks", slug, `${file}.json`);
}
