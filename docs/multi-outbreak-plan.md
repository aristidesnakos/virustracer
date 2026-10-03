# From one outbreak page to an outbreak news site: site map and SEO plan

**Version 1.0** · Created 2026-10-03 · Owner: Ari Nakos
**Status:** Planning only. Nothing in this document is built. Written to be picked up cold in the next session.

---

## 1. Where we are (verified in the repo on 2026-10-03)

One outbreak, one page, hard-wired in at every layer:

| Layer | Today | Why it blocks "many outbreaks" |
|---|---|---|
| Identity | `src/data/outbreak.ts` exports a single `outbreak` object plus `casesTimeline`, `monitoringData`, `spreadStops`, `caseLocations`, `summary` | 17 src files and 6 test files import it directly |
| Brand | `SITE_NAME = outbreak.title` (`src/lib/site.ts`). The site's name is "Ebola Outbreak Tracker" | A multi-disease site cannot be named after one disease. Site brand and outbreak must become separate things |
| Toll data | `data/toll.json`, written by `scripts/update-toll.mjs` from one Wikipedia article (`PAGE_TITLE` in `scripts/lib/outbreak-config.mjs`) | One file, one article |
| Feeds | `data/live.json`, `candidates.json`, `signals.json`, filtered by "Ebola" keywords | Keyword filter and the country-extraction prompt are Ebola-specific |
| Metrics | `src/lib/metrics.ts` `ASSUMPTIONS`: serial interval 15.3 d (Ebola, West Africa), case-to-death 10 d | Rt and fatality-delay constants are per pathogen. Wrong for measles, cholera, flu, dengue |
| API | `/api/v1/toll`, `/metrics`, `/signals` with no outbreak parameter | Already public and keyless, so people may depend on these URLs. Do not break them |
| Pages | `/` is the dashboard, `/data` is API docs | No index, no archive, no per-outbreak URL |
| SEO (shipped 2026-10-02, commit `869b818`) | Title, description with live toll, canonical, WebSite/WebPage/Dataset JSON-LD, sitemap with 2 URLs, robots, OG image, `/api/*` noindex | All of it is single-outbreak. `SITE_URL`, canonical, sitemap and JSON-LD helpers are reusable |
| Automation | `.github/workflows/update-data.yml` twice daily, commits four data files | Needs to loop over outbreaks, and one failing source must not block the others |

Rules that must survive the redesign (from `CLAUDE.md` and memory):
- Automation never edits curated `outbreak.ts` content. Only toll snapshots and feeds are automated.
- Rates stay lag-aware and return `insufficient_data` rather than guess.
- No forecasts or importation-risk projections (decided 2026-10-02: an unvalidated projection from a Wikipedia-sourced tool could mislead).
- The "Get alerts" widget is a fake-door demand test. No alert system exists. Do not describe alerts as live.
- Open licence question: the `/data` page says free with attribution; the underlying figures are Wikipedia CC BY-SA 4.0.

---

## 2. Product shape

Three kinds of page, in this order of importance:

1. **Home: a snapshot of what is active.** A grid of outbreak cards, each with the headline numbers, a 7-day trend badge, a sparkline and a "last updated / source" line. This answers "what is going on in the world right now".
2. **Outbreak page: the dashboard we have today**, one per outbreak. Map, chart, trend panel, regional table, news feed.
3. **Track record: an archive of past outbreaks.** Each past outbreak gets a smaller, mostly static page (final toll, timeline, countries, how it ended). Over time this is the thing no competitor has: one place with a consistent format across outbreaks.

Later: disease hubs (all Ebola outbreaks), regional pages, a news/journal stream.

### 2.1 Core concepts (get these right first, they drive URLs, data and schema)

- **Pathogen / disease** (evergreen): "Ebola (Bundibugyo)", "Measles", "H5N1 avian influenza", "Cholera", "Mpox", "Dengue".
- **Outbreak** (an event with a start, a status and maybe an end): "2026 Bundibugyo Ebola outbreak, DRC and Uganda". One disease has many outbreaks over time.
- **Status**: `active` | `waning` | `over` | `watch` (a signal, not yet an outbreak). Drives the home snapshot, sitemap priority and the archive.
- **Seasonal or endemic diseases** (flu, dengue, cholera, measles) do not behave like an Ebola event. Decide per disease whether it is modelled as "yearly outbreak" (`measles-us-2026`) or as a rolling series. Recommendation: yearly or per-event outbreak records, so one data model fits.

### 2.2 What "top diseases right now" should mean

