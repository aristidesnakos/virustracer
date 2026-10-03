import type { Metadata } from "next";
import Link from "next/link";
import CasesChart from "@/components/CasesChart";
import MonitoringTable from "@/components/MonitoringTable";
import FeedUpdates from "@/components/FeedUpdates";
import MapLoader from "@/components/MapLoader";
import PanelHeader from "@/components/PanelHeader";
import { FOOTER_LINKS } from "@/components/SiteFooter";
import SponsorCard from "@/components/SponsorCard";
import TrendPanel from "@/components/TrendPanel";
import StatStrip from "@/components/StatStrip";
import { notFound } from "next/navigation";
import { getOutbreak, isArchivedRecord, listOutbreaks } from "@/data/outbreaks";
import { getLiveData } from "@/lib/live-data";
import { getTollData } from "@/lib/toll";
import { mergeTimeline, latestDate } from "@/lib/timeline";
import { getCandidatesData } from "@/lib/candidates-data";
import { computeMetrics } from "@/lib/metrics";
import { outbreakApiPath, outbreakPath } from "@/lib/outbreak-paths";
import { describeFigures, latestFigures } from "@/lib/seo";
import { DATA_LICENSE, SITE_NAME, SITE_TAGLINE, absoluteUrl } from "@/lib/site";

type Props = { params: Promise<{ slug: string }> };

// Only registered outbreaks are served; any other slug is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return listOutbreaks().map((o) => ({ slug: o.slug }));
}

// The description carries the current toll, so it is built from the data at
// build/request time rather than fixed in the layout.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const outbreak = getOutbreak(slug);
  if (!outbreak) return {};
  const toll = getTollData(slug);
  const figures = latestFigures(mergeTimeline(outbreak.casesTimeline, toll.snapshots));
  const description = describeFigures(figures, outbreak.description, outbreak, {
    archived: isArchivedRecord(outbreak),
  });
  const path = outbreakPath(slug);
  return {
    // The seoTitle is already written for search results, so skip the layout's title template.
    title: { absolute: outbreak.seoTitle },
    description,
    keywords: [...outbreak.keywords],
    alternates: { canonical: path },
    // Page-level openGraph/twitter replace the layout's wholesale, so repeat the shared fields.
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_US",
      title: outbreak.seoTitle,
      description,
      url: path,
    },
    twitter: { card: "summary_large_image", title: outbreak.seoTitle, description },
  };
}

function shortDate(iso: string | undefined | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** "18 May 2026" / "3 Oct 2026". */
function dayMonthYear(iso: string | undefined | null, month: "short" | "long" = "long"): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month, year: "numeric", timeZone: "UTC" });
}

/** "1 Apr – 2 Jul 2026": the dates an archived record spans. */
function spanLabel(first: string | undefined, last: string | null): string {
  if (!first || !last) return "—";
  const a = new Date(first);
  const b = new Date(last);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "—";
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
  const start = a.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
  return `${start} – ${dayMonthYear(last, "short")}`;
}

