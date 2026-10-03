import Link from "next/link";
import WeeklySparkline from "@/components/WeeklySparkline";
import type { OutbreakStatus } from "@/data/outbreaks";
import type { OutbreakSnapshot } from "@/lib/home-snapshot";
import { outbreakPath } from "@/lib/outbreak-paths";
import { shortDay, trendStatement, type Verdict } from "@/lib/trend-summary";

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

export type TrendPanelState = "trend" | "final" | "pending";

/**
 * What the card's right-hand panel shows:
 * - "trend": there are daily readings, so show the weekly bars and the trend result, whatever the status;
 * - "final": no readings and the outbreak is over, so none are due and the figures are final;
 * - "pending": no readings but the outbreak is not over, so say there is not enough data yet.
 */
export function trendPanelState(status: OutbreakStatus, hasReadings: boolean): TrendPanelState {
  if (hasReadings) return "trend";
  return status === "over" ? "final" : "pending";
}

/** The statement leads the trend; colour backs the words up, it is never the only cue. */
const STATEMENT_TONE: Record<Verdict, string> = {
  growing: "text-death",
  declining: "text-good",
  plateau: "text-ink",
  unknown: "text-ink",
};

const LINK = "text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent";

/** The card names the source; who it cites is on /methodology, and the full label stays in the link's title. */
const sourceName = (label: string) => label.replace(/\s*\(cites[^)]*\)\s*$/i, "");

/**
 * One outbreak on the home page. Top row: places and the two dates. Then the newest figures
 * beside the picture of recent weeks: weekly bars, with the plain-language result and the
 * 7-day counts as their caption. Footer: the source, and the way on to the dashboard.
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
  const hasChart = weekly.length >= 2;
  const panel = trendPanelState(outbreak.status, Boolean(incidence && windowEnd));

  return (
    <article
      className={`panel flex h-full flex-col ${wide ? "md:grid! md:grid-cols-2 md:content-start md:gap-x-10" : ""}`}
      aria-labelledby={headingId}
    >
      <div className={`flex items-start justify-between gap-4 ${wide ? "md:col-span-2" : ""}`}>
        <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-ink-faint">
          <span data-testid="outbreak-status" className="sr-only">
            {STATUS_LABEL[outbreak.status]}.{" "}
          </span>
          {outbreak.places}
        </p>
        <p className="shrink-0 text-right text-[0.8125rem] leading-snug text-ink-faint">
          <span className="block">{figures ? `As of ${shortDate(figures.date)}` : "No figures yet"}</span>
          {source.checked && (
            <span className="block">
              {source.automated ? "Checked" : "Last verified"} {shortDate(source.checked)}
            </span>
          )}
        </p>
      </div>

      <div className={`mt-1 ${wide ? "md:mb-4" : ""}`}>
        <Heading
          id={headingId}
          className="font-journal text-xl font-semibold leading-snug text-ink"
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
        className={`mb-4 mt-4 border-t border-rule pt-3 ${wide ? "md:mt-1 md:border-l md:border-t-0 md:pl-10 md:pt-0" : ""} ${panel === "final" ? "flex flex-col items-center justify-center py-3 text-center" : ""}`}
      >
        {panel === "final" ? (
          <p data-testid="final-state" className="text-base font-semibold text-ink">
            Outbreak over
            <span className="sr-only">: these are the final figures</span>
          </p>
        ) : (
          <>
            {hasChart && <p className="text-[0.8125rem] text-ink-faint">New cases per week</p>}
            <WeeklySparkline weeks={weekly} fluid className="mt-2" />
            <p
              data-testid="trend-statement"
              className={`${hasChart ? "mt-3" : ""} text-base font-semibold leading-snug ${STATEMENT_TONE[trend.verdict]}`}
            >
              {trendStatement(trend)}
            </p>
            {incidence && windowEnd ? (
              <p className="mt-0.5 text-[0.9375rem] leading-snug text-ink-muted">
                <strong className="font-semibold text-ink">{fmt(incidence.confirmed.last7)}</strong> new cases and{" "}
                <strong className="font-semibold text-ink">{fmt(incidence.deaths.last7)}</strong> deaths in the 7
                days to <span className="whitespace-nowrap">{shortDay(windowEnd)}</span>
                {change && <> ({change})</>}
              </p>
            ) : (
              <p className="mt-0.5 text-[0.9375rem] leading-snug text-ink-muted">{trend.headline}</p>
            )}
          </>
        )}
      </div>

      <div
        className={`mt-auto flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-t border-rule pt-3 ${wide ? "md:col-span-2" : ""}`}
      >
        <p className="text-[0.8125rem] leading-relaxed text-ink-faint">
          Source:{" "}
          {source.url ? (
            <a href={source.url} className={LINK} rel="noopener" title={source.label}>
              {sourceName(source.label)}
            </a>
          ) : (
            source.label
          )}
        </p>

        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[0.9375rem] font-medium">
          <Link href={outbreakPath(outbreak.slug)} className={LINK}>
            Dashboard
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
