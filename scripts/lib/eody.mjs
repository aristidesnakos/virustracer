// Pure helpers for reading the weekly West Nile virus report of Greece's National
// Public Health Organisation (EODY / NPHO). No network, no fs, no child processes:
// scripts/update-toll.mjs fetches the RSS feed and the PDF and runs `pdftotext -layout`;
// these functions only read the text. Unit-tested in tests/eody.test.ts.
//
// The report is a PDF published every week of the transmission season (July to
// November), announced in EODY's "Ανακοινώσεις" (announcements) RSS feed. Most weeks
// it is in Greek; some early-season weeks it is in English. Both state the season
// totals twice: in a sentence ("up to 01/10/2026 ... (423) ... cases"; "(41) deaths")
// and in Table 1 (neuroinvasive, other, total, deaths). A reading is accepted only
// when the two agree, so a misread number cannot slip through on its own.

/**
 * @typedef {Object} ReportItem
 * @property {string} title
 * @property {string} pdfUrl      Absolute URL of the report PDF
 * @property {string} reportDate  YYYY-MM-DD from the item title
 * @property {string} [pageUrl]   The announcement page
 */

/**
 * @typedef {Object} ParsedReport
 * @property {string} asOf          YYYY-MM-DD the totals run to ("up to" date)
 * @property {number} confirmed     Laboratory-diagnosed locally acquired cases, season to date
 * @property {number} deaths        Deaths among them attributed to the virus
 * @property {number} neuroinvasive Cases with central nervous system disease (encephalitis, meningitis, paralysis)
 */

const decodeXml = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/**
 * Read an EODY RSS feed: how many items it has at all, the report items whose title
 * contains `titleIncludes` (newest report first), and how many such items could NOT be
 * read. The date comes from the title ("..., 01-10-2026"), the PDF from the first .pdf
 * link in the description, which must be an https EODY URL. An unreadable matching item
 * means the format changed: the caller must not mistake it for "no new report".
 * @param {string} xml
 * @param {string} titleIncludes
 * @returns {{itemCount: number, items: ReportItem[], unreadable: number}}
 */
export function inspectReportFeed(xml, titleIncludes) {
  const out = { itemCount: 0, items: /** @type {ReportItem[]} */ ([]), unreadable: 0 };
  if (typeof xml !== "string") return out;
  for (const chunk of xml.split(/<item\b[^>]*>/i).slice(1)) {
    out.itemCount++;
    const body = chunk.split(/<\/item>/i)[0];
    const title = decodeXml(body.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
    if (!title.includes(titleIncludes)) continue;
    const item = readItem(body, title);
    if (item) out.items.push(item);
    else out.unreadable++;
  }
  out.items.sort((a, b) => b.reportDate.localeCompare(a.reportDate));
  return out;
}

/** One matching feed item, or null when it cannot be read safely. */
function readItem(body, title) {
  // A title is logged by the workflow; a control character there could forge a runner command.
  if (/[\u0000-\u001f\u007f]/.test(title)) return null;
  const date = title.match(/(\d{2})-(\d{2})-(\d{4})\s*$/);
  const description = decodeXml(body.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? "");
  const href = description.match(/href="([^"]+?\.pdf)"/i)?.[1];
  if (!date || !href) return null;
  let pdfUrl;
  try {
    pdfUrl = new URL(href, "https://eody.gov.gr/").toString();
  } catch {
    return null;
  }
  // The link is shown on the site under EODY's name and fetched by the runner: EODY only.
  if (!isEodyUrl(pdfUrl)) return null;
  const pageUrl = decodeXml(body.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? "").trim() || undefined;
  return { title, pdfUrl, reportDate: `${date[3]}-${date[2]}-${date[1]}`, ...(pageUrl ? { pageUrl } : {}) };
}

/**
 * The readable report items of an EODY RSS feed, newest report first (see inspectReportFeed).
 * @param {string} xml
 * @param {string} titleIncludes
 * @returns {ReportItem[]}
 */
export function parseReportFeed(xml, titleIncludes) {
  return inspectReportFeed(xml, titleIncludes).items;
}

/** A URL in one canonical spelling (percent-encoding, host case), for comparing; the input when it does not parse. */
export function normalizeUrl(url) {
  try {
    return new URL(url).toString();
  } catch {
    return String(url);
  }
}

/** EODY's own hosts, the only ones a report may be read from or linked to. */
export const EODY_HOSTS = ["eody.gov.gr", "www.eody.gov.gr"];

/** True for an https URL on an EODY host. */
export function isEodyUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && EODY_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

const int = (s) => Number.parseInt(s, 10);

/**
 * Read the season totals from the text of one weekly report (`pdftotext -layout`
 * output, Greek or English). Returns ok:false with a reason when the text does not
 * have the expected sentence and table, or when they disagree.
 * `nowISO`, when given, rejects a report dated in the future (more than a day ahead),
 * which would otherwise block every later report as "lower totals".
 * @param {string} text
 * @param {string} [nowISO]
 * @returns {{ok: true, report: ParsedReport} | {ok: false, reason: string}}
 */
