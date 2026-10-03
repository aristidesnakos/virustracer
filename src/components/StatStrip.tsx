import { Metric } from "@/components/ui/metric";
import { BadgeDelta } from "@/components/ui/badge-delta";
import { SparkArea } from "@/components/ui/spark-area";
import type { CaseDataPoint, OutbreakSummary } from "@/data/outbreaks";
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
  cell: string;
}

const TILES: StatTile[] = [
  {
    label: "Deaths",
    field: "deaths",
    accent: "text-death",
    sparkColor: "var(--death)",
    headline: true,
    cell: "col-span-2 lg:col-span-1",
  },
  {
    label: "Confirmed cases",
    field: "confirmed",
    accent: "text-confirmed",
    sparkColor: "var(--confirmed)",
    cell: "",
  },
  {
    label: "Suspected",
    field: "suspected",
    accent: "text-suspected-text",
    sparkColor: "var(--suspected)",
    cell: "",
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

const LABEL_CLASS =
  "text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-ink-muted";
const NOTE_CLASS = "text-[0.8125rem] leading-snug text-ink-faint";
const CELL_CLASS = "flex flex-col justify-between gap-2 bg-panel px-5 py-4";

export default function StatStrip({
  timeline,
  summary,
}: {
  timeline: CaseDataPoint[];
  summary: OutbreakSummary;
}) {
  const asOf = timeline.length > 0 ? (latestDate(timeline) ?? undefined) : undefined;

  return (
    <section
      data-testid="stat-strip"
      aria-labelledby="figures-heading"
      // The 1px gaps over a rule-coloured ground draw the dividing hairlines.
      className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule lg:grid-cols-[1.7fr_1.1fr_1fr_0.9fr_1.1fr_1.7fr]"
    >
      <h2 id="figures-heading" className="sr-only">
        Headline figures
      </h2>

      {TILES.map((tile) => {
        const trend = computeTrend(timeline, tile.field, WINDOW_DAYS, asOf, {
          interpolateBaseline: true,
        });
        const hasSeries = trend.series.length > 0;
        return (
          <div key={tile.label} data-slot="figure" className={`${CELL_CLASS} ${tile.cell}`}>
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
              <span className={LABEL_CLASS}>{tile.label}</span>
              {trend.series.length > 1 && (
                <BadgeDelta
                  delta={trend.delta}
                  format={(d) => (d === 0 ? "0" : `${d > 0 ? "+" : "−"}${fmt(Math.abs(d))}`)}
                  aria-label={`${tile.label} change in last ${WINDOW_DAYS} days`}
                />
              )}
            </div>
            <Metric
              className={`font-journal font-bold leading-none ${tile.accent} ${
                tile.headline ? "text-[clamp(2.5rem,5vw,3.25rem)]" : "text-[2.25rem]"
              }`}
            >
              {hasSeries ? fmt(trend.current) : "—"}
            </Metric>
            <SparkArea
              data={trend.series}
              color={tile.sparkColor}
              height={tile.headline ? 36 : 28}
              ariaLabel={`${tile.label} sparkline`}
            />
          </div>
        );
      })}

      <div data-slot="figure" className={CELL_CLASS}>
        <span className={LABEL_CLASS}>Case fatality</span>
        <Metric className="font-journal text-[2.25rem] font-bold leading-none text-death">
          {caseFatality(timeline)}
        </Metric>
        <span className={NOTE_CLASS}>deaths / confirmed</span>
      </div>

      <div data-slot="figure" className={CELL_CLASS}>
        <span className={LABEL_CLASS}>Contacts followed up</span>
        <Metric className="font-journal text-[2.25rem] font-bold leading-none text-ink">
          {summary.contactsUnderFollowUp.toLocaleString("en-US")}
        </Metric>
        <span className={NOTE_CLASS}>under follow-up</span>
      </div>

      <div data-slot="figure" className={`${CELL_CLASS} col-span-2 lg:col-span-1`}>
        <span className={LABEL_CLASS}>Spread</span>
        <div className="font-journal text-xl font-semibold leading-tight text-accent">
          {summary.spreadStatus}
        </div>
        <span className={NOTE_CLASS}>
          {`${summary.provincesAffected} provinces · ${summary.healthZonesAffected} health zones · ${summary.countriesAffected} countries`}
        </span>
      </div>
    </section>
  );
}
