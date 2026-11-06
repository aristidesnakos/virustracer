"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  type TooltipContentProps,
} from "recharts";
import type { CaseDataPoint } from "@/data/outbreaks";
import PanelHeader from "@/components/PanelHeader";
import { evenTicks } from "@/lib/chart-ticks";

const TICK_COUNT = 6;

interface ChartRow {
  t: number;
  date: string;
  Deaths?: number;
  Confirmed?: number;
  Suspected?: number;
  Screening?: number;
}

const fmtNum = (n: number) => n.toLocaleString("en-US");

const fmtDay = (t: number) =>
  new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

function makeTooltip(byDate: Map<string, CaseDataPoint>) {
  return function CustomTooltip({
    active,
    payload,
  }: TooltipContentProps) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload as ChartRow | undefined;
    if (!row) return null;
    const entry = byDate.get(row.date);
    const items = payload.filter((p) => typeof p.value === "number");
    return (
      <div className="bg-panel border border-rule-strong rounded-lg px-3 py-2.5 text-[0.8125rem] leading-snug shadow-md max-w-[260px] pointer-events-none">
        <div className="font-journal font-semibold text-ink mb-1.5">{fmtDay(row.t)}</div>
        {items.map((p) => (
          <div key={String(p.name)} className="flex items-center gap-2 mb-0.5">
            <span
              className="size-2.5 rounded-full shrink-0"
              style={{ background: p.color }}
            />
            <span className="text-ink-muted">{p.name}:</span>
            <span className="font-semibold text-ink tabular-nums">
              {fmtNum(p.value as number)}
            </span>
          </div>
        ))}
        {entry?.note && (
          <div className="mt-2 pt-2 border-t border-rule text-ink-muted line-clamp-3">
            {entry.note}
          </div>
        )}
        {entry?.source && (
          <div className="mt-1 text-ink-faint italic line-clamp-2">Source: {entry.source}</div>
        )}
      </div>
    );
  };
}

/** Plain-language read-out of the newest values, for screen readers. */
function describeLatest(rows: ChartRow[], names: Record<SeriesKey, string>): string {
  const latest = (key: SeriesKey) => {
    for (let i = rows.length - 1; i >= 0; i--) {
      const v = rows[i][key];
      if (v !== undefined) return `${fmtNum(v)} ${names[key].toLowerCase()} (${fmtDay(rows[i].t)})`;
    }
    return null;
  };
  const parts = (["Deaths", "Confirmed", "Suspected", "Screening"] as const)
    .map(latest)
    .filter((p): p is string => p !== null);
  if (rows.length === 0 || parts.length === 0) return "No data points yet.";
  return `Line chart of cumulative figures from ${fmtDay(rows[0].t)} to ${fmtDay(
    rows[rows.length - 1].t,
  )}. Latest: ${parts.join("; ")}.`;
}

type SeriesKey = "Deaths" | "Confirmed" | "Suspected" | "Screening";

function LegendKey({
  color,
  label,
  dashed,
  weight = 2,
}: {
  color: string;
  label: string;
  dashed?: boolean;
  weight?: number;
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        className="h-0 w-6"
        style={{
          borderTop: `${weight}px ${dashed ? "dashed" : "solid"} ${color}`,
        }}
        aria-hidden
      />
      {label}
    </li>
  );
}

