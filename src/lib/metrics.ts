// Derived epidemiological indicators from the cumulative toll series.
// Pure and client-safe: no fs, no clock. Methods and assumptions are documented
// on the /data page and echoed in every API response, so keep them in sync.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** One cumulative reading. `recovered` is optional because not every source reports it. */
export interface MetricsPoint {
  /** ISO date (YYYY-MM-DD or full timestamp), interpreted in UTC. */
  date: string;
  confirmed: number;
  deaths: number;
  recovered?: number | null;
}

/** Fixed modelling assumptions. Changing one changes every derived number. */
export const ASSUMPTIONS = {
  /** Window for "recent" incidence and for the growth rate. */
  windowDays: 7,
  /**
   * Serial interval (time between symptom onset in a case and in the person they
   * infected), gamma-distributed. WHO Ebola Response Team, NEJM 2014 (West
   * Africa, Zaire ebolavirus): mean 15.3 d, SD 9.3 d. Not measured for this
   * Bundibugyo outbreak, so Rt carries this extra uncertainty.
   */
  serialIntervalMeanDays: 15.3,
  serialIntervalSdDays: 9.3,
  /** Typical delay from case confirmation to death, used for the delay-adjusted fatality ratio. */
  caseToDeathDays: 10,
  /** Minimum dated readings in the last 14 days before any rate is reported. */
  minReadingsInTwoWeeks: 5,
  /** Number of 7-day periods returned in `weekly`. */
  maxWeeks: 8,
  /**
   * The source is updated in batches, so the newest days are often not entered
   * yet and read as "no new cases". Windows therefore end on the latest day the
   * total actually moved, but never more than this many days before the last
   * reading, so a genuine halt in cases still shows up.
   */
  maxReportingLagDays: 3,
} as const;

export interface Interval {
  estimate: number;
  low: number;
  high: number;
}

export interface WeeklyPeriod {
  /** Last day (UTC) of the 7-day period. */
  periodEnd: string;
  newConfirmed: number;
  newDeaths: number;
}

export interface DailyPoint {
  date: string;
  confirmed: number;
  deaths: number;
  newConfirmed: number;
  newDeaths: number;
  /** Mean of `newConfirmed` over the 7 days up to and including this date (null for the first 6). */
  newConfirmed7dAvg: number | null;
  /** True when the cumulative values were filled in between two dated readings. */
  interpolated: boolean;
}

export type GrowthTrend = "growing" | "shrinking" | "stable";

export interface Metrics {
  status: "ok" | "insufficient_data";
  /** Why status is insufficient_data. */
  reason?: string;
  /** Date of the latest reading. */
  asOf: string | null;
  /** Last day of the windows used for incidence and growth (see `maxReportingLagDays`). */
  windowEnd: string | null;
  /** New confirmed cases / deaths in the last 7 days vs the 7 before. */
  incidence: {
    confirmed: { last7: number; prev7: number; changePct: number | null };
    deaths: { last7: number; prev7: number; changePct: number | null };
  } | null;
  /**
   * Exponential growth rate of weekly confirmed cases, per day, with a 95% range
   * from Poisson counting error only (reporting noise is not included).
   */
  growth: {
    ratePerDay: Interval;
    trend: GrowthTrend;
    doublingTimeDays: number | null;
    halvingTimeDays: number | null;
  } | null;
  /** Reproduction number implied by the growth rate and the serial interval. */
  rt: Interval | null;
  /** Fractions (0-1), not percentages. */
  cfr: {
    /** Deaths / confirmed cases. A floor while cases are still unresolved. */
    naive: number | null;
    /** Deaths / confirmed cases `caseToDeathDays` earlier. */
    delayAdjusted: number | null;
    /** Deaths / (deaths + recovered). Skews high while recoveries are under-reported. */
    resolved: number | null;
  };
  /** Newest period last. */
  weekly: WeeklyPeriod[];
  daily: DailyPoint[];
  assumptions: typeof ASSUMPTIONS;
}

const dayNum = (iso: string): number => Math.floor(Date.parse(iso) / MS_PER_DAY);
const isoOf = (day: number): string => new Date(day * MS_PER_DAY).toISOString().slice(0, 10);

