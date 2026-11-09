import Link from "next/link";
import PanelHeader from "@/components/PanelHeader";
import {
  COUNTERMEASURE_KINDS,
  KIND_HEADING,
  REGISTRY_STATUS_LABEL,
  TIER_LABEL,
  isStale,
  type CountermeasureEvent,
  type CountermeasureFile,
  type CountermeasureSource,
} from "@/lib/countermeasures";

/** "26 Oct 2026". */
function day(iso: string): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function sourceLabel(s: CountermeasureSource): string {
  return s.id ? `${s.id} · ${s.issuer}` : s.issuer;
}

function TierBadge({ tier }: { tier: CountermeasureEvent["tier"] }) {
  return (
    <span
      data-testid="tier-badge"
      className="inline-block shrink-0 rounded-md border border-rule-strong bg-sunk px-2 py-0.5 text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-ink-muted"
    >
      {TIER_LABEL[tier]}
    </span>
  );
}

function SourceLink({ source, label }: { source: CountermeasureSource; label?: string }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
    >
      {label ?? sourceLabel(source)}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function EventLine({ event }: { event: CountermeasureEvent }) {
  const { expect } = event;
  const registry = expect?.registryStatus ? REGISTRY_STATUS_LABEL[expect.registryStatus] : null;
  return (
    <li data-testid="countermeasure-line" className="flex flex-col gap-1 border-t border-rule pt-2 sm:flex-row sm:gap-3">
      <div className="sm:w-44 sm:shrink-0">
        <TierBadge tier={event.tier} />
      </div>
      <div className="min-w-0 text-[0.9375rem] leading-relaxed">
        <p className="text-ink">{event.text}</p>
        {(registry || expect?.recordUpdated) && (
          <p className="text-ink-muted">
            {registry ? <>Registry status: {registry}. </> : null}
            {expect?.recordUpdated ? <>Record last updated {day(expect.recordUpdated)}.</> : null}
          </p>
        )}
        <p className="text-[0.8125rem] text-ink-faint">
          {day(event.date)} · <SourceLink source={event.source} />
        </p>
      </div>
    </li>
  );
}

/**
 * The hand-curated "Vaccines & treatments" box for one pathogen. Every line names its evidence
 * tier and source; the wording rules are on /methodology#countermeasures.
 */
export default function CountermeasuresPanel({
  data,
  headingId,
  now,
}: {
  data: CountermeasureFile;
  headingId: string;
  /** For tests; defaults to the time of rendering. */
  now?: Date;
}) {
  const stale = isStale(data.checked, now);
  const groups = COUNTERMEASURE_KINDS.map((kind) => ({
    kind,
    products: data.products.filter((p) => p.kind === kind),
  })).filter((g) => g.products.length > 0);

  return (
    <>
      <PanelHeader
        kicker="Research"
        id={headingId}
        title={<>Vaccines &amp; treatments</>}
        aside={
          <p className="text-[0.8125rem] text-ink-faint" data-testid="countermeasures-checked">
            Each line checked against its source on {day(data.checked)}
            {stale && <span className="font-semibold text-death"> · may be out of date</span>}
          </p>
        }
      />

      <div className="rounded-lg border border-rule-strong bg-sunk px-4 py-3" data-testid="countermeasures-statement">
        <p className="font-journal text-lg font-semibold text-ink">{data.statement.text}</p>
        <p className="mt-1 text-[0.9375rem] text-ink-muted">
          &ldquo;{data.statement.quote}&rdquo; — {data.statement.source.issuer}, {day(data.statement.date)} ·{" "}
          <SourceLink source={data.statement.source} label="source" />
        </p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-2">
        {groups.map((g) => (
          <section key={g.kind} aria-label={KIND_HEADING[g.kind]}>
            <h3 className="mb-2 text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-ink-faint">
              {KIND_HEADING[g.kind]} in trials or use
            </h3>
            <ul className="space-y-5">
              {g.products.map((p) => (
                <li key={p.id} data-testid={`countermeasure-${p.id}`}>
                  <p className="font-journal text-base font-semibold text-ink">
                    {p.name}
                    {p.licensedFor && (
                      <span className="ml-2 inline-block rounded-md border border-rule-strong px-2 py-0.5 align-middle font-sans text-[0.75rem] font-semibold text-ink-muted">
                        Licensed for {p.licensedFor} only
                      </span>
                    )}
                  </p>
                  <p className="text-[0.875rem] text-ink-muted">{p.developer}</p>
                  <p className="mt-1 text-[0.9375rem] text-ink-muted">{p.note}</p>
                  <ul className="mt-2 space-y-2">
                    {p.events.map((e, i) => (
                      <EventLine key={`${p.id}-${i}`} event={e} />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-5 border-t border-rule-strong pt-3 text-[0.875rem] text-ink-muted" data-testid="countermeasures-disclaimer">
        A registered, recruiting or completed trial does not mean a product works or is safe. Statements are the
        issuer&rsquo;s own words; registries can lag behind them, so both are shown. This is not medical advice: follow
        WHO and your national health authority.{" "}
        <Link
          href="/methodology#countermeasures"
          className="font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
        >
          How this box is kept
        </Link>
        .
      </p>
    </>
  );
}