The home page should not claim "the top diseases in the world" unless the ranking is defensible. Recommendation: title the section **"Outbreaks we are tracking"**, sort by an explicit, published rule, for example `status` first (active before waning), then 7-day new deaths, with an editorial pin for anything newsworthy. Document the rule on `/methodology`. Revisit once there are more than about 6 outbreaks.

---

## 3. Site map

```
/                                   Home: snapshot grid of active outbreaks + short "what changed this week"
/outbreaks/                         Full index (active, waning, over), filterable. May be the same page as / at first
/outbreaks/[slug]                   Outbreak dashboard (today's / page moves here)
/outbreaks/[slug]/news              Dated situation notes for that outbreak (phase 5, only if we write them)
/archive/                           Track record: past outbreaks, by year and by disease
/diseases/                          Disease index (phase 5)
/diseases/[disease]                 Evergreen hub: what it is, all its outbreaks, links out to WHO/CDC (phase 5)
/regions/[region]                   Regional view, e.g. /regions/central-africa (phase 6)
/data                               API and data docs (exists). Add per-outbreak endpoints
/methodology                        How figures are sourced, lag handling, ranking rule, what we do not do
/about                              Who runs it, sources, corrections policy (trust page, see section 5.4)
/api/v1/outbreaks                   List of outbreaks
/api/v1/outbreaks/[slug]/toll       Per-outbreak toll (also /metrics, /signals)
/api/v1/toll, /metrics, /signals    KEEP as permanent aliases for the current Ebola outbreak (do not break callers)
```

Slug convention (decide in section 8): `ebola-bundibugyo-2026`, `measles-us-2026`, `h5n1-us-2024`. Disease first, place or variant if needed, year last. Slugs are forever: put the year in because the same disease will recur, and never reuse a slug.

URL notes:
- **The home page cannot be 301-redirected**, so the move is: `/` becomes the snapshot, the Ebola dashboard moves to `/outbreaks/ebola-bundibugyo-2026`. We shipped SEO one day ago, so almost no ranking equity is at stake on `/`. This is the cheapest moment to restructure.
- Keep `/data` where it is (already linked, already documented).
- No query-parameter pages in the sitemap (filters on `/outbreaks/` are client state with canonical to the bare URL).

---

## 4. Data model and refactor (do this before any new page)

Goal: replace the single `outbreak` with a registry, with **no behaviour change for Ebola** at the end of the phase.

Proposed layout:

```
src/data/outbreaks/index.ts            registry: { slug -> OutbreakDefinition } plus list helpers
src/data/outbreaks/ebola-bundibugyo-2026.ts   what outbreak.ts holds today
data/outbreaks/<slug>/toll.json        per-outbreak snapshots
data/outbreaks/<slug>/live.json        per-outbreak feed items
data/outbreaks/<slug>/signals.json
```

`OutbreakDefinition` (sketch):

```ts
{
  slug, disease, status: "active" | "waning" | "over" | "watch",
  title, seoTitle, subtitle, description, keywords, startDate, endDate?,
  countries: string[], region: string,
  source: { kind: "wikipedia-infobox" | "official-csv" | "manual", ref: string },
  feed: { keywords: string[], extractionPrompt?: string },
  metrics: { applicable: boolean, assumptions?: {...} },   // per pathogen, see below
  licence: string,                                          // per source, shown on the page
  casesTimeline, monitoringData, spreadStops, caseLocations, summary,
}
```

Work items:
1. **Separate site brand from outbreak.** Add `SITE_NAME` as its own constant (needs a name, see section 8). `src/lib/site.ts`, `layout.tsx`, `page.tsx`, `opengraph-image.tsx` all read `outbreak.title` today.
2. **Parameterise the components.** `StatStrip`, `CasesChart`, `MonitoringTable`, `OutbreakMap`, `TrendPanel`, `FeedUpdates` already take props for the timeline. The ones that import `@/data/outbreak` directly (`StatStrip`, `CasesChart`, `OutbreakMap`, `MonitoringTable`, `lib/outbreak-trend.ts`, `lib/signals.ts`, `lib/timeline.ts`) need the outbreak passed in. Mechanical, but it touches 6 test files.
3. **Parameterise the scripts.** `update-toll.mjs`, `backfill-toll.mjs` and `fetch-feeds.mjs` take a slug (or loop over all `active` and `waning` outbreaks). One outbreak failing logs a Actions annotation and continues, as the toll script already does for one source.
4. **Per-pathogen metrics.** Move `ASSUMPTIONS` to the outbreak definition. Measles, cholera and dengue need different assumptions, and for some the right answer is `metrics.applicable = false` (show incidence and deaths, hide Rt). The existing `insufficient_data` path is the model: never invent a number.
5. **Source adapters.** The keyless Wikipedia-infobox approach will not generalise to every disease. Many have official dashboards or CSVs (candidate sources to verify, not confirmed: CDC measles case counts, WHO mpox and cholera dashboards, CDC H5N1 human-case page, ECDC and PAHO dengue). Define an adapter interface and give each outbreak an **automation tier**: `auto` (script), `semi` (script proposes, human confirms), `manual`. Show the tier and "last verified" on the page, so manual outbreaks are not presented as live.
6. **Workflow.** Loop over outbreaks, commit `data/outbreaks/**`, keep the concurrency group. Watch run time and the 10-minute timeout as outbreaks are added.

