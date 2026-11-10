import type { Metadata } from "next";
import Link from "next/link";
import StaticPage, { PROSE_H2, PROSE_LINK, PROSE_NOTE, PROSE_P } from "@/components/StaticPage";
import {
  CITATIONS_API_PATH,
  INFECTION_CONTROL_PATH,
  NATIONAL,
  NURSING_HOMES_API_PATH,
  PATHOGENS,
  PATHOGEN_LABEL,
  RESPIRATORY_API_PATH,
  RESPIRATORY_PATH,
  fmtInt,
  fmtPct,
  fmtRate,
  longDate,
  nationalSummary,
  rateRows,
  summarizeState,
} from "@/lib/nursing-homes";
import { getF880Index, getF880State, getRespiratoryCounts, getRespiratoryRates, listF880States } from "@/lib/nursing-homes-data";
import { CORRECTIONS_URL } from "@/lib/methodology";
import { SITE_NAME } from "@/lib/site";

const TITLE = "Nursing Home Infection Data by State";
const DESCRIPTION =
  "Weekly COVID-19, influenza and RSV rates among US nursing-home residents from CDC NHSN, and nursing homes cited for infection-control deficiencies (CMS tag F880), by state and facility.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/nursing-homes" },
  openGraph: { type: "website", siteName: SITE_NAME, locale: "en_US", url: "/nursing-homes", title: `${TITLE} · ${SITE_NAME}`, description: DESCRIPTION },
};

const TILE = "rounded-lg border border-rule bg-panel p-4";

export default function NursingHomesPage() {
  const rates = getRespiratoryRates();
  const counts = getRespiratoryCounts();
  const index = getF880Index();
  const latestRates = rates ? rateRows(rates).find((r) => r.week === rates.latestWeek && r.jurisdiction === NATIONAL) : undefined;
  const summaries = listF880States().flatMap((st) => {
    const f = getF880State(st);
    return f ? [summarizeState(f)] : [];
  });
  const national = summaries.length ? nationalSummary(summaries) : null;
  const release = index?.releases.at(-1);

  return (
    <StaticPage
      title="Nursing homes"
      intro={
        <p>
          Two public US datasets about nursing homes, read automatically from the agencies that publish them: how many residents
          test positive for COVID-19, influenza and RSV each week, and which homes inspectors have cited for infection-control
          deficiencies. These are recurring measurements, not an outbreak count.
        </p>
      }
    >
      <section aria-labelledby="respiratory" className="space-y-4">
        <h2 id="respiratory" className={PROSE_H2}>
          <Link href={RESPIRATORY_PATH} className="hover:underline">
            Respiratory illness among residents
          </Link>
        </h2>
        <p className={PROSE_P}>
          CDC&apos;s National Healthcare Safety Network (NHSN) collects weekly cases and hospitalisations among residents of about
          15,000 CMS-certified nursing homes.
        </p>
        {latestRates ? (
          <>
            <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-ink-faint">
              United States, week ending {longDate(latestRates.week)} · new cases per 100,000 residents
            </p>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {PATHOGENS.map((p) => (
                <li key={p} className={TILE}>
                  <p className="text-[0.8125rem] text-ink-muted">{PATHOGEN_LABEL[p]}</p>
                  <p className="font-journal text-3xl font-semibold tabular-nums text-ink">{fmtRate(latestRates[`${p}CaseRate`])}</p>
                  <p className="text-[0.8125rem] text-ink-muted">
                    {fmtRate(latestRates[`${p}HospRate`])} hospitalised per 100,000
                  </p>
                </li>
              ))}
            </ul>
            <p className={PROSE_NOTE}>
              Rates from CDC&apos;s Nursing Home Data Dashboard data (newest weeks are preliminary). Counts with resident and facility
              numbers come from CDC&apos;s open dataset, which runs only to the week ending {longDate(counts?.latestWeek)}.
            </p>
          </>
        ) : (
          <p className={PROSE_NOTE}>Not fetched yet.</p>
        )}
        <p>
          <Link href={RESPIRATORY_PATH} className={PROSE_LINK}>
            Rates and counts by state →
          </Link>
        </p>
      </section>

      <section aria-labelledby="citations" className="space-y-4">
        <h2 id="citations" className={PROSE_H2}>
          <Link href={INFECTION_CONTROL_PATH} className="hover:underline">
            Infection-control citations (F880)
          </Link>
        </h2>
        <p className={PROSE_P}>
          State inspectors survey every nursing home on behalf of CMS. When a home falls short of the requirement to &ldquo;provide and
          implement an infection prevention and control program&rdquo;, it is cited under tag F880. A citation is an inspection finding,
          not a report of infections; most are corrected, and homes can dispute them.
        </p>
        {national && release ? (
          <>
            <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-ink-faint">
              Surveys from {longDate(national.since)} to {longDate(release.release)} · CMS release of {longDate(release.released)}
            </p>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <li className={TILE}>
                <p className="text-[0.8125rem] text-ink-muted">F880 citations</p>
                <p className="font-journal text-3xl font-semibold tabular-nums text-ink">{fmtInt(national.citations12m)}</p>
              </li>
              <li className={TILE}>
                <p className="text-[0.8125rem] text-ink-muted">Nursing homes cited</p>
                <p className="font-journal text-3xl font-semibold tabular-nums text-ink">{fmtInt(national.facilities12m)}</p>
              </li>
              <li className={TILE}>
                <p className="text-[0.8125rem] text-ink-muted">At actual harm or worse (G–L)</p>
                <p className="font-journal text-3xl font-semibold tabular-nums text-ink">{fmtPct(national.harmShare12m)}</p>
                <p className="text-[0.8125rem] text-ink-muted">{fmtInt(national.harm12m)} citations</p>
              </li>
            </ul>
          </>
        ) : (
          <p className={PROSE_NOTE}>Not fetched yet.</p>
        )}
        <p>
          <Link href={INFECTION_CONTROL_PATH} className={PROSE_LINK}>
            Citations by state, and a searchable list of homes →
          </Link>
        </p>
      </section>

      <section aria-labelledby="use" className="space-y-3">
        <h2 id="use" className={PROSE_H2}>
          Data, method and corrections
        </h2>
        <p className={PROSE_P}>
          Both datasets are free to download as JSON or CSV with no key:{" "}
          <code className="font-mono text-[0.875rem]">{NURSING_HOMES_API_PATH}</code>,{" "}
          <code className="font-mono text-[0.875rem]">{RESPIRATORY_API_PATH}</code> and{" "}
          <code className="font-mono text-[0.875rem]">{CITATIONS_API_PATH}</code>. See{" "}
          <Link href="/data#nursing-homes" className={PROSE_LINK}>
            Data &amp; API
          </Link>{" "}
          for parameters and{" "}
          <Link href="/methodology#nursing-homes" className={PROSE_LINK}>
            Methodology
          </Link>{" "}
          for the checks every fetch must pass. Spotted an error?{" "}
          <a href={CORRECTIONS_URL} className={PROSE_LINK}>
            Open an issue on GitHub
          </a>
          .
        </p>
      </section>
    </StaticPage>
  );
}