export default function CasesChart({
  timeline,
  headingId,
  reference,
  casesLabel = "Confirmed",
  screeningLabel = "Screening",
}: {
  timeline: CaseDataPoint[];
  headingId?: string;
  /** A dated event drawn as a labelled vertical line, e.g. a WHO emergency declaration. */
  reference?: { date: string; label: string };
  /** Name of the confirmed series where "Confirmed" would mislead (e.g. "Clinical cases"). */
  casesLabel?: string;
  /** Name of the `screening` series, drawn only when the timeline has one. */
  screeningLabel?: string;
}) {
  const refT = reference ? Date.parse(reference.date) : Number.NaN;
  const hasRef = !Number.isNaN(refT);
  const { data, ticks, tooltip, hasSuspected, hasScreening, hasDeaths, summary } = useMemo(() => {
    const rows: ChartRow[] = timeline
      .map((d) => ({
        t: Date.parse(d.date),
        date: d.date,
        Deaths: d.deaths,
        Confirmed: d.confirmed,
        Suspected: d.suspected,
        Screening: d.screening,
      }))
      .filter((r) => !Number.isNaN(r.t))
      .sort((a, b) => a.t - b.t);

    // The axis starts early enough to show the reference line.
    const first = rows[0]?.t ?? (hasRef ? refT : 0);
    const min = hasRef ? Math.min(first, refT) : first;
    const max = rows[rows.length - 1]?.t ?? (hasRef ? refT : 0);
    const tickList = evenTicks(min, max, TICK_COUNT);

    return {
      data: rows,
      ticks: tickList,
      tooltip: makeTooltip(new Map(timeline.map((d) => [d.date, d]))),
      hasSuspected: rows.some((r) => r.Suspected !== undefined),
      hasScreening: rows.some((r) => r.Screening !== undefined),
      // A source with no deaths at all (NNDSS) draws no deaths line and says so in the title.
      hasDeaths: rows.length === 0 || rows.some((r) => r.Deaths !== undefined),
      summary: describeLatest(rows, { Deaths: "Deaths", Confirmed: casesLabel, Suspected: "Suspected", Screening: screeningLabel }),
    };
  }, [timeline, hasRef, refT, casesLabel, screeningLabel]);

  return (
    <div className="flex w-full flex-1 flex-col">
      <PanelHeader
        kicker="Fig. 2"
        id={headingId}
        title={hasDeaths ? <>Cumulative deaths &amp; cases</> : <>Cumulative cases</>}
      />
      <ul
        className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.8125rem] font-medium text-ink-muted"
        aria-label="Chart legend"
      >
        {hasDeaths && <LegendKey color="var(--death)" label="Deaths" weight={4} />}
        <LegendKey color="var(--confirmed)" label={casesLabel} weight={2.5} />
        {hasSuspected && <LegendKey color="var(--suspected)" label="Suspected" dashed weight={2} />}
        {hasScreening && <LegendKey color="var(--suspected)" label={screeningLabel} dashed weight={2} />}
      </ul>
      <p className="sr-only">{summary}</p>
      {/* Grows with the row (the map beside it is taller); the minimum is the old fixed height. */}
      <div className="relative min-h-[16rem] flex-1 sm:min-h-[18rem]">
        {/* Recharts' 100% height needs a definite parent, which a flex-grown box is not. */}
        <div className="absolute inset-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--rule)" />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={[(dataMin: number) => (hasRef ? Math.min(dataMin, refT) : dataMin), "dataMax"]}
                ticks={ticks}
                tickFormatter={fmtDay}
                tick={{ fill: "var(--ink-muted)", fontSize: 13 }}
                axisLine={{ stroke: "var(--rule-strong)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "var(--ink-muted)", fontSize: 13 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                tickFormatter={fmtNum}
                width={58}
              />
              <Tooltip
                content={tooltip}
                isAnimationActive={false}
                cursor={{ stroke: "var(--ink-faint)", strokeDasharray: "3 3" }}
                offset={14}
                allowEscapeViewBox={{ x: false, y: true }}
                wrapperStyle={{ zIndex: 50, pointerEvents: "none" }}
              />
              {hasRef && (
                <ReferenceLine
                  x={refT}
                  stroke="var(--ink-faint)"
                  strokeDasharray="4 2"
                  label={{
                    value: reference?.label,
                    fill: "var(--ink-muted)",
                    fontSize: 12,
                    position: "insideTopLeft",
                    dx: 4,
                    dy: 2,
                  }}
                />
              )}
              <Line
                type="monotone"
                dataKey="Confirmed"
                name={casesLabel}
                stroke="var(--confirmed)"
                strokeWidth={2.5}
                connectNulls
                dot={{ fill: "var(--confirmed)", r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
              {hasSuspected && (
                <Line
                  type="monotone"
                  dataKey="Suspected"
                  stroke="var(--suspected)"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  connectNulls
                  dot={{ fill: "var(--suspected)", r: 2.5, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              )}
              {hasScreening && (
                <Line
                  type="monotone"
                  dataKey="Screening"
                  name={screeningLabel}
                  stroke="var(--suspected)"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  connectNulls
                  dot={{ fill: "var(--suspected)", r: 2.5, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              )}
              <Line
                type="monotone"
                dataKey="Deaths"
                stroke="var(--death)"
                strokeWidth={3.5}
                connectNulls
                dot={{ fill: "var(--death)", r: 3, strokeWidth: 0 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