Risk: this is the largest chunk of work and delivers nothing visible. Keep it a pure refactor (Ebola page looks the same at `/outbreaks/ebola-bundibugyo-2026`, tests green) and ship it on its own.

---

## 5. SEO plan

What exists today and carries over: `SITE_URL` resolution, canonical pattern, `generateMetadata` with live figures in the description (`src/lib/seo.ts`), WebSite/WebPage/Dataset JSON-LD, sitemap with data-date `lastmod`, robots, `/api/*` noindex, per-page OG image.

### 5.1 Query model (what people actually search)

| Intent | Example query | Page that answers it |
|---|---|---|
| Event + year, high urgency | "ebola outbreak 2026", "ebola death toll", "bird flu human cases 2026" | Outbreak page |
| Live status | "measles cases 2026", "mpox cases today" | Outbreak page, with the number in title or description |
| Broad "what is happening" | "disease outbreaks right now", "current outbreaks" | Home |
| Historical | "worst ebola outbreaks", "largest epidemics in history" | Archive and disease hubs |
| Definitional ("what is ebola") | Dominated by WHO, CDC, Mayo | **Do not compete.** Link out to WHO and CDC from disease hubs instead |

Be realistic: WHO, CDC and Wikipedia own the broad and definitional queries. The winnable space is **live, numeric, event-specific queries** and the consistent cross-outbreak format. That is also what the home snapshot and outbreak pages are for.

### 5.2 Page-by-page metadata

| Page | Title pattern (about 60 chars) | Description | Canonical | JSON-LD |
|---|---|---|---|---|
| `/` | `Outbreak Tracker: Live Disease Outbreaks Worldwide` (final brand TBD) | Names the top 2 or 3 active outbreaks with their numbers, generated from data | `/` | WebSite, CollectionPage with ItemList of outbreaks |
| `/outbreaks/[slug]` | `{Disease} Outbreak {Year}: Death Toll, Cases & Map \| {Place}` (the shipped Ebola title is the template) | Live numbers and as-of date (shipped for Ebola) | self | WebPage, Dataset, BreadcrumbList |
| `/archive` | `Past Disease Outbreaks: A Record of Major Epidemics` | Counts and date range, generated | self | CollectionPage |
| `/diseases/[d]` | `{Disease}: Outbreaks, History & Current Cases` | Active outbreak count plus links | self | CollectionPage, BreadcrumbList |
| `/data`, `/methodology`, `/about` | Static, with the title template | Static | self | AboutPage for `/about` (as on michikanji) |

Implementation: one `generateMetadata` helper that takes an `OutbreakDefinition` and returns metadata. Per-outbreak OG image via `app/outbreaks/[slug]/opengraph-image.tsx` (the existing one reads the single outbreak and must be generalised), plus a site-level OG image for `/`. Remember what we hit on 2026-10-02: a page-level `openGraph` or `twitter` replaces the layout's wholesale, so repeat `type`, `siteName`, `images` explicitly in the helper.

### 5.3 Sitemap, robots, freshness

- `app/sitemap.ts` generates entries from the registry. `lastmod` per outbreak is the date its data last moved (same rule as today). Never use build time. `over` outbreaks keep their final date and drop to a lower priority and `changeFrequency: "yearly"`.
- Home `lastmod` is the max across active outbreaks.
- Consider IndexNow pings on data commits (michikanji has `lib/seo/indexnow.ts`). Cheap, and freshness matters for news-like queries. Optional.
- Robots stay as they are, plus keep `/api/*` noindex via the header.
- Submit the new sitemap in Search Console once `NEXT_PUBLIC_SITE_URL` is set to the real domain (still open from 2026-10-02).

### 5.4 Trust: this is health content

