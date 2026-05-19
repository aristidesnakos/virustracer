import { Card, CardContent } from "@/components/ui/card";
import { Metric } from "@/components/ui/metric";
import { BadgeDelta } from "@/components/ui/badge-delta";
import { SparkArea } from "@/components/ui/spark-area";
import { casesTimeline, summary } from "@/data/outbreak";
import { computeTrend, type TrendField } from "@/lib/outbreak-trend";

const WINDOW_DAYS = 7;

interface StatTile {
  label: string;
  field?: TrendField;
  value?: string | number;
  accent: string;
  sparkColor?: string;
  caption?: string;
}

const TILES: StatTile[] = [
  {
    label: "Confirmed cases",
    field: "confirmed",
    accent: "text-orange-300",
    sparkColor: "#fb923c",
  },
  {
    label: "Deaths",
    field: "deaths",
    accent: "text-red-300",
    sparkColor: "#f87171",
  },
  {
    label: "Probable",
    field: "suspected",
    accent: "text-yellow-200",
    sparkColor: "#facc15",
  },
];

export default function StatStrip() {
  return (
    <div
      data-testid="stat-strip"
      className="shrink-0 px-5 py-3 grid grid-flow-col auto-cols-max gap-3 overflow-x-auto"
    >
      {TILES.map((tile) => {
        const trend = computeTrend(
          casesTimeline,
          tile.field!,
          WINDOW_DAYS,
          summary.lastUpdated,
        );
        return (
          <Card
            key={tile.label}
            size="sm"
            className="min-w-[180px] bg-white/[0.03] ring-white/[0.06]"
          >
            <CardContent className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
                  {tile.label}
                </span>
                <BadgeDelta
                  delta={trend.delta}
                  aria-label={`${tile.label} change in last ${WINDOW_DAYS} days`}
                />
              </div>
              <Metric className={tile.accent}>{trend.current}</Metric>
              <SparkArea
                data={trend.series}
                color={tile.sparkColor}
                ariaLabel={`${tile.label} sparkline`}
              />
            </CardContent>
          </Card>
        );
      })}

      <Card
        size="sm"
        className="min-w-[150px] bg-white/[0.03] ring-white/[0.06]"
      >
        <CardContent className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
            Under monitoring
          </span>
          <Metric className="text-yellow-200">{summary.totalMonitored}</Metric>
          <span className="text-[10px] text-gray-600">
            across {summary.countriesAffected} countries
          </span>
        </CardContent>
      </Card>

      <Card
        size="sm"
        className="min-w-[200px] bg-white/[0.03] ring-white/[0.06]"
      >
        <CardContent className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
            Ship status
          </span>
          <div className="text-sm font-semibold text-blue-300 leading-tight">
            {summary.shipStatus}
          </div>
          <span className="text-[10px] text-gray-600">
            {summary.vessel} · {summary.operator}
          </span>
        </CardContent>
      </Card>
    </div>
  );
}
