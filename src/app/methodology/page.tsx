import type { Metadata } from "next";
import Link from "next/link";
import StaticPage, { PROSE_H2, PROSE_LINK, PROSE_P } from "@/components/StaticPage";
import { STATUS_HEADING, STATUS_ORDER } from "@/lib/home-snapshot";
import { ASSUMPTIONS } from "@/lib/metrics";
import { SANITY_CHECKS, UPDATE_TIMES_UTC } from "@/lib/methodology";
import { SITE_NAME } from "@/lib/site";

const description =
  "How Outbreak Files sources and checks its figures, handles reporting lag, measures 7-day trends and ranks outbreaks on the home page, and what it does not do.";

export const metadata: Metadata = {
  title: "Methodology",
  description,
  alternates: { canonical: "/methodology" },
  // Page-level openGraph/twitter replace the layout's wholesale, so repeat the shared fields.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
    url: "/methodology",
    title: `Methodology · ${SITE_NAME}`,
    description,
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `Methodology · ${SITE_NAME}`,
    description,
    images: ["/opengraph-image"],
  },
};

const STATUS_MEANING = {
  active: "Cases are still being reported and the outbreak has not been declared over.",
  watch: "A signal worth following that has not yet been confirmed as an outbreak.",
  waning: "Transmission has slowed sharply; authorities are counting down to declaring it over.",
  over: "Declared over by the health authorities. Kept as a permanent record.",
} as const;

const { windowDays, maxReportingLagDays, minReadingsInTwoWeeks } = ASSUMPTIONS;

