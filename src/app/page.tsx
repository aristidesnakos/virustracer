import CasesChart from "@/components/CasesChart";
import MonitoringTable from "@/components/MonitoringTable";
import FeedUpdates from "@/components/FeedUpdates";
import MapLoader from "@/components/MapLoader";
import { summary } from "@/data/outbreak";
import { getLiveData } from "@/lib/live-data";

function StatCard({
  value,
  label,
  color = "text-white",
}: {
  value: string | number;
  label: string;
  color?: string;
}) {
  return (
    <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-5 py-3.5 flex flex-col gap-1">
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 uppercase tracking-wider font-medium">{label}</div>
    </div>
  );
}

export default function DashboardPage() {
  const liveData = getLiveData();

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
              MV Hondius Hantavirus Tracker
            </h1>
            <p className="text-xs text-gray-500 mt-0.5 leading-none">
              2026 outbreak · Andes hantavirus · Unofficial surveillance dashboard
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-600">Data as of</span>
          <span className="text-xs text-gray-400 font-medium tabular-nums">
            {new Date(summary.lastUpdated).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
          <span className="mx-1 text-gray-700">·</span>
          <a
            href="https://www.who.int/emergencies/disease-outbreak-news"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400/70 hover:text-blue-400 transition-colors"
          >
            WHO DON599
          </a>
          <span className="text-gray-700">·</span>
          <a
            href="https://www.cdc.gov/hantavirus"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400/70 hover:text-blue-400 transition-colors"
          >
            CDC
          </a>
        </div>
      </header>

      {/* ── Stat strip ─────────────────────────────────────────── */}
      <div className="shrink-0 px-5 py-3 flex gap-3 overflow-x-auto">
        <StatCard value={summary.totalConfirmed} label="Confirmed cases" color="text-orange-400" />
        <StatCard value={`+${summary.totalSuspected}`} label="Probable" color="text-yellow-400" />
        <StatCard value={summary.totalDeaths} label="Deaths" color="text-red-400" />
        <StatCard value={summary.totalMonitored} label="Under monitoring" color="text-yellow-300" />
        <StatCard value={summary.countriesAffected} label="Countries affected" />
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-5 py-3.5 flex flex-col gap-1 min-w-max">
          <div className="text-sm font-semibold text-blue-300 truncate">{summary.shipStatus}</div>
          <div className="text-xs text-gray-500 uppercase tracking-wider font-medium">Ship status</div>
        </div>
      </div>

      {/* ── Main grid ──────────────────────────────────────────── */}
      <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px_320px] gap-3 px-5 pb-5">

        {/* Map */}
        <div className="min-h-[340px] lg:min-h-0 bg-gray-900/40 border border-white/[0.07] rounded-xl overflow-hidden relative">
          <MapLoader />
        </div>

        {/* Center column: chart + table */}
        <div className="flex flex-col gap-3 min-h-0">
          <div className="h-[220px] lg:h-[230px] shrink-0 bg-gray-900/40 border border-white/[0.07] rounded-xl p-4">
            <CasesChart />
          </div>
          <div className="flex-1 min-h-0 bg-gray-900/40 border border-white/[0.07] rounded-xl p-4 overflow-hidden">
            <MonitoringTable />
          </div>
        </div>

        {/* Right column: feed (xl only, collapses on lg) */}
        <div className="hidden xl:flex flex-col min-h-0 bg-gray-900/40 border border-white/[0.07] rounded-xl p-4 overflow-hidden">
          <FeedUpdates
            items={liveData.recentItems}
            lastFetched={liveData.lastFetched}
          />
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
