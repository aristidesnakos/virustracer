import type { Metadata } from "next";
import Link from "next/link";
import StaticPage, { PROSE_H2, PROSE_LINK, PROSE_NOTE, PROSE_P } from "@/components/StaticPage";
import NumberTable from "@/components/NumberTable";
import SeverityGrid from "@/components/SeverityGrid";
import {
  CITATIONS_API_PATH,
  NURSING_HOMES_PATH,
  fmtInt,
  fmtPct,
  longDate,
  nationalSummary,
  stateCitationsPath,
  stateName,
  summarizeState,
} from "@/lib/nursing-homes";
import { getF880Index, getF880State, listF880States } from "@/lib/nursing-homes-data";
import { CORRECTIONS_URL } from "@/lib/methodology";
import { SITE_NAME } from "@/lib/site";

const TITLE = "Nursing Home Infection Control Citations (F880)";
const DESCRIPTION =
  "US nursing homes cited by inspectors for infection-control deficiencies (CMS tag F880), by state, with the scope and severity of each citation, from CMS's Health Deficiencies data.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/nursing-homes/infection-control" },
  openGraph: {
    type: "website", siteName: SITE_NAME, locale: "en_US", url: "/nursing-homes/infection-control", title: `${TITLE} · ${SITE_NAME}`, description: DESCRIPTION,
  },
};

export default function InfectionControlPage() {
  const index = getF880Index();
  const release = index?.releases.at(-1);
  const summaries = listF880States().flatMap((st) => {
    const f = getF880State(st);
    return f ? [summarizeState(f)] : [];
  });
  const national = summaries.length ? nationalSummary(summaries) : null;
  const sorted = [...summaries].sort((a, b) => stateName(a.state).localeCompare(stateName(b.state)));

  return (
    <StaticPage
      title="Infection-control citations in nursing homes"
      intro={
        <p>
          Nursing homes that health inspectors cited under federal tag F880, &ldquo;Provide and implement an infection prevention and
          control program&rdquo;. Part of{" "}
          <Link href={NURSING_HOMES_PATH} className={PROSE_LINK}>
            nursing-home data
          </Link>
          .
        </p>
      }
    >
      <section aria-labelledby="what" className="space-y-3">
        <h2 id="what" className={PROSE_H2}>
          What a citation means
        </h2>
        <p className={PROSE_P}>
          State survey agencies inspect every Medicare- and Medicaid-certified nursing home for CMS, on a regular cycle and after
          complaints. A citation records that, on the survey date, inspectors found the home did not meet the requirement. It is an
          inspection finding, not a report that residents were infected or that an outbreak happened.
        </p>
        <ul className={`list-disc space-y-1.5 pl-5 ${PROSE_P}`}>
          <li>Most citations are corrected: each row shows CMS&apos;s correction status and date.</li>
          <li>
            Homes can dispute a citation through informal dispute resolution (IDR) or independent IDR (IIDR); rows under dispute are marked.
          </li>
          <li>
            CMS&apos;s file covers about the last three standard inspection cycles of each home, plus complaint surveys in that window, so it is
            not a full history.
          </li>
          <li>Every row names the CMS release it came from.</li>
        </ul>
        {release && (
          <p className={PROSE_NOTE} data-testid="release">
            CMS release processed {longDate(release.release)}, published {longDate(release.released)}: {fmtInt(release.citations)} F880
            citations at {fmtInt(release.facilities)} homes. Checked {longDate(index?.lastChecked)}; CMS expects the next update on{" "}
            {longDate(index?.nextUpdateDate)}.
          </p>
        )}
      </section>

      {national && (
        <section aria-labelledby="grid" className="space-y-3">
          <h2 id="grid" className={PROSE_H2}>
            Scope and severity
          </h2>
          <p className={PROSE_P}>
            Inspectors grade each citation with a letter from A to L. The row is how serious it is, from &ldquo;potential for minimal
            harm&rdquo; to &ldquo;immediate jeopardy&rdquo;; the column is how many residents it affected or could affect: one or a few
            (isolated), several (pattern) or many (widespread). Shaded rows, G to L, mean residents were actually harmed or in immediate
            jeopardy. Counts below are F880 citations nationally in surveys from {longDate(national.since)} to {longDate(national.release)}.
          </p>
          <SeverityGrid counts={national.grid12m} caption="F880 citations by scope and severity, United States, last 12 months" />
        </section>
      )}

      <section aria-labelledby="states" className="space-y-3">
        <h2 id="states" className={PROSE_H2}>
          By state
        </h2>
        <p className={PROSE_P}>
          &ldquo;Last 12 months&rdquo; counts surveys dated {national ? `${longDate(national.since)} to ${longDate(national.release)}` : "in the year before the release"}.
          CMS adds surveys weeks after they happen, so the latest months are usually incomplete. Pick a state to search its homes.
        </p>
        <NumberTable
          caption="F880 citations by state"
          head={["State", "Citations, last 12 months", "Homes cited, last 12 months", "G or above", "Citations in CMS file"]}
          rows={sorted.map((s) => [
            <Link key="s" href={stateCitationsPath(s.state)} className={PROSE_LINK}>
              {stateName(s.state)}
            </Link>,
            <span key="c" className="tabular-nums">{fmtInt(s.citations12m)}</span>,
            <span key="f" className="tabular-nums">{fmtInt(s.facilities12m)}</span>,
            <span key="h" className="tabular-nums">
              {fmtPct(s.harmShare12m)} <span className="text-ink-faint">({fmtInt(s.harm12m)})</span>
            </span>,
            <span key="a" className="tabular-nums">{fmtInt(s.citationsAll)}</span>,
          ])}
        />
      </section>

      <section aria-labelledby="data" className="space-y-3">
        <h2 id="data" className={PROSE_H2}>
          Data and corrections
        </h2>
        <p className={PROSE_P}>
          Source:{" "}
          <a href={index?.sourceUrl} className={PROSE_LINK}>
            CMS Provider Data Catalog, Health Deficiencies
          </a>
          , tag F880 only. Download by state or by home as JSON or CSV at{" "}
          <code className="font-mono text-[0.875rem]">{CITATIONS_API_PATH}</code> (
          <Link href="/data#nursing-homes" className={PROSE_LINK}>
            parameters
          </Link>
          ). If a row is wrong or out of date, check the home&apos;s page on Medicare Care Compare and{" "}
          <a href={CORRECTIONS_URL} className={PROSE_LINK}>
            open an issue on GitHub
          </a>
          .
        </p>
      </section>
    </StaticPage>
  );
}
