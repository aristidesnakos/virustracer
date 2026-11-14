# Countermeasures tracker: should Outbreak Files follow "the solution"?

Research memo, written 2026-11-09; pilot section added the same day. The question: next to the outbreak figures, should the site
follow vaccines, treatments and diagnostics for the diseases it covers, showing when one reaches a
milestone? This file answers it with evidence: what the public sources give, what a panel would
show today for each disease, a design sketch, the risks and a phased plan. Nothing here is built.
Like `docs/public-data-sources.md`, **revise it when a source is re-checked**, and change the date
on the entry you touched.

How claims are labelled, because the cloud sandbox can reach only `www.cdc.gov`, `data.cdc.gov`,
`data.cms.gov` and `en.wikipedia.org`:

- **probe** — read by `scripts/probe-countermeasures.mjs` on a GitHub Actions runner on 2026-11-09:
  round 1 run 42619227360, round 2 run 42619911375 (workflow "Probe countermeasure sources").
- **opened** — page fetched from the sandbox and read (CDC, Wikipedia) on 2026-11-09.
- **search only (unverified)** — seen in web search results on 2026-11-09; the page itself was not
  opened. Treat as a lead, not a fact.

Registered, recruiting or completed does not mean a product works. Nothing in this memo says any
candidate is promising, effective or safe beyond what the cited source states.

## Verdict

1. **Do a smaller version.** Not a general "research and trials tracker", but a short, hand-checked
   **"Vaccines and treatments" status box per disease**, anchored on registries and regulators, with
   an automated watcher that only *flags* changes for a person to confirm.
2. **Why:** it fits the brand (each line tied to a registry record or regulator action, kept on
   file) and one disease (Bundibugyo Ebola) has a real, fast-moving story now; but for most of our
   diseases the box would be static or near-empty, the literature and news sources are too noisy to
   automate honestly, and a wrong milestone is a medical-information error, not a typo.
3. **Start with Bundibugyo Ebola only**, hand-curated for about four weeks, and measure whether
   readers use it before building the watcher or adding diseases.

## Pilot built (2026-11-09)

Ari chose the pilot: a hand-curated Bundibugyo box first. Built on the branch
`research/countermeasures-tracker`:

- **Box** "Vaccines & treatments" on `/outbreaks/ebola-bundibugyo-2026` (section
  `#vaccines-and-treatments`), from `src/data/countermeasures/ebolavirus-bundibugyo.json`:
  one statement (WHO: "no licensed vaccine or treatment"), five products (Tumaini trial, Ervebo,
  mRNA-1469, ChAdOx1 BDBV, PARTNERS treatment trial), ten sourced lines: 1 regulator record,
  7 registry records (ClinicalTrials.gov and ISRCTN), 2 statements (CEPI, WHO).
- **Rules** on `/methodology#countermeasures`, read from `src/lib/countermeasures.ts` (milestones,
  tiers, what each tier may claim, banned words, stale after 14 days).
- **Checker** `scripts/check-countermeasures.mjs` and workflow "Check countermeasures box": re-reads
  every source and warns on any difference; weekly with `--strict` (a red run means a source
  moved; scheduled runs start once the workflow is on `main`) and on demand. Runs 42623177006,
  42623504899, 42623730598, 42623960270 and 42624255741 on 2026-11-09 built and confirmed the file;
  the last reported 0 warnings.
- **Not built:** watcher that proposes new lines, API endpoint, other diseases, disease hubs.

What the checker established beyond the first probe (all on 2026-11-09):

- The Oxford candidate is registered twice on ISRCTN: ISRCTN72157798 (BD-Ebov-01, Phase 1a, UK,
  assigned 13 Jul 2026) and ISRCTN17249219 (BD-Ebov-02, Phase 1b, Uganda, assigned 18 Sep 2026).
- CEPI's article "First participant vaccinated in pivotal Phase 2/3 Bundibugyo vaccine trial in
  DRC" is listed on its news page under 26 Oct 2026; NCT07842107 still says "Not yet recruiting"
  (record updated 5 Oct). The box shows both.
- WHO's PARTNERS page (2 Jul 2026) names the antibody MBP134 and remdesivir and says the trial is
  "sponsored by the World Health Organization". No registry record for it was found on
  ClinicalTrials.gov or ISRCTN.
