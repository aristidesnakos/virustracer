# Public data sources: what is actually published

A living research note. It records which public health datasets we checked, what they really
contain, how fresh they were and whether we built on them, so a later session (or person) can
pick up without redoing the search. **Revise it whenever a source is re-checked, ruled out or
built on**, and change the "Last checked" date of the entry you touched.

How to read an entry:

- **Status** — `Verified` (we opened the data itself), `Reported` (seen only in documentation,
  catalog listings or news; not opened), `Not public` (the data exists but is not released at
  that level).
- **Level** — `facility` (one row per named facility), `state`/`region`, `national`.
- **Built** — what on the site uses it, if anything.

The filters we expect to use when this grows: **country**, **setting** (nursing home, hospital,
community), **level** (facility, state, national), **pathogen**, **cadence** and **freshness**.
Keep new entries in that shape so they can be compared side by side.

## Context

First compiled 2026-11-06. Ari asked whether we could track the *small* outbreaks (nursing
homes and similar settings) as an early indicator and as added value for the API, prompted by a
LinkedIn post about antimicrobial resistance and stewardship in nursing homes. Short answer
found: **US federal sources do not publish nursing-home outbreaks per facility.** Infection data
for nursing homes is public only as state totals; what is public per facility is inspection
citations. Around that gap, three useful datasets exist (C. auris weekly by state, nursing-home
respiratory infections weekly by state, F880 citations per facility), and all three were built.

## United States

### Summary

| Source | Host / id | Level | Cadence | Status | Built |
|---|---|---|---|---|---|
| CDC NNDSS weekly tables (C. auris clinical and screening) | `data.cdc.gov` `x9gk-5huc` | state, region, national | weekly | Verified 2026-11-06 | `candida-auris-us-2026` |
| CDC NHSN nursing-home respiratory pathogens, counts (COVID-19, flu, RSV) | `data.cdc.gov` `tscn-ryh9` | state, region, national | weekly in name; stale (to 2026-03-29) | Verified 2026-11-06 | `/nursing-homes/respiratory` |
| CDC NHSN nursing-home dashboard data file, rates only | `www.cdc.gov` `/nhsn/modules/case-rates-covid-flu-rsv.json` | state, national | weekly (Thursdays) | Verified 2026-11-06 | `/nursing-homes/respiratory` |
| CMS Health Deficiencies (F880 infection control) | `data.cms.gov` `r5ix-sfxw` | **facility (named, CCN)** | about monthly | Verified 2026-11-06 | `/nursing-homes/infection-control` |
| CMS Healthcare Associated Infections – Hospital | `data.cms.gov` `77hc-ibv8` | facility (hospital) | about quarterly, months behind | Reported | no |
| CMS COVID-19 Nursing Home Data | `data.cms.gov` | facility (CCN) | weekly (historically) | Reported; 2026 status unknown | no |
| CDC AR & Patient Safety Portal (NHSN antimicrobial use and resistance) | `arpsp.cdc.gov` | state, region, national | yearly | Reported | no |
| Nursing-home antibiotic use | — | — | — | Not public | no |
| CDC NORS outbreak line list (norovirus etc., includes setting) | BEAM dashboard / `data.cdc.gov` | outbreak | yearly, years behind | Reported | no |
| CDC NoroSTAT | `www.cdc.gov` | aggregate of participating states | monthly | Reported | no |
| State facility outbreak lists | state health departments | facility (some) | varies | Reported | no |

### CDC NNDSS weekly tables — Candida auris

- **Last checked:** 2026-11-06. **Status:** Verified. **Built:** `candida-auris-us-2026`
  (adapter in `scripts/lib/outbreak-registry.mjs`, parser and cross-checks in `scripts/lib/`).
- **Where:** Socrata dataset "NNDSS Weekly Data", `https://data.cdc.gov/resource/x9gk-5huc.json`.
  Labels `"Candida auris, clinical"` and `"Candida auris, screening"`.