interface GridRow {
  day: number;
  confirmed: number;
  deaths: number;
  observed: boolean;
}

/**
 * Cumulative counts never fall, so a lower reading than an earlier one is
 * treated as the earlier value. Gaps between readings are filled linearly and
 * flagged, which spreads a multi-day jump evenly instead of dumping it on one day.
 */
function buildGrid(points: readonly MetricsPoint[]): GridRow[] {
  const byDay = new Map<number, MetricsPoint>();
  for (const p of points) {
    const d = dayNum(p.date);
    if (Number.isNaN(d) || !Number.isFinite(p.confirmed) || !Number.isFinite(p.deaths)) continue;
    byDay.set(d, p); // last reading of a day wins
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);
  const obs: { day: number; confirmed: number; deaths: number }[] = [];
  let maxC = 0;
  let maxD = 0;
  for (const d of days) {
    const p = byDay.get(d)!;
    maxC = Math.max(maxC, p.confirmed);
    maxD = Math.max(maxD, p.deaths);
    obs.push({ day: d, confirmed: maxC, deaths: maxD });
  }
  const grid: GridRow[] = [];
  for (let i = 0; i < obs.length; i++) {
    grid.push({ ...obs[i], observed: true });
    const next = obs[i + 1];
    if (!next) continue;
    const span = next.day - obs[i].day;
    for (let step = 1; step < span; step++) {
      const f = step / span;
      grid.push({
        day: obs[i].day + step,
        confirmed: obs[i].confirmed + (next.confirmed - obs[i].confirmed) * f,
        deaths: obs[i].deaths + (next.deaths - obs[i].deaths) * f,
        observed: false,
      });
    }
  }
  return grid;
}

function changePct(last: number, prev: number): number | null {
  return prev > 0 ? ((last - prev) / prev) * 100 : null;
}

/**
 * R from a growth rate r when the serial interval is gamma(mean, sd):
 * R = (1 + r * sd^2 / mean) ^ (mean^2 / sd^2)   (Wallinga & Lipsitch 2007).
 */
export function reproductionFromGrowth(
  r: number,
  mean: number = ASSUMPTIONS.serialIntervalMeanDays,
  sd: number = ASSUMPTIONS.serialIntervalSdDays,
): number {
  const base = 1 + (r * sd * sd) / mean;
  if (base <= 0) return 0; // decay faster than the serial interval can express
  return Math.pow(base, (mean * mean) / (sd * sd));
}

const EMPTY_CFR = { naive: null, delayAdjusted: null, resolved: null } as const;

function insufficient(reason: string, asOf: string | null): Metrics {
  return {
    status: "insufficient_data",
    reason,
    asOf,
    windowEnd: null,
    incidence: null,
    growth: null,
    rt: null,
    cfr: { ...EMPTY_CFR },
    weekly: [],
    daily: [],
    assumptions: ASSUMPTIONS,
  };
}

