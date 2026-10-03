import Link from "next/link";
import type { OutbreakDefinition, OutbreakStatus } from "@/data/outbreaks";
import { outbreakPath } from "@/lib/outbreak-paths";
import type { LatestFigures } from "@/lib/seo";

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

/** One outbreak on the home page: its status, newest figures and a link to its dashboard. */
export default function OutbreakCard({
  outbreak,
  figures,
  headingId,
}: {
  outbreak: OutbreakDefinition;
  /** Newest reported figures (see latestFigures); null when the outbreak has no data yet. */
  figures: LatestFigures | null;
  headingId?: string;
}) {
  const stats: { label: string; value: number | null; tone: string }[] = [
    { label: "Deaths", value: figures?.deaths ?? null, tone: "text-death" },
    { label: "Confirmed cases", value: figures?.confirmed ?? null, tone: "text-confirmed" },
  ];

  return (
    <article className="panel flex flex-col" aria-labelledby={headingId}>
      <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-ink-faint">
        <span data-testid="outbreak-status">{STATUS_LABEL[outbreak.status]}</span>
        {" · "}
        {outbreak.places}
      </p>
      <h3
        id={headingId}
        className="mt-1 font-journal text-xl font-semibold leading-snug text-ink"
      >
        <Link
          href={outbreakPath(outbreak.slug)}
          className="underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
        >
          {outbreak.title}
        </Link>
      </h3>

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

      <p className="mt-3 text-[0.8125rem] tabular-nums text-ink-faint">
        {figures ? `As of ${shortDate(figures.date)}` : "No figures yet"}
      </p>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[0.9375rem] font-medium">
        <Link
          href={outbreakPath(outbreak.slug)}
          className="text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
        >
          Open dashboard
          <span className="sr-only"> for {outbreak.title}</span>
        </Link>
        <Link
          href="/data"
          className="text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
        >
          Data &amp; API
        </Link>
      </div>
    </article>
  );
}