export default async function OutbreakPage({ params }: Props) {
  const { slug } = await params;
  const outbreak = getOutbreak(slug);
  if (!outbreak) notFound();
  const liveData = getLiveData(slug);
  const toll = getTollData(slug);
  const timeline = mergeTimeline(outbreak.casesTimeline, toll.snapshots);
  const candidatesData = getCandidatesData(slug);
  // Rates come from the single-source daily snapshots only: mixing in hand-curated
  // milestone rows would add small cross-source jumps to the weekly counts.
  const metrics = computeMetrics(toll.snapshots);

  // An archived record (over, or curated by hand) shows nothing that looks live:
  // no pulsing dot, no fetch times, no empty trend panel, news as past coverage.
  const archived = isArchivedRecord(outbreak);
  const lastVerified = outbreak.summary.lastReviewed;
  const recordStart = [...outbreak.spreadStops.map((s) => s.date), ...timeline.map((p) => p.date)].sort()[0];
  const dates = archived
    ? [
        { label: "Record covers", value: spanLabel(recordStart, latestDate(timeline)) },
        { label: "Last verified", value: dayMonthYear(lastVerified) },
      ]
    : [
        { label: "Toll as of", value: shortDate(latestDate(timeline)) },
        { label: "Last checked", value: shortDate(toll.lastChecked) },
        { label: "News feed", value: shortDate(liveData.lastFetched) },
      ];
  // Only show the trend panel when there are snapshots to measure; for a curated
  // record it would only say "not enough data".
  const showTrend = !archived || metrics.status === "ok";

  const first = toll.snapshots[0]?.date ?? timeline[0]?.date;
  const last = latestDate(timeline);
  const pageUrl = absoluteUrl(outbreakPath(slug));
  const tollApi = outbreakApiPath(slug, "toll");
  // Dataset markup makes the figures eligible for Google Dataset Search; the
  // distribution entries point at the same keyless endpoints /data documents.
  const distribution = [
    {
      "@type": "DataDownload",
      encodingFormat: "application/json",
      contentUrl: absoluteUrl(tollApi),
    },
    {
      "@type": "DataDownload",
      encodingFormat: "text/csv",
      contentUrl: absoluteUrl(`${tollApi}?format=csv`),
    },
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": absoluteUrl("/#website"),
        url: absoluteUrl("/"),
        name: SITE_NAME,
        description: SITE_TAGLINE,
        inLanguage: "en",
      },
      {
        "@type": "WebPage",
        "@id": `${pageUrl}#webpage`,
        url: pageUrl,
        name: outbreak.seoTitle,
        isPartOf: { "@id": absoluteUrl("/#website") },
        about: { "@id": `${pageUrl}#dataset` },
        inLanguage: "en",
        ...(last ? { dateModified: last } : {}),
      },
      {
        "@type": "Dataset",
        "@id": `${pageUrl}#dataset`,
        name: outbreak.dataset.name,
        description: outbreak.dataset.description,
        url: archived ? pageUrl : absoluteUrl("/data"),
        keywords: [...outbreak.keywords],
        license: DATA_LICENSE,
        isAccessibleForFree: true,
        creator: { "@type": "Organization", name: SITE_NAME, url: absoluteUrl("/") },
        isBasedOn: outbreak.dataset.isBasedOn,
        spatialCoverage: [...outbreak.countries],
        ...(first && last ? { temporalCoverage: `${first}/${last}`, dateModified: last } : {}),
        // A hand-curated record has no daily readings, so its toll endpoint is not offered as a download.
        ...(archived ? {} : { distribution }),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        // "<" is escaped so no field value can close the script element.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <div className="mx-auto w-full max-w-[1360px] px-[clamp(1rem,3vw,2.5rem)] pb-10">
        {/* ── Masthead ───────────────────────────────────────────── */}
        <header className="rise pt-7 pb-5 border-b-4 border-double border-ink">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
            <div className="min-w-0 max-w-[46rem]">
              <p className="mb-2 flex items-center gap-2 text-[0.8125rem] font-semibold uppercase tracking-[0.12em] text-death">
                {!archived && (
                  <span
                    className="live-dot size-2 rounded-full bg-death animate-pulse"
                    aria-hidden
                  />
                )}
                <Link
                  href="/"
                  className="underline decoration-death/40 underline-offset-4 hover:decoration-death"
                >
                  {SITE_NAME}
                </Link>
              </p>
              <h1 className="font-journal text-[clamp(1.875rem,4.2vw,2.875rem)] font-bold leading-[1.1] tracking-[-0.01em] text-ink">
                {outbreak.title}
              </h1>
              <p className="mt-2 text-base text-ink-muted">{outbreak.subtitle}</p>
              {archived && (
                <p
                  data-testid="archived-record"
                  className="mt-3 inline-block rounded-md border border-rule-strong bg-sunk px-2.5 py-1 text-[0.875rem] font-semibold text-ink"
                >
                  Archived record · last verified {dayMonthYear(lastVerified)}
                </p>
              )}
              {outbreak.corrections?.map((c) => (
                <p key={c.date} data-testid="correction" className="mt-2 text-[0.875rem] text-ink-muted">
                  <span className="font-semibold text-ink">Corrected {dayMonthYear(c.date, "short")}:</span>{" "}
                  {c.note}
                </p>
              ))}
            </div>

            <div className="flex flex-col gap-3 xl:items-end">
              <dl className="flex flex-wrap gap-x-6 gap-y-2">
                {dates.map((d) => (
                  <div key={d.label}>
                    <dt className="text-[0.8125rem] text-ink-faint">{d.label}</dt>
                    <dd className="font-journal text-base font-semibold tabular-nums text-ink">
                      {d.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <nav aria-label="Official sources" className="flex flex-wrap gap-x-5 gap-y-1">
                {outbreak.links.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[0.9375rem] font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
                  >
                    {link.label}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                ))}
              </nav>
            </div>
          </div>
        </header>

        <main id="main" className="pt-6">
          {/* ── Headline figures ─────────────────────────────────── */}
          <div className="rise" style={{ "--i": 1 } as React.CSSProperties}>
            <StatStrip timeline={timeline} summary={outbreak.summary} />
          </div>

          {/* ── Figures ──────────────────────────────────────────── */}
          {/* Panels are paired by row (map|chart, table|trend) so neither column runs
              long and leaves a blank gap; feed and sponsor then span the full width. */}
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
            <section
              aria-labelledby="map-heading"
              className="panel rise min-w-0 lg:col-span-7"
              style={{ "--i": 2 } as React.CSSProperties}
            >
              <PanelHeader
                kicker="Fig. 1"
                id="map-heading"
                title={
                  outbreak.map?.route
                    ? "Route & reported cases"
                    : archived
                      ? "Where cases were reported"
                      : "Where cases are reported"
                }
              />
              <div className="h-[26rem] overflow-hidden rounded-lg border border-rule sm:h-[32rem]">
                <MapLoader
                  spreadStops={outbreak.spreadStops}
                  caseLocations={outbreak.caseLocations}
                  view={outbreak.map}
                  archived={archived}
                />
              </div>
            </section>

            <section
              aria-labelledby="chart-heading"
              className="panel rise min-w-0 lg:col-span-5"
              style={{ "--i": 3 } as React.CSSProperties}
            >
              <CasesChart
                timeline={timeline}
                headingId="chart-heading"
                reference={outbreak.chartReference}
              />
            </section>

            <section
              aria-labelledby="table-heading"
              className="panel rise min-w-0 lg:col-span-7"
              style={{ "--i": 4 } as React.CSSProperties}
            >
              <MonitoringTable
                monitoringData={outbreak.monitoringData}
                candidates={candidatesData.candidates}
                headingId="table-heading"
                title={
                  outbreak.monitoringData.some((r) => r.parentIso) ? (
                    <>By country &amp; province</>
                  ) : (
                    "By country"
                  )
                }
                sources={outbreak.tableSources ?? outbreak.summary.source}
                showCfr={outbreak.summary.fatalityBasis !== "all-cases"}
              />
            </section>

            {showTrend ? (
              <section
                aria-labelledby="trend-heading"
                className="panel rise min-w-0 lg:col-span-5"
                style={{ "--i": 4 } as React.CSSProperties}
              >
                <TrendPanel metrics={metrics} headingId="trend-heading" />
              </section>
            ) : (
              <section
                aria-labelledby="record-heading"
                className="panel rise min-w-0 lg:col-span-5"
                style={{ "--i": 4 } as React.CSSProperties}
              >
                <PanelHeader kicker="About" id="record-heading" title="About this record" />
                <div className="space-y-3 text-[0.9375rem] leading-relaxed text-ink-muted">
                  <p className="text-ink">{outbreak.description}</p>
                  <p>
                    Figures are hand-curated from the cited sources and are not updated
                    automatically. Each point on Fig. 2 and each row of Table 1 names its source;
                    the record was last checked against them on {dayMonthYear(lastVerified)}.
                  </p>
                  <p>Sources: {outbreak.summary.source}.</p>
                </div>
              </section>
            )}

            <section
              aria-labelledby="feed-heading"
              className="panel rise min-w-0 lg:col-span-12"
              style={{ "--i": 5 } as React.CSSProperties}
            >
              <FeedUpdates
                items={liveData.recentItems}
                lastFetched={liveData.lastFetched}
                headingId="feed-heading"
                archived={archived}
              />
            </section>

            <div className="rise lg:col-span-12" style={{ "--i": 6 } as React.CSSProperties}>
              <SponsorCard />
            </div>
          </div>
        </main>

        {/* ── Disclaimer ─────────────────────────────────────────── */}
        <footer className="mt-10 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-t border-rule-strong pt-5">
          <p className="max-w-[46rem] text-[0.9375rem] text-ink-muted">
            Not an official public health resource. Data manually compiled from public sources —
            verify with official authorities.
          </p>
          <p className="text-[0.8125rem] tabular-nums text-ink-faint">
            Source: {outbreak.summary.source}
            {FOOTER_LINKS.map((l) => (
              <span key={l.href}>
                {" · "}
                <Link
                  href={l.href}
                  className="font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
                >
                  {l.label}
                </Link>
              </span>
            ))}
          </p>
        </footer>
      </div>
    </>
  );
}
