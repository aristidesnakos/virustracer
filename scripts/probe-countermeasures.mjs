#!/usr/bin/env node
/**
 * Keyless, read-only probe of candidate sources for a "countermeasures" tracker (vaccines,
 * treatments and diagnostics for the diseases the site covers). Research only: nothing here is
 * used by the site. See docs/countermeasures-assessment.md.
 *
 * Run through .github/workflows/probe-countermeasures.yml: the build sandbox cannot reach these
 * hosts, GitHub's runners can. No secrets, no model calls, nothing written. Every request is a
 * single GET (NIH RePORTER's documented search is a POST that only reads), sent sequentially with
 * a pause per host, with an honest User-Agent. Output is one compact `PROBE` line per request plus
 * a few indented sample lines, so it reads in a job log.
 *
 * Usage: node scripts/probe-countermeasures.mjs [--only=<substring of group or id>]
 */

const UA =
  "virustracer-research-probe/1.0 (https://outbreakfiles.com; https://github.com/aristidesnakos/virustracer; read-only feasibility check, a few dozen requests)";
const MAX_BYTES = 30_000_000;
const TODAY = new Date().toISOString().slice(0, 10);
const clip = (s, n = 90) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).toLowerCase();
/** `--round=2` runs only the follow-up requests added after the first run (docs/countermeasures-assessment.md). */
const round = Number((process.argv.find((a) => a.startsWith("--round=")) ?? "").slice(8)) || 0;

/** Diseases the site covers, plus H5N1, with the search text used per source. */
const DISEASES = [
  { key: "bundibugyo", label: "Ebola (Bundibugyo virus)", term: "Bundibugyo", epmc: "Bundibugyo", pubmed: "Bundibugyo" },
  { key: "ebola", label: "Ebola (any species)", cond: "Ebola", epmc: "Ebola", pubmed: "Ebola" },
  { key: "measles", label: "Measles", cond: "Measles", epmc: "measles", pubmed: "measles" },
  { key: "auris", label: "Candida auris", term: "Candida auris", epmc: '"Candida auris"', pubmed: '"Candida auris"' },
  { key: "wnv", label: "West Nile virus", cond: "West Nile", epmc: '"West Nile"', pubmed: '"West Nile"' },
  { key: "hanta", label: "Hantavirus", term: "hantavirus", epmc: "hantavirus", pubmed: "hantavirus" },
  { key: "h5n1", label: "H5N1", term: "H5N1", epmc: "H5N1", pubmed: "H5N1" },
];
const CT = "https://clinicaltrials.gov/api/v2/studies";
const enc = encodeURIComponent;
const q = (d) => (d.cond ? `query.cond=${enc(d.cond)}` : `query.term=${enc(d.term)}`);

/** Count keyword hits in an HTML page. */
const htmlGrep = (keywords) => (r) => {
  const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(r.text) ?? [])[1];
  const hits = keywords.map((k) => `${k}=${(r.text.match(new RegExp(k, "gi")) ?? []).length}`).join(" ");
  return [`title="${clip(title, 70)}" bytes=${r.text.length} hits: ${hits}`];
};

const tasks = [];
const add = (t) => tasks.push(t);

