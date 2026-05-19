"use client";

import { useSyncExternalStore } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import type { TrendPoint } from "@/lib/outbreak-trend";

export interface SparkAreaProps {
  data: TrendPoint[];
  color?: string;
  height?: number;
  ariaLabel?: string;
}

const noopSubscribe = () => () => {};

export function SparkArea({
  data,
  color = "var(--color-chart-1)",
  height = 36,
  ariaLabel,
}: SparkAreaProps) {
  // Recharts' ResponsiveContainer measures the DOM, which is impossible during SSR
  // and triggers width(-1)/height(-1) warnings. Render the chart only on the client
  // by deriving an isClient flag from useSyncExternalStore — the canonical hook
  // for client-only rendering without setState-in-effect.
  const isClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  if (data.length < 2 || !isClient) {
    return <div style={{ height }} aria-label={ariaLabel} />;
  }

  return (
    <div style={{ height }} aria-label={ariaLabel} role="img">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 2, right: 0, bottom: 2, left: 0 }}
        >
          <defs>
            <linearGradient id={`sparkfill-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#sparkfill-${color})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
