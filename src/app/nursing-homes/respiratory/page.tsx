import type { Metadata } from "next";
import Link from "next/link";
import StaticPage, { PROSE_H2, PROSE_LINK, PROSE_NOTE, PROSE_P } from "@/components/StaticPage";
import NumberTable from "@/components/NumberTable";
import NursingHomeRatesChart, { type RatePoint } from "@/components/NursingHomeRatesChart";
import {
  NATIONAL,
  NURSING_HOMES_PATH,
  RESPIRATORY_API_PATH,
  THIN_REPORTING_SHARE,
  countRows,
  fmtInt,
  fmtRate,
  latestFullWeek,
  longDate,
  rateRows,
  stateName,
  thinlyReportedWeeks,
  withRates,
  type CountRowWithRates,
  type RateRow,
} from "@/lib/nursing-homes";
import { getRespiratoryCounts, getRespiratoryRates } from "@/lib/nursing-homes-data";
import { CORRECTIONS_URL } from "@/lib/methodology";
import { SITE_NAME } from "@/lib/site";

const TITLE = "Nursing Home COVID, Flu & RSV Data by State";
const DESCRIPTION =
  "Weekly new COVID-19, influenza and RSV cases and hospitalisations per 100,000 US nursing-home residents, by state and nationally, from CDC's National Healthcare Safety Network.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/nursing-homes/respiratory" },
  openGraph: {
    type: "website", siteName: SITE_NAME, locale: "en_US", url: "/nursing-homes/respiratory", title: `${TITLE} · ${SITE_NAME}`, description: DESCRIPTION,
  },
};

const FRESH = "rounded-lg border border-rule-strong bg-panel p-4 text-[0.9375rem] leading-relaxed text-ink-muted";

/** "12.3 (45)" cell: the rate, with the count under it. */
function rateCell(rate: number | null, count: number | null) {
  if (count === null) return <span className="text-ink-faint">no data</span>;
  return (
    <span className="tabular-nums">
      <span className="font-semibold text-ink">{fmtRate(rate)}</span> <span className="text-ink-faint">({fmtInt(count)})</span>
    </span>
  );
}

const rate = (v: number | null) => (v === null ? <span className="text-ink-faint">no data</span> : <span className="tabular-nums">{fmtRate(v)}</span>);
const byNationFirst = <T extends { jurisdiction: string }>(a: T, b: T) =>
  a.jurisdiction === NATIONAL ? -1 : b.jurisdiction === NATIONAL ? 1 : stateName(a.jurisdiction).localeCompare(stateName(b.jurisdiction));

