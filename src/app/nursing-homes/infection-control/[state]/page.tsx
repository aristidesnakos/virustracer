import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import StaticPage, { PROSE_H2, PROSE_LINK, PROSE_NOTE, PROSE_P } from "@/components/StaticPage";
import SeverityGrid from "@/components/SeverityGrid";
import CitationSearch, { type FacilityCitations } from "@/components/CitationSearch";
import {
  CITATIONS_API_PATH,
  INFECTION_CONTROL_PATH,
  fmtInt,
  fmtPct,
  longDate,
  stateCitationsPath,
  stateName,
  summarizeState,
  type StateCitationsFile,
} from "@/lib/nursing-homes";
import { getF880State, listF880States } from "@/lib/nursing-homes-data";
import { CORRECTIONS_URL } from "@/lib/methodology";
import { SITE_NAME } from "@/lib/site";

type Props = { params: Promise<{ state: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return listF880States().map((s) => ({ state: s.toLowerCase() }));
}

function load(param: string): StateCitationsFile | null {
  return /^[a-z]{2}$/.test(param) ? getF880State(param.toUpperCase()) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { state } = await params;
  const file = load(state);
  if (!file) return {};
  const name = stateName(file.state);
  const s = summarizeState(file);
  const title = `${name} nursing home infection-control citations (F880)`;
  const description = `${fmtInt(s.facilitiesAll)} ${name} nursing homes cited for an infection-control deficiency (CMS tag F880) in CMS's inspection data, ${fmtInt(s.citations12m)} citations in the 12 months to ${longDate(file.release)}. Search by home or city.`;
  return {
    title,
    description,
    alternates: { canonical: stateCitationsPath(file.state) },
    openGraph: { type: "website", siteName: SITE_NAME, locale: "en_US", url: stateCitationsPath(file.state), title: `${title} · ${SITE_NAME}`, description },
  };
}

/** The page's client list: homes A to Z, each with its citations newest first. */
function facilityList(file: StateCitationsFile): FacilityCitations[] {
  const by = new Map<string, FacilityCitations>();
  for (const [ccn, date, sev, , complaint, standard, ic, status, corrected, idr, iidr] of file.citations) {
    const [name, , city, zip] = file.facilities[ccn] ?? ["", "", "", ""];
    if (!by.has(ccn)) by.set(ccn, { ccn, name, city, zip, citations: [] });
    by.get(ccn)!.citations.push([date, sev, complaint, standard, ic, status, corrected, idr, iidr]);
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name) || a.city.localeCompare(b.city));
}

export default async function StateCitationsPage({ params }: Props) {
  const { state } = await params;
  const file = load(state);
  if (!file) notFound();
  const name = stateName(file.state);
  const s = summarizeState(file);

  return (
    <StaticPage
      title={`${name}: infection-control citations`}
      intro={
        <p>
          {name} nursing homes cited by inspectors under federal tag F880, &ldquo;Provide and implement an infection prevention and control
          program&rdquo;.{" "}
          <Link href={INFECTION_CONTROL_PATH} className={PROSE_LINK}>
            All states and what a citation means
          </Link>
          .
        </p>
      }
    >
      <section aria-labelledby="summary" className="space-y-3">
        <h2 id="summary" className={PROSE_H2}>
          Summary
        </h2>
        <p className={PROSE_P}>
          In surveys from {longDate(s.since)} to {longDate(file.release)}, inspectors cited <strong>{fmtInt(s.facilities12m)}</strong> {name}{" "}
          homes <strong>{fmtInt(s.citations12m)}</strong> times under F880; {fmtPct(s.harmShare12m)} of those citations ({fmtInt(s.harm12m)})
          were at severity G or above, and {fmtInt(s.complaint12m)} came from complaint surveys. CMS&apos;s file lists {fmtInt(s.citationsAll)}{" "}
          F880 citations at {fmtInt(s.facilitiesAll)} {name} homes over about the last three inspection cycles.
        </p>
        <p className={PROSE_NOTE} data-testid="release">
          A citation is an inspection finding on the survey date, not a report of infections. It may have been corrected since, and homes can
          dispute it (IDR/IIDR). Data: CMS release processed {longDate(file.release)}, published {longDate(file.released)}.
        </p>
        <SeverityGrid counts={s.grid} caption={`F880 citations by scope and severity, ${name}, whole CMS file`} />
        <p className={PROSE_NOTE}>Scope and severity of every F880 citation in CMS&apos;s file for {name}.</p>
      </section>

      <section aria-labelledby="homes" className="space-y-3">
        <h2 id="homes" className={PROSE_H2}>
          Homes cited
        </h2>
        <CitationSearch state={file.state} release={file.release} released={file.released} facilities={facilityList(file)} />
      </section>

      <section aria-labelledby="data" className="space-y-3">
        <h2 id="data" className={PROSE_H2}>
          Data and corrections
        </h2>
        <p className={PROSE_P}>
          Download as CSV:{" "}
          <a href={`${CITATIONS_API_PATH}?state=${file.state}&format=csv`} className={PROSE_LINK}>
            {CITATIONS_API_PATH}?state={file.state}&amp;format=csv
          </a>
          . If a row is wrong or out of date, compare it with the home&apos;s Medicare Care Compare page and{" "}
          <a href={CORRECTIONS_URL} className={PROSE_LINK}>
            open an issue on GitHub
          </a>
          .
        </p>
      </section>
    </StaticPage>
  );
}