- EMA's record for Ervebo: Authorised, marketing authorisation 11 Nov 2019, indication "caused by
  Zaire Ebola virus".
- Dropped for lack of a checkable date or source: CEPI's article on the Oxford trial launch (no date
  on the page), obeldesivir post-exposure trial (Wikipedia only), Tumaini partner list and Serum
  Institute of India role (search only).

**How to keep it (about an hour a week):** run or read the weekly "Check countermeasures box"
run; for each warning, open the source, fix the line by hand, set `checked` to the day you
checked, and push. Read the `--discover` part for new registry records (`NOT CITED`) and new
CEPI/WHO headlines; add a line only if it meets the tier rule. **How to measure the pilot (added 2026-11-14):** DataFast goals, as on Ari's other sites:
`countermeasures_view` (the box came into view), `countermeasures_source_click` (with product,
evidence tier and source kind) and `countermeasures_method_click`. They start recording once
`NEXT_PUBLIC_DATAFAST_WEBSITE_ID` and `DATAFAST_API_KEY` are set in Vercel. Read in DataFast:
Ebola page views → `countermeasures_view` → `countermeasures_source_click`. Suggested bar after
four weeks, to be set by Ari before looking: the share of Ebola page visitors who reach the box,
and of those, the share who open a source.

**Criteria used:** fit with the product ("Live outbreak figures, each tied to its source and kept
on file"); value to the site's readers (people following an outbreak, journalists, API users);
maintenance burden per disease; risk of misleading readers; and the cost of keeping it honest
(human review time, source breakage, corrections).

## What counts as a milestone

A closed vocabulary. Anything outside it is not shown.

| Code | Milestone | Typical evidence |
|---|---|---|
| `registered` | Trial registered | registry record (NCT, ISRCTN, EudraCT/CTIS, PACTR) |
| `first_enrolled` | First participant enrolled or vaccinated | registry status change to recruiting, or sponsor/WHO/CEPI statement |
| `phase_change` | Moves to a new phase (new registered trial at a later phase) | registry record |
| `status_change` | Suspended, terminated, withdrawn, completed | registry record |
| `results_posted` | Results posted to a registry | registry (`ResultsFirstPostDate`) |
| `preprint` | Results in a preprint | medRxiv/bioRxiv/Research Square via Europe PMC |
| `peer_reviewed` | Results in a peer-reviewed journal | PubMed/Europe PMC record |
| `submission` | Regulatory submission or validation | regulator listing (EMA "under evaluation", FDA acceptance) or sponsor statement |
| `authorised` | Approval, conditional approval or emergency authorisation | regulator record (openFDA, FDA list, EMA medicines JSON, national regulator) |
| `withdrawn` | Authorisation withdrawn or lapsed | regulator record |
| `who_listed` | WHO prequalification or Emergency Use Listing | WHO PQ/EUL list |
| `deployed` | Used in this outbreak outside a trial, or stockpile released | WHO, ministry, ICG, Gavi statement |

### Evidence-tier rule

What the site may show depends on the best evidence for that line. Each line shows its tier label
and its source link with a "checked on" date.

| Tier | Evidence | May show | Label |
|---|---|---|---|
| A | Regulator action (openFDA, FDA list, EMA medicines JSON, WHO PQ/EUL) | `authorised`, `withdrawn`, `who_listed`, `submission` | "Regulator record" |
| B | Trial registry record | `registered`, `phase_change`, `status_change`, `results_posted`, and `first_enrolled` when the registry status says so | "Trial registry" |
| C | Peer-reviewed paper | `peer_reviewed` (the fact of publication and its stated primary result, quoted, never paraphrased into "works") | "Peer-reviewed" |
| D | Preprint | `preprint`, labelled "Not peer-reviewed" | "Preprint, not peer-reviewed" |
| E | Statement by WHO, CEPI, a ministry, sponsor press release, or news | `first_enrolled`, `deployed`, `submission` only, with the issuer named (for example "CEPI says"); never `authorised` | "Statement by <issuer>" |

Rules: a tier-E line never claims an approval or a result; when tiers disagree, show both (see the
Tumaini example below) rather than pick one; efficacy and safety figures are quoted only from tier
A or C and attributed; news alone is never enough for any line.

## Source inventory

Probe results are from GitHub runners on 2026-11-09 (runs above). "Runner" = whether a runner got
HTTP 200. "Licence" notes are from search results unless marked otherwise and must be re-read at
source before building.

| Source | What it gives | Keyless | Terms / reuse | Cadence | Runner | Example result (probe) |
|---|---|---|---|---|---|---|
| **ClinicalTrials.gov API v2** `clinicaltrials.gov/api/v2` | Every registered study: status, phase, dates, sponsor and class, interventions, locations, results flag; `filter.advanced=AREA[LastUpdatePostDate]RANGE[...]` finds changes | yes | US government; attribution and "keep current" asked by the 2012 terms (archived copy only, search only); a ~50 requests/min limit is widely quoted but not found on an official page (unverified). The terms and API-about pages are a JavaScript app: the probe read no text from them | data timestamp `2026-11-06T10:00:05` (API v2.0.5); records updated by sponsors | 200 | "Bundibugyo": 8 studies, 0 with results, 3 updated since 2026-10-01; Ebola 132 (31 with results); measles 202; C. auris 16; West Nile 31; hantavirus 25; H5N1 272 |
| **EMA medicines JSON** `ema.europa.eu/en/documents/report/medicines-output-medicines_json-report_en.json` | Every centrally authorised medicine: status (Authorised/Withdrawn/...), opinion status, latest procedure, INN, indication; 17 sibling files (post-authorisation, orphan designations, PIPs, PSUSAs) | yes | EMA website data, reusable with acknowledgement (EMA legal notice; not re-read here) | twice a day per EMA's JSON page (search only); file `Last-Modified` 2026-11-09 05:00 GMT | 200 (6.8 MB) | 2,757 records; Ervebo `EMEA/H/C/004554` Authorised; Mvabea `EMEA/H/C/005343` Withdrawn; Rezzayo Authorised; Celldemic and Incellipan Authorised; M-M-RVaxPro and ProQuad Authorised; Inmazeb and Ebanga absent |
| **openFDA Drugs@FDA** `api.fda.gov/drug/drugsfda.json` | FDA applications (NDA, and BLAs reviewed by CDER) with every submission, its class and approval date | yes (key optional, raises limits) | public domain, no warranty (openFDA terms, not re-read here) | `meta.last_updated` 2026-11-06 | 200 | Inmazeb BLA761169 original approval 2020-10-14; Ebanga BLA761172 original approval 2020-12-21, latest labeling supplement 2026-02-18; Rezzayo NDA217417 2023-03-22; Brexafemme NDA214900 2021-06-01. **Vaccines are not in it**: Ervebo and MMR returned 404 "No matches" |
| **FDA "Vaccines Licensed for Use in the United States"** (CBER, HTML) | The US vaccine list | yes | public domain | page `Last-Modified` 2026-11-08 | 200 | Lists ERVEBO, M-M-R, PRIORIX, ProQuad, AUDENZ and "Influenza Virus Vaccine, H5N1 (for National Stockpile)"; no West Nile entry. HTML only: a change detector would diff the page |
| FDA Emergency Use Authorization page (HTML) | EUAs incl. diagnostics | yes | public domain | page `Last-Modified` 2026-11-09 | 200 | 67 mentions of Ebola (historic EUAs), 0 of Bundibugyo |
| **WHO prequalification, vaccines** `extranet.who.int/prequal/vaccines/prequalified-vaccines` | PQ list | yes | WHO terms (not read) | irregular | 200 (406 KB) | 0 mentions of Ervebo in the HTML: the list is paged or rendered by script, so it is **not readable as fetched**; needs another route (unverified) |
| WHO Emergency Use Listing page | EUL process and lists | yes | WHO terms | irregular | 200 | 5 Ebola mentions, 0 Bundibugyo |
| **WHO R&D Blueprint** `who.int/teams/blueprint` | WHO's dated news and documents on priority pathogens | yes | WHO terms | as events happen | 200 | Lists "2 July 2026 — Patient enrolment begins in a scientific trial to identify the first effective treatments for Bundibugyo virus disease"; a 21 Sept 2026 consortium document says "Bundibugyo virus remains one of the least studied Orthoebolaviruses with no licensed vaccine or treatment"; "12 June 2026 — Twenty-one countries launch coordinated Andes virus research initiative" |
| **WHO ICTRP** `trialsearch.who.int` | Pooled records from 17+ registries (incl. PACTR, CTIS, ISRCTN) | portal yes; web service for approved partners; weekly CSV via an annual fee for institutions (search only) | no marketing or commercial use, no WHO name/emblem (search only, unverified) | weekly | 200 (portal page) | Not queried (no open API). The commercial-use restriction matters if the data ever feeds a paid product |
| **EU Clinical Trials Register** `clinicaltrialsregister.eu` | EudraCT trials (pre-2023) | yes (HTML search) | EMA terms | legacy, frozen as CTIS replaces it | 200 | 11 results for "ebola", 1 for "bundibugyo" (EudraCT 2016-004853-34, an older trial) |
| **CTIS** `euclinicaltrials.eu` | EU trials since 2023 | public search UI | EMA terms | continuous | 200 (page) | No documented public API found; not queried |
| **ISRCTN** `isrctn.com/api/query` | UK-led and other trials, XML | yes | ISRCTN terms (not read) | continuous | 200 | totalCount: Bundibugyo 3 (incl. "A study of a new vaccine to prevent Bundibugyo Ebola virus disease in..."), Ebola 16, measles 90, hantavirus 2, C. auris 2, H5N1 4. The probe's record parser is not right yet (titles of contacts leak in) |
| PACTR `pactr.samrc.ac.za` | Pan African Clinical Trials Registry | site yes | — | — | 200 | Not queried; reachable via ICTRP |
| **CEPI** `cepi.net/news` | Funder news on the vaccines it backs | yes (HTML) | CEPI terms | as events happen | 200 (672 KB) | 16 distinct headlines name Bundibugyo, e.g. "First participant vaccinated in pivotal Phase 2/3 Bundibugyo vaccine trial in DRC", "Moderna's Bundibugyo ebolavirus vaccine candidate enters first human trial, backed by CEPI". Funder statements: tier E |
| Gavi `gavi.org` | Stockpiles, programme news | yes | Gavi terms | — | 200 | Home page only: 1 Ebola, 5 measles mentions. No feed tested |
| **Europe PMC REST** `ebi.ac.uk/europepmc/webservices/rest/search` | Journal articles and preprints (medRxiv, bioRxiv, Research Square, Preprints.org) in one query | yes | metadata reusable; full text by licence | daily | 200 (some queries 10–15 s) | 2026, title/abstract with vaccine/treatment terms: Bundibugyo 118 papers, 42 preprints; measles 625/112; C. auris 200/26; West Nile 197/22; hantavirus 118/25; H5N1 231/45. **Too noisy to automate:** top hits included genome sequencing and natural-product chemistry papers |
| **PubMed E-utilities** `eutils.ncbi.nlm.nih.gov` | PubMed counts and IDs | yes (≤3 requests/s; `tool` and contact email asked) | NLM terms | daily | 200 | 2026 counts: Bundibugyo 103, Ebola 320, measles 754, C. auris 275, West Nile 183, hantavirus 117, H5N1 253 |
| bioRxiv/medRxiv API `api.biorxiv.org` | Preprints by date range; **no keyword search** | yes | per-preprint licence | daily | 200 | medRxiv, last 7 days: 417 preprints; none of the first 30 matched our diseases. Use Europe PMC instead |
| **NIH RePORTER API** `api.reporter.nih.gov/v2/projects/search` | NIH grants (funding, not milestones) | yes (≤1 request/s asked) | public | weekly | 200 | FY2025–26 projects: Bundibugyo 6 (e.g. NIAID "PALM004: an observational study of the natural history of Bundibugyo V..."), C. auris 132, hantavirus 59, West Nile 181 |

Not probed, worth knowing: national regulators (Health Canada, MHRA, African regulators) announce
trial authorisations that the global registries miss; the International Coordinating Group (ICG)
announces vaccine deployments; WHO Disease Outbreak News (already read by the feed pipeline) often
states countermeasure deployment. No single "better source" covers vaccines, drugs and diagnostics;
the combination of ClinicalTrials.gov + EMA JSON + openFDA (+ the FDA vaccine list) is the keyless
core, and everything else is tier E.

## What would the panel show today

Snapshots as of 2026-11-09. This is the test of usefulness.

### Ebola, Bundibugyo virus — rich, fast-moving

- **No licensed vaccine or treatment for Bundibugyo virus.** WHO R&D Blueprint page (21 Sept 2026
  consortium document), probe. Wikipedia "2026 Ebola epidemic" (revision 1384659830) says the same
  "as of November 2026", opened.
- **Licensed products are for the Zaire species:** Ervebo (EMA Authorised, EMEA/H/C/004554, INN
  "Ebola Zaire...", probe; on FDA's licensed list, probe); Inmazeb (FDA 2020-10-14) and Ebanga (FDA
  2020-12-21), probe. That these two antibodies are indicated for Zaire ebolavirus comes from their
  labels, which were not opened here (unverified).
- **Vaccine trials (registry, probe):**
  - NCT07737717 — Moderna mRNA-1469, Phase 1, Canada, start 2026-07-31, active not recruiting, 84 participants.
  - NCT07919197 — Moderna mRNA-1469, Phase 1 in African participants, Uganda, start 2026-11-02, not yet recruiting, 224.
  - NCT07903350 — "BRAVO", Epicentre, Phase 4 study of ERVEBO in about 20,000 frontline workers, DRC, recruiting, start 2026-09-19.
  - NCT07842107 — "Study of Vaccines Against Bundibugyo Virus Disease in Contacts of Cases" (the Tumaini trial per Wikipedia), Phase 2/3, 3,620, DRC; **registry status "Not yet recruiting", last updated 2026-10-05**.
  - ISRCTN: 3 records, one titled "A study of a new vaccine to prevent Bundibugyo Ebola virus disease in..." (probe; the Oxford ChAdOx1 BDBV Phase 1 per the Oxford news release of 2026-07-13, search only, unverified).
- **The registry lags reality.** For the same trial, CEPI's news page carries "First participant
  vaccinated in pivotal Phase 2/3 Bundibugyo vaccine trial in DRC" (probe; headline date not
  captured) and Wikipedia says it launched on 23 October, while ClinicalTrials.gov still says "Not
  yet recruiting". A panel must show both lines, each with its tier, and never "correct" the
  registry from a press release.
