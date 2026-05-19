# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # start dev server (localhost:3000)
npm run build    # production build
npm run lint     # ESLint
node scripts/fetch-feeds.mjs  # manually run feed updater (needs OPENROUTER_API_KEY)
```

No test suite exists yet.

## Architecture

Single-page outbreak dashboard (Next.js 16 App Router, React 19, Tailwind v4, TypeScript).

**Data flow — two layers:**

1. **Static curated data** — `src/data/outbreak.ts` is the source of truth. All case counts, country monitoring entries, voyage stops, map markers, and summary stats live here as typed TypeScript constants. Edit this file to update outbreak numbers.

2. **Live feed data** — `data/live.json` is written by `scripts/fetch-feeds.mjs` (GitHub Actions cron, daily at 08:00 UTC). The script fetches RSS from PAHO and Google News, filters for hantavirus keywords, summarizes via OpenRouter (DeepSeek V4 Flash), and appends up to 20 items. The Next.js server reads this file at request time via `src/lib/live-data.ts` (`getLiveData()`), which is called in the Server Component `page.tsx` and passed as props to `FeedUpdates`.

**Component breakdown:**

- `src/app/page.tsx` — Server Component; composes the full dashboard layout (stat strip, map, chart, table, feed). Also defines `StatCard` inline.
- `src/components/MapLoader.tsx` — thin `"use client"` wrapper that uses `next/dynamic` with `ssr: false` to avoid SSR for MapLibre GL.
- `src/components/OutbreakMap.tsx` — Client Component; initializes a MapLibre GL map with Stadia dark tiles, renders the ship voyage route as a dashed LineString, voyage stops as circles, and country case/monitoring bubbles with hover popups.
- `src/components/CasesChart.tsx` — Recharts chart of the case timeline from `casesTimeline`.
- `src/components/MonitoringTable.tsx` — table of `monitoringData` entries.
- `src/components/FeedUpdates.tsx` — renders `recentItems` from `data/live.json`.

**Map:** MapLibre GL JS + Stadia Maps `alidade_smooth_dark` style. No Stadia API key required for development (free tier). `OutbreakMap` must be loaded client-side only — always go through `MapLoader`.

**Env vars:**
- `OPENROUTER_API_KEY` — required only for `scripts/fetch-feeds.mjs` (summarization); the app runs without it.