- **Columns:** `states, year, week, label, m1..m4` (+ `_flag`), `location1/2, sort_order, geocode`.
  `m1` current week, `m2` max of the previous 52 weeks, `m3` running total this year, `m4` running
  total last year (confirmed from the dataset's column descriptions and CDC's NNDSS Reader's Guide).
- **Level:** 70 reporting areas: states, nine regions, "U.S. Residents" (excludes territories),
  "U.S. Territories", non-U.S. residents and "Total". State rows carry a `geocode` point (the
  state capital).
- **Behaviour:** past weeks are kept as first published; running totals can go *down* when states
  correct their data (2026 weeks 17 and 18 fell below week 16, so the reader refused them for
  manual review). Weekly counts do not add up to the running total, because late reports land
  only in the total. California reports clinical cases but no screening; New York State and New
  York City show "-" (nothing sent to CDC), which does not mean zero.
- **Cross-checks that hold every 2026 week:** each area appears once; states sum to their region,
  regions to "U.S. Residents", territories to "U.S. Territories", and residents + territories +
  non-residents to "Total" (for `m1`, `m3`, `m4`).
- **Figures at last check:** week 43 of 2026 (to 31 Oct): 6,572 clinical cases among U.S.
  residents, against 5,733 by the same week of 2025; 7,202 screening cases.
- **Caution:** news coverage (Becker's, July 2026) quoted 3,302 clinical cases through 18 July,
  "below 2025". That does not match CDC's table. Use only the CDC table.
- **Reuse:** the same table covers every nationally notifiable condition, so other diseases can
  be read with the same reader. Not yet checked which conditions are useful for healthcare
  settings (for example carbapenemase-producing CRE).

### CDC NHSN nursing-home respiratory pathogens

- **Last checked:** 2026-11-06. **Status:** Verified. **Built:** `/nursing-homes/respiratory`
  and `/api/v1/nursing-homes/respiratory` (reader `scripts/update-nursing-homes.mjs`).
- **Where:** Socrata "Weekly Respiratory Pathogens and Vaccination (RPV) Metrics for Nursing Home
  Residents by Jurisdiction", `https://data.cdc.gov/resource/tscn-ryh9.json`. Human-facing
  dashboard: `https://www.cdc.gov/nhsn/ltc/ltc-report-overview.html` (about 15,000 nursing homes,
  "updated weekly on Thursdays").
- **Level:** state and national only. CDC shows facility-level data only to the facility itself
  and NHSN group users (CDC's 2025 annual-update slides on the RPV dashboard). **There is no public
  per-facility respiratory file from CDC.**
- **Columns:** `jurisdiction, survweekend, numres, faccount`, and per pathogen (COVID-19, flu,
  RSV): resident vaccination, new positive tests, hospitalisations, plus percentage vaccinated.
- **Rules:** flu and RSV reporting became required on 2025-01-01; earlier weeks follow different
  definitions.
- **Freshness problem:** on 2026-11-06 the dataset's latest week was **2026-03-29** (rows updated
  2026-08-24), while the dashboard page said "Updated November 5, 2026". No fresher dataset exists
  on data.cdc.gov.
- **Fresher source found:** the dashboard's own data file,
  `https://www.cdc.gov/nhsn/modules/case-rates-covid-flu-rsv.json`, ran to the week ending
  2026-11-01 and is updated on Thursdays. It has **rates per 100,000 residents only** (no counts,
  no facility numbers), and its rates are close to but not equal to rates computed from the
  dataset's counts, so the site keeps the two sources apart, labels each and never checks one
  against the other. At last check: COVID-19 210.1, influenza 43.6, RSV 2.6 new cases per 100,000
  residents (week ending 2026-11-01). The file repeats each rate up to three times; every copy
  agrees.
- **Cross-checks that hold (counts dataset):** in all 78 weeks the states add up exactly to the
  national row for every count column, and so do the 10 HHS regions; subsets never exceed totals;
  CDC's percentages equal numerator ÷ `numres`, which confirms `numres` (residents) as the
  denominator; weeks end on Sundays.
- **Data caveats:** the dataset's last two weeks are thin (6,743 reporting homes against about
  12,600 usually), so the newest full week is 2026-03-15; weeks under 90% of the usual count are
  flagged. Flu and RSV start with the week ending 2025-01-12. CDC marks 13 weeks
  (October–December 2025) "Dotted" without saying why; the site keeps it as `marked`.

### CMS Health Deficiencies — F880 infection prevention and control

- **Last checked:** 2026-11-06. **Status:** Verified. **Built:** `/nursing-homes/infection-control`
  (with one page per state and a searchable list of cited homes) and
  `/api/v1/nursing-homes/infection-control-citations` (reader `scripts/update-nursing-homes.mjs`).
- **Where:** CMS Provider Data Catalog, dataset `r5ix-sfxw`. Metadata:
  `https://data.cms.gov/provider-data/api/1/metastore/schemas/dataset/items/r5ix-sfxw`. Query:
  `https://data.cms.gov/provider-data/api/1/datastore/query/r5ix-sfxw/0` with a condition on
  `deficiency_tag_number = 0880`.
- **Level:** one row per citation, per named nursing home (CMS Certification Number, name,
  address).
- **Fields:** `cms_certification_number_ccn, provider_name, provider_address, citytown, state,
  zip_code, survey_date, survey_type, deficiency_category, deficiency_tag_number,
  deficiency_description, scope_severity_code, deficiency_corrected, correction_date,
  inspection_cycle, standard_deficiency, complaint_deficiency,
  infection_control_inspection_deficiency, citation_under_idr, citation_under_iidr,
  processing_date`.
- **Figures at last check:** 24,413 F880 citations at 12,011 homes in 53 states (all inspection
  cycles in the file; processed 2026-10-01, released 2026-10-28). Surveys in the last 12 months
  (2025-10-02 to 2026-10-01): 5,884 citations at 5,241 homes, 0.8% (49) at actual harm or worse
  (severity G–L). CMS expected the next release on 2026-12-02.
- **Behaviour:** holds roughly the last three inspection cycles, not a full history, so history
  only builds up if we keep each release. The site stores compact per-state files for the latest
  release and a gzipped, write-once raw copy of each release (about 0.7 MB each) in
  `data/raw/nursing-homes/`.
- **Cross-checks:** rows received equal the count the API reports; every row has tag 0880 and the
  release's processing date, valid codes, no duplicates; the release must not change while being
  read.
- **Care Compare links:** the site links each home as
  `https://www.medicare.gov/care-compare/details/nursing-home/<CCN>?state=<ST>`. medicare.gov is
  blocked from the cloud sandbox, so the link form is unverified.
- **Wording rule:** a citation is an inspection finding, may have been corrected and can be
  disputed. Never call it an outbreak.
- **Access note:** once, a Python `urllib` request with a custom user agent got HTTP 403 while
  `curl` worked. It could not be reproduced later the same day (Python and Node both got 200).

### CMS Healthcare Associated Infections – Hospital

- **Last checked:** 2026-11-06. **Status:** Reported (catalog listing only). **Built:** no.
- Dataset `77hc-ibv8` on data.cms.gov. Per hospital: CLABSI, CAUTI, surgical site infections,
  MRSA bacteraemia and C. difficile, as standardised infection ratios. Catalog modified
  2026-07-22. Reporting periods lag by months. **Lead:** a per-hospital C. diff signal, relevant
  to post-acute networks.

### CMS COVID-19 Nursing Home Data

- **Last checked:** 2026-11-06. **Status:** Reported; not opened. **Built:** no.
- Historically weekly, per facility, keyed by Federal Provider Number (CCN). A Connecticut mirror
  on data.ct.gov shows COVID-19 columns only. **Lead:** check whether CMS still updates it in 2026
  and whether it now carries flu and RSV. If so, it would be the only public per-facility
  respiratory source.

### Antimicrobial use and resistance

- **Last checked:** 2026-11-06. **Status:** Reported. **Built:** no.
- Hospitals report antimicrobial use and resistance to NHSN (a Promoting Interoperability
  measure since 2024). CDC publishes it on the AR & Patient Safety Portal
  (`https://arpsp.cdc.gov`) as national, regional and state figures (standardised antimicrobial
  administration ratios, resistance by pathogen), roughly yearly. Facility-level figures are not
  public.
- **Nursing-home antibiotic use is not published at any level.** So the antimicrobial-resistance
  story cannot be tracked per facility from public data.

### Norovirus and enteric outbreaks

- **Last checked:** 2026-11-06. **Status:** Reported. **Built:** no.
- **NORS:** line list of reported outbreaks, including setting (long-term care is the most common
  norovirus setting). Since July 2024 on CDC's BEAM dashboard and data.cdc.gov; public data then
  ran only to 2022. Too late for tracking.
- **NoroSTAT:** suspected and confirmed norovirus outbreaks from participating states, updated
  monthly. 2025–26 season (1 Aug 2025 – 31 Jul 2026): 1,392 outbreaks. No 2026–27 figures at the
  time of checking.

### State and local outbreak lists

- **Last checked:** 2026-11-06. **Status:** Reported. **Built:** no.
- Patchy and not national. Found: New Jersey's LTC facility outbreak list (names facilities, COVID
  only, active outbreaks only; latest copy found dated 2026-03-24); Texas annual HAI outbreak
  report (long-term care outbreaks by month and pathogen); Nevada outbreak report index (entries
  2014–2017); New York's 2019 list of facilities that treated C. auris patients; weekly
  respiratory reports (New Jersey, New York, Maryland, Nebraska, Kitsap County WA) that count
  long-term care outbreaks without naming facilities.