- **Treatments:** WHO, 2 July 2026: "Patient enrolment begins in a scientific trial to identify the
  first effective treatments for Bundibugyo virus disease" (probe). The drugs (remdesivir and the
  antibody MBP134, the PARTNERS trial) are named by Wikipedia and news (search only); a
  post-exposure trial of obeldesivir is listed by Wikipedia only (unverified). No registry record for
  PARTNERS was found among the 8 ClinicalTrials.gov records; it may be in PACTR or ISRCTN (not checked).
- **Diagnostics:** Africa CDC recommended PCR because no antigen rapid test met WHO's target profile
  (Wikipedia, citing Africa CDC, 22 May 2026; not opened at source).
- **Funding, not milestones:** CEPI funding for IAVI, Moderna, Oxford and Minapharm, and a BARDA award
  to an IAVI-led consortium, per Wikipedia (unverified at source).

### Measles — static

- Licensed vaccines in the US (M-M-R, PRIORIX, ProQuad on FDA's list, probe) and EU (M-M-RVaxPro,
  ProQuad Authorised, probe). CDC (page dated 29 Apr 2026, opened): two doses of MMR are 97%
  effective against measles.
- ClinicalTrials.gov: 202 studies, 1 updated since 1 Oct 2026 (probe), mostly vaccine schedules,
  diagnostics and unrelated uses of measles virus (oncolytic vectors).
