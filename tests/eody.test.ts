import { describe, it, expect } from "vitest";
import {
  inspectReportFeed,
  isEodyUrl,
  normalizeUrl,
  parseReportFeed,
  parseReportText,
  reportRawRelPath,
  seasonIsOver,
  SEASON_OVER_AFTER_DAYS,
} from "../scripts/lib/eody.mjs";

// Excerpts of real `pdftotext -layout` output (EODY reports of 1 Oct and 15 Jul 2026).
const GREEK = `
Από την αρχή της περιόδου 2026, μέχρι 01/10/2026 (έως τις 11.00πμ), έχουν διαγνωστεί και δηλωθεί
συνολικά τετρακόσια είκοσι τρία (423) εγχώρια κρούσματα λοίμωξης από τον ιό του Δυτικού Νείλου στην
Ελλάδα, εκ των οποίων τα διακόσια εβδομήντα ένα (271) κρούσματα παρουσίασαν εκδηλώσεις από το
Κεντρικό Νευρικό Σύστημα (ΚΝΣ, εγκεφαλίτιδα ή/και μηνιγγίτιδα ή/και οξεία χαλαρή παράλυση) και
εκατόν πενήντα δύο (152) κρούσματα είχαν ήπιες εκδηλώσεις/ δεν είχαν εκδηλώσεις από το ΚΝΣ (Πίνακας
1). Κατά τη διάρκεια της τελευταίας εβδομάδας, διαγνώσθηκαν/ δηλώθηκαν 27 νέα εγχώρια κρούσματα.
Συνολικά, κατά την περίοδο 2026, έως 01/10/2026, έχουν καταγραφεί σαράντα ένας (41) θάνατοι σε
ασθενείς με λοίμωξη από τον ιό, ηλικίας άνω των 60 ετών (διάμεση ηλικία θανόντων: 83 έτη, εύρος: 61 -
92 έτη).

Πίνακας 1: Αριθμός εγχώριων δηλωθέντων περιστατικών με εργαστηριακή διάγνωση λοίμωξης από τον
ιό του Δυτικού Νείλου, με και χωρίς εκδηλώσεις από το Κεντρικό Νευρικό Σύστημα (ΚΝΣ), Ελλάδα, 2026,
έως 01/10/2026

                                       Αριθμός          Αριθμός
                                   περιστατικών με περιστατικών χωρίς                 Σύνολο              Αριθμός
    Αριθμός περιστατικών
                                          271                     152                    423                 41
    και θανόντων
`;

const ENGLISH = `
In 2026 period, up to 15/07/2026, seven (7) laboratory diagnosed locally acquired cases of WNV infection
have been reported to NPHO, six (6) of which presented with neuro-invasive disease (WNND, encephalitis
and/or meningitis and/or acute flaccid paralysis) and one (1) case with mild symptoms (e.g., febrile
syndrome) (Table 1). No deaths have been recorded.
Table 1. Number of reported locally acquired cases of WNV disease, with and without central nervous
system (CNS) manifestations, Greece, period 2026, up to 15/07/2026

 Number of WNV cases
 and deaths                                       6                               1                 7                0
`;

describe("parseReportText", () => {
  it("reads a Greek report, cross-checked against Table 1", () => {
    expect(parseReportText(GREEK)).toEqual({
      ok: true,
      report: { asOf: "2026-10-01", confirmed: 423, deaths: 41, neuroinvasive: 271 },
    });
  });

  it("reads an English report, including the early weeks with no deaths", () => {
    expect(parseReportText(ENGLISH)).toEqual({
      ok: true,
      report: { asOf: "2026-07-15", confirmed: 7, deaths: 0, neuroinvasive: 6 },
    });
  });

  it("reads the Greek 'no deaths' wording and 'μέχρι τις'", () => {
    const text = GREEK.replace("μέχρι 01/10/2026", "μέχρι τις 01/10/2026")
      .replace(/Συνολικά, κατά[\s\S]*?92 έτη\)\./, "Δεν έχει καταγραφεί κανένας θάνατος ασθενούς με λοίμωξη από τον ιό.")
      .replace(/423 {17}41/, "423                 0");
    expect(parseReportText(text)).toMatchObject({ ok: true, report: { asOf: "2026-10-01", deaths: 0 } });
  });

  it("rejects a report whose sentence and table disagree", () => {
    expect(parseReportText(GREEK.replace("(423)", "(432)"))).toEqual({
      ok: false,
      reason: "case total differs: sentence 432, Table 1 423",
    });
    expect(parseReportText(GREEK.replace("(41)", "(14)"))).toMatchObject({ ok: false, reason: /death count differs/ });
  });

  it("rejects a report dated in the future", () => {
    expect(parseReportText(GREEK, "2026-09-29T08:00:00Z")).toEqual({
      ok: false,
      reason: "report date 2026-10-01 is in the future",
    });
    expect(parseReportText(GREEK, "2026-09-30T08:00:00Z").ok).toBe(true); // a day of leeway
  });

  it("rejects a table that does not add up", () => {
    expect(parseReportText(GREEK.replace(/271 {21}152/, "270                     152"))).toMatchObject({
      ok: false,
      reason: /does not add up/,
    });
  });

  it("fails loudly, not silently, when the format changes", () => {
    expect(parseReportText("")).toMatchObject({ ok: false });
    expect(parseReportText(GREEK.replace(/μέχρι/g, "έως"))).toMatchObject({ ok: false, reason: /date/ });
    expect(parseReportText(GREEK.replace("εγχώρια κρούσματα", "κρούσματα"))).toMatchObject({ ok: false, reason: /case total/ });
    expect(parseReportText(GREEK.replace("Πίνακας 1", "Πίνακας"))).toMatchObject({ ok: false, reason: /Table 1/ });
  });
});

