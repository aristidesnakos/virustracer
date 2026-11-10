# SEO keywords: what people type, and what each page should say

Written 2026-11-10; titles and descriptions applied the same day (see "Applied"). Update it when titles change or a harvest is re-run, and date the change.

## How this was done, and what it can and cannot tell us

- **Autocomplete, round 1:** the `keyword-family-gate` skill's step 1, Google autocomplete, 153 queries across our diseases and the general "outbreak tracker" family (`scripts/probe-keywords.mjs`, run from a GitHub runner by the manual "Probe keywords" workflow; the cloud sandbox cannot reach Google). US English, 2026-11-10, 0 errors.
- **Autocomplete, round 2 (2026-11-10, 116 queries, 0 errors):** other grammar for the families that came back thin (nursing homes: "long-term care", "care home", "SNF", "infection prevention"; bird flu and avian influenza variants) and the letter expansion (a to z) of three head terms: "ebola tracker", "measles tracker", "candida auris map". Run with `PROBE_ROUND=2` (the workflow's default input).
- **Wikipedia pageviews (2026-11-10):** daily views of the English Wikipedia articles on our topics, 12 Aug to 9 Nov 2026 (90 days), user agents only, from Wikimedia's official REST API (`scripts/probe-pageviews.mjs`, same workflow; wikimedia.org is not reachable from the sandbox). This is a proxy for public attention to a topic, **not search volume**, and not traffic we could win.
- **What autocomplete shows:** which phrasings people really type, and the order Google offers them. **It is not search volume.** A query that returns nothing may still be searched a little; one that returns ten completions is searched more than one that returns two, but we cannot say by how much.
- **Not measured: search volume, bids (CPC) and competition.** These need Google Keyword Planner in a signed-in Google Ads account in a browser. A cloud session has neither, so every volume, bid and competition figure is **not measured**. The paste-ready list at the end is for whoever has the account.
- **Not measured: Google rankings.** Competitor notes come from a general web search, not from Google's results page. They show who publishes on each topic, not who ranks first. Google Search Console (our own impressions and positions) was not read.
- **The `keywords` meta tag does not rank.** Google ignores it. The fields that matter are the `<title>`, the meta description, the H1 and other headings, and the visible copy. The `keywords` arrays are kept tidy and match the evidence, but are worth almost nothing.

## Wikipedia pageviews (attention proxy, 12 Aug to 9 Nov 2026)

| Article | 90-day views | Mean/day | Last 30 d mean | Previous 30 d mean | Peak day | Reading |
|---|---|---|---|---|---|---|
| 2026 Ebola epidemic | 162,347 | 1,804 | 1,758 | 1,543 | 3,166 (21 Oct) | Highest of our events, rising again in late October |
| Ebola | 127,449 | 1,416 | 1,493 | 1,162 | 3,177 (17 Aug) | Rising |
| Bundibugyo ebolavirus | 21,667 | 241 | 286 | 181 | 723 (17 Aug) | Rising |
| Measles | 151,842 | 1,687 | 1,457 | 1,851 | 4,299 (6 Oct) | High, easing |
| Measles resurgence in the United States | 8,989 | 100 | 106 | 96 | 728 (7 Nov) | Small; a spike in the last week |
| 2026 Pennsylvania measles outbreak | 10,628 (56 days) | 190 | 131 | 258 | 1,525 (29 Sep) | Article created in September; fading |
| 2026 Bangladesh measles outbreak | 5,021 | 56 | 31 | 51 | 667 (10 Sep) | Small and fading |
| West Nile virus | 70,535 | 784 | 425 | 779 | 1,577 (20 Aug) | Seasonal, falling steadily since August |
| West Nile fever | 19,336 | 215 | 120 | 189 | 940 (31 Aug) | Seasonal, falling |
| Candida auris | 19,661 | 218 | 190 | 245 | 838 (6 Oct) | Steady, news-driven spikes |
| MV Hondius hantavirus outbreak | 25,703 | 286 | 306 | 272 | 1,012 (19 Oct) | Steady months after the outbreak ended |
| Hantavirus | 44,663 | 496 | 448 | 550 | 840 (18 Sep) | Steady |
| Andes virus | 4,061 | 45 | 41 | 50 | 119 (16 Sep) | Small |
| Epidemic | 16,503 | 183 | 176 | 189 | 358 (21 Oct) | Steady |
| Disease outbreak | 2,037 | 23 | 20 | 25 | 38 (25 Sep) | Small |
| Nursing home | 12,349 | 137 | 131 | 141 | 188 (11 Oct) | Steady, not outbreak-driven |
| Avian influenza | 17,391 | 193 | 168 | 156 | 524 (23 Aug) | Steady |
| H5N1 | 1,268 | 14 | 12 | 15 | 26 (24 Aug) | Small (most readers use "Avian influenza") |

What it supports: Ebola is the event with the most public attention by a wide margin and it is still rising, so the Ebola page is where search wording matters most. Attention to West Nile virus is seasonal and was a quarter of its August level by November. The MV Hondius record still draws steady readers, so the archived page's title should match how people name it ("hantavirus cruise ship"). Bangladesh measles draws little attention in English. What it does not support: any statement about Google search volume or what share of it we could reach.

## Autocomplete findings by page

| Page | What people type (autocomplete, rounds 1 and 2) | Who else publishes (web search, not rankings) |
|---|---|---|
| **Ebola** | "ebola death toll" (+ today, 2026, congo, drc, uganda, total, worldwide); "ebola outbreak map" (2026, today, live, drc); "ebola cases" (today, uganda, drc, kenya, us); **"ebola tracker"** (2026, live, map, kenya, uganda, drc). Letters: "ebola case tracker", "ebola death tracker", "ebola tracker map", "ebola outbreak tracker 2026", "ebola virus tracker 2026", "ebola tracker uganda", "ebola tracker drc", "ebola tracker kenya", "ebola tracking dashboard", "ebola spread tracker", "ebola tracker who", "cdc ebola tracker", "ebola bundibugyo tracker". | WHO AFRO situation reports, major news, Wikipedia, a few aggregators. Very competitive. |
| **US measles** | "measles cases 2026" (usa, by state, map, vs 2025, cdc); "measles outbreak map"; **"measles tracker"** (pa, map, cdc, johns hopkins); "measles cases by state". Letters (24 of 26 letters answered, the richest family): "measles tracker by state", "measles tracker by county", "measles tracker by zip code", "measles tracker us", "measles tracker united states", "us measles outbreak tracker", "measles outbreak tracker map", "measles case tracker", "tracking measles cases in the united states", "live measles tracker", plus many single states (pa, texas, ohio, utah, south carolina, washington state…) and named trackers (cdc, johns hopkins, cnn, nyt, nbc, abc, yale). | CDC, Johns Hopkins tracker, news trackers (CNN, NYT, NBC, ABC). Strong incumbents. |
| **West Nile, Greece** | Only the head term: "west nile virus greece" (+ 2026, map, crete, outbreak, rhodes, 2025). "deaths", "attica", "travel", "tourists", "latest" returned nothing. | News and EODY's PDFs. No dedicated tracker found. |
| **Candida auris** | "candida auris cases" (2026, by state, texas, ohio, michigan); **"candida auris map"** (2026, us map, cdc map, spread map); "candida auris states"; "candida auris deaths". Letters (8 of 26): "candida auris us map", "candida auris states map", "candida auris spread map", "candida auris outbreak map 2026", "candida auris cdc map", "candida auris fungus state map", "candida auris global map", "candida auris world map". | News and CDC archive documents; no interactive 2026 map found. |
| **Bangladesh measles** | "bangladesh measles outbreak" (2026, deaths, latest news, status, statistics); "bangladesh measles death toll"; "bangladesh measles cases 2026". | News, Wikipedia, UN situation reports. News quotes a much larger death total (about 994 in early September, 894 of them among suspected cases) than our headline (deaths among confirmed cases, 100 to 105). |
| **Hantavirus (archived)** | "hantavirus cruise ship" (update, deaths, how many passengers, timeline, location); "hantavirus mv hondius" (timeline, map, update); "hantavirus outbreak 2026". | Wikipedia, news, at least one live-map site. |
| **Home** | "outbreak tracker" (completions are games and single diseases); "disease outbreak map"; "current outbreaks" (in the us, in the world, cdc); "disease outbreaks 2026"; "outbreaks around the world". | No authoritative all-disease tracker found: apps, aggregators, WHO Disease Outbreak News. |
| **Nursing homes** | Round 1: almost nothing ("nursing home deficiencies by state", "f880 nursing home", "nursing home flu outbreak"). Round 2 found the vocabulary people use: **"nursing home inspection reports"** (+ texas, iowa, missouri, ohio, pa, florida), "nursing home citation lookup", "nursing home violations lookup", "how to find out if a nursing home has violations", "infection control nursing home", "infection prevention skilled nursing facility", "covid 19 nursing home data", "cms covid 19 nursing home data", "nursing home influenza outbreak", "care home flu outbreak". Nothing for "snf covid cases", "skilled nursing facility outbreak", "long term care covid cases", "nursing home respiratory virus data", "nursing home covid cases by state 2026". Many "care home" and "long term care homes" completions are UK or Ontario. | Not checked. |
| **Bird flu (no page yet)** | Rich: "bird flu tracker", "bird flu outbreak map", "bird flu cases 2026", "bird flu cases us", "bird flu human cases" (2026, us, worldwide), "avian influenza tracker", "usda avian influenza tracker", "h5n1 tracker", "hpai tracker usda", "which states have bird flu". | Not checked. Recorded for a possible future page only. |

## Gate results (keyword-family-gate)

| Family | Queries answered | G1 free-attached | G3 clean paid intent (needs 50%) | Skill's decision |
|---|---|---|---|---|
| Ebola | 19 of 19 | none | 1 of 19 (5%; "ebola vaccine cost", irrelevant) | trim: informational |
| Measles US, West Nile, outbreaks around the world, Candida auris, Bangladesh measles, hantavirus | 7 to 17 each | none | 0% | trim: informational |
| Nursing-home infection data, round 1 | 4 of 12 | none | 0% | trim, thin vocabulary |
| Nursing-home vocabulary, round 2 | 12 of 20 | none | 0% | trim: informational (vocabulary now found) |
| Bird flu variants, round 2 | 16 of 18 | none | 0% | trim: informational |
| Letters: ebola tracker / measles tracker / candida auris map | 13, 24 and 8 of 26 | none | 0% | trim: informational |
| Paid idea: egg and poultry buyers (H5N1 feed) | 11 of 20 | none | 9 of 20 (45%) | trim by the rule, but closest to passing |
| Paid idea: nursing-home and post-acute infection data | 1 of 15 | none | 0 of 15 | cannot be scored on round 1; round 2 shows the searched vocabulary is "infection control/prevention" training and certification and inspection lookups, not data products |

The gates are built for commercial keywords and trim every informational term, so they say nothing about whether a page should target a phrase organically. G2 (bids) and the 7-point score need Keyword Planner: **not measured**.

## Applied (2026-11-10)

Titles must stay at 60 characters or fewer and never say "live" or "today" (our figures are daily or weekly and carry an as-of date; `tests/seo.test.ts` enforces both for every registered outbreak). Each outbreak's meta description now starts with its `searchLabel` (the phrase a searcher types) instead of the event name, followed by the numbers; the place in brackets is dropped when the label already names it, and a source that collects no deaths says "deaths not reported".

| Page | Old title | New title (chars) | Description lead | Confidence | Why |
|---|---|---|---|---|---|
| Ebola | Ebola Outbreak 2026: Death Toll, Cases & Map \| DRC & Uganda | Ebola Tracker 2026: Death Toll, Cases & Map \| DRC, Uganda (57) | "Ebola death toll: N deaths and N confirmed cases as of …" | **High** for the words; competition unmeasured and visibly heavy | "ebola tracker" and "ebola death toll" lead autocomplete with many completions; the letter expansion added tracker variants (case, death, map, uganda, drc); highest Wikipedia attention, rising |
| US measles | Measles Outbreak US 2026: Cases, Deaths & Map | US Measles Tracker 2026: Cases, Deaths & Outbreak Map (53) | "Measles tracker, United States: N deaths in the CDC's count and N confirmed cases as of …" | **High** for "measles tracker"; medium for ranking (strong incumbents) | Richest letter expansion (24 of 26); "us measles outbreak tracker", "measles outbreak tracker map". "By state" left out: the table lists only the 11 states with 100+ cases |
| West Nile, Greece | West Nile Virus Greece 2026: Cases, Deaths & Map | unchanged (48) | "West Nile virus in Greece: N deaths and N confirmed cases as of …" | **Medium** | Only the head term has completions and the title already starts with it; attention is seasonal and falling |
| Candida auris | Candida auris Cases US 2026: Tracker & Map by State | Candida auris Cases & US Map 2026: Weekly Tracker (49) | "Candida auris cases, United States: N clinical cases as of … (deaths not reported)" | **Medium-high** | "candida auris map" family: "us map", "states map", "outbreak map 2026"; "candida auris cases" round 1. "By state" removed: the table lists the 15 states with 100+ clinical cases |
| Bangladesh measles | Measles Outbreak Bangladesh 2026: Cases, Deaths & Map | Bangladesh Measles Outbreak 2026: Cases, Deaths & Map (53) | "Bangladesh measles outbreak: N deaths among confirmed cases and N confirmed cases as of …" | **Medium** (words), low (attention) | Same word order as the searches. **No "death toll"**: the description can carry only the confirmed-case deaths (100 to 105), not the ~994 total news quotes, so the title would promise a number the page does not lead with |
| Hantavirus (archived) | Hantavirus Outbreak 2026: MV Hondius Cruise Ship Cases & Deaths (63) | Hantavirus Cruise Ship Outbreak 2026: MV Hondius Cases (54) | "Hantavirus cruise ship MV Hondius: 3 deaths and 12 confirmed cases as of 2 July 2026 …" | **Medium-high** | "hantavirus cruise ship" leads its family; the MV Hondius article still draws ~300 views a day. Was over 60 characters |
| Home | Outbreak Files: Live outbreak figures, each tied to its source and kept on file. | Current Disease Outbreaks 2026 Tracker \| Outbreak Files (55) | "Current disease outbreaks, every figure sourced and dated. …" then the top three outbreaks with numbers | **Medium** | "current outbreaks", "disease outbreaks 2026", "outbreak tracker"; no authoritative incumbent seen. "Live" removed. No "map" (the home page has none) |
| Nursing homes (hub) | Nursing homes · Outbreak Files | Nursing Home Infection Data by State · Outbreak Files (53) | unchanged | **Low** | Descriptive; no phrase with evidence fits the hub better |
| Nursing homes, respiratory | COVID-19, flu and RSV in US nursing homes · Outbreak Files | Nursing Home COVID, Flu & RSV Data by State · Outbreak Files (60) | unchanged | **Low** | "covid 19 nursing home data", "nursing home flu outbreak"; the page has state and national tables |
| Nursing homes, infection control | Nursing home infection-control citations (F880) · Outbreak Files | Nursing Home Infection Control Citations (F880) · Outbreak Files (64) | unchanged | **Low-medium** | "infection control nursing home", "nursing home citation lookup", "f880 nursing home"; one page per state exists |

`keywords` arrays were rewritten to the phrases above (low value). The nursing-home and Candida auris pages still say their sources report no deaths: the C. auris description now says so, and the nursing-home descriptions and copy were not changed.

## On-page wording (applied 2026-11-10; no layout change)

Same panels, same order, same cards; only words changed, plus one sentence and one line of links per outbreak page.

- **Home:** the line under "Outbreak Files" now reads "Current disease outbreaks in 2026, with death tolls, cases and maps, each figure tied to its source and kept on file." (`HOME_INTRO`; `SITE_TAGLINE` is unchanged everywhere else), and the section heading is "Current disease outbreaks we track" (was "Outbreaks we are tracking").
- **Panel headings** (`headings` on each definition; each falls back to the generic heading):

| Outbreak | Figures (screen-reader heading) | Map (Fig. 1) | Table 1 |
|---|---|---|---|
| Ebola | Ebola death toll and confirmed cases | Ebola outbreak map | Ebola cases by country and province |
| US measles | US measles cases and deaths | US measles outbreak map | US measles cases by state (states with 100+ cases) |
| West Nile, Greece | West Nile virus cases and deaths in Greece | West Nile virus map of Greece | West Nile virus cases in Greece |
| Candida auris | Candida auris cases in the US | Candida auris US map | Candida auris cases by state (states with 100+ clinical cases) |
| Bangladesh measles | Bangladesh measles cases and deaths | Bangladesh measles outbreak map | Bangladesh measles cases, national total |
| Hantavirus | Hantavirus cruise ship outbreak: cases and deaths | MV Hondius route and hantavirus cases | Hantavirus cases by country |

  This also corrected a wrong heading: the US measles and Candida auris tables were titled "By country & province" although their sub-rows are states.
- **Answer sentence** under the headline figures (`answerTemplate`, filled by `answerSentence` in `src/lib/seo.ts` from the same latest figures as the description, so it cannot go stale; left out if a figure is missing). E.g. "As of 10 November 2026, the 2026 Ebola outbreak in DR Congo and Uganda had 5,327 deaths and 10,951 confirmed cases." The Candida auris one ends "the table does not report deaths"; the Bangladesh one says "deaths among confirmed cases".
- **"Other outbreaks we track"**: one line of plain links above each outbreak page's footer, so every page links to every other.
- **Structured data:** a `BreadcrumbList` (Outbreak Files › outbreak title) on each outbreak page; the WebPage already carries `dateModified`.
- `tests/seo-pages.test.tsx` checks every outbreak's sentence renders from current data with no placeholder left, that "by state" headings carry the 100+ threshold, that no heading says "live" or "today", and the links and breadcrumb.

Still suggestions, not applied: name Attica (and Crete, Rhodes) in the West Nile copy if the region data supports it; a one-line note on the infection-control pages that F880 citations are one tag of an inspection report, with the Care Compare link for the rest; "measles tracker by county / zip code" has demand we cannot serve (the CDC publishes by jurisdiction). Do not expect an FAQ rich result: Google limits those to authoritative government and health sites.

## Still not measured, and how to fill the gap

- **Search volume, bids and competition:** open Google Keyword Planner (Tools → Keyword Planner → "Get search volume and forecasts"), paste the list below, set location United States (and Greece for the West Nile terms), language English, last 12 months, download the CSV, and paste it into a session. It will fill the volume, bid and competition columns and the skill's 7-point score.
- **Rankings and our own impressions:** Google Search Console → Performance → Queries and Pages, last 3 months. Compare before changing a title that already earns clicks; recheck 4 to 6 weeks after this change.
- **Non-US phrasing:** autocomplete was US English only; Greek terms for West Nile were not probed.

## Paste-ready terms for Google Keyword Planner

ebola death toll · ebola death toll today · ebola tracker · ebola outbreak tracker · ebola case tracker · ebola death tracker · ebola tracker map · ebola outbreak map · ebola cases · ebola outbreak 2026 · ebola tracker uganda · ebola tracker drc · bundibugyo ebola · measles tracker · us measles tracker · measles tracker by state · measles outbreak tracker map · measles cases 2026 · measles cases by state · measles outbreak map · measles cases this year · us measles cases · west nile virus greece · west nile virus greece 2026 · west nile virus greece map · west nile virus europe · candida auris cases · candida auris map · candida auris us map · candida auris states map · candida auris outbreak map · candida auris cases by state · candida auris states · candida auris deaths · bangladesh measles outbreak · bangladesh measles deaths · bangladesh measles death toll · hantavirus cruise ship · hantavirus outbreak 2026 · mv hondius hantavirus · outbreak tracker · disease outbreak map · current outbreaks · disease outbreaks 2026 · outbreaks around the world · nursing home inspection reports · nursing home citation lookup · nursing home violations lookup · infection control nursing home · covid 19 nursing home data · nursing home flu outbreak · f880 nursing home · nursing home deficiencies by state · bird flu tracker · bird flu outbreak map · h5n1 tracker

## Re-running the harvest

Actions tab → "Probe keywords" → Run workflow (input "round": 1 for the first harvest, 2 for the second), then read the log. It runs the pageview probe first (`PAGEVIEW_ARTICLES` overrides the article list, `|`-separated), then autocomplete. Edit `FAMILIES` in `scripts/probe-keywords.mjs` to probe other terms; keep it to a few hundred requests, 0.7 s apart, and stop if Google refuses.
