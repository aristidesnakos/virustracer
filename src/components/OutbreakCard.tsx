import Link from "next/link";
import TrendBadge from "@/components/TrendBadge";
import WeeklySparkline from "@/components/WeeklySparkline";
import type { OutbreakStatus } from "@/data/outbreaks";
import type { OutbreakSnapshot } from "@/lib/home-snapshot";
import { outbreakPath } from "@/lib/outbreak-paths";
import { shortDay } from "@/lib/trend-summary";

const STATUS_LABEL: Record<OutbreakStatus, string> = {
  active: "Active",
  waning: "Waning",
  over: "Declared over",
  watch: "Under watch",
};

const fmt = (n: number) => n.toLocaleString("en-US");

function shortDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function signedPct(changePct: number | null): string | null {
  if (changePct === null) return null;
  const r = Math.round(changePct);
  return r === 0
    ? "cases unchanged vs the week before"
    : `cases ${r > 0 ? "+" : "−"}${Math.abs(r)}% vs the week before`;
}

const LINK = "text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent";

/** The card names the source; who it cites is on /methodology, and the full label stays in the link's title. */
const sourceName = (label: string) => label.replace(/\s*\(cites[^)]*\)\s*$/i, "");

/**
 * One outbreak on the home page: places, newest figures, the 7-day trend with a
 * weekly sparkline, where the numbers come from and when, and a link to its dashboard.
 * The status is stated by the group heading the card sits under, so the card only
 * announces it to screen readers. `wide` lays the card out in two columns for a group
 * that has room for it (the page passes it when the group holds a single outbreak).
 */
export default function OutbreakCard({
  snapshot,
  headingId,
  headingLevel = 3,
  wide = false,
}: {
  snapshot: OutbreakSnapshot;
  headingId?: string;
  /** Heading level of the title, so the card fits under the page's outline. */
  headingLevel?: 2 | 3 | 4;
  wide?: boolean;
}) {
  const Heading = `h${headingLevel}` as const;
  const { outbreak, figures, trend, incidence, windowEnd, weekly, source } = snapshot;
  const stats: { label: string; value: number | null; tone: string }[] = [
    { label: "Deaths", value: figures?.deaths ?? null, tone: "text-death" },
    { label: "Confirmed cases", value: figures?.confirmed ?? null, tone: "text-confirmed" },
  ];
  const change = incidence ? signedPct(incidence.confirmed.changePct) : null;

  return (
    <article
      className={`panel flex h-full flex-col ${wide ? "md:grid! md:grid-cols-2 md:content-start md:gap-x-10" : ""}`}
      aria-labelledby={headingId}
    >
      <div>
        <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-ink-faint">
          <span data-testid="outbreak-status" className="sr-only">
            {STATUS_LABEL[outbreak.status]}.{" "}
          </span>
          {outbreak.places}
        </p>
        <Heading
          id={headingId}
          className="mt-1 font-journal text-xl font-semibold leading-snug text-ink"
        >
          <Link
            href={outbreakPath(outbreak.slug)}
            className="underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
          >
            {outbreak.title}
          </Link>
        </Heading>

        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-[0.8125rem] text-ink-faint">{s.label}</dt>
              <dd
                className={`font-journal text-3xl font-bold tabular-nums leading-tight ${s.tone}`}
              >
                {s.value === null ? "—" : fmt(s.value)}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div
        className={`mt-4 border-t border-rule pt-3 ${wide ? "md:mt-0 md:border-l md:border-t-0 md:pl-10 md:pt-0" : ""}`}
      >
        <div className="flex items-end justify-between gap-4">
          <TrendBadge summary={trend} />
          <WeeklySparkline weeks={weekly} className="shrink-0" />
        </div>
        {incidence && windowEnd ? (
          <p className="mt-2 text-[0.9375rem] leading-snug text-ink">
            <strong className="font-semibold">{fmt(incidence.confirmed.last7)}</strong> new cases and{" "}
            <strong className="font-semibold">{fmt(incidence.deaths.last7)}</strong> deaths in the 7 days
            to {shortDay(windowEnd)}
            {change && <span className="text-ink-muted"> ({change})</span>}
          </p>
        ) : (
          <p className="mt-2 text-[0.9375rem] leading-snug text-ink-muted">{trend.headline}</p>
        )}
      </div>

      <div
        className={`mt-auto ${wide ? "md:col-span-2 md:mt-4 md:flex md:items-end md:justify-between md:gap-6 md:border-t md:border-rule md:pt-3" : ""}`}
      >
        <p className={`mt-3 text-[0.8125rem] leading-relaxed text-ink-faint ${wide ? "md:mt-0" : ""}`}>
          <span className="block">
            {figures ? `As of ${shortDate(figures.date)}` : "No figures yet"}
            {source.checked &&
              ` · ${source.automated ? "checked" : "last verified"} ${shortDate(source.checked)}`}
          </span>
          <span className="block">
            Source:{" "}
            {source.url ? (
              <a href={source.url} className={LINK} rel="noopener" title={source.label}>
                {sourceName(source.label)}
              </a>
            ) : (
              source.label
            )}
          </span>
        </p>

        <div className="flex flex-wrap gap-x-5 gap-y-1 pt-4 text-[0.9375rem] font-medium md:shrink-0 md:pt-0">
          <Link href={outbreakPath(outbreak.slug)} className={LINK}>
            Open dashboard
            <span className="sr-only"> for {outbreak.title}</span>
          </Link>
          <Link href="/data" className={LINK}>
            Data &amp; API
          </Link>
        </div>
      </div>
    </article>
  );
}