- Movement worth showing is rare: the measles-rubella microarray patch (Phase 1/2 results in The
  Gambia, reported 2024, search only) is the main pipeline item. A panel would say "licensed vaccine,
  no new milestones" for months. Measles's real story is coverage and policy, which this feature
  should not try to cover.

### Candida auris — mostly infection control, little product movement

- No vaccine found (search only). CDC clinical care page (updated 12 Nov 2025, opened): reports of
  echinocandin-resistant and pan-resistant cases are increasing; "investigational drugs may be
  considered".
- Newer antifungals have regulator records (Rezzayo FDA 2023-03-22, EMA Authorised; Brexafemme FDA
  2021-06-01, probe) but **their approvals are not specific to C. auris** and their labels were not
  read here; the site must not imply otherwise. Fosmanogepix Phase 3 (NCT05421858) appears only in a
  third-party tracker (search only, unverified).
- ClinicalTrials.gov: 16 studies (probe), led by prevention and diagnostics, e.g. NCT06282510
  "Nasal Antisepsis for C. Auris Prevention", Phase 4, recruiting; a rapid diagnostic device study by
  AP-HP (NCT07253311).

### West Nile virus — "none licensed", a few early trials

- CDC (about page updated 16 Jun 2026, opened): "No licensed vaccines or medicines are available to
  prevent or treat West Nile virus disease in people."