// ---- ClinicalTrials.gov API v2 ----
add({
  group: "clinicaltrials.gov", id: "version", host: "clinicaltrials.gov", url: "https://clinicaltrials.gov/api/v2/version",
  sum: (r) => [clip(r.text, 160)],
});
for (const d of DISEASES) {
  const fields = "NCTId,BriefTitle,OverallStatus,Phase,LastUpdatePostDate,LeadSponsorName,HasResults";
  add({
    group: "clinicaltrials.gov", id: `${d.key}:latest`, host: "clinicaltrials.gov",
    url: `${CT}?${q(d)}&pageSize=4&countTotal=true&sort=LastUpdatePostDate:desc&fields=${fields}`,
    sum: (r) => {
      const j = JSON.parse(r.text);
      return [
        `total=${j.totalCount} (newest updates first)`,
        ...(j.studies ?? []).map((s) => {
          const p = s.protocolSection;
          return `${p.identificationModule.nctId} ${p.statusModule.overallStatus} phase=${(p.designModule?.phases ?? []).join("/") || "-"} updated=${p.statusModule.lastUpdatePostDateStruct?.date} results=${s.hasResults} sponsor="${clip(p.sponsorCollaboratorsModule?.leadSponsor?.name, 28)}" "${clip(p.identificationModule.briefTitle, 60)}"`;
        }),
      ];
    },
  });
  add({
    group: "clinicaltrials.gov", id: `${d.key}:with-results`, host: "clinicaltrials.gov",
    url: `${CT}?${q(d)}&pageSize=1&countTotal=true&filter.advanced=${enc("AREA[ResultsFirstPostDate]RANGE[MIN,MAX]")}&fields=NCTId`,
    sum: (r) => [`studies with posted results: ${JSON.parse(r.text).totalCount}`],
  });
  add({
    group: "clinicaltrials.gov", id: `${d.key}:changed-since-oct`, host: "clinicaltrials.gov",
    url: `${CT}?${q(d)}&pageSize=1&countTotal=true&filter.advanced=${enc("AREA[LastUpdatePostDate]RANGE[2026-10-01,MAX]")}&fields=NCTId`,
    sum: (r) => [`studies updated since 2026-10-01 (change detection works: ${JSON.parse(r.text).totalCount})`],
  });
}
add({
  group: "clinicaltrials.gov", id: "bundibugyo:interventions", host: "clinicaltrials.gov",
  url: `${CT}?query.term=Bundibugyo&pageSize=10&fields=NCTId,InterventionName,OverallStatus,StartDate,Phase,LocationCountry`,
  sum: (r) =>
    (JSON.parse(r.text).studies ?? []).map((s) => {
      const p = s.protocolSection;
      return `${p.identificationModule.nctId} ${p.statusModule.overallStatus} start=${p.statusModule.startDateStruct?.date ?? "-"} interventions=${clip((p.armsInterventionsModule?.interventions ?? []).map((i) => i.name).join("; "), 70)} countries=${clip((p.contactsLocationsModule?.locations ?? []).map((l) => l.country).filter((v, i, a) => a.indexOf(v) === i).join(","), 40)}`;
    }),
});

// ---- Europe PMC (literature and preprints) ----
const EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
for (const d of DISEASES) {
  const topic = `TITLE_ABS:${d.epmc} AND (TITLE_ABS:vaccine OR TITLE_ABS:therapeutic OR TITLE_ABS:treatment OR TITLE_ABS:"clinical trial" OR TITLE_ABS:antiviral OR TITLE_ABS:diagnostic)`;
  add({
    group: "europepmc", id: `${d.key}:lit`, host: "ebi.ac.uk", round: 2,
    url: `${EPMC}?query=${enc(`${topic} AND FIRST_PDATE:[2026-01-01 TO 2026-12-31]`)}&format=json&pageSize=3&sort=${enc("P_PDATE_D desc")}&resultType=lite`,
    sum: (r) => {
      const j = JSON.parse(r.text);
      return [
        `hits in 2026=${j.hitCount}`,
        ...(j.resultList?.result ?? []).map((x) => `${x.source} ${x.firstPublicationDate} ${x.pubType ?? ""} "${clip(x.title, 70)}" (${clip(x.journalTitle ?? x.bookOrReportDetails?.publisher ?? "", 30)})`),
      ];
    },
  });
  add({
    group: "europepmc", id: `${d.key}:preprints`, host: "ebi.ac.uk", round: 2,
    url: `${EPMC}?query=${enc(`${topic} AND SRC:PPR AND FIRST_PDATE:[2026-01-01 TO 2026-12-31]`)}&format=json&pageSize=2&sort=${enc("P_PDATE_D desc")}&resultType=lite`,
    sum: (r) => {
      const j = JSON.parse(r.text);
      return [`preprint hits in 2026=${j.hitCount}`, ...(j.resultList?.result ?? []).map((x) => `${x.firstPublicationDate} "${clip(x.title, 75)}" (${clip(x.bookOrReportDetails?.publisher ?? "", 20)})`)];
    },
  });
}

