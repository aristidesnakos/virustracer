import Link from "next/link";
import { PROSE_H2, PROSE_LINK, PROSE_P } from "@/components/StaticPage";
import {
  CITATIONS_API_PATH,
  INFECTION_CONTROL_PATH,
  NURSING_HOMES_API_PATH,
  NURSING_HOMES_PATH,
  RESPIRATORY_API_PATH,
  RESPIRATORY_PATH,
  THIN_REPORTING_SHARE,
  longDate,
} from "@/lib/nursing-homes";
import { getF880Index, getRespiratoryCounts, getRespiratoryRates } from "@/lib/nursing-homes-data";
import { CITATIONS_ATTRIBUTION, RESPIRATORY_ATTRIBUTION } from "@/lib/nursing-homes-api";

// The nursing-home layer's sections on the shared pages (/data, /methodology, home), kept
// in one file so those pages each gain one import and one element.

const P = "text-[0.9375rem] leading-relaxed text-ink-muted";
const LINK = "font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent";

const ENDPOINTS = [
  {
    path: NURSING_HOMES_API_PATH,
    what: "The datasets in this layer, their sources and how fresh each one is.",
    params: [] as [string, string][],
    example: NURSING_HOMES_API_PATH,
  },
  {
    path: RESPIRATORY_API_PATH,
    what: "Weekly COVID-19, influenza and RSV cases and hospitalisations among nursing-home residents, by state and nationally (CDC NHSN). series=counts (default): counts, residents and reporting homes from CDC's open dataset, with rates per 100,000 residents computed from them. series=rates: CDC's dashboard rates per 100,000 residents, fresher but without counts. Null is missing data, never zero.",
    params: [
      ["series", "counts (default) or rates."],
      ["state", "Two-letter state or territory code, or USA for the nation."],
      ["from, to", "Inclusive range of week-ending dates (Sundays), YYYY-MM-DD."],
      ["format", "json (default) or csv."],
    ] as [string, string][],
    example: `${RESPIRATORY_API_PATH}?series=rates&state=USA&format=csv`,
  },
  {
    path: CITATIONS_API_PATH,
    what: "Nursing homes cited for an infection-control deficiency (CMS tag F880), one row per citation, with survey date, scope/severity, complaint or standard survey, correction status, dispute flags, the CMS release it came from and a Medicare Care Compare link. Without state or ccn it returns the per-state summary.",
    params: [
      ["state", "Two-letter state or territory code: that state's citations."],
      ["ccn", "Six-character CMS Certification Number: one home's citations."],
      ["from, to", "Inclusive range of survey dates, YYYY-MM-DD."],
      ["min_severity", "Scope/severity letter A to L; G returns actual harm and immediate jeopardy only."],
      ["format", "json (default) or csv."],
    ] as [string, string][],
    example: `${CITATIONS_API_PATH}?state=VT&format=csv`,
  },
];

