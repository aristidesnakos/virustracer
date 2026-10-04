import type { WeeklyPeriod } from "@/lib/metrics";
import { shortDay } from "@/lib/trend-summary";

// Small bar chart of new confirmed cases per 7-day period, rendered on the
// server as plain SVG (no client JS). Weekly bars, not daily points: the source
// is updated in batches, so daily counts swing on reporting, not on spread.

// Compact: a fixed 120x32 mark. Fluid: fills its container's width and keeps the aspect ratio,
// for the card where the bars are the main picture.
const SIZES = {
  compact: { W: 120, H: 32, GAP: 2 },
  fluid: { W: 240, H: 72, GAP: 4 },
} as const;

export default function WeeklySparkline({
  weeks,
  className = "",
  fluid = false,
}: {
  /** Newest last, as returned by computeMetrics. */
  weeks: readonly WeeklyPeriod[];
  className?: string;
  fluid?: boolean;
}) {
  if (weeks.length < 2) return null;
  const { W, H, GAP } = fluid ? SIZES.fluid : SIZES.compact;
  const max = Math.max(1, ...weeks.map((w) => w.newConfirmed));
  const slot = W / weeks.length;
  const last = weeks[weeks.length - 1];
  const label =
    `New confirmed cases per week, ${weeks.length} weeks to ${shortDay(last.periodEnd)}, oldest first: ` +
    weeks.map((w) => w.newConfirmed.toLocaleString("en-US")).join(", ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      {...(fluid ? {} : { width: W, height: H })}
      role="img"
      aria-label={label}
      data-testid="weekly-sparkline"
      className={`text-confirmed ${fluid ? "h-auto w-full" : ""} ${className}`}
    >
      {weeks.map((w, i) => {
        const h = Math.max(1, (w.newConfirmed / max) * H);
        const newest = i === weeks.length - 1;
        return (
          <rect
            key={w.periodEnd}
            x={i * slot + GAP / 2}
            y={H - h}
            width={slot - GAP}
            height={h}
            rx={fluid ? 2 : 1}
            fill="currentColor"
            opacity={newest ? 1 : 0.45}
          />
        );
      })}
    </svg>
  );
}