- ClinicalTrials.gov: 31 studies (probe); NCT06745921 NIAID inactivated vaccine, Phase 1, active not
  recruiting; NCT07094724 high-titre neutralising plasma, Phase 2, recruiting; NCT06590207
  convalescent plasma, Phase 3, completed, no results posted. A Bavarian Nordic MVA-BN-WEV Phase 2
  appears only on a third-party trial site (search only).
- The Greek season is ending; a panel would barely move until next summer.

### Hantavirus (archived MV Hondius record, Andes virus) — "none", preclinical

- CDC (hantavirus about page, opened): "There is no specific treatment for hantavirus infection."
- WHO, 12 June 2026: "Twenty-one countries launch coordinated Andes virus research initiative"
  (probe). AP-HP "Natural History of Andes Virus Infection" (NCT07703579), active not recruiting
  (probe). The completed US Army DNA vaccine trials (e.g. NCT04333459) target Hantaan and Puumala
  viruses, not Andes.
- A single-dose mRNA vaccine protected animals in a June 2026 paper (search only). Nothing for a
  panel beyond "no licensed vaccine or treatment; research initiative launched", and the record is
  archived anyway.

### H5N1 (next candidate) — rich but complex

- US: FDA's list includes AUDENZ and "Influenza Virus Vaccine, H5N1 (for National Stockpile)" (probe);
  EU: Celldemic (zoonotic influenza) and Incellipan (pandemic influenza) Authorised (probe).
