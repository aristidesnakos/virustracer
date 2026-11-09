# Roadmap

Written 2026-11-08, at the end of the round that added the C. auris tracker, the nursing-home layer and the feed-pipeline fixes. The hand-off for whoever resumes is `docs/status-and-next-steps.md` (read its "Update 2026-11-08" section first); the long-range site plan is `docs/multi-outbreak-plan.md`; what public data exists, and how fresh it was, is `docs/public-data-sources.md`. Update this file when a milestone lands or a decision is made, and date the change.

## Where we stand (2026-11-08)

**Tracked and live** (figures from each `toll.json` on `main`)

| What | Latest stored figure | Source and cadence |
|---|---|---|
| Ebola, Bundibugyo 2026 | 10,445 confirmed, 5,376 deaths, **2 Nov** | Wikipedia infobox, daily. **Frozen since 2 Nov**, see "Now" |
| Measles, Bangladesh 2026 | 24,219 confirmed, 105 deaths, 6 Nov | Wikipedia infobox, daily |
| Measles, United States 2026 | 5,182 confirmed, 4 deaths (CDC page), 5 Nov | CDC page and two data files, weekly. The data file lists 7 deaths on 2026-11-06 |
| Candida auris, United States 2026 | 6,572 clinical cases, week 43 (to 31 Oct); 7,202 screening; no deaths collected | CDC NNDSS table, weekly. Weeks 17 and 18 are missing: the cumulative count fell and the reader refuses a fall |
| West Nile virus, Greece 2026 | 462 cases, 53 deaths, 5 Nov | EODY weekly PDF, read only by the Mac launchd job (EODY blocks GitHub) |
| Hantavirus, MV Hondius 2026 | archived record | hand-curated |
| Nursing homes (not outbreaks) | respiratory rates to the week ending 1 Nov; counts dataset only to 29 Mar; 24,413 F880 citations at 12,011 homes (CMS release 1 Oct, published 28 Oct) | CDC dashboard file, CDC open dataset, CMS Health Deficiencies. CMS expects the next release on 2 Dec |

**Pipeline.** The twice-daily GitHub workflow runs and saves data again: runs 210–213 succeeded (about 3 to 6 minutes each) after 12 of 14 earlier runs were cancelled at the old 10-minute limit before they could commit. The job limit is 22 minutes, the feed step has its own 12-minute limit and turns the run red if it fails, and the archive step is capped at 5 minutes. GitHub's runners do reach `data.cdc.gov`, `www.cdc.gov` and `data.cms.gov`. The empty-answer problem in the news step (about 23% of model calls) was traced to providers that reason by default and use up the small token budget; the fix (reasoning off, larger budget, named failure causes, repair of stored raw summaries) and the article-text sources (WHO Disease Outbreak News, CIDRAP, ECDC, Daily Star, Greek Reporter) are on `main` but **have not yet run in production**. The first scheduled run with them is 20:00 UTC on 2026-11-08.

## Now (next few days)

1. **Read the 20:00 UTC run on 8 Nov.** Expect near-zero failed model calls in the feed step's per-outbreak summary lines, fallback summaries repaired (at most 20 per outbreak per run), WHO Disease Outbreak News items no longer collapsing into duplicates, and a data commit on `main`. If it regressed, fix it on `main`.
2. **Ebola is stuck.** On 6 Nov Wikipedia's infobox showed 5,234 deaths against our stored 5,376, so the sanity check (deaths never decrease) refused the update, and `lastChecked` has stayed at 2 Nov. A person has to decide whether the stored figure or Wikipedia is right, and how to un-stick it (correct the stored snapshot by hand, or wait for Wikipedia to move past it).
3. **US measles deaths.** The CDC page shows 4, its data file 7 (3 against 5 a week earlier). The headline follows the page; the open decision from the hand-off doc stands and the gap is widening.
4. **Hand-copied tables go stale.** The region tables and map markers for US measles (11 states) and C. auris (15 states, week 43) are copied by hand and dated per row. Refresh weekly or accept the dates.
5. **Tidy up.** Remote branches already merged into `main` can be deleted (the sandbox cannot do it; use the GitHub branches page); the last finished build session can go after its 20:50 UTC check of the 20:00 run.