const FEED = `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel>
<item>
  <title>Εβδομαδιαία έκθεση επιτήρησης αναπνευστικών λοιμώξεων</title>
  <link>https://eody.gov.gr/el/anakoinoseis/other.html</link>
  <description><![CDATA[<p><a href="https://eody.gov.gr/images/other.pdf">x</a></p>]]></description>
</item>
<item>
  <title>Εβδομαδιαία έκθεση επιτήρησης της λοίμωξης από ιό του Δυτικού Νείλου, 24-09-2026</title>
  <link>https://eody.gov.gr/el/anakoinoseis/wnv-24-09.html</link>
  <description><![CDATA[<p><a href="/images/%CE%95%CE%B2%CE%B4_24_09_2026.pdf" class="post-link">r</a></p>]]></description>
</item>
<item>
  <title>Εβδομαδιαία έκθεση επιτήρησης της λοίμωξης από ιό του Δυτικού Νείλου, 01-10-2026</title>
  <link>https://eody.gov.gr/el/anakoinoseis/wnv-01-10.html</link>
  <description><![CDATA[<p><a href="https://eody.gov.gr/images/%CE%95%CE%B2%CE%B4_01_10_2026.pdf" class="post-link">r</a></p>]]></description>
</item>
<item>
  <title>Εβδομαδιαία έκθεση επιτήρησης της λοίμωξης από ιό του Δυτικού Νείλου, 17-09-2026</title>
  <description>no link here</description>
</item>
</channel></rss>`;

describe("parseReportFeed", () => {
  it("keeps the matching reports with a PDF, newest first, with absolute URLs", () => {
    expect(parseReportFeed(FEED, "Δυτικού Νείλου")).toEqual([
      {
        title: "Εβδομαδιαία έκθεση επιτήρησης της λοίμωξης από ιό του Δυτικού Νείλου, 01-10-2026",
        pdfUrl: "https://eody.gov.gr/images/%CE%95%CE%B2%CE%B4_01_10_2026.pdf",
        reportDate: "2026-10-01",
        pageUrl: "https://eody.gov.gr/el/anakoinoseis/wnv-01-10.html",
      },
      {
        title: "Εβδομαδιαία έκθεση επιτήρησης της λοίμωξης από ιό του Δυτικού Νείλου, 24-09-2026",
        pdfUrl: "https://eody.gov.gr/images/%CE%95%CE%B2%CE%B4_24_09_2026.pdf",
        reportDate: "2026-09-24",
        pageUrl: "https://eody.gov.gr/el/anakoinoseis/wnv-24-09.html",
      },
    ]);
  });

  it("drops items whose PDF is not an https EODY link, or whose title has control characters", () => {
    const evil = FEED.replace(
      "https://eody.gov.gr/images/%CE%95%CE%B2%CE%B4_01_10_2026.pdf",
      "https://evil.example/report.pdf",
    ).replace("Νείλου, 24-09-2026", "Νείλου\n::error::forged, 24-09-2026");
    expect(parseReportFeed(evil, "Δυτικού Νείλου")).toEqual([]);
    expect(isEodyUrl("https://www.eody.gov.gr/images/x.pdf")).toBe(true);
    expect(isEodyUrl("http://eody.gov.gr/images/x.pdf")).toBe(false);
    expect(isEodyUrl("https://eody.gov.gr.evil.example/x.pdf")).toBe(false);
    expect(isEodyUrl("data:application/pdf;base64,AAAA")).toBe(false);
  });

  it("counts matching items it could not read, so a format change is never taken for 'no reports'", () => {
    expect(inspectReportFeed(FEED, "Δυτικού Νείλου")).toMatchObject({ itemCount: 4, unreadable: 1 });
    const changed = FEED.replace("Νείλου, 01-10-2026", "Νείλου, 1/10/2026");
    expect(inspectReportFeed(changed, "Δυτικού Νείλου")).toMatchObject({ unreadable: 2 });
    expect(inspectReportFeed("<html>maintenance</html>", "Δυτικού Νείλου")).toEqual({ itemCount: 0, items: [], unreadable: 0 });
  });

  it("compares URLs in one spelling", () => {
    expect(normalizeUrl("https://eody.gov.gr/images/Εβδ_01_10_2026.pdf")).toBe(
      "https://eody.gov.gr/images/%CE%95%CE%B2%CE%B4_01_10_2026.pdf",
    );
  });

  it("returns nothing for junk", () => {
    expect(parseReportFeed("not xml", "Δυτικού Νείλου")).toEqual([]);
    expect(parseReportFeed(undefined as unknown as string, "x")).toEqual([]);
  });
});

describe("reportRawRelPath", () => {
  it("names the file by source, date and checksum", () => {
    expect(reportRawRelPath("eody-wnv", "2026-10-01", "a".repeat(64))).toBe(
      "data/raw/report/eody-wnv-2026-10-01-aaaaaaaaaaaa.txt",
    );
    expect(() => reportRawRelPath("../x", "2026-10-01", "a".repeat(64))).toThrow();
    expect(() => reportRawRelPath("eody-wnv", "1 Oct", "a".repeat(64))).toThrow();
  });
});

describe("seasonIsOver", () => {
  it(`is over only after ${SEASON_OVER_AFTER_DAYS} days without a new report`, () => {
    expect(seasonIsOver("2026-10-01", "2026-10-22T05:30:00Z")).toBe(false); // 21 days
    expect(seasonIsOver("2026-10-01", "2026-10-23T05:30:00Z")).toBe(true); // 22 days
  });

  it("is never over before the first report", () => {
    expect(seasonIsOver(null, "2026-12-31T00:00:00Z")).toBe(false);
  });
});