### Network notes (cloud sessions)

- `www.cdc.gov` was allowed from the start. `data.cdc.gov` and `data.cms.gov` were added on
  2026-11-06 in the personal cloud environment "virustracer". `stacks.cdc.gov`,
  `catalog.data.gov`, `wonder.cdc.gov` and `www.medicare.gov` were still blocked from the sandbox.
- Whether GitHub's Actions runners can reach `data.cdc.gov` and `data.cms.gov` was unconfirmed at
  the time of writing. EODY (Greece) refuses them; CDC might too. Readers log a warning and exit 0
  if refused.

## News feeds (article text for the outbreak feeds)

**Last checked:** 2026-11-08, from a GitHub Actions runner (`scripts/probe-feeds.mjs`, workflow
"Probe feed sources", run 42487722439; re-run it with workflow_dispatch before adding a source).
**Why:** Google News RSS descriptions are only "<headline> <publisher>" (45 of 50 sampled items),
and 45 of 50 Google News links stay on news.google.com when fetched (hidden redirect, no 403), so
the model was summarising headlines. These sources carry real text. Format: status, text per
item, items matching each outbreak's keyword filter in the feed at the time.

| Source | URL | Result | Built |
|---|---|---|---|
| WHO Disease Outbreak News API | `https://www.who.int/api/news/diseaseoutbreaknews` (JSON, OData; fields include Summary, Overview, Epidemiology, Assessment, Advice, UrlName, PublicationDateAndTime) | Verified: 200, full reports (avg 7,654 chars), 15 Ebola, 1 Bangladesh measles, 1 US measles of the newest 30 | Ebola, Bangladesh measles (`format: "who-don-api"`) |
| CIDRAP all news | `https://www.cidrap.umn.edu/news/all/rss` | Verified: 200, one-sentence lead per item (~113 chars), never headline-only; 20 items (~2 days) | Ebola, C. auris |
| CIDRAP measles topic | `https://www.cidrap.umn.edu/news/78/rss` | Verified: 200, 12 of 20 items US measles | US measles |
| ECDC Communicable Disease Threats | `https://www.ecdc.europa.eu/en/taxonomy/term/1310/feed` | Verified: 200, ~200 chars per item, Ebola multi-country item | Ebola, West Nile (seasonal WNV updates) |
| ECDC news | `https://www.ecdc.europa.eu/en/taxonomy/term/1307/feed` | Verified: 200, ~260 chars, 3 Ebola items | Ebola |
| The Daily Star (Bangladesh) health | `https://www.thedailystar.net/health/rss.xml` | Verified: 200, ~170 chars; measles items never say "Bangladesh", so the source has `match: ["measles"]` | Bangladesh measles |
| Greek Reporter | `https://greekreporter.com/feed/` | Verified: 200, ~320 chars; no West Nile items on 2026-11-08 (season ending) | West Nile Greece |
| Outbreak News Today | `https://outbreaknewstoday.com/feed/` (also feedburner) | 200, full text, but newest item 2026-07-30: stale | No |
| Outbreak News Today (Substack) | `https://outbreaknewstoday.substack.com/feed` | 403 | No |
| CDC newsroom | `https://tools.cdc.gov/api/v2/resources/media/132608.rss` | 200, 1,844 items back to 2014, newest 2026-09-22: would flood the feed with old items | No |
| CDC HAN | `https://tools.cdc.gov/api/v2/resources/media/413690.rss` | 200, 0 items | No |
| ReliefWeb RSS | `https://reliefweb.int/updates/rss.xml?search=...` | 406 / 202 (refuses automated clients); the API needs an approved `appname` | No |
| STAT News, BNO News | `statnews.com/feed/`, `bnonews.com/index.php/feed/` | 200, full text, no matching items | No (candidates if coverage grows) |
| The Business Standard (BD), Keep Talking Greece | `tbsnews.net/top-news/rss.xml`, `keeptalkinggreece.com/feed/` | 200, no matching items | No |
| Dhaka Tribune, eKathimerini | `dhakatribune.com/feed`, `ekathimerini.com/rss` | 403 | No |
| Contagion Live, Africa CDC, bdnews24 | | empty titles / 0 items / HTML | No |

