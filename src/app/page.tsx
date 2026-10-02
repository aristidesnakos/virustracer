import CasesChart from "@/components/CasesChart";
import MonitoringTable from "@/components/MonitoringTable";
import FeedUpdates from "@/components/FeedUpdates";
import MapLoader from "@/components/MapLoader";
import SponsorCard from "@/components/SponsorCard";
import StatStrip from "@/components/StatStrip";
import { outbreak, summary, casesTimeline } from "@/data/outbreak";
import { getLiveData } from "@/lib/live-data";
import { getTollData } from "@/lib/toll";
import { mergeTimeline, latestDate } from "@/lib/timeline";
import { getCandidatesData } from "@/lib/candidates-data";

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

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-950">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-white/[0.07] px-5 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex flex-col items-center justify-center w-7 h-7 rounded bg-red-500/15 border border-red-500/30 shrink-0">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-white leading-none truncate">
              {outbreak.title}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5 leading-none truncate">
              {outbreak.subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-600">Toll</span>
          <span className="text-xs text-gray-400 font-medium tabular-nums">
            {shortDate(latestDate(timeline))}
          </span>
          <span className="text-gray-700">·</span>
          <span className="text-xs text-gray-600">Checked</span>
          <span className="text-xs text-gray-400 font-medium tabular-nums">
            {shortDate(toll.lastChecked)}
          </span>
          <span className="text-gray-700">·</span>
          <span className="text-xs text-gray-600">Feed</span>
          <span className="text-xs text-gray-400 font-medium tabular-nums">
            {shortDate(liveData.lastFetched)}
          </span>
          {outbreak.links.map((link) => (
            <span key={link.href} className="flex items-center gap-2">
              <span className="text-gray-700">·</span>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400/70 hover:text-blue-400 transition-colors"
              >
                {link.label}
              </a>
            </span>
          ))}
        </div>
      </header>

      {/* ── Stat strip ─────────────────────────────────────────── */}
      <StatStrip timeline={timeline} />

      {/* ── Main grid ──────────────────────────────────────────── */}
      <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px_320px] gap-3 px-5 pb-5">

        {/* Map */}
        <div className="min-h-[340px] lg:min-h-0 bg-gray-900/40 border border-white/[0.07] rounded-xl overflow-hidden relative">
          <MapLoader />
        </div>

        {/* Center column: chart + table */}
        <div className="flex flex-col gap-3 min-h-0">
          <div className="h-[220px] lg:h-[230px] shrink-0 bg-gray-900/40 border border-white/[0.07] rounded-xl p-4">
            <CasesChart timeline={timeline} />
          </div>
          <div className="flex-1 min-h-0 bg-gray-900/40 border border-white/[0.07] rounded-xl p-4 overflow-hidden">
            <MonitoringTable candidates={candidatesData.candidates} />
          </div>
        </div>

        {/* Right column: feed + sponsor (xl only, collapses on lg) */}
        <div className="hidden xl:flex flex-col min-h-0 gap-3">
          <div className="flex-1 min-h-0 bg-gray-900/40 border border-white/[0.07] rounded-xl p-4 overflow-hidden">
            <FeedUpdates
              items={liveData.recentItems}
              lastFetched={liveData.lastFetched}
            />
          </div>
          <SponsorCard />
        </div>
      </main>

      {/* ── Disclaimer ─────────────────────────────────────────── */}
      <footer className="shrink-0 border-t border-white/[0.07] px-5 py-2 flex items-center justify-between">
        <p className="text-xs text-gray-600">
          Not an official public health resource. Data manually compiled from public sources — verify with official authorities.
        </p>
        <p className="text-xs text-gray-700 tabular-nums">
          Source: {summary.source}
        </p>
      </footer>
    </div>
  );
}
