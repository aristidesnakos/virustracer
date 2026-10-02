import { Card, CardContent } from "@/components/ui/card";
import { Metric } from "@/components/ui/metric";
import { BadgeDelta } from "@/components/ui/badge-delta";
import { SparkArea } from "@/components/ui/spark-area";
import { casesTimeline, summary, type CaseDataPoint } from "@/data/outbreak";
import { computeTrend, type TrendField } from "@/lib/outbreak-trend";
import { latestDate } from "@/lib/timeline";

const WINDOW_DAYS = 7;

const fmt = (n: number) => n.toLocaleString("en-US");

interface StatTile {
  label: string;
  field: TrendField;
  accent: string;
  sparkColor: string;
  headline?: boolean;
}

const TILES: StatTile[] = [
  {
    label: "Deaths",
    field: "deaths",
    accent: "text-red-400",
    sparkColor: "#f87171",
    headline: true,
  },
  {
    label: "Confirmed cases",
    field: "confirmed",
    accent: "text-orange-300",
    sparkColor: "#fb923c",
  },
  {
    label: "Suspected",
    field: "suspected",
    accent: "text-yellow-200",
    sparkColor: "#facc15",
  },
];

/** Case fatality from the most recent point that reports both deaths and confirmed cases. */
function caseFatality(timeline: readonly CaseDataPoint[]): string {
  const sorted = [...timeline].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const { deaths, confirmed } = sorted[i];
    if (deaths !== undefined && confirmed !== undefined && confirmed > 0) {
      return `${((deaths / confirmed) * 100).toFixed(1)}%`;
    }
  }
  return "—";
}

const LABEL_CLASS = "text-[10px] uppercase tracking-wider text-gray-500 font-medium";

export default function StatStrip({
  timeline = casesTimeline,
}: {
  timeline?: CaseDataPoint[];
}) {
  const asOf = timeline.length > 0 ? (latestDate(timeline) ?? undefined) : undefined;

  return (
    <div
      data-testid="stat-strip"
      className="shrink-0 px-5 py-3 flex gap-3 overflow-x-auto"
    >
      {TILES.map((tile) => {
        const trend = computeTrend(timeline, tile.field, WINDOW_DAYS, asOf, {
          interpolateBaseline: true,
        });
        const hasSeries = trend.series.length > 0;
        return (
          <Card
            key={tile.label}
            size="sm"
            className={
              tile.headline
                ? "flex-[1.6] min-w-[240px] bg-red-500/[0.07] ring-red-500/30"
                : "flex-1 min-w-[170px] bg-white/[0.03] ring-white/[0.06]"
            }
          >
            <CardContent className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={
                    tile.headline
                      ? "text-xs uppercase tracking-wider text-red-300 font-semibold"
                      : LABEL_CLASS
                  }
                >
                  {tile.label}
                </span>
                {trend.series.length > 1 && (
                  <BadgeDelta
                    delta={trend.delta}
                    format={(d) => (d === 0 ? "0" : `${d > 0 ? "+" : "−"}${fmt(Math.abs(d))}`)}
                    aria-label={`${tile.label} change in last ${WINDOW_DAYS} days`}
                  />
                )}
              </div>
              <Metric
                className={`${tile.accent} ${tile.headline ? "text-5xl leading-none py-1" : ""}`}
              >
                {hasSeries ? fmt(trend.current) : "—"}
              </Metric>
              <SparkArea
                data={trend.series}
                color={tile.sparkColor}
                height={tile.headline ? 44 : 36}
                ariaLabel={`${tile.label} sparkline`}
              />
            </CardContent>
          </Card>
        );
      })}

      <Card size="sm" className="flex-1 min-w-[150px] bg-white/[0.03] ring-white/[0.06]">
        <CardContent className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Case fatality</span>
          <Metric className="text-red-300">{caseFatality(timeline)}</Metric>
          <span className="text-[10px] text-gray-600">deaths / confirmed</span>
        </CardContent>
      </Card>

      <Card size="sm" className="flex-1 min-w-[170px] bg-white/[0.03] ring-white/[0.06]">
        <CardContent className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Contacts followed up</span>
          <Metric className="text-yellow-200">
            {summary.contactsUnderFollowUp.toLocaleString("en-US")}
          </Metric>
          <span className="text-[10px] text-gray-600">under follow-up</span>
        </CardContent>
      </Card>

      <Card size="sm" className="flex-[1.4] min-w-[240px] bg-white/[0.03] ring-white/[0.06]">
        <CardContent className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Spread</span>
          <div className="text-sm font-semibold text-blue-300 leading-tight">
            {summary.spreadStatus}
          </div>
          <span className="text-[10px] text-gray-600">
            {`${summary.provincesAffected} provinces · ${summary.healthZonesAffected} health zones · ${summary.countriesAffected} countries`}
          </span>
        </CardContent>
      </Card>
    </div>
  );
}