ECDC's feed index (`https://www.ecdc.europa.eu/en/rss-feeds`) lists 18 taxonomy feeds (terms
323, 2942, 2794, 197, 1310, 1505, 1295, 1244, 1253, 1502, 1301, 1307, 1319, 1382, 1250, 1376,
1379); only 1307 and 1310 were probed.

## Countermeasures and research sources

**Last checked:** 2026-11-09, from GitHub Actions runners (`scripts/probe-countermeasures.mjs`,
workflow "Probe countermeasure sources", runs 42619227360 and 42619911375). **Why:** Ari asked
whether the site should also follow vaccines, treatments and diagnostics for the diseases it
covers. Full assessment, per-disease snapshots and design sketch: `docs/countermeasures-assessment.md`
(verdict: a smaller, hand-checked per-disease box, Bundibugyo Ebola first). **Pilot built
2026-11-09:** the "Vaccines & treatments" box on the Bundibugyo Ebola page, re-checked against
ClinicalTrials.gov, ISRCTN, EMA, CEPI and WHO by `scripts/check-countermeasures.mjs`.

| Source | Host / id | Level | Cadence | Status | Built |
|---|---|---|---|---|---|
| ClinicalTrials.gov API v2 (status, phase, results flag, change filters) | `clinicaltrials.gov/api/v2` | trial | data timestamp 2026-11-06 | Verified 2026-11-09 (probe, checker) | Vaccines & treatments box (checked lines) |
| EMA medicines JSON (authorisation status, latest procedure) | `ema.europa.eu` `medicines-output-medicines_json-report_en.json` | product, EU | twice a day (per EMA) | Verified 2026-11-09 (probe, 2,757 records; checker) | Vaccines & treatments box (checked lines) |
| openFDA Drugs@FDA (applications and dated submissions; no vaccines) | `api.fda.gov/drug/drugsfda.json` | product, US | `last_updated` 2026-11-06 | Verified 2026-11-09 (probe) | no |
| FDA licensed-vaccine list (HTML) | `www.fda.gov` | product, US | page changed 2026-11-08 | Verified 2026-11-09 (probe) | no |
| WHO prequalified vaccines list (HTML) | `extranet.who.int/prequal` | product | irregular | Reached, but list not readable as fetched | no |
| WHO R&D Blueprint, CEPI news (HTML statements) | `who.int/teams/blueprint`, `cepi.net/news` | statement | as events happen | Verified 2026-11-09 (probe, checker) | Vaccines & treatments box (statement lines, quote-checked) |
| ISRCTN query API (XML) | `isrctn.com/api/query/format/default?q=<id>` | trial | continuous | Verified 2026-11-09 (checker reads `lastUpdated`, acronym, scientific title) | Vaccines & treatments box (checked lines) |
| EU CTR search (HTML) | `clinicaltrialsregister.eu` | trial | legacy | Verified 2026-11-09 (counts only) | no |
| WHO ICTRP, CTIS, PACTR | `trialsearch.who.int`, `euclinicaltrials.eu`, `pactr.samrc.ac.za` | trial | weekly / continuous | Reported (portal pages reached; no open API; ICTRP forbids commercial use) | no |
| Europe PMC, PubMed E-utilities, bioRxiv/medRxiv API | `ebi.ac.uk`, `eutils.ncbi.nlm.nih.gov`, `api.biorxiv.org` | publication | daily | Verified 2026-11-09 (probe); too noisy to automate | no |
| NIH RePORTER API (grants, not milestones) | `api.reporter.nih.gov` | grant | weekly | Verified 2026-11-09 (probe) | no |

