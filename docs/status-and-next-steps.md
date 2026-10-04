# Status and next steps

Written 2026-10-03, after Phase 4 landed on `main` (3b318d6, deployed); updated 2026-10-04 after the repo cleanup and the alerts widget launch (da28422). Read this first when resuming. Architecture lives in `CLAUDE.md`; the long-range plan and its reasoning in `docs/multi-outbreak-plan.md` (sections 2, 4, 6, 8).

## Where we stand

**Site:** Outbreak Files, https://outbreakfiles.com. Next.js 16 App Router, data committed to the repo by a twice-daily GitHub Action (08:00 and 20:00 UTC), Vercel deploys on every push to `main`.

**Three outbreaks are live**

| Slug | Status | Source | Notes |
|---|---|---|---|
| `ebola-bundibugyo-2026` | active | Wikipedia infobox, daily | Rt shown (serial interval from West Africa 2014). Default outbreak: the un-prefixed `/api/v1/*` aliases serve it and must never be removed. |
| `measles-bangladesh-2026` | active | Wikipedia infobox, daily | Rt and delay-adjusted fatality are **not** reported (no verified serial-interval SD). Headline Deaths = deaths among confirmed cases (`summary.deathsQualifier`); the 909 further deaths among suspected cases are stated beside it. |
| `hantavirus-mv-hondius-2026` | over | hand-curated | Archived record, no `toll.json`, frozen `live.json`. |

**Phases (from the plan)**

| Phase | State |
|---|---|
| 0. Decisions | Done: brand Outbreak Files, licence CC BY-SA 4.0, ranking rule, `/about` names Ari Nakos. Audience, editorial capacity and regional scope still open (plan section 8). |
| 1. Registry refactor | Done |
| 2. Route move and per-outbreak API | Done |
| 3. Snapshot home, `/methodology`, `/about` | Done |
| 4. Second outbreak | **Done** (measles automated; hantavirus archived) |
| 5. Track record (`/archive`, past outbreaks, disease hubs) | Not started |
| 6. Regions, alerts, news | Alerts demand test live (one email field, 2026-10-04); real alerts, regions and news not started |

**What Phase 4 changed**
- `OutbreakDefinition.metrics` (`PathogenAssumptions`) is required; `computeMetrics(points, outbreak.metrics)` has no default. A value with no verified source is `null` and that indicator is left out. `/data` lists every outbreak's assumptions. The API's flat `assumptions` field names are unchanged.
- Script registry (`scripts/lib/outbreak-registry.mjs`): `toll.ignoreFields` blanks a field a source uses differently (measles `recovered`, which is hospital discharges). `parseDeaths` in `scripts/lib/toll.mjs` takes the confirmed-case figure from a multi-figure deaths field and reads the old `N (M suspected cases)` form.
- `summary.deathsQualifier` prints "among confirmed cases" after Deaths on the stat strip, home card, meta descriptions and share card.
- First `data/raw/infobox/` files are now tracked (53, measles only; see "Loose ends").

**Checks at the last push (2026-10-04):** `tsc` clean, 354 unit tests pass, lint has one old warning (`tests/StatStrip.test.tsx:67`). Playwright is not installed (about 150 MB; ask first). Do not run `next build` (disk was at 4.4 to 7.5 GiB free).

## Known problems to fix first

1. **Measles source is stale.** The Wikipedia infobox had not changed since 2026-09-10 (19,933 confirmed, 100 confirmed deaths). News citing DGHS reported about 21,600 confirmed and 1,114 deaths in all on 3 Oct. The home card shows "not enough data" for a trend (one reading in 14 days), and the tracker lags the official count. Options: wait for Wikipedia edits; or add a second, direct source (DGHS press bulletins, no feed found yet) as a new adapter kind. Needs a decision before another automated outbreak is added on the same pattern.
2. **Gap in the measles series.** No snapshots between 2026-04-22 and 2026-05-11 (confirmed 826 to 6,937). The chart will jump there. The cause was not investigated (the article may simply have had no infobox counts then, or those revisions failed to parse); the backfill log says which. Check whether a curated milestone row (with a source) should bridge it.
3. **Wikipedia mislabels measles fatality.** "5.06% (confirmed cases)" is 1,009 / 19,933. Ours shows about 0.5% (100 / 19,933). Add a note on `/methodology`.
4. **Unverified hotspots.** The 30 early-April map dots for measles are copied from the infobox map and not confirmed against the Ministry of Health. Verify or drop.
5. **Vaccination tile** uses the UN ICCG figure of 18.4M (25 Jun). Al Jazeera cites 19.75M for mid-September; update only from an official source.
6. **Measles Rt:** to add it, source a serial interval with mean AND SD for measles (Vink et al. 2014 gives mean 11.7 days; SD not verified). Also consider that growth in lab-confirmed counts tracks testing capacity, not transmission.
7. **Ebola raw archive:** `data/outbreaks/ebola-bundibugyo-2026/toll.json` has no `rawPath` on `main`, although `CLAUDE.md` describes the archive. Run `node scripts/backfill-raw.mjs --outbreak=ebola-bundibugyo-2026` (writes `data/raw/`, small) and commit, or find out why it never landed.

