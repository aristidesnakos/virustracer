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
  return r === 0 ? "same as the week before" : `${r > 0 ? "+" : "−"}${Math.abs(r)}% vs the week before`;
}

const LINK = "text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent";

/**
 * One outbreak on the home page: status, newest figures, the 7-day trend with a
 * weekly sparkline, where the numbers come from and when, and a link to its dashboard.
 */
export default function OutbreakCard({
  snapshot,
  headingId,
  headingLevel = 3,
}: {
  snapshot: OutbreakSnapshot;
  headingId?: string;
  /** Heading level of the title, so the card fits under the page's outline. */
  headingLevel?: 2 | 3 | 4;
}) {
  const Heading = `h${headingLevel}` as const;
  const { outbreak, figures, trend, incidence, windowEnd, weekly, source } = snapshot;
  const stats: { label: string; value: number | null; tone: string }[] = [
    { label: "Deaths", value: figures?.deaths ?? null, tone: "text-death" },
    { label: "Confirmed cases", value: figures?.confirmed ?? null, tone: "text-confirmed" },
  ];
  const change = incidence ? signedPct(incidence.confirmed.changePct) : null;

  return (
    <article className="panel flex h-full flex-col" aria-labelledby={headingId}>
      <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-ink-faint">
        <span data-testid="outbreak-status">{STATUS_LABEL[outbreak.status]}</span>
        {" · "}
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

      <div className="mt-4 border-t border-rule pt-3">
        <div className="flex items-end justify-between gap-4">
          <TrendBadge summary={trend} />
          <WeeklySparkline weeks={weekly} className="shrink-0" />
        </div>
        {incidence && windowEnd ? (
          <p className="mt-2 text-[0.9375rem] leading-snug text-ink tabular-nums">
            <strong className="font-semibold">{fmt(incidence.confirmed.last7)}</strong> new cases and{" "}
            <strong className="font-semibold">{fmt(incidence.deaths.last7)}</strong> deaths in the 7 days
            to {shortDay(windowEnd)}
            {change && <span className="text-ink-muted"> ({change})</span>}
          </p>
        ) : (
          <p className="mt-2 text-[0.9375rem] leading-snug text-ink-muted">{trend.headline}</p>
        )}
      </div>

      <p className="mt-3 text-[0.8125rem] leading-relaxed tabular-nums text-ink-faint">
        {figures ? `As of ${shortDate(figures.date)}` : "No figures yet"}
        {" · Source: "}
        {source.url ? (
          <a href={source.url} className={LINK} rel="noopener">
            {source.label}
          </a>
        ) : (
          source.label
        )}
        {source.checked &&
          ` · ${source.automated ? "checked" : "last verified"} ${shortDate(source.checked)}`}
      </p>

      <div className="mt-auto flex flex-wrap gap-x-5 gap-y-1 pt-4 text-[0.9375rem] font-medium">
        <Link href={outbreakPath(outbreak.slug)} className={LINK}>
          Open dashboard
          <span className="sr-only"> for {outbreak.title}</span>
        </Link>
        <Link href="/data" className={LINK}>
          Data &amp; API
        </Link>
      </div>
    </article>
  );
}