// ---- PubMed E-utilities ----
for (const d of DISEASES) {
  const term = `${d.pubmed}[Title/Abstract] AND (vaccine OR therapeutic OR treatment OR "clinical trial")`;
  add({
    group: "pubmed", id: `${d.key}:2026`, host: "ncbi.nlm.nih.gov", gap: 500,
    url: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=3&sort=pub_date&datetype=pdat&mindate=2026/01/01&maxdate=2026/12/31&tool=outbreakfiles-research-probe&term=${enc(term)}`,
    sum: (r) => {
      const j = JSON.parse(r.text).esearchresult;
      return [`count 2026=${j.count} newest pmids=${(j.idlist ?? []).join(",")}`];
    },
  });
}

// ---- openFDA (drugs only; most vaccines are biologics outside it) ----
for (const [name, field] of [["INMAZEB", "brand_name"], ["EBANGA", "brand_name"], ["ERVEBO", "brand_name"], ["REZZAYO", "brand_name"], ["BREXAFEMME", "brand_name"], ["MMR", "brand_name"]]) {
  add({
    group: "openfda", id: `drugsfda:${name}`, host: "api.fda.gov", gap: 700,
    url: `https://api.fda.gov/drug/drugsfda.json?search=${enc(`products.brand_name:"${name}"`)}&limit=1`,
    sum: (r) => {
      const j = JSON.parse(r.text);
      if (j.error) return [`${j.error.code}: ${j.error.message}`];
      const x = j.results?.[0];
      return [
        `total=${j.meta?.results?.total} application=${x?.application_number} sponsor="${clip(x?.sponsor_name, 30)}" last_updated=${j.meta?.last_updated}`,
        ...(x?.submissions ?? []).slice(0, 3).map((s) => `${s.submission_type} ${s.submission_status} ${s.submission_status_date}`),
      ];
    },
    allow404: true,
  });
}

// ---- ISRCTN (documented query API, XML) ----
for (const t of ["Bundibugyo", "Ebola", "measles", "hantavirus", "Candida auris", "H5N1"]) {
  add({
    group: "isrctn", id: t, host: "isrctn.com", round: 2,
    url: `https://www.isrctn.com/api/query/format/default?q=${enc(t)}&limit=2`,
    sum: (r) => {
      const total = /totalCount="(\d+)"/.exec(r.text)?.[1];
      const ids = [...r.text.matchAll(/<isrctn[^>]*>(ISRCTN\d+)<\/isrctn>/g)].map((m) => m[1]);
      const titles = [...r.text.matchAll(/<trialDescription>\s*<title>([^<]*)<\/title>/g)].map((m) => clip(m[1], 75));
      const edited = [...r.text.matchAll(/<lastUpdated>([^<]*)<\/lastUpdated>/g)].map((m) => m[1].slice(0, 10));
      return [`totalCount=${total}`, ...titles.slice(0, 3).map((x, i) => `${ids[i] ?? "?"} edited=${edited[i] ?? "?"} "${x}"`)];
    },
  });
}

// ---- NIH RePORTER (POST that only reads) ----
for (const [label, text] of [["Bundibugyo", "Bundibugyo"], ["Candida auris", "Candida auris"], ["hantavirus", "hantavirus"], ["West Nile", "West Nile"]]) {
  add({
    group: "nih-reporter", id: label, host: "reporter.nih.gov", gap: 1500,
    method: "POST",
    url: "https://api.reporter.nih.gov/v2/projects/search",
    body: { criteria: { advanced_text_search: { operator: "and", search_field: "projecttitle,terms", search_text: text }, fiscal_years: [2025, 2026] }, limit: 3, offset: 0, sort_field: "project_start_date", sort_order: "desc" },
    sum: (r) => {
      const j = JSON.parse(r.text);
      return [`total projects FY2025-26=${j.meta?.total}`, ...(j.results ?? []).map((p) => `FY${p.fiscal_year} ${p.agency_ic_admin?.abbreviation ?? ""} "${clip(p.project_title, 70)}"`)];
    },
  });
}

// ---- bioRxiv / medRxiv API (date-range listing, no keyword search) ----
add({
  group: "biorxiv", id: "medrxiv:last-week", host: "api.biorxiv.org",
  url: `https://api.biorxiv.org/details/medrxiv/${new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)}/${TODAY}/0/json`,
  sum: (r) => {
    const j = JSON.parse(r.text);
    const m = j.messages?.[0] ?? {};
    const kw = /bundibugyo|ebola|measles|auris|west nile|hantavirus|h5n1/i;
    const hits = (j.collection ?? []).filter((x) => kw.test(`${x.title} ${x.abstract}`));
    return [`status=${m.status} total_in_range=${m.total} page_count=${m.count}`, ...hits.slice(0, 3).map((x) => `${x.date} "${clip(x.title, 80)}"`)];
  },
});