export default function MethodologyPage() {
  return (
    <StaticPage
      title="Methodology"
      intro={
        <p>
          How the figures on {SITE_NAME} are gathered, checked and summarised, how the home page orders
          outbreaks, and what the site deliberately does not do. The formulas behind each indicator are on the{" "}
          <Link href="/data#method" className={PROSE_LINK}>
            Data &amp; API
          </Link>{" "}
          page.
        </p>
      }
    >
      <section aria-labelledby="sources" className="space-y-3">
        <h2 id="sources" className={PROSE_H2}>
          Where the figures come from
        </h2>
        <p className={PROSE_P}>Each outbreak has one of two kinds of source, shown on its card.</p>
        <dl className="space-y-4 text-[0.9375rem] leading-relaxed">
          <div>
            <dt className="font-semibold text-ink">Read automatically</dt>
            <dd className="text-ink-muted">
              A script reads the outbreak&rsquo;s Wikipedia infobox twice a day ({UPDATE_TIMES_UTC.join(" and ")}{" "}
              UTC). The infobox in turn cites the health ministries and WHO. Every reading is stored with a link to
              the exact Wikipedia revision it came from, and the raw infobox text is archived with a SHA-256
              fingerprint, so any number can be traced and re-checked later. The card says when the source was last
              checked.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Curated by hand</dt>
            <dd className="text-ink-muted">
              Figures entered by us from official situation reports, each with its source. These do not update on
              their own, so the card shows the date they were last verified instead of looking live.
            </dd>
          </div>
        </dl>
        <p className={PROSE_P}>
          Hand-checked milestones from official reports are merged with the automatic readings for the headline
          totals and the chart; on a day with both, the hand-checked figure wins. Country and province tables,
          map bubbles and written summaries are always updated by hand. Countries that only the news has linked to
          an outbreak are labelled <em>Unverified</em> until an official source confirms them.
        </p>
      </section>

      <section aria-labelledby="checks" className="space-y-3">
        <h2 id="checks" className={PROSE_H2}>
          Checks before a reading is kept
        </h2>
        <ul className={`list-disc space-y-1.5 pl-5 ${PROSE_P}`}>
          <li>Confirmed cases, deaths and recoveries never go down; a reading where they do is rejected.</li>
          <li>
            Confirmed cases or deaths may not jump by more than {SANITY_CHECKS.maxJumpPct}% over the previous
            reading, unless that reading is more than {SANITY_CHECKS.stalePrevDays} days old.
          </li>
          <li>Deaths may not exceed confirmed cases.</li>
          <li>
            When older history is imported, edits that break these rules (typos, vandalism, edits in progress) are
            dropped and the longest consistent run of readings is kept.
          </li>
        </ul>
        <p className={PROSE_P}>A rejected reading is logged and the previous figures stay on the page.</p>
      </section>

      <section aria-labelledby="lag" className="space-y-3">
        <h2 id="lag" className={PROSE_H2}>
          Reporting lag and the 7-day trend
        </h2>
        <p className={PROSE_P}>
          Sources are updated in batches, so the most recent days often show no new cases simply because the
          report has not been entered yet. Measured naively, that looks like a sudden collapse. Every{" "}
          {windowDays}-day count therefore ends on the latest day the total actually moved, but never more than{" "}
          {maxReportingLagDays} days before the newest reading, so a real halt in cases still shows up. Days
          without a reading are filled in a straight line between their neighbours.
        </p>
        <p className={PROSE_P}>
          The trend badge on each card compares new confirmed cases in the last {windowDays} days with the{" "}
          {windowDays} days before. It says <em>Growing</em> or <em>Declining</em> only when the whole 95% range of
          the growth rate is above or below zero; otherwise <em>Plateau</em>. With fewer than{" "}
          {minReadingsInTwoWeeks} readings in the last two weeks, or less than {2 * windowDays} days of history, it
          says <em>Not enough data</em> instead of guessing. The small bar chart beside it shows new confirmed cases
          per {windowDays}-day period, newest on the right. Rates use only the automatic daily readings, never the
          hand-entered milestones, so a change of source cannot create a false jump.
        </p>
      </section>

      <section aria-labelledby="ranking" className="space-y-3">
        <h2 id="ranking" className={PROSE_H2}>
          How the home page orders outbreaks
        </h2>
        <p className={PROSE_P}>
          The home page is titled &ldquo;Outbreaks we are tracking&rdquo;, not &ldquo;the worst outbreaks in the
          world&rdquo;: it covers only the outbreaks we follow. They are ordered by a fixed rule:
        </p>
        <ol className={`list-decimal space-y-1.5 pl-5 ${PROSE_P}`}>
          <li>
            <strong className="font-semibold text-ink">Status group</strong>, in this order:
            <dl className="mt-2 space-y-1.5">
              {STATUS_ORDER.map((status) => (
                <div key={status}>
                  <dt className="inline font-semibold text-ink">{STATUS_HEADING[status]}: </dt>
                  <dd className="inline">{STATUS_MEANING[status]}</dd>
                </div>
              ))}
            </dl>
          </li>
          <li>
            Within a group, <strong className="font-semibold text-ink">most new deaths</strong> in the last{" "}
            {windowDays} days first.
          </li>
          <li>Ties are broken by most new confirmed cases in the same {windowDays} days, then alphabetically.</li>
          <li>Outbreaks without enough history for a {windowDays}-day count come last in their group.</li>
        </ol>
        <p className={PROSE_P}>
          There is no editorial pinning and no combined severity score. We will revisit the rule once more than
          about six outbreaks are tracked, and any change will be dated on this page.
        </p>
      </section>

      <section aria-labelledby="comparing" className="space-y-3">
        <h2 id="comparing" className={PROSE_H2}>
          Comparing outbreaks
        </h2>
        <p className={PROSE_P}>
          Outbreaks are counted differently: case definitions, testing capacity and reporting delays vary by
          disease and by country, and some sources report suspected cases while others report only confirmed ones.
          Two totals side by side are rarely like for like. Each card shows its own source and as-of date; compare
          the direction of each trend rather than the size of the numbers.
        </p>
      </section>

      <section aria-labelledby="not" className="space-y-3">
        <h2 id="not" className={PROSE_H2}>
          What we do not do
        </h2>
        <ul className={`list-disc space-y-1.5 pl-5 ${PROSE_P}`}>
          <li>No forecasts. Every indicator describes the recent past and depends on how complete reporting is.</li>
          <li>No medical or travel advice. For decisions, follow WHO and your national health authority.</li>
          <li>No single &ldquo;severity&rdquo; score across diseases.</li>
          <li>
            The reproduction number (Rt) relies on a serial interval measured for a specific disease, so it is shown
            only where one is available; the values used are listed on the{" "}
            <Link href="/data#method" className={PROSE_LINK}>
              Data &amp; API
            </Link>{" "}
            page.
          </li>
        </ul>
        <p className={PROSE_P}>
          Found an error? See{" "}
          <Link href="/about#corrections" className={PROSE_LINK}>
            corrections
          </Link>
          .
        </p>
      </section>
    </StaticPage>
  );
}