## Loose ends

- Cleaned up 2026-10-04: one checkout only (`~/Documents/virustracer`, on `main`, level with `origin/main`). The `virustracer-brand` and `virustracer-phase4` worktrees and every stale local branch are gone. `feature/alerts-widget` is merged; its remote branch, `origin/design/journal-redesign` (superseded) and `origin/copilot/use-map-libre-or-leaflet` (already merged) can be deleted on GitHub.
- `.claude/dev-feedback.json` is tracked and shows as modified whenever the dev feedback widget is used; `.claude/dev-feedback/` (screenshots) is ignored. The repo is public.
- The measles page, card and map were checked only by Vitest render tests, not visually. Open `/` and `/outbreaks/measles-bangladesh-2026` once and look: map with no bubbles, stat strip with "Children vaccinated", chart gap, empty trend panel, the longer "Deaths among confirmed cases" label on the card.

## Next: Phase 5, the track record

Goal: a visible archive that shows the site keeps records after an outbreak ends, which is the product's differentiator.

1. `/archive` page listing finished outbreaks (status `over`) with final figures, dates, duration, and source links. Hantavirus is the first entry.
2. Backfill two or three past outbreaks from Wikipedia infoboxes using `scripts/backfill-toll.mjs` (it already takes the last revision per UTC day and keeps the longest never-decreasing chain). Candidates need an `{{Infobox outbreak}}` with confirmed cases and deaths; check the history for format changes first, as measles needed (see `parseDeaths`). Add each as a registry entry with `status: "over"`; add `toll.ignoreFields` where a field means something else.
3. Disease hubs (`/diseases/<disease>`) only where two or more outbreaks exist (Ebola could qualify once a past Ebola outbreak is added).
4. Optional dated situation notes, only if someone will write them (open question 5 in the plan).
5. Update `sitemap.ts`, home grouping ("Declared over" already exists), `/methodology` and tests as outbreaks are added. Adding an outbreak = definition file in `src/data/outbreaks/`, line in `index.ts`, matching entry in `scripts/lib/outbreak-registry.mjs`; `tests/outbreak-registry.test.ts` fails if the two drift.

## Questions waiting on Ari

- Measles source: keep the Wikipedia infobox and accept the lag, or build a direct DGHS adapter?
- Phase 5 order: backfill past outbreaks first, or `/archive` page first with hantavirus alone?
- Plan section 8 items still open: audience, editorial capacity (notes or numbers only), regional scope (cholera in one country, dengue in a region?).
- Alerts: the "Get alerts" widget is live on every page (2026-10-04): one email field, sign-ups emailed via Resend from `alerts@mail.outbreakfiles.com` (the verified Resend domain is the `mail.` subdomain, not the apex). Compare `[alert-interest] open` with `[alert-interest] submit page=...` in the Vercel logs before building real alerts.
- Licence: CC BY-SA 4.0 is set, but WHO data is CC BY-NC-SA, so do not scrape WHO tables into the API without checking that against the sponsor card (`SponsorCard.tsx`).

## Rules that bit us (keep following)

- **Every push to `main` deploys.** Ask each time unless Ari has just said to push.
- **Another session commits into the main checkout and rewrote a branch while we worked.** Always `git fetch` and look before merging, resetting or rebasing. Run `git diff --cached` before every commit; staging a file can sweep in someone else's uncommitted work. Work on a branch in this one checkout; Ari does not want sibling `virustracer-*` worktree folders.
- Rates come from `computeMetrics(toll.snapshots, outbreak.metrics)`, never the merged timeline. Windows end on the last day the total moved (at most 3 days back). Use `status: "insufficient_data"` rather than guessing.
- Never add a number without a verified source. When a source is missing, set the field to `null` and leave the indicator out.
- The ranking rule lives in both `compareSnapshots` (`src/lib/home-snapshot.ts`) and `/methodology#ranking`. Change both, and ask Ari first. Sanity-check numbers live in `src/lib/methodology.ts`; `tests/site-pages.test.tsx` fails on drift.
- Next.js 16: read `node_modules/next/dist/docs` before route or metadata code. `params` is a Promise. Every page sets its own canonical and repeats `siteName`/`type` in `openGraph`.
- Automation never edits `src/data/outbreaks/*.ts`. Only `data/` is bot-written.
- macOS `sed` is BSD: use python for in-place edits. Use `fireEvent`, not `user-event`, in tests.
- Dev server: `preview_start {name: "dev"}` (port 3000).

## Commands to resume

```bash
cd /Users/ari/Documents/virustracer
git fetch origin && git status -sb && git log --oneline HEAD..origin/main
git checkout main && git merge --ff-only origin/main
npx tsc --noEmit && npm test && npm run lint
```
