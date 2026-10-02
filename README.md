# VirusTracer

[![Update Outbreak Data](https://github.com/aristidesnakos/virustracer/actions/workflows/update-data.yml/badge.svg)](https://github.com/aristidesnakos/virustracer/actions/workflows/update-data.yml)

**A lightweight, self-hosted outbreak surveillance dashboard you can configure and deploy in minutes.**

VirusTracer makes it easy for one person — a journalist, researcher, public health student, or concerned citizen — to stand up an accurate, source-cited tracking dashboard for any viral outbreak. Configure the data file, push to GitHub, and Vercel handles the rest. A GitHub Actions cron runs twice a day, refreshing the headline **death toll** and pulling news from official health feeds automatically.

---

## Live Instance — 2026 Bundibugyo Ebola Outbreak (DR Congo & Uganda)

This repository is currently deployed as a tracker for the **2026 Bundibugyo ebolavirus outbreak** in the Democratic Republic of the Congo and Uganda. The outbreak was declared on May 15 2026 in Ituri province, and the WHO declared a Public Health Emergency of International Concern (PHEIC) on May 16 2026. As of Oct 2 2026, Wikipedia (citing INSP DRC) reported about 8,245 confirmed cases and about 3,984 deaths. **See the dashboard for the current toll**, which is refreshed automatically twice a day.

There is **no approved vaccine or treatment for Bundibugyo virus** (the licensed Ervebo vaccine targets Zaire ebolavirus), so the response relies on case finding, contact tracing, isolation, and safe burials.

> ⚠️ **Not an official public health resource.** Headline totals are scraped from a public encyclopedia page that cites official reports; provinces and contact figures are curated by hand; news-extracted items are unverified. Always verify critical information with official sources.

**Official sources:**
- [WHO Disease Outbreak News](https://www.who.int/emergencies/disease-outbreak-news)
- [CDC Ebola](https://www.cdc.gov/ebola)
- [ECDC — Ebola outbreak in DR Congo and Uganda](https://www.ecdc.europa.eu/en/ebola-outbreak-democratic-republic-congo-and-uganda)

---

## What It Does

| Panel | Description |
|-------|-------------|
| **Stat strip** | Headline confirmed cases, deaths, and recoveries, taken from the latest point of the merged timeline (curated + auto-tracked). |
| **World map** | Spread sites and per-region bubbles (DRC provinces, Uganda, France), each labelled with confirmed cases and deaths. Hover for source-cited tooltips. |
| **Cumulative deaths & cases chart** | Confirmed cases and deaths over time. Curated milestones are merged with daily auto-tracked snapshots; each data point cites its source and date. |
| **Region table** | Country-by-country table with DRC provinces as sub-rows (excluded from the total). Click any row for full detail + source. |
| **Feed panel** | Recent articles from WHO news and Google News, summarized by an LLM. News-extracted countries are marked *Unverified*. |

Data freshness: the GitHub Actions workflow runs at **08:00 and 20:00 UTC**, commits updated `data/toll.json`, `data/live.json` and `data/candidates.json`, and Vercel redeploys automatically.

---

## Stack

- [Next.js 16](https://nextjs.org/) (App Router, React 19, TypeScript)
- [MapLibre GL JS](https://maplibre.org/) with [CARTO](https://carto.com/basemaps/) dark-matter tiles (free, no API key)
- [Recharts](https://recharts.org/)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [Vitest](https://vitest.dev/) + Testing Library for unit tests, [Playwright](https://playwright.dev/) for e2e
- [Wikipedia / MediaWiki API](https://www.mediawiki.org/wiki/API:Main_page) (keyless) for the death-toll snapshots
- WHO news RSS and Google News RSS for the feed
- [OpenRouter](https://openrouter.ai/) — DeepSeek V4 Flash for feed summarization and country extraction (cheap, optional)
- [GitHub Actions](https://docs.github.com/en/actions) for scheduled data updates
- [Vercel](https://vercel.com/) for hosting

---

## Death-Toll Tracking (GitHub Actions)

The headline toll is tracked automatically. The workflow (`.github/workflows/update-data.yml`) runs twice a day and on demand:

```
 08:00 & 20:00 UTC  (cron)  or  manual workflow_dispatch
          │
          ▼
 GitHub Actions  (.github/workflows/update-data.yml, concurrency group)
          │
          ├── node scripts/update-toll.mjs
          │       Wikipedia infobox ("2026 Ebola epidemic") via MediaWiki API
          │       → parse confirmed / suspected / deaths / recovered
          │       → sanity-check against the previous snapshot
          │       → data/toll.json   (daily snapshot + permalink to the exact revision)
          │
          ├── node scripts/fetch-feeds.mjs
          │       WHO news RSS + 3 Google News queries → keyword filter
          │       → LLM summaries + country extraction (OpenRouter, optional)
          │       → data/live.json  +  data/candidates.json
          │
          ├── git commit data/live.json data/candidates.json data/toll.json → git push
          │                   │
          │                   ▼
          │            Vercel redeploys
          │
          └── latest toll written to the Actions run summary
```

**How the toll reaches the page.** The dashboard merges the curated `casesTimeline` in `src/data/outbreak.ts` with the snapshots in `data/toll.json` through `src/lib/timeline.ts`. On the same date the curated entry wins. The stat strip and chart both read from that merged timeline.

**Data-quality guards** (`scripts/lib/toll.mjs`). A new snapshot is rejected (logged as a GitHub Actions warning, `data/toll.json` left untouched) unless it passes all of these:

- Counts are non-negative integers, and deaths never exceed confirmed cases.
- Confirmed, deaths and recovered never decrease compared to the previous snapshot. Suspected is only range-checked, because suspected cases are routinely reclassified.
- Confirmed and deaths don't jump by more than 25% over the previous snapshot, unless that snapshot is more than 7 days old.

Each snapshot records its `source` and a `sourceUrl` permalink (`?oldid=<revision>`) to the exact Wikipedia revision it was parsed from, so every number is traceable. At most one snapshot is kept per UTC day (a later run the same day replaces it), and the file is capped at 400 snapshots.

If the API is unreachable, the infobox can't be parsed, or a guard trips, the script logs a warning or error annotation and exits 0, so a bad day never breaks the feed step or the deploy. Rejected values need a manual look.

**Run it manually.**

- GitHub UI: Actions → *Update Outbreak Data* → *Run workflow* (`workflow_dispatch`)
- CLI: `gh workflow run update-data.yml`
- Locally: `node scripts/update-toll.mjs` (no key needed; writes `data/toll.json`)

**Secrets.** There is a single optional secret: `OPENROUTER_API_KEY` (repo Settings → Secrets and variables → Actions). It is only used for feed summaries and country extraction. **Toll tracking works without it.**

**Limitations (be honest about them).**

- The Wikipedia infobox lags the official sources (INSP DRC, WHO) by up to about a day, and Wikipedia itself is editable by anyone. The guards above reduce, but don't eliminate, that risk.
- Only the headline totals and chart are automated. The province/country table (`monitoringData`), contact figures, and `summary` are **curated by hand** and only change when you edit `src/data/outbreak.ts`.
- Countries extracted from news by the LLM are shown in the feed as **Unverified** and never promoted to the table automatically.
- Automation never edits `src/data/outbreak.ts`.

---

## Configuring for a Different Outbreak

VirusTracer is built to be repurposed. You edit **three places** to track a different outbreak.

### 1. `src/data/outbreak.ts` — The curated outbreak data

This is the single source of truth for curated, manually verified data. Replace its contents with your outbreak's information. Exports:

```ts
// Identity — title, subtitle, description and source links shown in the header/metadata
export const outbreak = {
  title: "Ebola Outbreak Tracker",
  subtitle: "2026 DR Congo & Uganda · Bundibugyo virus · Unofficial surveillance dashboard",
  description: "Unofficial surveillance dashboard tracking ...",
  links: [{ label: "WHO DON", href: "https://www.who.int/emergencies/disease-outbreak-news" }],
} as const;

// Curated timeline — one entry per significant, documented reporting date.
// confirmed / suspected / deaths / recovered are ALL optional: a milestone row
// (e.g. "1,000th death") carries only the figure its source documents, and the
// other series simply has a gap there. Auto-tracked snapshots from
// data/toll.json are merged in after these (curated wins on the same date).
export const casesTimeline: CaseDataPoint[] = [
  {
    date: "2026-08-01",             // ISO date
    label: "Aug 1",                 // chart x-axis label
    confirmed: 3626,
    deaths: 1589,
    recovered: 654,
    note: "DRC 3,605 / 1,587 deaths; Uganda 20 / 2",   // shown in the hover tooltip
    source: "WHO DON614 (1 Aug 2026)",                 // required
  },
];

// Country / region table. Sub-national rows set `parentIso` and are excluded from the total.
// There are no monitored / quarantined fields.
export const monitoringData: MonitoringEntry[] = [
  { country: "DR Congo", flag: "🇨🇩", iso: "CD", confirmed: 8224, deaths: 3982,
    status: "Epicentre · active", detail: "...", source: "INSP DRC / WHO", asOf: "2026-09-29" },
  { country: "Ituri", flag: "🇨🇩", iso: "CD-IT", parentIso: "CD", confirmed: 6250, deaths: 2885,
    status: "Epicentre", detail: "...", source: "WHO DON617", asOf: "2026-09-29" },
];

// First-detection / spread sites shown on the map
export const spreadStops: SpreadStop[] = [
  { name: "Bunia", location: "Ituri, DR Congo", coords: [30.252, 1.567], // [lng, lat]
    date: "2026-05-14", event: "Outbreak first detected" },
];

// Map bubbles per region, labelled with confirmed cases and deaths.
// type: "origin" | "case" | "monitoring"; asOf drives the map recency gradient.
export const caseLocations: CaseLocation[] = [
  { country: "Ituri", flag: "🇨🇩", coords: [30.1, 1.6], confirmed: 6250, deaths: 2885,
    type: "origin", asOf: "2026-09-29" },
];

// Figures the timeline doesn't carry (headline case/death totals come from the merged timeline)
export const summary = {
  countriesAffected: 3,
  provincesAffected: 7,
  healthZonesAffected: 63,
  contactsUnderFollowUp: 31034,
  healthWorkerDeaths: 50,
  spreadStatus: "Active · 7 DRC provinces",
  lastReviewed: "2026-09-29",
  source: "WHO DON / INSP DRC / Wikipedia / AP",
};
```

**Rule:** every entry must have a `source` field. This is what makes the dashboard citable.

### 2. `scripts/update-toll.mjs` — The death-toll source

Point the script at the English Wikipedia article for your outbreak by changing the `PAGE_TITLE` constant (currently `"2026_Ebola_epidemic"`). The lead section of the article must contain an `{{Infobox outbreak}}` with `confirmed_cases` and `deaths` fields (`suspected_cases` and `recovery_cases` are optional); if your article names them differently, adjust the parser in `scripts/lib/toll.mjs`. Then replace the `casesTimeline` entries that predate your outbreak, or delete `data/toll.json` so it starts fresh.

### 3. `scripts/fetch-feeds.mjs` — The feed sources

Update `FEEDS` and the keyword list to match your pathogen:

```js
const FEEDS = [
  { name: "WHO News", url: "https://www.who.int/rss-feeds/news-english.xml", source: "WHO" },
  {
    name: "Google News — Your Outbreak",
    // Adjust this query for your pathogen and year
    url: gnews("Ebola Bundibugyo outbreak"),
    source: "News",
  },
];

// Articles are only saved if they contain at least one of these strings
// ("ituri" is noisy, so it additionally needs outbreak context words)
const STRONG_KEYWORDS = ["ebola", "bundibugyo", "ebola virus disease", "filovirus"];
```

The `FEEDS` list ships with WHO news plus three Google News queries; the LLM prompts in the same file also mention the outbreak by name — update those too. (`KEYWORDS` is called `STRONG_KEYWORDS` in the script.) Everything else — the map, chart, table, Actions cron, and feed panel — adapts automatically.

---

## Setup

### Prerequisites
- Node.js 20+
- A [Vercel](https://vercel.com/) account (free tier is enough)
- An [OpenRouter](https://openrouter.ai/) API key (optional — costs fractions of a cent per run)

### Local development

```bash
git clone https://github.com/aristidesnakos/virustracer.git
cd virustracer
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Tests

```bash
npm test              # unit tests (Vitest)
npm run test:e2e      # Playwright e2e (expects the dev server; see playwright.config.ts)
```

### Run the data pipelines locally

```bash
# Death-toll snapshot (keyless) — writes data/toll.json
node scripts/update-toll.mjs

# Feed pipeline — writes data/live.json and data/candidates.json
OPENROUTER_API_KEY=your_key node scripts/fetch-feeds.mjs
```

Without the key the feed script still runs — it just skips LLM summarization and country extraction, saving raw article descriptions instead.

### Deploy to Vercel

1. Fork this repo to your GitHub account
2. Import it at [vercel.com/new](https://vercel.com/new)
3. No environment variables needed for the dashboard itself
4. Optionally add `OPENROUTER_API_KEY` as a **GitHub repository secret** (repo Settings → Secrets and variables → Actions → New repository secret)

Vercel redeploys automatically every time GitHub Actions commits updated data.

---

## Contributing

If you're using VirusTracer to track a different outbreak, consider opening a PR to add your configuration as an example under `examples/`. Issues with data errors in the Ebola tracker are welcome — include the source link.

---

## License

MIT

> Not an official public health resource. For decisions that matter, rely on WHO, CDC, ECDC, and national health authorities.