Health content is treated as "Your Money or Your Life" by search quality raters, so authority and transparency are ranking inputs here, not decoration. Take the pattern from michikanji's `/about` page (a paper trail in place of credentials):
- `/about`: who runs it, that it is unofficial, where each layer of data comes from, how it is checked, corrections policy, contact.
- `/methodology`: sourcing, reporting lag, why windows end on the last day the total moved, why there are no forecasts, how the ranking works.
- Per-outbreak: source line, "last verified" date and automation tier visible in the page, plus the "Not an official public health resource" disclaimer already in the footer.
- Outbound links to WHO, CDC and ECDC on every outbreak page (already present for Ebola).

### 5.5 Avoid thin and duplicate pages

Programmatic pages are where sites like this get demoted. Guardrails:
- **Publish bar for an outbreak page:** at least about 14 days of data or a sourced summary, a named source, a regional table or a plain-language situation summary, and an as-of date. Below the bar, the outbreak shows only as a card on `/outbreaks/` with no standalone indexable page, or the page is `noindex` until it clears.
- **Do not index the aggregated news feed as its own page.** A list of other people's headlines adds no original value. A news section earns indexing only if it carries dated, original situation notes (a "journal"), which also fits the existing Situation Journal design and gives freshness. That needs editorial capacity (open question).
- Disease hubs must be more than a list. If there is only one outbreak per disease, skip the hub and link straight to the outbreak.
- Archive pages for `over` outbreaks stay indexed, because "how many died in the 2014 outbreak" is a real query, but keep them accurate and static.

### 5.6 Internal linking

Home links to each active outbreak card. Outbreak pages link up (breadcrumb: Home > Outbreaks > Name), sideways (related outbreaks of the same disease or region) and to `/methodology` and `/data`. Archive links both ways. Plain `<a>` links, descriptive anchor text.

### 5.7 Measurement

Search Console for index coverage and queries (domain verification once the domain is set). The user already has DataFast skills for goals and funnels: track outbreak-card clicks from home (`place_thing_action` naming), and keep the alerts-widget opens versus submissions as the demand signal for an alert feature.

---

## 6. Phased plan

**Status (2026-10-03, evening):** Phases 1 to 3 are on `main` and deployed (df3b586): registry, `/outbreaks/[slug]`, per-outbreak API with permanent `/api/v1/*` aliases, snapshot home (status groups, trend badge, weekly sparkline, source line), `/methodology` with the approved ranking rule (status, then 7-day deaths, then 7-day cases, no editorial pin), `/about` naming Ari Nakos with corrections via GitHub issues, and a dev-only feedback widget (comments tracked in `.claude/dev-feedback.json`). Phase 4 is in progress in another session: local branch `outbreak/hantavirus-archive` (worktree ~/Documents/virustracer-brand, not pushed) adds the 2026 MV Hondius hantavirus outbreak as a hand-curated `over` record. It is manual, so it does not yet prove an automatable second source. Per-pathogen `ASSUMPTIONS` in `src/lib/metrics.ts` is still global and Ebola-specific. Decided: licence CC BY-SA 4.0; brand "Outbreak Files" (outbreakfiles.com); alerts parked (`feature/alerts-widget` unmerged); COVID-19 named as a later outbreak. Still open in section 8: audience, editorial capacity, regional scope.

Each phase ships on its own and leaves `main` working.

| Phase | Scope | Visible result | Rough size |
|---|---|---|---|
| **0. Decisions** | Answer section 8 (name, domain, first diseases, slug rule, editorial capacity) | None | A conversation |
| **1. Registry refactor** | Section 4 items 1 to 4. Ebola moved into the registry, scripts and workflow parameterised, per-outbreak data folders, site brand separated. Pure refactor, no URL change yet | None (tests green, page identical) | Large |
| **2. Route move and API** | Ebola dashboard to `/outbreaks/[slug]`, `/` temporarily a one-card snapshot, per-outbreak API under `/api/v1/outbreaks/...`, old `/api/v1/*` kept as aliases, generalised `generateMetadata`, sitemap from registry, per-outbreak OG image | New URL structure | Medium |
| **3. Home snapshot** | Outbreak cards (numbers, trend badge, sparkline, source and as-of), status grouping, published ranking rule, `/methodology` and `/about` | The new landing page | Medium |
| **4. Second outbreak** | Add one outbreak with an automatable source as the proof that the model generalises (also forces the metrics-applicability and source-adapter decisions). Choose the one with the cleanest official data, not the most newsworthy | Home shows 2 outbreaks | Medium |
| **5. Track record** | `/archive`, 2 or 3 past outbreaks backfilled (Wikipedia infoboxes plus `scripts/backfill-toll.mjs` reuse), disease hubs only where there are 2 or more outbreaks, optional situation notes | The archive | Medium to large |
| **6. Regions, alerts, news** | Regional pages, real alerts only if the demand test justifies it, news stream only if original | Growth features | Open |

