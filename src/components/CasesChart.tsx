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
  Legend,
  ReferenceLine,
  type TooltipContentProps,
} from "recharts";
import type { CaseDataPoint } from "@/data/outbreak";

const PHEIC_DATE = "2026-05-16";
const PHEIC_T = Date.parse(PHEIC_DATE);
const TICK_COUNT = 6;

interface ChartRow {
  t: number;
  date: string;
  Deaths?: number;
  Confirmed?: number;
  Suspected?: number;
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
      <div className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2.5 text-xs shadow-xl max-w-[260px]">
        <div className="font-semibold text-white mb-1.5">{fmtDay(row.t)}</div>
        {items.map((p) => (
          <div key={String(p.name)} className="flex items-center gap-2 mb-0.5">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: p.color }}
            />
            <span className="text-gray-300">{p.name}:</span>
            <span className="font-medium text-white tabular-nums">
              {fmtNum(p.value as number)}
            </span>
          </div>
        ))}
        {entry?.note && (
          <div className="mt-2 pt-2 border-t border-white/10 text-gray-400 leading-snug">
            {entry.note}
          </div>
        )}
        {entry?.source && (
          <div className="mt-1 text-gray-500 italic">Source: {entry.source}</div>
        )}
      </div>
    );
  };
}

export default function CasesChart({ timeline }: { timeline: CaseDataPoint[] }) {
  const { data, ticks, tooltip, hasSuspected } = useMemo(() => {
    const rows: ChartRow[] = timeline
      .map((d) => ({
        t: Date.parse(d.date),
        date: d.date,
        Deaths: d.deaths,
        Confirmed: d.confirmed,
        Suspected: d.suspected,
      }))
      .filter((r) => !Number.isNaN(r.t))
      .sort((a, b) => a.t - b.t);

    const min = Math.min(rows[0]?.t ?? PHEIC_T, PHEIC_T);
    const max = rows[rows.length - 1]?.t ?? PHEIC_T;
    const tickList = Array.from({ length: TICK_COUNT }, (_, i) =>
      Math.round(min + ((max - min) * i) / (TICK_COUNT - 1)),
    );

    return {
      data: rows,
      ticks: tickList,
      tooltip: makeTooltip(new Map(timeline.map((d) => [d.date, d]))),
      hasSuspected: rows.some((r) => r.Suspected !== undefined),
    };
  }, [timeline]);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-white/90 uppercase tracking-wider">
          Cumulative deaths &amp; cases
        </h2>
        <span className="text-xs text-gray-500">WHO · INSP DRC · daily auto-tracking</span>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[(dataMin: number) => Math.min(dataMin, PHEIC_T), "dataMax"]}
              ticks={ticks}
              tickFormatter={fmtDay}
              tick={{ fill: "#9ca3af", fontSize: 11 }}
              axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#9ca3af", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              tickFormatter={fmtNum}
              width={48}
            />
            <Tooltip content={tooltip} />
            <Legend
              wrapperStyle={{ fontSize: "11px", color: "#9ca3af", paddingTop: "8px" }}
            />
            <ReferenceLine
              x={PHEIC_T}
              stroke="rgba(255,255,255,0.25)"
              strokeDasharray="4 2"
              label={{
                value: "WHO PHEIC",
                fill: "#6b7280",
                fontSize: 10,
                position: "insideTopRight",
              }}
            />
            <Line
              type="monotone"
              dataKey="Confirmed"
              stroke="#f97316"
              strokeWidth={2}
              connectNulls
              dot={{ fill: "#f97316", r: 2.5, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
            {hasSuspected && (
              <Line
                type="monotone"
                dataKey="Suspected"
                stroke="#facc15"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                connectNulls
                dot={{ fill: "#facc15", r: 2.5, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            )}
            <Line
              type="monotone"
              dataKey="Deaths"
              stroke="#ef4444"
              strokeWidth={3.5}
              connectNulls
              dot={{ fill: "#ef4444", r: 3, strokeWidth: 0 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