- CDC (page updated 5 Nov 2026, opened): 74 reported human cases since Feb 2024; the seasonal flu
  vaccine "is not designed to protect against H5N1".
- ClinicalTrials.gov: 272 studies, 6 updated since 1 Oct 2026 (probe). Moderna announced a Phase 3
  start for mRNA-1018 on 21 Apr 2026 (press release via BioSpace, search only).
- Useful, but "licensed stockpile vaccine exists, not generally available" is exactly the kind of
  nuance a status box gets wrong, and animal vaccines (poultry, cattle) are a separate regulatory
  world (USDA), not covered here.

**Summary:** one disease (Bundibugyo) would carry a useful, changing panel today; H5N1 would be
useful if added; measles, West Nile and hantavirus would show a near-static "licensed" or "none
licensed" line; C. auris would show mostly prevention trials. A per-disease box is worth it; a
cross-disease "tracker" page would look empty.

## Design sketch (no code)

**Key: the pathogen, not the outbreak.** Countermeasures for Bundibugyo apply to every Bundibugyo
outbreak; Zaire-species products must never appear under Bundibugyo except as "licensed for a
different species". Proposed ids: `ebolavirus-bundibugyo`, `measles`, `candida-auris`,
`west-nile-virus`, `hantavirus-andes`, `influenza-a-h5n1`. An `OutbreakDefinition` would gain an
optional `pathogen` field pointing at one id, mirrored in `scripts/lib/outbreak-registry.mjs` and
checked by `tests/outbreak-registry.test.ts`, like `disease` today. Kept apart from the outbreak
data model in the same way as the nursing-home layer: never fed to `computeMetrics`, never in the
home ranking.

**Data.**

- Curated (hand-verified source of truth, never written by automation, same rule as
  `src/data/outbreaks/*.ts`): `src/data/countermeasures/<pathogen>.ts` with `products[]` (name,
  type `vaccine|treatment|prophylaxis|diagnostic`, platform, developer, funders as named by the
  source, and `licensedFor` species if different) and `events[]` (date, milestone code, tier, source
  URL, issuer, "checked on" date, optional short quote).