export default function RespiratoryPage() {
  const rates = getRespiratoryRates();
  const counts = getRespiratoryCounts();
  const rRows: RateRow[] = rates ? rateRows(rates) : [];
  const points: RatePoint[] = rates
    ? rRows.filter((r) => r.jurisdiction === NATIONAL && r.week >= rates.allPathogensFrom)
    : [];
  const latestRates = rates ? rRows.filter((r) => r.week === rates.latestWeek).sort(byNationFirst) : [];
  const markedWeeks = [...new Set(rRows.filter((r) => r.marked && r.jurisdiction === NATIONAL).map((r) => r.week))].sort();

  const cRows = counts ? countRows(counts) : [];
  const thin = [...thinlyReportedWeeks(cRows)].sort();
  const fullWeek = latestFullWeek(cRows);
  const weekCounts: CountRowWithRates[] = cRows.filter((r) => r.week === fullWeek).map(withRates).sort(byNationFirst);

  return (
    <StaticPage
      title={TITLE}
      intro={
        <p>
          New cases and hospitalisations among residents of US nursing homes, per 100,000 residents, as reported each week to
          CDC&apos;s National Healthcare Safety Network (NHSN). Part of{" "}
          <Link href={NURSING_HOMES_PATH} className={PROSE_LINK}>
            nursing-home data
          </Link>
          .
        </p>
      }
    >
      <section aria-labelledby="freshness" className="space-y-3">
        <h2 id="freshness" className="sr-only">
          How current these figures are
        </h2>
        <div className={FRESH} data-testid="freshness">
          <p>
            <strong className="text-ink">Rates</strong> run to the week ending{" "}
            <strong className="text-ink">{longDate(rates?.latestWeek)}</strong>, from the data behind{" "}
            <a href={rates?.sourceUrl} className={PROSE_LINK}>
              CDC&apos;s Nursing Home Data Dashboard
            </a>{" "}
            (file last changed {longDate(rates?.sourceLastModified)}; checked {longDate(rates?.lastChecked)}). CDC marks the newest weeks as preliminary.
          </p>
          <p className="mt-2">
            <strong className="text-ink">Counts</strong> (cases, residents and reporting homes) run only to the week ending{" "}
            <strong className="text-ink">{longDate(counts?.latestWeek)}</strong>: CDC&apos;s open dataset{" "}
            <a href={counts?.sourceUrl} className={PROSE_LINK}>
              {counts?.dataset}
            </a>{" "}
            was last updated on {longDate(counts?.sourceRowsUpdatedAt)} (checked {longDate(counts?.lastChecked)}). No fresher machine-readable
            counts are published.
          </p>
        </div>
      </section>

      <section aria-labelledby="trend" className="space-y-3">
        <h2 id="trend" className={PROSE_H2}>
          National trend
        </h2>
        {points.length ? <NursingHomeRatesChart points={points} /> : <p className={PROSE_NOTE}>Not fetched yet.</p>}
        <p className={PROSE_NOTE}>
          Starts at the week ending {longDate(rates?.allPathogensFrom)}, the first week CDC includes all three pathogens (influenza and RSV
          reporting became mandatory on 1 January 2025). COVID-19-only weeks from October 2024 are in the API.
          {markedWeeks.length > 0 &&
            ` CDC draws ${markedWeeks.length} weeks (${longDate(markedWeeks[0])} to ${longDate(markedWeeks.at(-1))}) dotted on its own chart without saying why in the data; they are shown as is.`}
        </p>
      </section>

      <section aria-labelledby="by-state" className="space-y-3">
        <h2 id="by-state" className={PROSE_H2}>
          By state, week ending {longDate(rates?.latestWeek)}
        </h2>
        <p className={PROSE_P}>Weekly rates per 100,000 residents. &ldquo;No data&rdquo; is missing data, not zero.</p>
        <NumberTable
          caption={`Nursing-home resident rates per 100,000 by state, week ending ${rates?.latestWeek}`}
          head={["State", "COVID-19 cases", "COVID-19 hosp.", "Flu cases", "Flu hosp.", "RSV cases", "RSV hosp."]}
          rows={latestRates.map((r) => [
            stateName(r.jurisdiction),
            rate(r.covidCaseRate),
            rate(r.covidHospRate),
            rate(r.fluCaseRate),
            rate(r.fluHospRate),
            rate(r.rsvCaseRate),
            rate(r.rsvHospRate),
          ])}
        />
      </section>

      <section aria-labelledby="counts" className="space-y-3">
        <h2 id="counts" className={PROSE_H2}>
          Counts by state, week ending {longDate(fullWeek)}
        </h2>
        <p className={PROSE_P}>
          From CDC&apos;s open dataset: residents testing positive (and the rate per 100,000 residents) among the homes that reported
          complete data that week. A small state&apos;s rate can swing on a handful of cases.
        </p>
        {thin.length > 0 && (
          <p className={PROSE_NOTE}>
            This is the newest week with typical reporting. In the dataset&apos;s later week{thin.length > 1 ? "s" : ""} (
            {thin.map(longDate).join(", ")}) fewer than {Math.round(THIN_REPORTING_SHARE * 100)}% of the usual homes had reported, so those
            counts are not comparable; they are in the API, flagged <code className="font-mono">thinReporting</code>.
          </p>
        )}
        <NumberTable
          caption={`Nursing-home resident counts by state, week ending ${fullWeek}`}
          head={["State", "Homes reporting", "Residents", "COVID-19 cases", "COVID-19 hosp.", "Flu cases", "RSV cases"]}
          rows={weekCounts.map((r) => [
            stateName(r.jurisdiction),
            <span key="f" className="tabular-nums">{fmtInt(r.facilities)}</span>,
            <span key="r" className="tabular-nums">{fmtInt(r.residents)}</span>,
            rateCell(r.covidCaseRate, r.covidCases),
            rateCell(r.covidHospRate, r.covidHosp),
            rateCell(r.fluCaseRate, r.fluCases),
            rateCell(r.rsvCaseRate, r.rsvCases),
          ])}
        />
        <p className={PROSE_NOTE}>Rate per 100,000 residents, count in brackets.</p>
      </section>

      <section aria-labelledby="read" className="space-y-3">
        <h2 id="read" className={PROSE_H2}>
          How to read these figures
        </h2>
        <ul className={`list-disc space-y-2 pl-5 ${PROSE_P}`}>
          <li>
            A <strong>case</strong> is a resident with a positive test during the week. A <strong>hospitalisation</strong> is a resident admitted to
            hospital during the week who tested positive in the previous 10 days.
          </li>
          <li>
            The rate&apos;s denominator is every resident present for at least one day of the week in the homes that reported, as CDC defines
            it; it is the same denominator CDC uses for its own percentages.
          </li>
          <li>Only CMS-certified homes that submitted complete data for the week are counted, so the number of homes varies from week to week.</li>
          <li>
            The dashboard&apos;s rates and the rates computed from the open dataset&apos;s counts are close but not equal: CDC computes them from
            different extracts. Each is shown as published and labelled with its source.
          </li>
        </ul>
        <p className={PROSE_P}>
          Download everything as JSON or CSV at <code className="font-mono text-[0.875rem]">{RESPIRATORY_API_PATH}</code> (
          <Link href="/data#nursing-homes" className={PROSE_LINK}>
            parameters
          </Link>
          ). The checks each fetch must pass are on{" "}
          <Link href="/methodology#nursing-homes" className={PROSE_LINK}>
            Methodology
          </Link>
          . Corrections:{" "}
          <a href={CORRECTIONS_URL} className={PROSE_LINK}>
            GitHub issues
          </a>
          .
        </p>
      </section>
    </StaticPage>
  );
}
