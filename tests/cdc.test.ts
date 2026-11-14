/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures are edited as loose JSON to build each bad case */
import { describe, it, expect } from "vitest";
import {
  buildReading,
  extractPageExcerpt,
  isCdcUrl,
  isoFromLongDate,
  parseCdcReading,
  serializeReading,
  snapshotFromReading,
} from "../scripts/lib/cdc.mjs";
import { archiveReportText, sha256, verifyCdcRaw } from "../scripts/lib/raw.mjs";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A page cut down to what the reader looks at, in the markup the CDC page uses (checked
// against the live page on 2026-11-02): the headline paragraph, the "Updated on" line and
// the U.S. Deaths table, whose 2026 cell is typed by hand and whose 2025 cell is filled by script.
const PAGE = `<html><head><title>Measles Cases and Outbreaks | CDC</title>
<script>var x = "As of May 1, 1999, 1 confirmed measles cases were reported in the United States in 1999.";</script></head><body>
<ul class="dfe-field"><li class="level-1">Updated on October 30, 2026.</li></ul>
<p>As of October 29, 2026, 100 confirmed* measles cases were reported in the United States in 2026. Among these, 97 measles cases were reported by 3 jurisdictions: Alpha, Beta, and Gamma. A total of 3 measles cases were reported among international visitors to the United States. </p>
<p>There have been 4 new outbreaks** reported in 2026, and 90% of confirmed cases (90 of 100) are outbreak-associated (60 from outbreaks starting in 2026 and 30 from outbreaks that started in 2025).</p>
<p>For the full year of 2025, a total of 2,289 confirmed* measles cases were reported in the United States.</p>
<h4>U.S. Deaths</h4>
<table class="table1"><caption class="sr-only d-none">U.S. Deaths</caption>
<thead><tr class="section-header"><th class="us-cases"></th><th class="us-cases"><h5><strong>2026</strong></h5></th><th class="us-cases"><h5><strong>2025</strong></h5></th></tr></thead>
<tbody><tr><td width="50%"><h5><strong>Total Deaths</strong></h5></td><td width="25%"><h5 style="font-weight: bold;">2*</h5></td><td><h5 id="2025_total_deaths" style="font-weight: bold;"></h5></td></tr></tbody></table>
</body></html>`;

const HOSP = {
  lastUpdated: "October 29, 2026",
  data: {
    "2026": {
      total_cases: ["100"],
      hospitalized_sentence: ["(11 of 100 cases)"],
      total_deaths: ["2"],
    },
    "2025": { total_cases: ["2,289"], total_deaths: ["3"] },
  },
};

// Three rows per jurisdiction, as the real file has (one per year).
const geo = (name: string, c26: number, c25: number) =>
  ["2024", "2025", "2026"].map((year) => ({ geography: name, year, cases_2026: String(c26), cases_2025: String(c25) }));
const MAP = {
  lastUpdated: "October 29, 2026",
  data: [...geo("Alpha", 60, 5), ...geo("Beta", 30, 0), ...geo("Gamma", 7, 1), ...geo("Delta", 0, 9)],
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** A fresh copy every time: buildReading keeps references into its inputs, and tests edit the result. */
function doc(overrides: { page?: object; hosp?: any; map?: any } = {}): any {
  const ex = extractPageExcerpt(PAGE);
  if (!ex.ok) throw new Error(ex.reason);
  return clone(
    buildReading({
      page: { ...ex.page, ...overrides.page },
      hosp: overrides.hosp ?? HOSP,
      map: overrides.map ?? MAP,
      year: 2026,
    }),
  );
}

describe("extractPageExcerpt", () => {
  it("takes the headline, the update line and the deaths row out of the page", () => {
    const ex = extractPageExcerpt(PAGE);
    expect(ex.ok).toBe(true);
    if (!ex.ok) return;
    expect(ex.page.headline.startsWith("As of October 29, 2026, 100 confirmed* measles cases")).toBe(true);
    expect(ex.page.headline.endsWith("started in 2025).")).toBe(true);
    expect(ex.page.headline).not.toMatch(/full year of 2025/); // stops at the outbreaks sentence
    expect(ex.page.updated).toBe("October 30, 2026");
    expect(ex.page.deaths).toEqual({ header: ["", "2026", "2025"], row: ["Total Deaths", "2*", ""] });
  });

  it("ignores text inside scripts", () => {
    const ex = extractPageExcerpt(PAGE);
    expect(ex.ok && ex.page.headline).not.toMatch(/1999/);
  });

  it("decodes entities and ends at the visitors sentence when there is no outbreaks sentence", () => {
    const html = PAGE.replace(/<p>There have been[\s\S]*?<\/p>/, "").replace("cases were reported by", "cases&nbsp;were reported by");
    const ex = extractPageExcerpt(html);
    expect(ex.ok && ex.page.headline.endsWith("international visitors to the United States.")).toBe(true);
    expect(ex.ok && ex.page.headline).toMatch(/cases were reported by 3 jurisdictions/);
  });

  it("fails with a reason when the layout changes", () => {
    expect(extractPageExcerpt("")).toEqual({ ok: false, reason: "empty page" });
    expect(extractPageExcerpt(PAGE.replace("confirmed* measles cases were", "confirmed cases were"))).toMatchObject({
      ok: false,
      reason: /As of <date>/,
    });
    expect(extractPageExcerpt(PAGE.replace(/A total of 3[^<]*international visitors[^<]*\./, "").replace(/<p>There have been[\s\S]*?<\/p>/, ""))).toMatchObject({
      ok: false,
      reason: /international-visitors or outbreaks/,
    });
    expect(extractPageExcerpt(PAGE.replace(/Total Deaths/g, "Deaths"))).toMatchObject({ ok: false, reason: /Total Deaths/ });
    expect(extractPageExcerpt(PAGE.replace(/<th[^>]*>\s*<h5><strong>20\d\d<\/strong><\/h5>\s*<\/th>/g, "<th></th>"))).toMatchObject({
      ok: false,
      reason: /year columns/,
    });
  });
});

describe("parseCdcReading", () => {
  it("reads the totals, the displayed deaths and the jurisdictions", () => {
    const r = parseCdcReading(doc(), { nowISO: "2026-11-02T08:00:00Z" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reading).toMatchObject({
      asOf: "2026-10-29",
      updated: "2026-10-30",
      year: 2026,
      confirmed: 100,
      deaths: 2,
      deathsDataFile: 2,
      residents: 97,
      jurisdictions: 3,
      visitors: 3,
      hospitalized: { count: 11, of: 100 },
      newOutbreaks: 4,
      outbreakAssociated: { count: 90, of: 100 },
    });
    // Delta has no cases in 2026, so it is not a jurisdiction with cases; most cases first.
    expect(r.reading.states).toEqual([
      { name: "Alpha", cases: 60 },
      { name: "Beta", cases: 30 },
      { name: "Gamma", cases: 7 },
    ]);
    expect(r.notes).toEqual([]);
  });

  it("tracks the figure the page displays and notes a different one in the data file", () => {
    const hosp = clone(HOSP);
    hosp.data["2026"].total_deaths = ["5"];
    const r = parseCdcReading(doc({ hosp }));
    expect(r.ok && r.reading.deaths).toBe(2);
    expect(r.ok && r.reading.deathsDataFile).toBe(5);
    expect(r.ok && r.notes).toEqual([expect.stringMatching(/displays 2 deaths for 2026.*lists 5/)]);
  });

  it("accepts a page with no deaths file entry, singular wording and no visitors", () => {
    const hosp: any = clone(HOSP);
    delete hosp.data["2026"].total_deaths;
    expect(parseCdcReading(doc({ hosp }))).toMatchObject({ ok: true, reading: { deathsDataFile: null } });

    const one = doc();
    one.page.headline = one.page.headline
      .replace("100 confirmed", "98 confirmed")
      .replace("A total of 3 measles cases were", "A total of 1 measles case was");
    const hosp98: any = clone(HOSP);
    hosp98.data["2026"].total_cases = ["98"];
    hosp98.data["2026"].hospitalized_sentence = ["(11 of 98 cases)"];
    one.hosp.data = hosp98.data["2026"];
    expect(parseCdcReading(one)).toMatchObject({ ok: true, reading: { confirmed: 98, visitors: 1 } });

    const none = doc();
    none.page.headline = none.page.headline.replace("100 confirmed", "97 confirmed").replace(/ A total of 3[^.]*\./, "");
    none.hosp.data.total_cases = ["97"];
    none.hosp.data.hospitalized_sentence = ["(11 of 97 cases)"];
    expect(parseCdcReading(none)).toMatchObject({ ok: true, reading: { confirmed: 97, visitors: 0 } });
  });

  it("rejects readings whose documents disagree", () => {
    const total = doc();
    total.hosp.data.total_cases = ["101"];
    expect(parseCdcReading(total)).toEqual({ ok: false, reason: "total differs: page 100, measles_hosp.json 101" });

    const sum = doc();
    sum.page.headline = sum.page.headline.replace("100 confirmed", "101 confirmed");
    expect(parseCdcReading(sum)).toMatchObject({ ok: false, reason: /does not add up: 97 from jurisdictions \+ 3 international visitors != 101/ });

    const states = doc();
    states.map.cases.Alpha = "61";
    expect(parseCdcReading(states)).toEqual({ ok: false, reason: "the jurisdictions add up to 98, the page says 97" });

    const count = doc();
    count.page.headline = count.page.headline.replace("by 3 jurisdictions", "by 4 jurisdictions");
    expect(parseCdcReading(count)).toMatchObject({ ok: false, reason: /3 jurisdictions have cases.*page says 4/ });

    const hospDate = doc();
    hospDate.hosp.lastUpdated = "October 22, 2026";
    expect(parseCdcReading(hospDate)).toMatchObject({ ok: false, reason: /measles_hosp.json is dated 2026-10-22/ });

    const mapDate = doc();
    mapDate.map.lastUpdated = "October 22, 2026";
    expect(parseCdcReading(mapDate)).toMatchObject({ ok: false, reason: /MeaslesCasesMap.json is dated 2026-10-22/ });

    const hospOf = doc();
    hospOf.hosp.data.hospitalized_sentence = ["(11 of 90 cases)"];
    expect(parseCdcReading(hospOf)).toMatchObject({ ok: false, reason: /hospitalisations are out of 90 cases/ });
  });

  it("rejects an unreadable or impossible deaths cell", () => {
    const text = doc({ page: { deaths: { header: ["", "2026", "2025"], row: ["Total Deaths", "pending", ""] } } });
    expect(parseCdcReading(text)).toMatchObject({ ok: false, reason: /Total Deaths cell for 2026 is "pending"/ });
    const blank = doc({ page: { deaths: { header: ["", "2025"], row: ["Total Deaths", "3"] } } });
    expect(parseCdcReading(blank)).toMatchObject({ ok: false, reason: /Total Deaths cell for 2026 is null/ });
    const many = doc({ page: { deaths: { header: ["", "2026", "2025"], row: ["Total Deaths", "101*", ""] } } });
    expect(parseCdcReading(many)).toMatchObject({ ok: false, reason: /deaths \(101\) exceed confirmed cases \(100\)/ });
  });

  it("flags a page that has moved on to another year, with a code", () => {
    const next = doc();
    next.page.headline = next.page.headline.replace(/in 2026\./, "in 2027.");
    expect(parseCdcReading(next)).toEqual({ ok: false, reason: "the page now reports 2027, not 2026", code: "other-year" });
  });

  it("rejects a date in the future and a date that does not exist", () => {
    expect(parseCdcReading(doc(), { nowISO: "2026-10-27T08:00:00Z" })).toMatchObject({ ok: false, reason: /in the future/ });
    expect(parseCdcReading(doc(), { nowISO: "2026-10-28T08:00:00Z" }).ok).toBe(true); // a day of leeway
    const bad = doc();
    bad.page.headline = bad.page.headline.replace("October 29", "February 30");
    expect(parseCdcReading(bad)).toMatchObject({ ok: false, reason: /invalid date/ });
  });

  it("rejects an incomplete document instead of guessing", () => {
    expect(parseCdcReading(null)).toMatchObject({ ok: false });
    expect(parseCdcReading({ year: 2026 })).toMatchObject({ ok: false, reason: /headline/ });
    const noMap = doc();
    noMap.map.cases = {};
    expect(parseCdcReading(noMap)).toMatchObject({ ok: false, reason: /MeaslesCasesMap.json has no jurisdictions/ });
    const noHosp = doc();
    noHosp.hosp.data = null;
    expect(parseCdcReading(noHosp)).toMatchObject({ ok: false, reason: /measles_hosp.json has no data/ });
    const junk = doc();
    junk.map.cases.Alpha = "a lot";
    expect(parseCdcReading(junk)).toMatchObject({ ok: false, reason: /unreadable case count for Alpha/ });
  });
});

describe("archived form", () => {
  it("re-parses to the same reading after a JSON round trip", () => {
    const original = doc();
    const text = serializeReading(original);
    expect(text.endsWith("\n")).toBe(true);
    expect(parseCdcReading(JSON.parse(text))).toEqual(parseCdcReading(original));
  });

  it("is identical for identical content, so a repeat fetch makes no new file", () => {
    expect(serializeReading(doc())).toBe(serializeReading(doc()));
  });
});

describe("snapshotFromReading", () => {
  it("dates the snapshot by the day the counts run to and leaves suspected and recovered empty", () => {
    const r = parseCdcReading(doc());
    if (!r.ok) throw new Error(r.reason);
    expect(snapshotFromReading(r.reading, { source: "CDC", pageUrl: "https://www.cdc.gov/measles/data-research/index.html" })).toEqual({
      date: "2026-10-29",
      confirmed: 100,
      suspected: null,
      deaths: 2,
      deathsDataFile: r.reading.deathsDataFile,
      recovered: null,
      source: "CDC",
      sourceUrl: "https://www.cdc.gov/measles/data-research/index.html",
    });
    expect(typeof r.reading.deathsDataFile).toBe("number");
  });
});

describe("isoFromLongDate / isCdcUrl", () => {
  it("reads 'Month D, YYYY' and nothing else", () => {
    expect(isoFromLongDate("October 29, 2026")).toBe("2026-10-29");
    expect(isoFromLongDate("March 1, 2026")).toBe("2026-03-01");
    for (const bad of ["Oct 29, 2026", "October 32, 2026", "February 30, 2026", "2026-10-29", "", null, undefined]) {
      expect(isoFromLongDate(bad as string), String(bad)).toBeNull();
    }
  });

  it("accepts only https on www.cdc.gov", () => {
    expect(isCdcUrl("https://www.cdc.gov/wcms/vizdata/measles/measles_hosp.json")).toBe(true);
    for (const bad of ["http://www.cdc.gov/x", "https://cdc.gov/x", "https://www.cdc.gov.evil.example/x", "https://evil.example/www.cdc.gov", "not a url"]) {
      expect(isCdcUrl(bad), bad).toBe(false);
    }
  });
});

describe("verifyCdcRaw (the archived reading)", () => {
  const snap = { date: "2026-10-29", confirmed: 100, deaths: 2 };

  it("accepts the archived text of the snapshot it was stored for, with its checksum", () => {
    const text = serializeReading(doc());
    expect(verifyCdcRaw({ ...snap, rawSha256: sha256(text) }, text)).toEqual({ ok: true });
    expect(verifyCdcRaw(snap, text)).toEqual({ ok: true }); // a snapshot without a checksum is still re-parsed
  });

  it("re-checks the data file's deaths when the snapshot stores them, and older snapshots without them", () => {
    const text = serializeReading(doc());
    const r = parseCdcReading(doc());
    if (!r.ok) throw new Error(r.reason);
    expect(verifyCdcRaw({ ...snap, deathsDataFile: r.reading.deathsDataFile }, text)).toEqual({ ok: true });
    expect(verifyCdcRaw({ ...snap, deathsDataFile: 999 }, text)).toMatchObject({ ok: false, reason: /deathsDataFile: raw parses to/ });
  });

  it("rejects text that was edited, is not JSON, or no longer cross-checks", () => {
    const text = serializeReading(doc());
    expect(verifyCdcRaw({ ...snap, rawSha256: sha256(text) }, text.replace('"Alpha": "60"', '"Alpha": "61"'))).toEqual({
      ok: false,
      reason: "sha256 of raw text does not match rawSha256",
    });
    expect(verifyCdcRaw(snap, "As of October 29, 2026 ...")).toMatchObject({ ok: false, reason: /not JSON/ });
    expect(verifyCdcRaw(snap, text.replace('"Alpha": "60"', '"Alpha": "61"'))).toMatchObject({
      ok: false,
      reason: /does not parse as a CDC reading: the jurisdictions add up to 98/,
    });
  });

  it("rejects a reading that parses to different numbers than the snapshot", () => {
    const text = serializeReading(doc());
    expect(verifyCdcRaw({ ...snap, date: "2026-10-22" }, text)).toMatchObject({ ok: false, reason: /date: raw parses to 2026-10-29/ });
    expect(verifyCdcRaw({ ...snap, confirmed: 99 }, text)).toMatchObject({ ok: false, reason: /confirmed: raw parses to 100/ });
    expect(verifyCdcRaw({ ...snap, deaths: 3 }, text)).toMatchObject({ ok: false, reason: /deaths: raw parses to 2/ });
    expect(verifyCdcRaw(snap, undefined as unknown as string)).toEqual({ ok: false, reason: "no raw text" });
  });

  it("is written once under data/raw/report, named by source, date and checksum", () => {
    const root = mkdtempSync(join(tmpdir(), "cdc-raw-"));
    try {
      const text = serializeReading(doc());
      const first = archiveReportText(root, "cdc-measles-us", "2026-10-29", text);
      expect(first).toMatchObject({ ok: true, written: true });
      if (!first.ok) return;
      expect(first.rawPath).toBe(`data/raw/report/cdc-measles-us-2026-10-29-${sha256(text).slice(0, 12)}.txt`);
      expect(readFileSync(join(root, first.rawPath), "utf8")).toBe(text);
      expect(archiveReportText(root, "cdc-measles-us", "2026-10-29", text)).toMatchObject({ ok: true, written: false });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
