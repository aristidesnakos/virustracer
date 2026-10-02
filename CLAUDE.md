# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev       # start dev server (localhost:3000)
npm run build     # production build
npm run lint      # ESLint
npm test          # unit tests (Vitest, jsdom; tests/**/*.test.{ts,tsx})
npm run test:e2e  # Playwright e2e (uses the running dev server on PLAYWRIGHT_PORT, default 3000)
node scripts/update-toll.mjs   # manually refresh data/toll.json (keyless)
node scripts/fetch-feeds.mjs   # manually run feed updater (OPENROUTER_API_KEY optional)
node scripts/backfill-toll.mjs [--dry-run]   # one-off: import daily toll history from the Wikipedia article's revisions
```

## Architecture

Single-page outbreak dashboard (Next.js 16 App Router, React 19, Tailwind v4, TypeScript). Currently configured for the 2026 Bundibugyo Ebola outbreak (DRC + Uganda) with an automatically tracked death toll.

**Data flow — three layers:**

1. **Curated data** — `src/data/outbreak.ts` is the hand-verified source of truth. Exports: `outbreak` (title/subtitle/description/links), `casesTimeline` (milestones; `confirmed`/`suspected`/`deaths`/`recovered` are all optional), `monitoringData` (country table; DRC provinces are sub-rows via `parentIso` and excluded from the total), `spreadStops`, `caseLocations` (map bubbles) and `summary`. Every entry needs a `source`.

2. **Auto-tracked toll snapshots** — `data/toll.json` (`{ lastChecked, snapshots[] }`) is written by `scripts/update-toll.mjs`, which reads the Wikipedia infobox for "2026 Ebola epidemic" via the MediaWiki API, parses confirmed/suspected/deaths/recovered from the `{{Infobox outbreak}}` in the lead section (page constant `PAGE_TITLE`; parsing and the sanity checks live in the pure helpers in `scripts/lib/toll.mjs`), sanity-checks against the previous snapshot (confirmed/deaths/recovered never decrease, no >25% jump in confirmed/deaths unless the last snapshot is >7 days old, deaths <= confirmed), and writes one snapshot per UTC day with an `?oldid=` permalink to the exact revision. On failure it logs a GitHub Actions warning/error annotation and exits 0. `src/lib/toll.ts` (`getTollData()`) reads the file at request time and `src/lib/timeline.ts` (`mergeTimeline`, `latestDate`) merges the snapshots with the curated `casesTimeline`; curated wins on the same date. `page.tsx` passes the merged `timeline` to `StatStrip` and `CasesChart`.

3. **Live feed data** — `data/live.json` and `data/candidates.json` are written by `scripts/fetch-feeds.mjs`. It fetches WHO news RSS plus three Google News queries, keyword-filters for Ebola, and (if `OPENROUTER_API_KEY` is set) summarizes via OpenRouter DeepSeek and extracts country candidates. The server reads them at request time via `src/lib/live-data.ts` (`getLiveData()`) and `src/lib/candidates-data.ts`, called in the Server Component `page.tsx`. Country candidates extracted from news are shown as Unverified.

**Derived metrics and public API:**

- `src/lib/metrics.ts` (`computeMetrics`) turns the daily `toll.snapshots` into weekly incidence, a growth rate with a Poisson 95% range, doubling/halving time, Rt (gamma serial interval, constants in `ASSUMPTIONS`) and three fatality ratios. It fills gaps by interpolation, never lets a cumulative count fall, and ends the 7-day windows on the latest day the total moved (at most `maxReportingLagDays` before the last reading) because the Wikipedia source is updated in batches; measuring to a stale flat day shows a false collapse. It returns `status: "insufficient_data"` rather than guessing when history is thin. Metrics use `toll.snapshots` only, not the merged timeline, to avoid cross-source jumps from curated rows. `src/lib/trend-summary.ts` writes the plain-language verdict; `TrendPanel.tsx` renders it (Fig. 3).
- Public, keyless, CORS-open JSON/CSV under `/api/v1/` (`toll`, `metrics`, `signals`); helpers (query parsing, CSV, headers) in `src/lib/api.ts`. `/data` documents endpoints and the method; its assumptions are read from `ASSUMPTIONS` so docs cannot drift. Keep `/data` and `src/lib/metrics.ts` in sync.
- `scripts/backfill-toll.mjs` takes the last Wikipedia revision of each UTC day, parses the infobox with the same parser as the daily updater, drops readings with deaths > confirmed (early revisions counted suspected deaths) and keeps the longest never-decreasing chain (`scripts/lib/backfill.mjs`) so vandalism/typos cannot poison the series. The article title and user agent live in `scripts/lib/outbreak-config.mjs`, shared with `update-toll.mjs`. Snapshots may carry `revisionTimestamp`.
- Early-signal ledger: `scripts/fetch-feeds.mjs` folds extracted candidates into `data/signals.json` (one row per country, first-seen date, never pruned; `scripts/lib/signals.mjs`). `src/lib/signals.ts` joins it to `monitoringData` at read time: a signal is confirmed once the table lists the country with cases, and `leadDays` needs the optional curated `firstConfirmed` date on that `MonitoringEntry`.

**Automation rule:** automation (GitHub Actions) never edits `src/data/outbreak.ts`. Only the headline totals and chart are auto-updated; the province/country table, map bubbles, and `summary` are updated by hand.

**Workflow:** `.github/workflows/update-data.yml` runs at 08:00 and 20:00 UTC (and via `workflow_dispatch`, e.g. `gh workflow run update-data.yml`) in a concurrency group. Steps: `node scripts/update-toll.mjs`, then `node scripts/fetch-feeds.mjs`, then commits `data/live.json data/candidates.json data/signals.json data/toll.json` (pull --rebase, push), then a final `always()` step writes the latest toll to the Actions step summary. Vercel redeploys on the commit. `OPENROUTER_API_KEY` is the only secret and is optional.

**Component breakdown:**

- `src/app/page.tsx` — Server Component; composes the dashboard (stat strip, map, chart, table, feed). Builds the merged `timeline` and passes it as a prop to `StatStrip` and `CasesChart`.
- `src/components/StatStrip.tsx` — headline stats; takes the `timeline` prop (latest merged point for cases/deaths, trends, case fatality) plus figures from `summary`.
- `src/components/MapLoader.tsx` — thin `"use client"` wrapper that uses `next/dynamic` with `ssr: false` to avoid SSR for MapLibre GL.
- `src/components/OutbreakMap.tsx` — Client Component; MapLibre GL map with CARTO dark-matter tiles. Renders `spreadStops` (first-detection sites) and `caseLocations` bubbles labelled with confirmed cases and deaths, with hover popups.
- `src/components/CasesChart.tsx` — Recharts "Cumulative deaths & cases" chart; takes the merged `timeline` prop.
- `src/components/MonitoringTable.tsx` — region table from `monitoringData`; province rows (`parentIso`) render as sub-rows under their country.
- `src/components/FeedUpdates.tsx` — renders `recentItems` from `data/live.json`.
- `src/lib/outbreak-trend.ts` (trend deltas), `src/lib/timeline.ts` (curated + snapshot merge), `src/lib/toll.ts` (reads `data/toll.json`), `src/lib/live-data.ts`, `src/lib/candidates-data.ts`.

**Map:** MapLibre GL JS with CARTO dark-matter tiles (free, no API key). `OutbreakMap` must be loaded client-side only — always go through `MapLoader`.

**Tests:** unit tests live in `tests/` (Vitest + Testing Library, `tests/setup.ts`; includes `toll.test.ts` for the scraper helpers and `timeline.test.ts` for the merge); e2e specs in `e2e/` (Playwright, run against the dev server).

**Env vars:**
- `OPENROUTER_API_KEY` — optional; used only by `scripts/fetch-feeds.mjs` (summaries + country extraction). The app and `scripts/update-toll.mjs` run without it.