## Next (weeks)

- **Per-facility risk view for post-acute networks.** Join F880 citations (named homes) with state-level C. auris and respiratory activity, and hospital C. diff where relevant. Test demand first, the way `/commercial-data` does for H5N1, before building. Buyer and pricing notes belong in Ari's private ledger, not in this public repo.
- **F880 release on 2 Dec.** Check that the reader picks it up, the release index grows and the per-state files switch cleanly.
- **NHSN counts.** The open dataset has not moved since August; re-check monthly for a fresher official file. The dashboard rates file is current and carries the page meanwhile.
- **Verify the Care Compare link form** from a machine that can reach medicare.gov (the sandbox cannot).
- **Internet Archive backlog.** On 2026-11-09 the archive step stopped trying the 41 data.cdc.gov query links for C. auris (they timed out and used up the 5-minute step) and now stops itself after 3 minutes so the ledger is saved; the older ledger entries for them stay, unattempted. The ledger still held about 630 pending links (mostly Google News headlines that cannot be resolved to an article) and 65 failed; the Internet Archive returns 429 after a handful of saves per run, so the backlog drains slowly. Worth a look at the order or the cap.
- **C. auris gaps.** Revisit weeks 17 and 18 if CDC revises its counts; consider whether the reader should accept a small fall in a provisional cumulative count.
- **Phase 5, the track record (`/archive`, past outbreaks, disease hubs)** and **H5N1 as the next outbreak** are still open from the hand-off doc and compete with the items above. The order is Ari's call.
- **Security list** in the hand-off doc (headers, untrusted feed text, Actions pinning, cost guards) is unchanged and still open; the new article-text sources add more untrusted text to the same pipeline, so the "untrusted text" item matters more now.

## Later (ideas, not decided)

- **Other countries.** Leads only, none verified (details in `docs/public-data-sources.md`): UK (UKHSA trust-level C. difficile, MRSA and bacteraemia counts; weekly norovirus report), EU (ECDC point-prevalence surveys in long-term care, C. auris survey), Canada (provincial long-term-care outbreak announcements that name the facility; Ontario open data). Decide first how a country becomes a filter: check what `/api/v1/outbreaks` and the home grouping support today, and keep one vocabulary across the research note, the registry and the API (country, setting, level, pathogen, cadence, freshness).
- **More notifiable conditions from the NNDSS table** that matter in care settings. The same reader covers the whole table; which conditions are in it and worth tracking has not been checked.
- **Antibiotic use in nursing homes** is not published at any level, so the antimicrobial-resistance story can only be told through C. auris, citations and hospital-level figures. Say so wherever it comes up.

## Decisions waiting on Ari

- Order of work: per-facility view, Phase 5, or H5N1.
- Ebola: which figure stands, and how to release the freeze.
- Headline deaths for US measles: CDC page or its data file.
- Keep or remove the two manual diagnostic workflows ("Diagnose feed model" reads the OpenRouter secret when started by hand; "Probe feed sources" needs no key).

## Working agreements from this round

- Cloud sessions cannot start workflows (403), delete branches or delete sessions; Ari clicks "Run workflow", deletes branches in GitHub and deletes sessions in the app.
- The cloud sandbox cannot reach news sites or openrouter.ai, and the OpenRouter key exists only as a GitHub Actions secret. Live experiments go in a workflow that uses that secret; do not add a second key.
- Child sessions push to their own branch and the parent merges. Check `git fetch` before trusting a branch's state: one session also merged to `main` itself on Ari's request.
- Keep tests data-driven. A test that hard-coded the US measles total broke on the next weekly update.
- A push to `main` deploys; ask first unless Ari has just said to push.