// ---- EMA medicines data (JSON files, updated twice a day per EMA's JSON-data page) ----
add({
  group: "ema", id: "json-docs-page", host: "ema.europa.eu", round: 2,
  url: "https://www.ema.europa.eu/en/about-us/about-website/download-website-data-json-data-format",
  html: true,
  sum: (r) => {
    const links = [...new Set([...r.text.matchAll(/href="([^"]*\.json[^"]*)"/g)].map((m) => m[1]))];
    return [`bytes=${r.text.length} json links=${links.length}`, ...links.filter((l) => /medicine/i.test(l)).slice(0, 6)];
  },
});
add({
  group: "ema", id: "medicines-json", host: "ema.europa.eu", round: 2,
  url: "https://www.ema.europa.eu/en/documents/report/medicines-output-medicines_json-report_en.json",
  sum: (r) => {
    const j = JSON.parse(r.text);
    const rows = Array.isArray(j) ? j : j.data ?? j.results ?? Object.values(j)[0];
    const first = rows?.[0] ?? {};
    const out = [`records=${rows?.length} keys=${Object.keys(first).slice(0, 16).join(",")}`];
    for (const name of ["Ervebo", "Zabdeno", "Mvabea", "Inmazeb", "Ebanga", "Rezzayo", "Brexafemme", "Zoonotic Influenza", "Celldemic", "Incellipan", "Priorix", "ProQuad", "M-M-RvaxPro"]) {
      const hit = rows?.filter((x) => JSON.stringify(x).toLowerCase().includes(name.toLowerCase())) ?? [];
      if (hit.length) {
        const h = hit[0];
        out.push(`${name}: ${hit.length} record(s); first: ${clip(JSON.stringify(h), 260)}`);
      } else out.push(`${name}: none`);
    }
    return out;
  },
});

// ---- Regulator, WHO and funder pages (status and keyword counts only) ----
const pages = [
  ["fda", "cber-licensed-vaccines", "https://www.fda.gov/vaccines-blood-biologics/vaccines/vaccines-licensed-use-united-states", ["Ervebo", "M-M-R", "PRIORIX", "ProQuad", "Audenz", "H5N1", "West Nile"]],
  ["fda", "cber-eua-or-emergency", "https://www.fda.gov/emergency-preparedness-and-response/mcm-legal-regulatory-and-policy-framework/emergency-use-authorization", ["Ebola", "Bundibugyo", "diagnostic"]],
  ["who", "prequalified-vaccines", "https://extranet.who.int/prequal/vaccines/prequalified-vaccines", ["Ervebo", "measles", "Bundibugyo"]],
  ["who", "eul-page", "https://www.who.int/teams/regulation-prequalification/eul", ["Ebola", "Bundibugyo", "Emergency Use"]],
  ["who", "rd-blueprint", "https://www.who.int/teams/blueprint", ["Bundibugyo", "Ebola", "Nipah"]],
  ["who", "ictrp-portal", "https://trialsearch.who.int/", ["ICTRP", "Search"]],
  ["cepi", "home", "https://cepi.net/", ["Bundibugyo", "Ebola", "Lassa", "H5"]],
  ["cepi", "news", "https://cepi.net/news", ["Bundibugyo", "Ebola"]],
  ["gavi", "home", "https://www.gavi.org/", ["Ebola", "measles", "Bundibugyo"]],
  ["eu-ctr", "search-ebola", "https://www.clinicaltrialsregister.eu/ctr-search/search?query=ebola", ["Ebola", "result\\(s\\) found", "Displaying"]],
  ["ctis", "search-page", "https://euclinicaltrials.eu/search-for-clinical-trials/", ["CTIS", "clinical trial"]],
  ["pactr", "home", "https://pactr.samrc.ac.za/", ["Pan African", "Ebola"]],
];
for (const [group, id, url, kws] of pages) add({ group, id, url, host: new URL(url).host, sum: htmlGrep(kws), html: true });


