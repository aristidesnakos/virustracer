"use client";

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
} from "recharts";
import { casesTimeline } from "@/data/outbreak";

interface TooltipEntry {
  name?: string;
  value?: number;
  color?: string;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const entry = casesTimeline.find((d) => d.label === label);
  return (
    <div className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2.5 text-xs shadow-xl max-w-[240px]">
      <div className="font-semibold text-white mb-1.5">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-gray-300">{p.name}:</span>
          <span className="font-medium text-white">{p.value}</span>
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
}

export default function CasesChart() {
  const data = casesTimeline.map((d) => ({
    label: d.label,
    "Confirmed": d.confirmed,
    "Suspected": d.suspected,
    "Deaths": d.deaths,
  }));

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-white/90 uppercase tracking-wider">
          Cumulative Cases
        </h2>
        <span className="text-xs text-gray-500">WHO / CDC / AP</span>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="label"
              tick={{ fill: "#9ca3af", fontSize: 11 }}
              axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#9ca3af", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              domain={[0, 14]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: "11px", color: "#9ca3af", paddingTop: "8px" }}
            />
            <ReferenceLine
              x="May 12"
              stroke="rgba(255,255,255,0.15)"
              strokeDasharray="4 2"
              label={{ value: "WHO briefing", fill: "#6b7280", fontSize: 10, position: "insideTopRight" }}
            />
            <Line
              type="monotone"
              dataKey="Confirmed"
              stroke="#f97316"
              strokeWidth={2}
              dot={{ fill: "#f97316", r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="Suspected"
              stroke="#facc15"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={{ fill: "#facc15", r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="Deaths"
              stroke="#ef4444"
              strokeWidth={2}
              dot={{ fill: "#ef4444", r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