/** The /data page's section: endpoints, sources, cadence and caveats. */
export function NursingHomesDataSection() {
  const counts = getRespiratoryCounts();
  const rates = getRespiratoryRates();
  const f880 = getF880Index();
  const release = f880?.releases.at(-1);
  return (
    <section aria-labelledby="nursing-homes-heading" id="nursing-homes" className="space-y-6">
      <h2 id="nursing-homes-heading" className="font-journal text-2xl font-semibold leading-snug text-ink">
        Nursing homes
      </h2>
      <p className={P}>
        A separate layer from the outbreak endpoints: recurring measurements by state and by facility, shown on{" "}
        <Link href={NURSING_HOMES_PATH} className={LINK}>
          Nursing homes
        </Link>
        . Same conventions (keyless, CORS-open, JSON or CSV, errors as <span className="font-mono">{"{ \"error\": ... }"}</span>).
      </p>
      {ENDPOINTS.map((e) => (
        <div key={e.path} className="panel">
          <h3 className="font-mono text-base font-semibold text-ink">GET {e.path}</h3>
          <p className={`mt-2 ${P}`}>{e.what}</p>
          {e.params.length > 0 && (
            <dl className="mt-3 space-y-1 text-[0.9375rem]">
              {e.params.map(([name, desc]) => (
                <div key={name} className="flex flex-wrap gap-x-3">
                  <dt className="font-mono text-ink">{name}</dt>
                  <dd className="text-ink-muted">{desc}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="mt-3 text-[0.9375rem]">
            <a href={e.example} className={LINK}>
              Try it: <span className="font-mono">{e.example}</span>
            </a>
          </p>
        </div>
      ))}
      <h3 className="text-base font-semibold text-ink">Sources, cadence and caveats</h3>
      <ul className={`list-disc space-y-2 pl-5 ${P}`}>
        <li>
          <strong>NHSN counts</strong>: CDC dataset{" "}
          <a href={counts?.sourceUrl ?? "https://data.cdc.gov/d/tscn-ryh9"} className={LINK}>
            tscn-ryh9
          </a>{" "}
          on data.cdc.gov. Labelled weekly, but its newest week is {longDate(counts?.latestWeek)} and its rows were last updated{" "}
          {longDate(counts?.sourceRowsUpdatedAt)}. Checked twice a day; fetched only when CDC&apos;s metadata says the rows changed.
        </li>
        <li>
          <strong>NHSN rates</strong>: the data file behind{" "}
          <a href={rates?.sourceUrl ?? "https://www.cdc.gov/nhsn/ltc/ltc-report-overview.html"} className={LINK}>
            CDC&apos;s Nursing Home Data Dashboard
          </a>{" "}
          on www.cdc.gov, updated on Thursdays; newest week {longDate(rates?.latestWeek)}. Rates per 100,000 residents only. Recent weeks are
          preliminary. Its rates are close to, not equal to, rates computed from the counts.
        </li>
        <li>
          <strong>CMS F880 citations</strong>:{" "}
          <a href={f880?.sourceUrl ?? "https://data.cms.gov/provider-data/dataset/r5ix-sfxw"} className={LINK}>
            Health Deficiencies (r5ix-sfxw)
          </a>{" "}
          on data.cms.gov, about monthly. Current release processed {longDate(release?.release)}, published {longDate(release?.released)}; next
          expected {longDate(f880?.nextUpdateDate)}. Fetched only when the release dates change. It holds about the last three inspection cycles
          per home, not a full history.
        </li>
        <li>
          Influenza and RSV reporting became mandatory on 1 January 2025; the NHSN series include them from the week ending 12 January 2025.
          Weeks in which fewer than {Math.round(THIN_REPORTING_SHARE * 100)}% of the usual homes reported are flagged{" "}
          <span className="font-mono">thinReporting</span>.
        </li>
        <li>
          A citation is an inspection finding, not evidence of infections or an outbreak; it may have been corrected and may be under dispute
          (IDR/IIDR flags).
        </li>
      </ul>
      <p className={P}>{RESPIRATORY_ATTRIBUTION}</p>
      <p className={P}>{CITATIONS_ATTRIBUTION}</p>
    </section>
  );
}

/** The /methodology page's section: how the nursing-home data is checked. */
export function NursingHomesMethodSection() {
  return (
    <section aria-labelledby="nursing-homes" className="space-y-3">
      <h2 id="nursing-homes" className={PROSE_H2}>
        Nursing-home data
      </h2>
      <p className={PROSE_P}>
        <Link href={NURSING_HOMES_PATH} className={PROSE_LINK}>
          Nursing homes
        </Link>{" "}
        is a separate layer: weekly measurements by state and inspection citations by facility, never ranked or counted as an outbreak.
        Every fetch is checked before anything is stored; a failed check stores nothing and is flagged for review. Each accepted extract is
        archived, compressed, with the SHA-256 checksum of its text, so every figure can be re-derived.
      </p>
      <ul className={`list-disc space-y-1.5 pl-5 ${PROSE_P}`}>
        <li>
          <Link href={RESPIRATORY_PATH} className={PROSE_LINK}>
            NHSN counts
          </Link>
          : for every week and every count, the states and territories must add up exactly to the national row, and so must the ten HHS
          regions; vaccinated or hospitalised subsets can never exceed their totals; CDC&apos;s percentages must equal numerator ÷ residents;
          weeks must end on a Sunday. Rates per 100,000 use CDC&apos;s resident count for the same homes and week.
        </li>
        <li>
          NHSN dashboard rates: CDC&apos;s file repeats each rate up to three times, and every copy must agree; every week must have a national
          row; the chart must still say &ldquo;per 100,000 residents&rdquo;. These rates are not checked against the counts, because CDC computes
          them from a different extract and they differ slightly.
        </li>
        <li>
          <Link href={INFECTION_CONTROL_PATH} className={PROSE_LINK}>
            CMS F880 citations
          </Link>
          : the rows received must equal the count the API reports; every row must be tag F880 with the release&apos;s processing date; codes,
          dates and flags must be valid; no row may repeat; and the release must not change while it is being read. &ldquo;Last 12 months&rdquo; means
          surveys within the year that ends on the release&apos;s processing date. &ldquo;G or above&rdquo; means scope/severity G to L: actual harm
          or immediate jeopardy.
        </li>
      </ul>
    </section>
  );
}

/** The home page's pointer to the layer. */
export function NursingHomesHomeLink() {
  return (
    <section aria-labelledby="nursing-homes-heading" className="mt-10 border-t border-rule pt-6">
      <h2 id="nursing-homes-heading" className="font-journal text-xl font-semibold leading-snug text-ink">
        Nursing homes
      </h2>
      <p className="mt-1 max-w-[46rem] text-[0.9375rem] text-ink-muted">
        Weekly{" "}
        <Link href={RESPIRATORY_PATH} className={LINK}>
          COVID-19, flu and RSV rates among US nursing-home residents
        </Link>{" "}
        (CDC) and{" "}
        <Link href={INFECTION_CONTROL_PATH} className={LINK}>
          homes cited for infection-control deficiencies
        </Link>{" "}
        (CMS inspections), by state and facility.
      </p>
    </section>
  );
}
