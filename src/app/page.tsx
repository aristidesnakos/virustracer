import Link from "next/link";
import CasesChart from "@/components/CasesChart";
import MonitoringTable from "@/components/MonitoringTable";
import FeedUpdates from "@/components/FeedUpdates";
import MapLoader from "@/components/MapLoader";
import PanelHeader from "@/components/PanelHeader";
import SponsorCard from "@/components/SponsorCard";
import TrendPanel from "@/components/TrendPanel";
import AlertsInterestWidget from "@/components/AlertsInterestWidget";
import StatStrip from "@/components/StatStrip";
import { outbreak, summary, casesTimeline } from "@/data/outbreak";
import { getLiveData } from "@/lib/live-data";
import { getTollData } from "@/lib/toll";
import { mergeTimeline, latestDate } from "@/lib/timeline";
import { getCandidatesData } from "@/lib/candidates-data";
import { computeMetrics } from "@/lib/metrics";

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

export default function DashboardPage() {
  const liveData = getLiveData();
  const toll = getTollData();
  const timeline = mergeTimeline(casesTimeline, toll.snapshots);
  const candidatesData = getCandidatesData();
  // Rates come from the single-source daily snapshots only: mixing in hand-curated
  // milestone rows would add small cross-source jumps to the weekly counts.
  const metrics = computeMetrics(toll.snapshots);

  const dates = [
    { label: "Toll as of", value: shortDate(latestDate(timeline)) },
    { label: "Last checked", value: shortDate(toll.lastChecked) },
    { label: "News feed", value: shortDate(liveData.lastFetched) },
  ];

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <div className="mx-auto w-full max-w-[1360px] px-[clamp(1rem,3vw,2.5rem)] pb-10">
        {/* ── Masthead ───────────────────────────────────────────── */}
        <header className="rise pt-7 pb-5 border-b-4 border-double border-ink">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
            <div className="min-w-0 max-w-[46rem]">
              <p className="mb-2 flex items-center gap-2 text-[0.8125rem] font-semibold uppercase tracking-[0.12em] text-death">
                <span
                  className="live-dot size-2 rounded-full bg-death animate-pulse"
                  aria-hidden
                />
                Situation journal
              </p>
              <h1 className="font-journal text-[clamp(1.875rem,4.2vw,2.875rem)] font-bold leading-[1.1] tracking-[-0.01em] text-ink">
                {outbreak.title}
              </h1>
              <p className="mt-2 text-base text-ink-muted">{outbreak.subtitle}</p>
            </div>

            <div className="flex flex-col gap-3 sm:items-end">
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
            <StatStrip timeline={timeline} />
          </div>

          {/* ── Figures ──────────────────────────────────────────── */}
          <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
            {/* Left column: map + table */}
            <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
              <section
                aria-labelledby="map-heading"
                className="panel rise"
                style={{ "--i": 2 } as React.CSSProperties}
              >
                <PanelHeader
                  kicker="Fig. 1"
                  id="map-heading"
                  title="Where cases are reported"
                />
                <div className="h-[26rem] overflow-hidden rounded-lg border border-rule sm:h-[32rem]">
                  <MapLoader />
                </div>
              </section>

              <section
                aria-labelledby="table-heading"
                className="panel rise"
                style={{ "--i": 4 } as React.CSSProperties}
              >
                <MonitoringTable candidates={candidatesData.candidates} headingId="table-heading" />
              </section>
            </div>

            {/* Right column: chart + news + sponsor */}
            <div className="flex min-w-0 flex-col gap-6 lg:col-span-5">
              <section
                aria-labelledby="chart-heading"
                className="panel rise"
                style={{ "--i": 3 } as React.CSSProperties}
              >
                <CasesChart timeline={timeline} headingId="chart-heading" />
              </section>

              <section
                aria-labelledby="trend-heading"
                className="panel rise"
                style={{ "--i": 3 } as React.CSSProperties}
              >
                <TrendPanel metrics={metrics} headingId="trend-heading" />
              </section>

              <section
                aria-labelledby="feed-heading"
                className="panel rise"
                style={{ "--i": 5 } as React.CSSProperties}
              >
                <FeedUpdates
                  items={liveData.recentItems}
                  lastFetched={liveData.lastFetched}
                  headingId="feed-heading"
                />
              </section>

              <div className="rise" style={{ "--i": 6 } as React.CSSProperties}>
                <SponsorCard />
              </div>
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
            Source: {summary.source} ·{" "}
            <Link
              href="/data"
              className="font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
            >
              Data &amp; API
            </Link>
          </p>
        </footer>
      </div>

      <AlertsInterestWidget />
    </>
  );
}