Suggested first move next session: Phase 0 questions, then Phase 1 as one branch with a green `npm test`, `npm run lint` and `npm run build` before merging.

Test impact to plan for: `tests/StatStrip.test.tsx`, `MonitoringTable.test.tsx`, `outbreak-trend.test.ts`, `timeline.test.ts`, `signals.test.ts`, `seo.test.ts` import `@/data/outbreak` and will need the outbreak passed in. `e2e/dashboard.spec.ts` asserts the heading "Ebola outbreak tracker" on `/`, so it will fail the moment `/` changes (Phase 2) and must be moved to the outbreak URL.

---

## 7. Risks

- **Brand and scope drift.** Moving from "Ebola tracker" to a general site resets the audience. If the Ebola story fades, an "outbreak news site" needs its own pull. The registry approach keeps Ebola useful on its own while the rest is built.
- **Editorial burden.** Auto-tracked numbers scale, writing does not. Manual outbreaks go stale, and stale health data is worse than none. The automation tier plus visible "last verified" date is the mitigation; a hard rule helps too: an outbreak not verified in N days drops to `waning` on the home page.
- **Source fragility.** Wikipedia infobox formats vary and can be vandalised (the backfill already needed a longest-never-decreasing filter). Each new source needs sanity checks like `scripts/lib/toll.mjs` has.
- **Licensing.** Mixed sources mean mixed licences (Wikipedia CC BY-SA, CDC public domain, WHO CC BY-NC-SA for much of its data, which may conflict with a commercial or sponsored site). Settle this before publishing a "free data API" across sources. The sponsor card (`SponsorCard.tsx`) makes the commercial question real.
- **Misleading by comparison.** A grid that puts measles and Ebola side by side invites comparing numbers that are not comparable (different case definitions, reporting lags). Show each card's definition and as-of date, and avoid a single combined "severity" score.
- **Crawl quality.** Too many thin programmatic pages can drag down the whole site. The publish bar in 5.5 is the guard.
- **Disk.** The Mac has had little free space (3.1 GiB, later 10.1 GiB). `npm run build` writes about 350 MB of `.next`; delete it afterwards.

---

## 8. Open questions for Ari (answer these in Phase 0)

1. **Brand and domain.** What is the site called, and is there a domain yet? (`NEXT_PUBLIC_SITE_URL` is still unset, so canonical and sitemap URLs point at the Vercel address.) The name cannot contain "Ebola".
2. **Audience.** General public, journalists and researchers, or both? It changes tone, the API's priority and how much explanation each page needs.
3. **First additional outbreaks.** Which one or two come next? Criteria in order: public interest, a clean official data source, and not fighting seasonality on day one.
4. **Slug and URL style.** Confirm `/outbreaks/<disease>-<place?>-<year>`, or prefer a flatter `/<slug>`.
5. **Editorial capacity.** Will anyone write dated situation notes, or is the site numbers-only? Decides whether the news and journal section is worth building.
6. **Licence and sponsorship.** What is the data licence, and is the site meant to earn from sponsors? Needed before the API is advertised across mixed sources.
7. **Alerts.** Check the fake-door numbers (`[alert-interest] open` log lines versus submissions) before deciding whether to build them.
8. **Regional scope.** "Regional ones in certain parts of the world": is that cholera in one country, dengue in a region, or both? It sets the region taxonomy.

---

## 9. Reference: what is reusable

- `src/lib/site.ts`: `SITE_URL`, `absoluteUrl`, `DATA_LICENSE` (keep, add a real `SITE_NAME`).
- `src/lib/seo.ts`: `latestFigures`, `describeFigures` (generalise to take an outbreak).
- `src/lib/metrics.ts`: lag-aware windows (keep, per-outbreak assumptions).
- `src/lib/api.ts`: query parsing, CSV, CORS and cache headers (keep).
- `scripts/lib/toll.mjs`, `backfill.mjs`, `signals.mjs`: parsers and sanity checks (keep, parameterise).
- From `~/Documents/michikanji`: `lib/seo/site.ts` (single URL source), hand-maintained `lastmod` discipline in its sitemap, `app/about/page.tsx` (trust page and `AboutPage` JSON-LD), `lib/seo/indexnow.ts`, and the `docs/prd/` format this file follows.