// ---- Round 2 additions: detail needed for the memo ----
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#?\w+;/g, " ").replace(/\s+/g, " ");
const context = (text, re, n = 3, w = 110) => {
  const t = strip(text);
  const out = [];
  for (const m of t.matchAll(re)) { out.push(`...${t.slice(Math.max(0, m.index - w), m.index + w)}...`); if (out.length >= n) break; }
  return out.length ? out : ["(no match)"];
};
add({
  group: "clinicaltrials.gov", id: "bundibugyo:all-records", host: "clinicaltrials.gov", round: 2,
  url: `${CT}?query.term=Bundibugyo&pageSize=20&fields=NCTId,BriefTitle,OverallStatus,StartDate,LastUpdatePostDate,LeadSponsorName,LeadSponsorClass,Phase,EnrollmentCount`,
  sum: (r) =>
    (JSON.parse(r.text).studies ?? []).map((s) => {
      const p = s.protocolSection;
      return `${p.identificationModule.nctId} ${p.statusModule.overallStatus} start=${p.statusModule.startDateStruct?.date ?? "-"} upd=${p.statusModule.lastUpdatePostDateStruct?.date} phase=${(p.designModule?.phases ?? []).join("/") || "-"} n=${p.designModule?.enrollmentInfo?.count ?? "-"} ${p.sponsorCollaboratorsModule?.leadSponsor?.class}:"${clip(p.sponsorCollaboratorsModule?.leadSponsor?.name, 26)}" "${clip(p.identificationModule.briefTitle, 80)}"`;
    }),
});
add({
  group: "clinicaltrials.gov", id: "tumaini:NCT07842107", host: "clinicaltrials.gov", round: 2,
  url: `${CT}/NCT07842107?fields=NCTId,OverallStatus,StartDate,PrimaryCompletionDate,LastUpdatePostDate,StatusVerifiedDate,Phase,EnrollmentCount,InterventionName,LeadSponsorName`,
  sum: (r) => {
    const p = JSON.parse(r.text).protocolSection;
    return [`status=${p.statusModule.overallStatus} verified=${p.statusModule.statusVerifiedDate} start=${p.statusModule.startDateStruct?.date} (${p.statusModule.startDateStruct?.type}) lastUpdate=${p.statusModule.lastUpdatePostDateStruct?.date} n=${p.designModule?.enrollmentInfo?.count} interventions=${clip((p.armsInterventionsModule?.interventions ?? []).map((i) => i.name).join("; "), 100)}`];
  },
});
add({
  group: "clinicaltrials.gov", id: "terms-page", host: "clinicaltrials.gov", round: 2, html: true,
  url: "https://clinicaltrials.gov/about-site/terms-conditions",
  sum: (r) => context(r.text, /(public domain|attribut|copyright|rate limit|requests per)/gi, 5),
});
add({
  group: "clinicaltrials.gov", id: "api-about", host: "clinicaltrials.gov", round: 2, html: true,
  url: "https://clinicaltrials.gov/data-api/about-api",
  sum: (r) => context(r.text, /(rate limit|per minute|requests)/gi, 4),
});
for (const name of ["INMAZEB", "EBANGA"]) {
  add({
    group: "openfda", id: `submissions:${name}`, host: "api.fda.gov", gap: 700, round: 2,
    url: `https://api.fda.gov/drug/drugsfda.json?search=${enc(`products.brand_name:"${name}"`)}&limit=1`,
    sum: (r) => {
      const x = JSON.parse(r.text).results?.[0];
      return [`products=${(x?.products ?? []).map((p) => `${p.brand_name} ${clip(p.active_ingredients?.[0]?.name, 30)} marketing=${p.marketing_status}`).join("; ")}`, ...(x?.submissions ?? []).map((s) => `${s.submission_type}${s.submission_number} ${s.submission_status} ${s.submission_status_date} class=${s.submission_class_code_description ?? "-"}`).sort()];
    },
  });
}
add({
  group: "fda", id: "vaccine-list-rows", host: "www.fda.gov", round: 2, html: true,
  url: "https://www.fda.gov/vaccines-blood-biologics/vaccines/vaccines-licensed-use-united-states",
  sum: (r) => [...context(r.text, /Ervebo/g, 1, 160), ...context(r.text, /H5N1/g, 2, 160), ...context(r.text, /Audenz/g, 1, 120)],
});
add({
  group: "who", id: "blueprint-bundibugyo-context", host: "www.who.int", round: 2, html: true,
  url: "https://www.who.int/teams/blueprint",
  sum: (r) => context(r.text, /Bundibugyo/g, 4, 130),
});
add({
  group: "cepi", id: "news-bundibugyo-headlines", host: "cepi.net", round: 2, html: true,
  url: "https://cepi.net/news",
  sum: (r) => {
    const heads = [...new Set([...r.text.matchAll(/<(?:h\d|a)[^>]*>\s*([^<]{15,160}?)\s*<\/(?:h\d|a)>/g)].map((m) => strip(m[1]).trim()).filter((x) => /bundibugyo/i.test(x)))];
    return [`distinct headlines mentioning Bundibugyo=${heads.length}`, ...heads.slice(0, 8).map((h) => `"${clip(h, 130)}"`)];
  },
});
add({
  group: "eu-ctr", id: "search-ebola-count", host: "www.clinicaltrialsregister.eu", round: 2, html: true,
  url: "https://www.clinicaltrialsregister.eu/ctr-search/search?query=ebola",
  sum: (r) => context(r.text, /result\(s\) found/g, 1, 90),
});
add({
  group: "eu-ctr", id: "search-bundibugyo-count", host: "www.clinicaltrialsregister.eu", round: 2, html: true,
  url: "https://www.clinicaltrialsregister.eu/ctr-search/search?query=bundibugyo",
  sum: (r) => context(r.text, /(result\(s\) found|No results)/gi, 1, 90),
});

