import Link from "next/link";
import PanelHeader from "@/components/PanelHeader";
import TrendBadge from "@/components/TrendBadge";
import type { Metrics, WeeklyPeriod } from "@/lib/metrics";
import { describeTrend, shortDay } from "@/lib/trend-summary";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const pct = (f: number | null) => (f === null ? "—" : `${Math.round(f * 100)}%`);

function signedPct(changePct: number | null): string {
  if (changePct === null) return "—";
  const r = Math.round(changePct);
  return r === 0 ? "0%" : `${r > 0 ? "+" : "−"}${Math.abs(r)}%`;
}

function WeeklyBars({ weeks }: { weeks: WeeklyPeriod[] }) {
  const W = 320;
  const H = 128;
  const top = 18;
  const bottom = 22;
  const plotH = H - top - bottom;
  const max = Math.max(1, ...weeks.map((w) => w.newConfirmed));
  const slot = W / weeks.length;
  const barW = Math.min(30, slot * 0.62);

  return (
    <figure className="mt-5">
      <figcaption className="mb-1 text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        New confirmed cases per 7 days
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Bar chart of new confirmed cases in each of the last ${weeks.length} seven-day periods, from ${weeks[0].newConfirmed.toLocaleString("en-US")} to ${weeks[weeks.length - 1].newConfirmed.toLocaleString("en-US")}.`}
        className="block h-auto w-full"
      >
        <line x1="0" x2={W} y1={H - bottom} y2={H - bottom} className="stroke-rule-strong" strokeWidth="1" />
        {weeks.map((w, i) => {
          const h = (w.newConfirmed / max) * plotH;
          const x = i * slot + (slot - barW) / 2;
          const y = H - bottom - h;
          const isLatest = i === weeks.length - 1;
          return (
            <g key={w.periodEnd}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, 1)}
                rx="2"
                className="fill-confirmed"
                fillOpacity={isLatest ? 1 : 0.55}
              >
                <title>{`7 days to ${shortDay(w.periodEnd)}: ${fmt(w.newConfirmed)} new confirmed cases, ${fmt(w.newDeaths)} deaths`}</title>
              </rect>
              <text
                x={x + barW / 2}
                y={y - 4}
                textAnchor="middle"
                fontSize="10.5"
                className="fill-ink"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {fmt(w.newConfirmed)}
              </text>
              <text
                x={x + barW / 2}
                y={H - 7}
                textAnchor="middle"
                fontSize="10"
                className="fill-ink-faint"
              >
                {shortDay(w.periodEnd)}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-[0.8125rem] text-ink-faint">Each bar is the 7 days ending on the date below it.</p>
    </figure>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-ink-muted">{label}</dt>
      <dd className="mt-1 font-journal text-[1.75rem] font-bold leading-none text-ink tabular-nums">{value}</dd>
      {note && <dd className="mt-1 text-[0.8125rem] leading-snug text-ink-faint">{note}</dd>}
    </div>
  );
}

export default function TrendPanel({
  metrics,
  headingId,
  rtShortNote = "no verified serial interval for this disease",
}: {
  metrics: Metrics;
  headingId: string;
  /** Why Rt is not shown, when the disease has no serial interval (`PathogenAssumptions.rtShortNote`). */
  rtShortNote?: string;
}) {
  const summary = describeTrend(metrics);
  const ready = metrics.status === "ok" && metrics.incidence && metrics.windowEnd;

  return (
    <>
      <PanelHeader kicker="Fig. 3" id={headingId} title="Is it still growing?" />

      <div className="flex items-start gap-3">
        <TrendBadge summary={summary} className="mt-0.5" />
        <p className="text-base leading-snug text-ink">{summary.headline}</p>
      </div>

      {ready && metrics.incidence && (
        <>
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5">
            <Stat
              label="New cases, 7 days"
              value={fmt(metrics.incidence.confirmed.last7)}
              note={`${signedPct(metrics.incidence.confirmed.changePct)} vs the 7 days before`}
            />
            <Stat
              label="New deaths, 7 days"
              value={fmt(metrics.incidence.deaths.last7)}
              note={`${signedPct(metrics.incidence.deaths.changePct)} vs the 7 days before`}
            />
            <Stat
              label="Reproduction number"
              value={metrics.rt ? metrics.rt.estimate.toFixed(2) : "—"}
              note={
                metrics.rt
                  ? `Likely range ${metrics.rt.low.toFixed(2)}–${metrics.rt.high.toFixed(2)}. Below 1 means shrinking.`
                  : metrics.assumptions.serialIntervalMeanDays === null
                    ? `Not shown: ${rtShortNote}.`
                    : "Needs new cases in both weeks."
              }
            />
            <Stat
              label={
                metrics.growth?.trend === "growing"
                  ? "Time to double"
                  : metrics.growth?.trend === "shrinking"
                    ? "Time to halve"
                    : "Doubling or halving"
              }
              value={
                metrics.growth?.trend === "growing" && metrics.growth.doublingTimeDays
                  ? `${Math.round(metrics.growth.doublingTimeDays)} days`
                  : metrics.growth?.trend === "shrinking" && metrics.growth.halvingTimeDays
                    ? `${Math.round(metrics.growth.halvingTimeDays)} days`
                    : "—"
              }
              note={
                metrics.growth?.trend === "stable"
                  ? "Not shown: no clear trend."
                  : "At the current weekly rate."
              }
            />
          </dl>

          <WeeklyBars weeks={metrics.weekly} />

          <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-muted">
            <span className="font-semibold text-ink">Case fatality is best read as a range:</span>{" "}
            {pct(metrics.cfr.naive)} of confirmed cases have died
            {metrics.cfr.delayAdjusted !== null && (
              <>, {pct(metrics.cfr.delayAdjusted)} allowing for the delay between confirmation and death</>
            )}
            {metrics.cfr.resolved !== null && <>, and {pct(metrics.cfr.resolved)} of cases with a known outcome</>}.
          </p>
        </>
      )}

      <p className="mt-4 border-t border-rule pt-3 text-[0.8125rem] leading-relaxed text-ink-faint">
        {ready && metrics.windowEnd ? (
          <>
            Estimates, not official figures. The 7-day windows end on {shortDay(metrics.windowEnd)}, the latest day
            the reported total moved, because the source is updated in batches.{" "}
          </>
        ) : null}
        <Link
          href="/data#method"
          className="font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
        >
          How this is calculated
        </Link>
        .
      </p>
    </>
  );
}
