"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { evenTicks } from "@/lib/chart-ticks";

/** One week of national rates per 100,000 residents; null is missing data. */
export interface RatePoint {
  week: string;
  covidCaseRate: number | null;
  covidHospRate: number | null;
  fluCaseRate: number | null;
  fluHospRate: number | null;
  rsvCaseRate: number | null;
  rsvHospRate: number | null;
}

// Categorical slots 1-3 of the dataviz reference palette, validated against the page
// surface (CVD and normal-vision separation pass; aqua is under 3:1, so the legend names
// each series with its latest value and the same figures are in the tables below).
const SERIES = [
  { key: "covid", label: "COVID-19", color: "#2a78d6" },
  { key: "flu", label: "Influenza", color: "#eb6834" },
  { key: "rsv", label: "RSV", color: "#1baf7a" },
] as const;

type Measure = "Case" | "Hosp";

const fmtWeek = (t: number) =>
  new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit", timeZone: "UTC" });
const fmtRate = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function RatesTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const t = (payload[0].payload as { t: number }).t;
  return (
    <div className="pointer-events-none max-w-[260px] rounded-lg border border-rule-strong bg-panel px-3 py-2.5 text-[0.8125rem] leading-snug shadow-md">
      <div className="mb-1.5 font-journal font-semibold text-ink">Week ending {fmtWeek(t)}</div>
      {payload.map((p) => (
        <div key={String(p.name)} className="mb-0.5 flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
          <span className="text-ink-muted">{p.name}:</span>
          <span className="font-semibold tabular-nums text-ink">{typeof p.value === "number" ? fmtRate(p.value) : "no data"}</span>
        </div>
      ))}
    </div>
  );
}

/** National weekly rates per 100,000 residents for the three pathogens, cases or hospitalisations. */
export default function NursingHomeRatesChart({ points }: { points: RatePoint[] }) {
  const [measure, setMeasure] = useState<Measure>("Case");
  const { data, ticks, summary } = useMemo(() => {
    const rows = points.map((p) => ({
      t: Date.parse(`${p.week}T00:00:00Z`),
      "COVID-19": p[`covid${measure}Rate`],
      Influenza: p[`flu${measure}Rate`],
      RSV: p[`rsv${measure}Rate`],
    }));
    const last = rows.at(-1);
    const words = measure === "Case" ? "new cases" : "hospitalisations";
    const text = last
      ? `Line chart of weekly ${words} per 100,000 nursing-home residents nationally, ${fmtWeek(rows[0].t)} to ${fmtWeek(last.t)}. Latest week: ` +
        SERIES.map((s) => `${s.label} ${last[s.label] === null ? "no data" : fmtRate(last[s.label] as number)}`).join(", ") + "."
      : "No data yet.";
    return { data: rows, ticks: rows.length ? evenTicks(rows[0].t, last!.t, 5) : [], summary: text };
  }, [points, measure]);

  const last = data.at(-1);

  return (
    <figure className="space-y-3" aria-labelledby="rates-chart-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <figcaption id="rates-chart-title" className="font-journal text-lg font-semibold text-ink">
          {measure === "Case" ? "New cases" : "Hospitalisations"} per 100,000 residents, United States, weekly
        </figcaption>
        <div role="group" aria-label="Measure" className="inline-flex rounded-md border border-rule-strong p-0.5 text-[0.8125rem]">
          {(["Case", "Hosp"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={measure === m}
              onClick={() => setMeasure(m)}
              className={`rounded px-3 py-1 font-medium ${measure === m ? "bg-ink text-paper" : "text-ink-muted hover:text-ink"}`}
            >
              {m === "Case" ? "Cases" : "Hospitalisations"}
            </button>
          ))}
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[0.8125rem] font-medium text-ink-muted" aria-label="Chart legend, with the latest week's values">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className="h-0 w-6" style={{ borderTop: `2px solid ${s.color}` }} aria-hidden />
            {s.label}
            {last && (
              <span className="tabular-nums text-ink">
                {last[s.label] === null ? "no data" : fmtRate(last[s.label] as number)}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="sr-only">{summary}</p>
      <div className="h-[18rem] sm:h-[20rem]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--rule)" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              ticks={ticks}
              tickFormatter={fmtWeek}
              tick={{ fill: "var(--ink-muted)", fontSize: 12 }}
              axisLine={{ stroke: "var(--rule-strong)" }}
              tickLine={false}
            />
            <YAxis tick={{ fill: "var(--ink-muted)", fontSize: 12 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip content={RatesTooltip} cursor={{ stroke: "var(--rule-strong)" }} />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.label}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: "var(--panel)", strokeWidth: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