export function parseReportText(text, nowISO) {
  if (typeof text !== "string" || text.trim() === "") return { ok: false, reason: "empty report text" };
  const flat = text.replace(/\s+/g, " ");

  // "μέχρι (τις) 01/10/2026" / "up to 15/07/2026": the first one is the summary sentence.
  const date = flat.match(/(?:μέχρι(?: τις)?|up to) (\d{2})\/(\d{2})\/(20\d{2})/);
  if (!date) return { ok: false, reason: "no 'up to DD/MM/YYYY' date in the summary" };
  const asOf = `${date[3]}-${date[2]}-${date[1]}`;
  if (Number.isNaN(Date.parse(asOf))) return { ok: false, reason: `invalid report date ${asOf}` };
  if (nowISO && Date.parse(asOf) > Date.parse(nowISO.slice(0, 10)) + 86_400_000) {
    return { ok: false, reason: `report date ${asOf} is in the future` };
  }

  // "συνολικά τετρακόσια είκοσι τρία (423) εγχώρια κρούσματα" / "seven (7) laboratory diagnosed locally acquired cases"
  const casesM = flat.match(/\((\d+)\) (?:εγχώρια κρούσματα|laboratory diagnosed locally acquired cases)/);
  if (!casesM) return { ok: false, reason: "no season case total in the summary sentence" };
  const sentenceCases = int(casesM[1]);

  // "σαράντα ένας (41) θάνατοι" / "thirty-six (36) deaths"; early weeks say there were none.
  const deathsM = flat.match(/\((\d+)\) (?:θάνατ|deaths?\b)/);
  const noDeaths = /No deaths have been recorded|Δεν έχει καταγραφεί κανένας θάνατος|Δεν έχουν καταγραφεί θάνατοι/.test(flat);
  if (!deathsM && !noDeaths) return { ok: false, reason: "no death count in the summary" };
  const sentenceDeaths = deathsM ? int(deathsM[1]) : 0;

  // Table 1: the first line after its caption ending in four counts
  // (neuroinvasive, without CNS disease, total, deaths).
  const caption = text.search(/Πίνακας 1|Table 1\./);
  if (caption === -1) return { ok: false, reason: "no Table 1" };
  const row = text
    .slice(caption)
    .split(/\r?\n/)
    .map((l) => l.match(/(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/))
    .find(Boolean);
  if (!row) return { ok: false, reason: "no row of four counts in Table 1" };
  const [neuroinvasive, other, total, tableDeaths] = row.slice(1, 5).map(int);

  if (neuroinvasive + other !== total) {
    return { ok: false, reason: `Table 1 does not add up: ${neuroinvasive} + ${other} != ${total}` };
  }
  if (total !== sentenceCases) {
    return { ok: false, reason: `case total differs: sentence ${sentenceCases}, Table 1 ${total}` };
  }
  if (tableDeaths !== sentenceDeaths) {
    return { ok: false, reason: `death count differs: sentence ${sentenceDeaths}, Table 1 ${tableDeaths}` };
  }
  if (tableDeaths > total) return { ok: false, reason: `deaths (${tableDeaths}) exceed cases (${total})` };
  return { ok: true, report: { asOf, confirmed: total, deaths: tableDeaths, neuroinvasive } };
}

export const REPORT_RAW_DIR = "data/raw/report";

/**
 * Repo-relative archive path for one report's text: the source, the date its totals
 * run to and the first 12 hex digits of the text's SHA-256, so a reissued report for
 * the same date gets its own file instead of clashing with the first.
 * @param {string} prefix  e.g. "eody-wnv"
 * @param {string} asOf    YYYY-MM-DD
 * @param {string} sha256  hex digest of the text
 */
export function reportRawRelPath(prefix, asOf, sha256) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(prefix)) throw new Error(`invalid raw prefix: ${prefix}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error(`invalid date: ${asOf}`);
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error("invalid sha256");
  return `${REPORT_RAW_DIR}/${prefix}-${asOf}-${sha256.slice(0, 12)}.txt`;
}

/**
 * Days without a new weekly report after which the season counts as over. EODY reports
 * every week while the virus circulates (July to November), so three missed weeks
 * means the reports have stopped, not that one week was late.
 */
export const SEASON_OVER_AFTER_DAYS = 21;

/**
 * Whether the season's reports have stopped: a report has been stored, and the newest
 * one runs to a date more than SEASON_OVER_AFTER_DAYS before `nowISO`. Before the first
 * report it is never over (the season has not started).
 * @param {string|null} lastReportDate  YYYY-MM-DD of the newest stored report
 * @param {string} nowISO
 */
export function seasonIsOver(lastReportDate, nowISO) {
  if (!lastReportDate) return false;
  const days = (Date.parse(nowISO.slice(0, 10)) - Date.parse(lastReportDate)) / 86_400_000;
  return Number.isFinite(days) && days > SEASON_OVER_AFTER_DAYS;
}
