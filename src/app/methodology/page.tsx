import type { Metadata } from "next";
import Link from "next/link";
import StaticPage, { PROSE_H2, PROSE_LINK, PROSE_NOTE, PROSE_P, ProseTable } from "@/components/StaticPage";
import { STATUS_HEADING, STATUS_ORDER } from "@/lib/home-snapshot";
import { ASSUMPTIONS } from "@/lib/metrics";
import { SANITY_CHECKS, UPDATE_TIMES_UTC } from "@/lib/methodology";
import { SITE_NAME } from "@/lib/site";
import { TREND_STATEMENT } from "@/lib/trend-summary";

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

/** In-page contents: short labels for the h2 sections below, in page order. */
const CONTENTS = [
  ["sources", "Sources"],
  ["checks", "Checks"],
  ["lag", "Reporting lag and trend"],
  ["ranking", "Ranking"],
  ["comparing", "Comparing outbreaks"],
  ["not", "What we do not do"],
] as const;

export default function MethodologyPage() {
  return (
    <StaticPage
      title="Methodology"
      intro={
        <>
          <p>
            How the figures on {SITE_NAME} are gathered, checked and summarised, how the home page orders
            outbreaks, and what the site deliberately does not do. The formulas behind each indicator are on the{" "}
            <Link href="/data#method" className={PROSE_LINK}>
              Data &amp; API
            </Link>{" "}
            page.
          </p>
          <nav aria-label="On this page" className="mt-4">
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[0.9375rem]">
              {CONTENTS.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className={PROSE_LINK}>
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </>
      }
    >
      <section aria-labelledby="sources" className="space-y-3">
        <h2 id="sources" className={PROSE_H2}>
          Where the figures come from
        </h2>
        <p className={PROSE_P}>Each outbreak has one of two kinds of source, shown on its card.</p>
        <ProseTable
          caption="Automatic and hand-curated sources compared"
          head={["", "Read automatically", "Curated by hand"]}
          rows={[
            [
              "Source",
              "The outbreak\u2019s Wikipedia infobox, which cites the health ministries and WHO.",
              "Official situation reports, each with its source.",
            ],
            [
              "Covers",
              "Headline totals and the chart.",
              "Milestones, country and province tables, map bubbles and written summaries.",
            ],
            [
              "Updated",
              `Twice a day (${UPDATE_TIMES_UTC.join(" and ")} UTC).`,
              "When we enter a report. It does not update on its own.",
            ],
            ["Card shows", "When the source was last checked.", "The date the figures were last verified."],
            [
              "How to trace it",
              "Every reading links to the exact Wikipedia revision. The raw infobox text is archived with a SHA-256 fingerprint, so any number can be re-checked later.",
              "The official report is linked on each entry.",
            ],
          ]}
        />
        <p className={PROSE_NOTE}>
          Hand-checked milestones are merged with the automatic readings for the headline totals and the chart. On
          a day with both, the hand-checked figure wins.
        </p>
        <p className={PROSE_NOTE}>
          Countries that only the news has linked to an outbreak are labelled <em>Unverified</em> until an official
          source confirms them.
        </p>
      </section>

      <section aria-labelledby="checks" className="space-y-3">
        <h2 id="checks" className={PROSE_H2}>
          Checks before a reading is kept
        </h2>
        <ProseTable
          caption="Sanity checks applied to each new reading"
          head={["Check", "Rule", "Exception"]}
          rows={[
            ["No decreases", "Confirmed cases, deaths and recoveries never go down.", "None."],
            [
              "Largest jump",
              <>
                Confirmed cases or deaths may not rise by more than{" "}
                <strong className="font-semibold text-ink">{SANITY_CHECKS.maxJumpPct}%</strong> over the previous
                reading.
              </>,
              <>
                Not applied when the previous reading is more than{" "}
                <strong className="font-semibold text-ink">{SANITY_CHECKS.stalePrevDays} days</strong> old.
              </>,
            ],
            ["Deaths and cases", "Deaths may not exceed confirmed cases.", "None."],
          ]}
        />
        <p className={PROSE_NOTE}>
          A reading that fails a check is rejected and logged, and the previous figures stay on the page.
        </p>
        <p className={PROSE_P}>
          <strong className="font-semibold text-ink">Historical import.</strong> When older history is imported,
          edits that break these rules (typos, vandalism, edits in progress) are dropped and the longest consistent
          run of readings is kept.
        </p>
      </section>

      <section aria-labelledby="lag" className="space-y-3">
        <h2 id="lag" className={PROSE_H2}>
          Reporting lag and the 7-day trend
        </h2>
        <p className={PROSE_P}>
          Sources are updated in batches, so the most recent days often show no new cases simply because the
          report has not been entered yet. Measured naively, that looks like a sudden collapse. Every{" "}
          {windowDays}-day count therefore ends on the latest day the total actually moved, but{" "}
          <strong className="font-semibold text-ink">
            never more than {maxReportingLagDays} days before the newest reading
          </strong>
          , so a real halt in cases still shows up. Days without a reading are filled in a straight line between
          their neighbours.
        </p>
        <p className={PROSE_P}>
          Each card leads with a plain-language result for the trend: it compares new confirmed cases in the last{" "}
          {windowDays} days with the {windowDays} days before. There are five possible results:
        </p>
        <ProseTable
          caption="Trend results shown on a card and when each is shown"
          head={["Result on the card", "When it shows"]}
          rows={[
            [TREND_STATEMENT.growing, "The whole 95% range of the growth rate is above zero."],
            [TREND_STATEMENT.declining, "The whole 95% range of the growth rate is below zero."],
            [TREND_STATEMENT.plateau, "The 95% range of the growth rate includes zero."],
            [TREND_STATEMENT.unclear, `Too few new cases in the ${windowDays} days to judge a trend.`],
            [
              TREND_STATEMENT.noData,
              `Fewer than ${minReadingsInTwoWeeks} readings in the last two weeks, or less than ${2 * windowDays} days of history. Shown instead of guessing.`,
            ],
          ]}
        />
        <p className={PROSE_P}>
          On an outbreak&rsquo;s dashboard the same five results appear as a badge: Growing, Declining, Plateau,
          Unclear or Not enough data. The bar chart on each card shows new confirmed cases per {windowDays}-day
          period, newest on the right, and the result and counts beneath it describe the newest bar.
        </p>
        <p className={PROSE_NOTE}>
          Rates use only the automatic daily readings, never the hand-entered milestones, so a change of source
          cannot create a false jump.
        </p>
      </section>

      <section aria-labelledby="ranking" className="space-y-3">
        <h2 id="ranking" className={PROSE_H2}>
          How the home page orders outbreaks
        </h2>
        <p className={PROSE_P}>
          The home page is titled &ldquo;Outbreaks we are tracking&rdquo;, not &ldquo;the worst outbreaks in the
          world&rdquo;: it covers only the outbreaks we follow. They are ordered by a fixed rule. First, by status
          group, in this order:
        </p>
        <ProseTable
          caption="Status groups in the order the home page shows them"
          head={["Status group", "Meaning"]}
          rows={STATUS_ORDER.map((status, i) => [
            <>
              <span className="mr-2 text-ink-faint">{i + 1}.</span>
              {STATUS_HEADING[status]}
            </>,
            STATUS_MEANING[status],
          ])}
        />
        <p className={PROSE_P}>Then, within each group:</p>
        <ol className={`list-decimal space-y-1.5 pl-5 ${PROSE_P}`}>
          <li>
            <strong className="font-semibold text-ink">Most new deaths</strong> in the last {windowDays} days first.
          </li>
          <li>Ties are broken by most new confirmed cases in the same {windowDays} days, then alphabetically.</li>
          <li>Outbreaks without enough history for a {windowDays}-day count come last in their group.</li>
        </ol>
        <p className={PROSE_P}>There is no editorial pinning and no combined severity score.</p>
        <p className={PROSE_NOTE}>
          We will revisit the rule once more than about six outbreaks are tracked, and any change will be dated on
          this page.
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