Key finding: registries lag reality. CEPI's news page announced the first vaccination in the
Phase 2/3 Bundibugyo vaccine trial in DRC while its ClinicalTrials.gov record (NCT07842107) still
said "Not yet recruiting" (last updated 2026-10-05). Any use of these sources has to show which
source says what, at which evidence tier.

## Other countries

Not researched yet. These are **leads only, none verified**; check each before relying on it and
move it into its own country section when done.

- **United Kingdom:** UKHSA mandatory surveillance of C. difficile, MRSA and Gram-negative
  bacteraemia by NHS trust; UKHSA national norovirus and rotavirus reports (weekly in season, with
  hospital norovirus outbreak counts; 2026–27 reports were being published in October 2026).
- **European Union:** ECDC point-prevalence surveys of healthcare-associated infections and
  antimicrobial use in long-term care facilities (periodic, aggregated); ECDC surveys of C. auris.
- **Canada:** provincial long-term care outbreak announcements (for example Interior Health in
  British Columbia names the facility; an influenza A outbreak at a Kelowna care centre was
  declared on 2026-11-03); Ontario's open data on long-term care homes.

## Ideas not yet acted on

- A per-facility risk view for ACOs and nursing-home networks: F880 citations joined with the
  state's C. auris and respiratory activity (and hospital C. diff where relevant). Test demand
  first, as `/commercial-data` does for H5N1 (for example an "ACO / post-acute network" buyer
  type).
- Other healthcare-setting conditions from the NNDSS table.
