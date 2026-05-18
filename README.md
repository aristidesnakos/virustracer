# VirusTracer

**A lightweight, self-hosted outbreak surveillance dashboard you can configure and deploy in minutes.**

VirusTracer makes it easy for one person — a journalist, researcher, public health student, or concerned citizen — to stand up an accurate, source-cited tracking dashboard for any viral outbreak. Configure the data file, push to GitHub, and Vercel handles the rest. A daily cron pulls from official health feeds automatically.

---

## Live Instance — 2026 MV Hondius Hantavirus Outbreak

This repository is currently deployed as a tracker for the **2026 MV Hondius hantavirus outbreak** (Andes strain), in which three cruise ship passengers died and cases spread across multiple countries following an expedition voyage from Ushuaia, Argentina.

> ⚠️ **Not an official public health resource.** Data is manually compiled from WHO, CDC, PAHO, and regional health authority press releases. Always verify critical information with official sources.

**Official sources:**
- [WHO Disease Outbreak News — DON599](https://www.who.int/emergencies/disease-outbreak-news)
- [CDC Hantavirus](https://www.cdc.gov/hantavirus)
- [PAHO](https://www.paho.org/en)

---

## What It Does

| Panel | Description |
|-------|-------------|
| **World map** | Plots the ship's voyage route and case/monitoring markers by country. Hover for source-cited tooltips. |
| **Cases chart** | Cumulative confirmed / suspected / deaths over time. Each data point cites its source and date. |
| **Monitoring table** | Country-by-country quarantine and monitoring counts. Click any row for full detail + source. |
| **Feed panel** | Live articles pulled daily from PAHO and Google News, summarized by an LLM. |

Data freshness: the GitHub Actions cron runs every morning at 08:00 UTC, commits updated `data/live.json`, and Vercel redeploys automatically.

---

## Stack

- [Next.js 16](https://nextjs.org/) (App Router, TypeScript)
- [MapLibre GL JS](https://maplibre.org/) with [Stadia Maps](https://stadiamaps.com/) dark tiles
- [Recharts](https://recharts.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [OpenRouter](https://openrouter.ai/) — DeepSeek V4 Flash for feed summarization (cheap)
- [GitHub Actions](https://docs.github.com/en/actions) for daily data updates
- [Vercel](https://vercel.com/) for hosting

---

## Configuring for a Different Outbreak

VirusTracer is built to be repurposed. You only need to edit **two files** to track a completely different outbreak.

### 1. `src/data/outbreak.ts` — The outbreak data

This is the single source of truth for all curated, manually verified data. Replace its contents with your outbreak's information. The types are:

```ts
// Case timeline — one entry per significant reporting date
export const casesTimeline: CaseDataPoint[] = [
  {
    date: "2026-01-15",           // ISO date
    label: "Jan 15",              // displayed on the chart x-axis
    confirmed: 12,                // cumulative WHO-confirmed cases
    suspected: 3,                 // cumulative probable/suspected
    deaths: 2,                    // cumulative deaths
    note: "First WHO briefing",   // shown in chart hover tooltip
    source: "WHO DON / Reuters",  // cite your source — required
  },
  // add one entry per key date
];

// Country monitoring table
export const monitoringData: MonitoringEntry[] = [
  {
    country: "Germany",
    flag: "🇩🇪",
    iso: "DE",
    confirmed: 3,
    deaths: 1,
    monitored: 42,
    quarantined: 12,
    status: "Active monitoring",
    detail: "Full detail shown when the table row is expanded.",
    source: "Robert Koch Institut, Jan 15 2026",
    asOf: "2026-01-15",
  },
];

// Geographic progression (ship route, city-to-city spread, etc.)
export const voyageStops: VoyageStop[] = [
  {
    name: "Frankfurt",
    location: "Germany",
    coords: [8.682, 50.11],  // [longitude, latitude]
    date: "2026-01-10",
    event: "First cases detected at this location",
  },
];

// Map bubble markers per country
export const caseLocations: CaseLocation[] = [
  {
    country: "Germany",
    flag: "🇩🇪",
    coords: [10.45, 51.165],
    confirmed: 3,
    deaths: 1,
    monitored: 42,
    type: "case",  // "origin" | "case" | "monitoring" | "ship"
  },
];

// Header stat strip
export const summary = {
  totalConfirmed: 3,
  totalSuspected: 1,
  totalDeaths: 1,
  totalMonitored: 42,
  countriesAffected: 4,
  vessel: "N/A",           // ship name, or "N/A" if not applicable
  operator: "N/A",
  voyage: "N/A",
  shipStatus: "Ongoing",
  lastUpdated: "2026-01-15",
  source: "WHO / RKI / AP",
};
```

**Rule:** every entry must have a `source` field. This is what makes the dashboard citable.

### 2. `scripts/fetch-feeds.mjs` — The feed sources

Update `FEEDS` and `KEYWORDS` to match your pathogen:

```js
const FEEDS = [
  {
    name: "PAHO",
    url: "https://www.paho.org/en/rss.xml",  // works without a key
    source: "PAHO",
  },
  {
    name: "Google News — Your Outbreak",
    // Adjust this query for your pathogen and year
    url: "https://news.google.com/rss/search?q=ebola+outbreak+2026&hl=en-US&gl=US&ceid=US:en",
    source: "News",
  },
];

// Articles are only saved if they contain at least one of these strings
const KEYWORDS = ["ebola", "hemorrhagic fever", "ebv"];
```

Everything else — the map, chart, table, Actions cron, and feed panel — adapts automatically.

---

## Setup

### Prerequisites
- Node.js 20+
- A [Vercel](https://vercel.com/) account (free tier is enough)
- An [OpenRouter](https://openrouter.ai/) API key (optional — costs fractions of a cent per daily run)

### Local development

```bash
git clone https://github.com/aristidesnakos/virustracer.git
cd virustracer
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Run the feed pipeline locally

```bash
OPENROUTER_API_KEY=your_key node scripts/fetch-feeds.mjs
```

Without the key it still runs — it just skips LLM summarization and saves raw article descriptions instead.

### Deploy to Vercel

1. Fork this repo to your GitHub account
2. Import it at [vercel.com/new](https://vercel.com/new)
3. No environment variables needed for the dashboard itself
4. Add `OPENROUTER_API_KEY` as a **GitHub repository secret** (repo Settings → Secrets and variables → Actions → New repository secret)

Vercel redeploys automatically every time GitHub Actions commits updated feed data.

### Optional: Stadia Maps key

The map works without a key on low traffic. For production load:
1. Get a free key at [stadiamaps.com](https://stadiamaps.com/)
2. Add `NEXT_PUBLIC_STADIA_API_KEY=your_key` as a Vercel environment variable

---

## Data Update Pipeline

```
08:00 UTC daily
      │
      ▼
GitHub Actions  (.github/workflows/update-data.yml)
      │
      ├── Fetch PAHO RSS
      ├── Fetch Google News RSS (your pathogen query)
      │
      ├── Filter by keyword list
      ├── Deduplicate via processedIds in data/live.json
      │
      ├── Summarize new articles — OpenRouter → DeepSeek V4 Flash
      │
      └── git commit data/live.json → git push
                    │
                    ▼
              Vercel redeploys
```

The curated data in `src/data/outbreak.ts` is **never modified by automation** — only by you, when official sources confirm new numbers.

---

## Contributing

If you're using VirusTracer to track a different outbreak, consider opening a PR to add your configuration as an example under `examples/`. Issues with data errors in the hantavirus tracker are welcome — include the source link.

---

## License

MIT
