import type { CaseDataPoint } from "@/data/outbreaks";

export type TrendField = "confirmed" | "suspected" | "deaths" | "recovered";

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
  // Points that do not report this field (e.g. milestone rows) are skipped, so
  // the last known value is carried forward.
  let v = 0;
  for (const p of sorted) {
    if (toUTCDay(p.date) > cutoffDay) break;
    const x = p[field];
    if (x !== undefined) v = x;
  }
  return v;
}

/**
 * Value at `cutoffDay`, linearly interpolated between the reading before and the
 * reading after it. With sparse reporting (e.g. a reading every ~week) the plain
 * "last value at or before" baseline can be many days stale and overstates a
 * windowed delta; interpolating gives a fair estimate and converges to the exact
 * value once readings are daily. Falls back to the carried-forward value when
 * there is no later reading to interpolate towards.
 */
function interpolatedValueAt(
  sorted: readonly CaseDataPoint[],
  field: TrendField,
  cutoffDay: number,
): number {
  let before: { day: number; v: number } | null = null;
  let after: { day: number; v: number } | null = null;
  for (const p of sorted) {
    const x = p[field];
    if (x === undefined) continue;
    const day = toUTCDay(p.date);
    if (day <= cutoffDay) before = { day, v: x };
    else {
      after = { day, v: x };
      break;
    }
  }
  if (!before) return 0;
  if (!after || before.day === cutoffDay) return before.v;
  const frac = (cutoffDay - before.day) / (after.day - before.day);
  return before.v + (after.v - before.v) * frac;
}

export interface TrendOptions {
  /** Estimate the window-start baseline by interpolating between readings. */
  interpolateBaseline?: boolean;
}

export function computeTrend(
  timeline: readonly CaseDataPoint[],
  field: TrendField,
  windowDays: number,
  asOfISO?: string,
  options: TrendOptions = {},
): Trend {
  if (timeline.length === 0) {
    return { current: 0, delta: 0, windowDays, series: [] };
  }
  const sorted = sortAsc(timeline);
  const lastPoint = sorted[sorted.length - 1];
  const asOfDay = asOfISO ? toUTCDay(asOfISO) : toUTCDay(lastPoint.date);
  const priorDay = asOfDay - windowDays;

  const current = valueAtOrBefore(sorted, field, asOfDay);
  const prior = options.interpolateBaseline
    ? interpolatedValueAt(sorted, field, priorDay)
    : valueAtOrBefore(sorted, field, priorDay);

  const series: TrendPoint[] = [];
  for (const p of sorted) {
    const x = p[field];
    if (x !== undefined && toUTCDay(p.date) <= asOfDay) {
      series.push({ date: p.date, value: x });
    }
  }

  return { current, delta: Math.round(current - prior), windowDays, series };
}

export function daysBetween(fromISO: string, toISO: string): number {
  return toUTCDay(toISO) - toUTCDay(fromISO);
}
