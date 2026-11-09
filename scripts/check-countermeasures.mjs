#!/usr/bin/env node
/**
 * Re-checks every line of the hand-curated countermeasures files (src/data/countermeasures/*.json)
 * against its source, read-only. It never edits a file: a person compares the output and updates
 * the curated file by hand (same rule as the outbreak definitions; see
 * docs/countermeasures-assessment.md).
 *
 * Per source kind:
 *   - clinicaltrials.gov: reads the study from API v2 and compares `expect` (registryStatus,
 *     recordUpdated, phase, enrollment); prints the first-posted date and start date too.
 *   - ema-medicine: reads EMA's medicines JSON once and compares `expect.medicineStatus` for the
 *     product number, then fetches the EPAR page and checks `expect.quotes` on it.
 *   - isrctn: reads the record from ISRCTN's query API; compares `expect.recordUpdated` and quotes.
 *   - web: fetches the page and checks that every `expect.quotes` string appears in its text.
 * Each mismatch is a GitHub `::warning::`; the script always exits 0.
 *
 * `--discover` also lists, for each curated file, ClinicalTrials.gov studies matching its name
 * that the file does not cite (new registrations to review), and the Bundibugyo headlines with
 * their links on CEPI's news page and WHO's R&D Blueprint page.
 *
 * Run through .github/workflows/check-countermeasures.yml (manual): the build sandbox cannot reach
 * these hosts, GitHub's runners can. No secrets; sequential requests paced per host.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = resolve(ROOT, "src/data/countermeasures");
const UA = "virustracer-countermeasures-check/1.0 (https://outbreakfiles.com; https://github.com/aristidesnakos/virustracer; read-only)";
const HOSTS = new Set(["clinicaltrials.gov", "www.ema.europa.eu", "cepi.net", "www.who.int", "www.isrctn.com"]);
const MAX_BYTES = 12_000_000;
const discover = process.argv.includes("--discover");
const clip = (s, n = 110) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (h) =>
  h
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "’")
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ");
const norm = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ");

let warnings = 0;
const warn = (msg) => {
  warnings++;
  console.log(`::warning::${msg}`);
};

const lastHit = new Map();
async function get(url) {
  const u = new URL(url);
  if (u.protocol !== "https:" || !HOSTS.has(u.host)) throw new Error(`host not allowed: ${u.host}`);
  const wait = (lastHit.get(u.host) ?? 0) + 1500 - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(u.host, Date.now());
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(60_000) });
  const finalHost = new URL(res.url).host;
  if (!HOSTS.has(finalHost)) throw new Error(`redirected off allowed hosts to ${finalHost}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error(`body over ${MAX_BYTES} bytes`);
  return { status: res.status, url: res.url, text: buf.toString("utf8") };
}

let emaRows = null;
async function emaRecord(id) {
  if (!emaRows) {
    const r = await get("https://www.ema.europa.eu/en/documents/report/medicines-output-medicines_json-report_en.json");
    if (r.status !== 200) throw new Error(`EMA medicines JSON status ${r.status}`);
    const j = JSON.parse(r.text);
    emaRows = Array.isArray(j) ? j : (j.data ?? Object.values(j)[0]);
  }
  return emaRows.find((x) => x.ema_product_number === id);
}

async function checkLine(label, line) {
  const { source, expect = {} } = line;
  try {
    if (source.kind === "clinicaltrials.gov") {
      const fields = "NCTId,BriefTitle,OverallStatus,StudyFirstPostDate,LastUpdatePostDate,StartDate,Phase,EnrollmentCount,LeadSponsorName,InterventionName,LocationCountry";
      const r = await get(`https://clinicaltrials.gov/api/v2/studies/${source.id}?fields=${fields}`);
      if (r.status !== 200) return warn(`${label}: ${source.id} status ${r.status}`);
      const p = JSON.parse(r.text).protocolSection;
      const actual = {
        registryStatus: p.statusModule.overallStatus,
        recordUpdated: p.statusModule.lastUpdatePostDateStruct?.date,
        phase: (p.designModule?.phases ?? []).join("/") || null,
        enrollment: p.designModule?.enrollmentInfo?.count ?? null,
      };
      const countries = [...new Set((p.contactsLocationsModule?.locations ?? []).map((l) => l.country))].join(",");
      console.log(
        `  ${source.id} status=${actual.registryStatus} firstPosted=${p.statusModule.studyFirstPostDateStruct?.date} updated=${actual.recordUpdated} start=${p.statusModule.startDateStruct?.date} phase=${actual.phase} n=${actual.enrollment} sponsor="${clip(p.sponsorCollaboratorsModule?.leadSponsor?.name, 40)}" countries=${countries || "-"}`,
      );
      console.log(`    title="${clip(p.identificationModule.briefTitle, 200)}"`);
      console.log(`    interventions="${clip((p.armsInterventionsModule?.interventions ?? []).map((i) => i.name).join("; "), 200)}"`);
      for (const [k, v] of Object.entries(expect)) {
        if (String(actual[k]) !== String(v)) warn(`${label}: ${source.id} ${k} is ${actual[k]}, curated file says ${v}`);
      }
    } else if (source.kind === "ema-medicine") {
      const rec = await emaRecord(source.id);
      if (!rec) return warn(`${label}: ${source.id} not in EMA medicines JSON`);
      const dates = Object.entries(rec).filter(([k, v]) => /date/i.test(k) && v).map(([k, v]) => `${k}=${clip(v, 20)}`).join(" ");
      console.log(`  ${source.id} ${rec.name_of_medicine} status=${rec.medicine_status} inn="${clip(rec.international_non_proprietary_name_common_name, 90)}" ${dates}`);
      console.log(`    indication="${clip(rec.therapeutic_indication, 220)}"`);
      if (expect.medicineStatus && rec.medicine_status !== expect.medicineStatus) warn(`${label}: ${source.id} status is ${rec.medicine_status}, curated file says ${expect.medicineStatus}`);
      const page = await get(source.url);
      console.log(`    page ${source.url} status=${page.status}`);
      if (page.status !== 200) warn(`${label}: ${source.url} status ${page.status}`);
      for (const q of expect.quotes ?? []) if (!norm(strip(page.text)).includes(norm(q))) warn(`${label}: quote not found on ${source.url}: "${q}"`);
    } else if (source.kind === "isrctn") {
      const r = await get(`https://www.isrctn.com/api/query/format/default?q=${source.id}&limit=1`);
      if (r.status !== 200) return warn(`${label}: ${source.id} status ${r.status}`);
      const updated = (/<trial[^>]*lastUpdated="(\d{4}-\d{2}-\d{2})/.exec(r.text) ?? [])[1];
      const assigned = (/<isrctn dateAssigned="(\d{4}-\d{2}-\d{2})/.exec(r.text) ?? [])[1];
      const title = (/<scientificTitle>([^<]*)</.exec(r.text) ?? [])[1];
      const status = (/<(?:overallStatusOverride|recruitmentStatusOverride|overallEndDate)>([^<]*)</.exec(r.text) ?? [])[1];
      const scientific = (/<acronym>([^<]*)</.exec(r.text) ?? [])[1];
      console.log(`  ${source.id} acronym=${scientific ?? "-"} assigned=${assigned} updated=${updated} status-ish=${status ?? "-"} title="${clip(title, 200)}"`);
      if (!r.text.includes(source.id.replace("ISRCTN", ""))) return warn(`${label}: ${source.id} not found`);
      if (expect.recordUpdated && updated !== expect.recordUpdated) warn(`${label}: ${source.id} recordUpdated is ${updated}, curated file says ${expect.recordUpdated}`);
      for (const q of expect.quotes ?? []) if (!norm(strip(r.text)).includes(norm(q))) warn(`${label}: quote not found in ${source.id}: "${q}"`);
      const page = await get(source.url);
      console.log(`    page ${source.url} status=${page.status}`);
      if (page.status !== 200) warn(`${label}: ${source.url} status ${page.status}`);
    } else if (source.kind === "web") {
      const r = await get(source.url);
      const text = strip(r.text);
      const title = clip((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(r.text) ?? [])[1], 140);
      const published = (/property="article:published_time"\s+content="([^"]+)"/.exec(r.text) ??
        /"datePublished"\s*:\s*"([^"]+)"/.exec(r.text) ??
        /"(?:publishedDate|published_at|publishDate|created)"\s*:\s*"([^"]+)"/.exec(r.text) ??
        /<time[^>]*datetime="([^"]+)"/.exec(r.text) ??
        [])[1];
      const firstDate = (/\b\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec) 20\d\d\b/.exec(text) ?? [])[0];
      console.log(`  ${source.url} status=${r.status} title="${title}" published=${published ?? "-"} first-date-in-text=${firstDate ?? "-"} curated-date=${line.date ?? "-"}`);
      if (r.status !== 200) return warn(`${label}: ${source.url} status ${r.status}`);
      for (const q of expect.quotes ?? []) {
        const i = norm(text).indexOf(norm(q));
        if (i < 0) warn(`${label}: quote not found on ${source.url}: "${q}"`);
        else console.log(`    found "${q}": ...${clip(text.slice(Math.max(0, i - 120), i + q.length + 120), 300)}...`);
      }
    } else {
      warn(`${label}: unknown source kind ${source.kind}`);
    }
  } catch (e) {
    warn(`${label}: ${clip(`${e.name}: ${e.message}`, 160)}`);
  }
}

async function discoverFor(file) {
  console.log(`DISCOVER ${file.id}`);
  const cited = new Set(file.products.flatMap((p) => p.events).filter((e) => e.source.kind === "clinicaltrials.gov").map((e) => e.source.id));
  try {
    const r = await get(`https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(file.name.replace(/ virus$/, ""))}&pageSize=50&fields=NCTId,BriefTitle,OverallStatus,StudyFirstPostDate,LastUpdatePostDate,Phase`);
    for (const s of JSON.parse(r.text).studies ?? []) {
      const p = s.protocolSection;
      const id = p.identificationModule.nctId;
      console.log(`  ${cited.has(id) ? "cited  " : "NOT CITED"} ${id} ${p.statusModule.overallStatus} firstPosted=${p.statusModule.studyFirstPostDateStruct?.date} updated=${p.statusModule.lastUpdatePostDateStruct?.date} phase=${(p.designModule?.phases ?? []).join("/") || "-"} "${clip(p.identificationModule.briefTitle, 120)}"`);
    }
  } catch (e) {
    warn(`discover ${file.id}: ClinicalTrials.gov ${clip(e.message)}`);
  }
  for (const q of ["MBP134", "obeldesivir Bundibugyo", "ChAdOx1 BDBV"]) {
    try {
      const r = await get(`https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(q)}&pageSize=10&fields=NCTId,BriefTitle,OverallStatus,LastUpdatePostDate`);
      const j = JSON.parse(r.text);
      console.log(`  query "${q}": ${(j.studies ?? []).map((s) => `${s.protocolSection.identificationModule.nctId} ${s.protocolSection.statusModule.overallStatus} "${clip(s.protocolSection.identificationModule.briefTitle, 70)}"`).join(" | ") || "none"}`);
    } catch (e) {
      warn(`discover query ${q}: ${clip(e.message)}`);
    }
  }
  try {
    const r = await get("https://www.isrctn.com/api/query/format/default?q=Bundibugyo&limit=10");
    const ids = [...r.text.matchAll(/ISRCTN\d{8}/g)].map((m) => m[0]);
    console.log(`  ISRCTN ids in "Bundibugyo" query: ${[...new Set(ids)].join(", ") || "none"}`);
    const i = r.text.indexOf("Bundibugyo");
    console.log(`  ISRCTN xml near first match: ${clip(r.text.slice(Math.max(0, i - 600), i + 400).replace(/\s+/g, " "), 1000)}`);
  } catch (e) {
    warn(`discover ISRCTN: ${clip(e.message)}`);
  }
  try {
    const r = await get("https://www.isrctn.com/api/query/format/default?q=Bundibugyo&limit=10");
    for (const m of r.text.matchAll(/<isrctn dateAssigned="([^"]{10})[^"]*">(\d+)<\/isrctn>[\s\S]*?<title>([^<]*)<\/title>/g)) {
      console.log(`  ISRCTN${m[2]} assigned=${m[1]} "${clip(m[3], 140)}"`);
    }
  } catch (e) {
    warn(`discover ISRCTN titles: ${clip(e.message)}`);
  }
  try {
    const r = await get("https://cepi.net/news");
    for (const m of r.text.matchAll(/Bundibugyo/g)) {
      const before = r.text.slice(Math.max(0, m.index - 1500), m.index);
      const hrefs = [...before.matchAll(/href="([^"#]+)"/g)].map((h) => h[1]);
      const heading = clip(strip(r.text.slice(Math.max(0, m.index - 120), m.index + 120)), 200);
      if (hrefs.length) console.log(`  CEPI near "${heading}": nearest preceding href=${new URL(hrefs[hrefs.length - 1], "https://cepi.net").href}`);
    }
  } catch (e) {
    warn(`discover CEPI hrefs: ${clip(e.message)}`);
  }
  for (const [name, url] of [["CEPI news", "https://cepi.net/news"], ["WHO Blueprint", "https://www.who.int/teams/blueprint"]]) {
    try {
      const r = await get(url);
      const seen = new Set();
      for (const m of r.text.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]{0,600}?)<\/a>/g)) {
        const text = clip(strip(m[2]), 160);
        if (!/bundibugyo|ebola|andes/i.test(text) || seen.has(m[1])) continue;
        seen.add(m[1]);
        const around = strip(r.text.slice(Math.max(0, m.index - 400), m.index + m[0].length + 200));
        const date = (/\b\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) 2026\b/.exec(around) ?? [])[0] ?? "-";
        console.log(`  ${name}: date=${date} href=${new URL(m[1], url).href} "${text}"`);
        if (seen.size >= 25) break;
      }
    } catch (e) {
      warn(`discover ${name}: ${clip(e.message)}`);
    }
  }
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(resolve(DIR, f), "utf8")));
console.log(`# countermeasures check ${new Date().toISOString()} files=${files.length}`);
for (const file of files) {
  console.log(`FILE ${file.id} checked=${file.checked}`);
  if (file.statement) await checkLine(`${file.id} statement`, file.statement);
  for (const p of file.products) {
    for (const [i, e] of p.events.entries()) {
      console.log(`LINE ${file.id}/${p.id}#${i + 1} ${e.milestone} tier=${e.tier}`);
      await checkLine(`${file.id}/${p.id}#${i + 1}`, e);
    }
  }
  if (discover) await discoverFor(file);
}
console.log(`# done, ${warnings} warning(s)`);