// ---------------------------------------------------------------------------

async function get(t) {
  const started = Date.now();
  const res = await fetch(t.url, {
    method: t.method ?? "GET",
    headers: { "User-Agent": UA, Accept: t.html ? "text/html,*/*;q=0.5" : "application/json, application/xml;q=0.9, */*;q=0.5", ...(t.body ? { "Content-Type": "application/json" } : {}) },
    body: t.body ? JSON.stringify(t.body) : undefined,
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });
  const reader = res.body.getReader();
  const chunks = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > MAX_BYTES) { await reader.cancel(); throw new Error(`body over ${MAX_BYTES} bytes`); }
    chunks.push(value);
  }
  return {
    status: res.status, ms: Date.now() - started, finalHost: new URL(res.url).host,
    type: res.headers.get("content-type") ?? "", modified: res.headers.get("last-modified") ?? "",
    text: Buffer.concat(chunks).toString("utf8"),
  };
}

const lastHit = new Map();
let failures = 0;
console.log(`# countermeasures probe ${new Date().toISOString()} ua="${UA}"`);
for (const t of tasks) {
  if (only && !`${t.group} ${t.id}`.toLowerCase().includes(only)) continue;
  if (round && (t.round ?? 1) !== round) continue;
  const wait = (lastHit.get(t.host) ?? 0) + (t.gap ?? 1800) - Date.now();
  if (wait > 0) await sleep(wait);
  let line;
  let samples = [];
  try {
    const r = await get(t);
    lastHit.set(t.host, Date.now());
    const ok = r.status === 200 || (t.allow404 && r.status === 404);
    line = `PROBE ${t.group}/${t.id} status=${r.status} ms=${r.ms} host=${r.finalHost} type=${clip(r.type, 24)} bytes=${r.text.length}${r.modified ? ` last-modified="${r.modified}"` : ""}`;
    if (ok) {
      try { samples = t.sum(r); } catch (e) { samples = [`(summary failed: ${clip(e.message, 100)}) head="${clip(r.text, 140)}"`]; }
    } else {
      failures++;
      samples = [`head="${clip(r.text, 160)}"`];
    }
  } catch (e) {
    lastHit.set(t.host, Date.now());
    failures++;
    line = `PROBE ${t.group}/${t.id} error="${clip(`${e.name}: ${e.message}`, 120)}" url=${t.url.slice(0, 100)}`;
  }
  console.log(line);
  for (const s of samples) console.log(`    ${s}`);
}
console.log(`# done, ${failures} request(s) not OK`);