- Watched (automation output, shown nowhere until promoted): `data/countermeasures/<pathogen>/watch.json`
  with the last-seen state of each watched record and a `candidates[]` list of detected changes.
- Raw: every accepted response archived write-once as
  `data/raw/countermeasures/<source>-<record>-<date>-<sha12>.json` (gzip for the 6.8 MB EMA file, or
  store only the matched records plus the file's SHA-256), like the CDC and NNDSS raw files.

**Where it appears.** A "Vaccines and treatments" section on each outbreak page, under the table,
showing that pathogen's box; and the same box on the disease hub `/diseases/<disease>` when Phase 5
builds hubs. The box lists products with their latest milestone and tier label, each line linked to
its source and dated, plus a fixed sentence: "Trial registration or enrolment does not mean a product
works. This is not medical advice."

**API**, next to the existing one and served the same way (keyless, CORS-open, JSON/CSV,
`attributionFor`): `/api/v1/countermeasures` (pathogens with counts and last change) and
`/api/v1/countermeasures/[pathogen]` (products and events, curated only; tier and source on every
event). The outbreak endpoints could add `meta.pathogen` so callers can join.

**Keyless watcher** (a later step, in `update-data.yml` as its own `continue-on-error` step):

- ClinicalTrials.gov: a curated list of NCT ids per pathogen, re-read daily (`overallStatus`,
  `phases`, `lastUpdatePostDate`, `hasResults`, `resultsFirstPostDate`); plus one query per pathogen
  with `AREA[LastUpdatePostDate]RANGE[<last run>,MAX]` and `AREA[StudyFirstPostDate]` to find new
  studies. Probe shows both filters work and cost one request each.
- EMA medicines JSON: one download a day (6.8 MB), compare `medicine_status`, `opinion_status` and
  `latest_procedure_affecting_product_information` for watched product numbers, and scan new records
  whose INN or indication names a watched pathogen.
- openFDA: by application number, compare the submissions list (a new `ORIG` or `SUPPL` with status
  `AP`).
- FDA vaccine list: hash the page, raise a candidate when it changes.
- Not automated: WHO, CEPI, news, preprints and papers. The probe shows Europe PMC's top results for
  "measles AND vaccine" in 2026 include genome sequencing and epidemiology papers; deciding what a
  paper shows needs a person. The existing news feed can surface candidates for a human to check.
- Same reliability rules as the other readers: host allow-list, https only, size caps, `::warning::`
  on fetch failure, `::error::` on a failed check, exit 0, nothing stored on doubt.

**Wording rules** (to add to `/methodology` with the box):

- Say what the record says: "registered", "recruiting according to the registry", "results posted",
  "authorised by EMA on <date>". Never "promising", "breakthrough", "effective", "safe", "cure",
  "approved" for a trial, or "the vaccine" for a candidate.
- Name the species: "licensed for Zaire ebolavirus, not tested for Bundibugyo" where it applies.
- Name sponsors and funders exactly as the source does ("ModernaTX, Inc.", "funded by CEPI per
  CEPI"); the site already names sponsors and funders elsewhere, so keep that style.
- Every line: tier label, source link, date of the event, date we checked.
- Show disagreement between sources instead of resolving it.
- Fixed footer: not medical advice; ask a health professional; corrections via `CORRECTIONS_URL`.

## Risks and trust

1. **Over-claiming and misinformation.** The biggest risk. A box that says "Phase 3" next to an
   outbreak reads as "a vaccine is coming"; a funder headline reads as a result. Mitigations: the
   closed vocabulary, the tier rule, the wording rules, no automated publishing, and quoting rather
   than paraphrasing results.
2. **Getting a milestone wrong is reputational.** A false "authorised" or a missed withdrawal (EMA
   lists Mvabea as Withdrawn; a page copied from an older source would still show it authorised)
   is worse than an out-of-date death toll, because readers may act on it. Every line needs a
   "checked on" date, and a stale box (not checked in N days) should show that it is stale, like the
   hand-copied region tables do.
3. **Medical-advice boundary.** The site must not tell anyone whether to get vaccinated or treated,
   or where; no eligibility, dosing or access information. Link to WHO, CDC or the national health
   authority instead.
4. **Registry lag and conflict.** Shown above: CEPI announced first vaccinations while the registry
   still says "Not yet recruiting". Without the tier rule the site would contradict itself or one of
   its sources.
5. **Species and strain confusion.** Ebola is the obvious trap (Zaire products vs Bundibugyo); H5N1
   clade and animal vs human vaccines is the next one.
6. **Terms and licences.** ClinicalTrials.gov, openFDA and NIH data are US government (attribution
   requested); EMA asks for acknowledgement; WHO ICTRP forbids commercial and marketing use and use
   of the WHO name (search only). If countermeasure data ever feeds a paid product (like the planned
   commercial feed), ICTRP-derived data must stay out of it. Re-read every source's terms at source
   before building; none were read in full here.
7. **Maintenance when sources change.** ClinicalTrials.gov already moved from its classic API to v2;
   EMA renamed its files (the first probe used a wrong name and got 404); WHO's PQ list could not be
   read as fetched. A broken reader must fail loudly and store nothing, as the toll readers do.
8. **Scope creep.** A research feed turns the site into a news aggregator, which the multi-outbreak
   plan already warns against (§5.5: do not index aggregated headlines).

## Effort and phasing

| Phase | What | Rough effort | Ongoing |
|---|---|---|---|
| 0. Test before building | Pick one: (a) a hand-curated Bundibugyo box on the Ebola page for four weeks, with a DataFast goal on its source links and a "Vaccines and treatments" anchor; or (b) a demand question in the existing alerts widget ("Tell me when a Bundibugyo vaccine reaches a milestone"). (a) is the better test because it also tests the upkeep | (a) ~1 day incl. wording on `/methodology`; (b) ~2 hours | (a) ~1 hour a week for one disease |
| 1. Smallest useful version | Curated `src/data/countermeasures/` for Bundibugyo, `pathogen` field on outbreaks, box component, `/methodology` wording, tests (vocabulary, tier, every event has source and date) | 1.5–2 days | ~1 hour a week per active disease |
| 2. Watcher | `scripts/update-countermeasures.mjs` for ClinicalTrials.gov, EMA JSON, openFDA and the FDA vaccine list; candidates file; raw archive; tests with recorded fixtures; step in `update-data.yml` | 3–4 days | review of candidates, ~30 min a week |
| 3. Breadth | H5N1 (if added as an outbreak), the static diseases as one-line boxes, disease hubs, `/api/v1/countermeasures` | 2–3 days | grows per disease |

Recommendation: Phase 0 (a), then decide. Do not start Phase 2 before Phase 1 has shown readers use
the box, and do not build a site-wide "research tracker" page at all.

## Open questions for Ari

1. Smaller version (per-disease box, Bundibugyo first) or not at all? (recommended: smaller version)
2. Pilot shape: hand-curated box on the Ebola page for four weeks, or a demand question in the
   alerts widget first?
3. Who reviews milestones before they show: you only, or anyone with commit access following the
   tier rule?
4. Include diagnostics, or vaccines and treatments only? (diagnostics have the weakest public sources)
5. Show tier-E lines (WHO/CEPI/sponsor statements) at all, or registry and regulator lines only?
6. Countermeasures in the public API from day one, or site-only until the watcher exists?
7. Keep this data out of any paid product (because of ICTRP's commercial-use restriction and the
   advice risk)? (recommended: yes)
8. Order against the roadmap: before or after Phase 5 (disease hubs) and H5N1?
9. (Pilot) Answered 2026-11-14: measure with DataFast. Still open: the pass mark for the four-week
   read (share of Ebola visitors who reach the box; share of those who open a source).
10. (Pilot) Who reads the weekly checker run and updates the file, and how long the pilot runs
    before deciding (suggested: four weeks)?

## Probe and reproduction

`node scripts/probe-countermeasures.mjs [--only=<text>] [--round=1|2]`, run through the
"Probe countermeasure sources" workflow (manual only, no secrets, read-only, about 100 sequential
requests paced per host, User-Agent names the project). Known gaps in the probe: the ISRCTN record
parser, the WHO PQ list (not readable as fetched), and the ClinicalTrials.gov terms page (a
JavaScript app, so no text). Re-run it before building anything on these sources.
