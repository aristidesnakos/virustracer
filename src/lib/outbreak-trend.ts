import type { CaseDataPoint } from "@/data/outbreak";

export type TrendField = "confirmed" | "suspected" | "deaths";

export interface TrendPoint {
  date: string;
  value: number;
}

export interface Trend {
  current: number;
  delta: number;
  windowDays: number;
  series: TrendPoint[];
}

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toUTCDay(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`invalid ISO date: ${iso}`);
  return Math.floor(t / MS_PER_DAY);
}

function sortAsc(timeline: readonly CaseDataPoint[]): CaseDataPoint[] {
  return [...timeline].sort((a, b) => toUTCDay(a.date) - toUTCDay(b.date));
}

function valueAtOrBefore(
  sorted: readonly CaseDataPoint[],
  field: TrendField,
  cutoffDay: number,
): number {
  let v = 0;
  for (const p of sorted) {
    if (toUTCDay(p.date) <= cutoffDay) v = p[field];
    else break;
  }
  return v;
}

export function computeTrend(
  timeline: readonly CaseDataPoint[],
  field: TrendField,
  windowDays: number,
  asOfISO?: string,
): Trend {
  if (timeline.length === 0) {
    return { current: 0, delta: 0, windowDays, series: [] };
  }
  const sorted = sortAsc(timeline);
  const lastPoint = sorted[sorted.length - 1];
  const asOfDay = asOfISO ? toUTCDay(asOfISO) : toUTCDay(lastPoint.date);
  const priorDay = asOfDay - windowDays;

  const current = valueAtOrBefore(sorted, field, asOfDay);
  const prior = valueAtOrBefore(sorted, field, priorDay);

  const series: TrendPoint[] = sorted
    .filter((p) => toUTCDay(p.date) <= asOfDay)
    .map((p) => ({ date: p.date, value: p[field] }));

  return { current, delta: current - prior, windowDays, series };
}

export function daysBetween(fromISO: string, toISO: string): number {
  return toUTCDay(toISO) - toUTCDay(fromISO);
}