export function computeMetrics(points: readonly MetricsPoint[]): Metrics {
  const grid = buildGrid(points);
  if (grid.length === 0) return insufficient("No readings yet.", null);

  const last = grid[grid.length - 1];
  const asOf = isoOf(last.day);
  const W = ASSUMPTIONS.windowDays;

  const readingsInTwoWeeks = grid.filter((g) => g.observed && g.day > last.day - 2 * W).length;
  if (grid[0].day > last.day - 2 * W) {
    return insufficient(`Need at least ${2 * W} days of history; have ${last.day - grid[0].day}.`, asOf);
  }
  if (readingsInTwoWeeks < ASSUMPTIONS.minReadingsInTwoWeeks) {
    return insufficient(
      `Need at least ${ASSUMPTIONS.minReadingsInTwoWeeks} dated readings in the last 14 days; have ${readingsInTwoWeeks}.`,
      asOf,
    );
  }

  // End the windows on the latest day the total moved, within the allowed reporting lag.
  let windowEnd = last.day;
  for (let i = grid.length - 1; i > 0 && last.day - grid[i].day < ASSUMPTIONS.maxReportingLagDays; i--) {
    if (grid[i].confirmed > grid[i - 1].confirmed) {
      windowEnd = grid[i].day;
      break;
    }
  }

  const byDay = new Map(grid.map((g) => [g.day, g]));
  const at = (day: number): GridRow => byDay.get(day) ?? grid[0];

  // Daily series with a trailing 7-day mean of new confirmed cases.
  const daily: DailyPoint[] = [];
  for (let i = 0; i < grid.length; i++) {
    const g = grid[i];
    const prev = grid[i - 1];
    const newConfirmed = prev ? g.confirmed - prev.confirmed : 0;
    const newDeaths = prev ? g.deaths - prev.deaths : 0;
    // The grid has one row per day, so the row W places back is exactly W days earlier.
    const avg = i >= W ? (g.confirmed - grid[i - W].confirmed) / W : null;
    daily.push({
      date: isoOf(g.day),
      confirmed: Math.round(g.confirmed),
      deaths: Math.round(g.deaths),
      newConfirmed: Math.round(newConfirmed * 10) / 10,
      newDeaths: Math.round(newDeaths * 10) / 10,
      newConfirmed7dAvg: avg === null ? null : Math.round(avg * 10) / 10,
      interpolated: !g.observed,
    });
  }

  // Non-overlapping 7-day periods ending at the latest reading, newest last.
  const weekly: WeeklyPeriod[] = [];
  for (let k = 0; k < ASSUMPTIONS.maxWeeks; k++) {
    const end = windowEnd - W * k;
    const start = end - W;
    if (start < grid[0].day) break;
    weekly.unshift({
      periodEnd: isoOf(end),
      newConfirmed: Math.round(at(end).confirmed - at(start).confirmed),
      newDeaths: Math.round(at(end).deaths - at(start).deaths),
    });
  }

  const cur = weekly[weekly.length - 1];
  const prv = weekly[weekly.length - 2];
  const incidence = {
    confirmed: {
      last7: cur.newConfirmed,
      prev7: prv.newConfirmed,
      changePct: changePct(cur.newConfirmed, prv.newConfirmed),
    },
    deaths: {
      last7: cur.newDeaths,
      prev7: prv.newDeaths,
      changePct: changePct(cur.newDeaths, prv.newDeaths),
    },
  };

  let growth: Metrics["growth"] = null;
  let rt: Interval | null = null;
  if (cur.newConfirmed > 0 && prv.newConfirmed > 0) {
    const lnRatio = Math.log(cur.newConfirmed / prv.newConfirmed);
    const se = Math.sqrt(1 / cur.newConfirmed + 1 / prv.newConfirmed);
    const rate = (x: number) => x / W;
    const r: Interval = {
      estimate: rate(lnRatio),
      low: rate(lnRatio - 1.96 * se),
      high: rate(lnRatio + 1.96 * se),
    };
    const trend: GrowthTrend = r.low > 0 ? "growing" : r.high < 0 ? "shrinking" : "stable";
    growth = {
      ratePerDay: r,
      trend,
      doublingTimeDays: r.estimate > 0 ? Math.LN2 / r.estimate : null,
      halvingTimeDays: r.estimate < 0 ? Math.LN2 / -r.estimate : null,
    };
    rt = {
      estimate: reproductionFromGrowth(r.estimate),
      low: reproductionFromGrowth(r.low),
      high: reproductionFromGrowth(r.high),
    };
  }

  const lag = ASSUMPTIONS.caseToDeathDays;
  const lagged = last.day - lag >= grid[0].day ? at(last.day - lag).confirmed : null;
  const recovered = [...points]
    .sort((a, b) => dayNum(a.date) - dayNum(b.date))
    .reverse()
    .find((p) => typeof p.recovered === "number")?.recovered;
  const resolvedDenominator = typeof recovered === "number" ? last.deaths + recovered : 0;

  return {
    status: "ok",
    asOf,
    windowEnd: isoOf(windowEnd),
    incidence,
    growth,
    rt,
    cfr: {
      naive: last.confirmed > 0 ? last.deaths / last.confirmed : null,
      delayAdjusted: lagged !== null && lagged > 0 ? last.deaths / lagged : null,
      resolved: resolvedDenominator > 0 ? last.deaths / resolvedDenominator : null,
    },
    weekly,
    daily,
    assumptions: ASSUMPTIONS,
  };
}
