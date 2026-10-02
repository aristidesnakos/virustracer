import type { Metadata } from "next";
import Link from "next/link";
import { outbreak } from "@/data/outbreak";
import { API_ATTRIBUTION, MAX_LIMIT } from "@/lib/api";
import { ASSUMPTIONS } from "@/lib/metrics";
import { getTollData } from "@/lib/toll";

export const metadata: Metadata = {
  title: `Data & API · ${outbreak.title}`,
  description:
    "Free, keyless JSON and CSV access to the daily Ebola outbreak figures, with the source revision for every reading, plus how the growth and reproduction estimates are calculated.",
};

const ENDPOINTS = [
  {
    path: "/api/v1/toll",
    what: "One row per day of cumulative confirmed, suspected, deaths and recovered, each linked to the exact Wikipedia revision it was read from.",
    params: [
      ["from, to", "Inclusive date range, YYYY-MM-DD."],
      ["limit", `Keep only the most recent N rows (1–${MAX_LIMIT}).`],
      ["format", "json (default) or csv."],
    ],
    example: "/api/v1/toll?from=2026-09-01&format=csv",
  },
  {
    path: "/api/v1/metrics",
    what: "Derived indicators: new cases and deaths per 7 days, growth rate, doubling or halving time, reproduction number (Rt) and three fatality ratios, with their assumptions.",
    params: [
      ["include=daily", "Add the day-by-day series (new cases, 7-day average, interpolated flag)."],
      ["format=csv", "Return the daily series as CSV."],
    ],
    example: "/api/v1/metrics?include=daily",
  },
  {
    path: "/api/v1/signals",
    what: "Countries the news has linked to the outbreak, when each was first mentioned, and, once officially confirmed, how far the news led.",
    params: [],
    example: "/api/v1/signals",
  },
] as const;

const code = "overflow-x-auto rounded-lg border border-rule bg-sunk p-4 font-mono text-[0.875rem] leading-relaxed text-ink";
const h2 = "font-journal text-2xl font-semibold leading-snug text-ink";
const link =
  "font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent";

export default function DataPage() {
  const toll = getTollData();
  const snapshots = [...toll.snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const latest = snapshots.at(-1) ?? null;
  const first = snapshots[0] ?? null;

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <div className="mx-auto w-full max-w-[56rem] px-[clamp(1rem,3vw,2.5rem)] pb-16">
        <header className="pt-7 pb-5 border-b-4 border-double border-ink">
          <p className="mb-2 text-[0.8125rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            <Link href="/" className={link}>
              ← {outbreak.title}
            </Link>
          </p>
          <h1 className="font-journal text-[clamp(1.875rem,4.2vw,2.5rem)] font-bold leading-[1.1] text-ink">
            Data &amp; API
          </h1>
          <p className="mt-3 max-w-[40rem] text-base text-ink-muted">
            The numbers on the dashboard are free to use. No account, no key, and any website can call them from the
            browser. Every figure points back to the source revision it came from, so you can check it.
          </p>
        </header>

        <main id="main" className="space-y-12 pt-8">
          <section aria-labelledby="endpoints" className="space-y-6">
            <h2 id="endpoints" className={h2}>
              Endpoints
            </h2>
            {ENDPOINTS.map((e) => (
              <div key={e.path} className="panel">
                <h3 className="font-mono text-base font-semibold text-ink">GET {e.path}</h3>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">{e.what}</p>
                {e.params.length > 0 && (
                  <dl className="mt-3 space-y-1 text-[0.9375rem]">
                    {e.params.map(([name, desc]) => (
                      <div key={name} className="flex flex-wrap gap-x-3">
                        <dt className="font-mono text-ink">{name}</dt>
                        <dd className="text-ink-muted">{desc}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <p className="mt-3 text-[0.9375rem]">
                  <a href={e.example} className={link}>
                    Try it: <span className="font-mono">{e.example}</span>
                  </a>
                </p>
              </div>
            ))}

            {latest && (
              <div>
                <h3 className="mb-2 text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                  Latest reading, as the API returns it
                </h3>
                <pre className={code}>{JSON.stringify(latest, null, 2)}</pre>
              </div>
            )}

            <div>
              <h3 className="mb-2 text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                From a browser or script
              </h3>
              <pre className={code}>{`const res = await fetch("/api/v1/metrics");   // or the full https:// address
const { growth, rt, incidence } = await res.json();
console.log(growth.trend, rt.estimate);`}</pre>
            </div>
          </section>

          <section aria-labelledby="method-heading" id="method" className="space-y-4">
            <h2 id="method-heading" className={h2}>
              How the indicators are calculated
            </h2>
            <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
              All of them start from the daily cumulative totals. Days the source did not publish are filled in a
              straight line between neighbouring readings and flagged <span className="font-mono">interpolated</span>.
              A total that falls is treated as unchanged, because cumulative counts cannot decrease.
            </p>
            <dl className="space-y-4 text-[0.9375rem] leading-relaxed">
              <div>
                <dt className="font-semibold text-ink">New cases and deaths per {ASSUMPTIONS.windowDays} days</dt>
                <dd className="text-ink-muted">
                  The rise in the total over the last {ASSUMPTIONS.windowDays} days, compared with the{" "}
                  {ASSUMPTIONS.windowDays} days before that.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">Where the window ends</dt>
                <dd className="text-ink-muted">
                  The source is updated in batches, so the newest days often look like &ldquo;no new cases&rdquo; just
                  because the report has not been entered yet. Measuring up to such a day would understate current
                  incidence. The windows therefore end on the latest day the total actually moved, but never more than{" "}
                  {ASSUMPTIONS.maxReportingLagDays} days before the last reading, so a genuine halt still shows. The
                  response says which day that is in <span className="font-mono">windowEnd</span>.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">Growth rate and doubling or halving time</dt>
                <dd className="text-ink-muted">
                  r = ln(this week&rsquo;s new cases ÷ last week&rsquo;s) ÷ {ASSUMPTIONS.windowDays}, per day. The range
                  is a 95% interval from counting error alone (the square root of 1/n₁ + 1/n₂ on the log ratio). It
                  does not include reporting noise, so treat it as a minimum. The trend is called{" "}
                  <em>growing</em> or <em>shrinking</em> only when that whole range is above or below zero; otherwise{" "}
                  <em>stable</em>. Doubling time is ln 2 ÷ r.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">Reproduction number (Rt)</dt>
                <dd className="text-ink-muted">
                  The average number of people each case infects, implied by the growth rate. With a gamma-distributed
                  serial interval of mean μ and standard deviation σ, R = (1 + r·σ²/μ)^(μ²/σ²) (Wallinga &amp;
                  Lipsitch, 2007). We use μ = {ASSUMPTIONS.serialIntervalMeanDays} days and σ ={" "}
                  {ASSUMPTIONS.serialIntervalSdDays} days, measured in the 2014 West Africa epidemic (WHO Ebola
                  Response Team, NEJM). It has not been measured for this Bundibugyo outbreak, so Rt carries that extra
                  uncertainty. It describes recent transmission and lags real changes.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">Case fatality, three ways</dt>
                <dd className="text-ink-muted">
                  <span className="font-mono">naive</span> is deaths ÷ confirmed cases; it is too low while cases are
                  still unresolved. <span className="font-mono">delayAdjusted</span> divides deaths by the cases
                  confirmed {ASSUMPTIONS.caseToDeathDays} days earlier, which accounts for the lag from confirmation to
                  death. <span className="font-mono">resolved</span> is deaths ÷ (deaths + recovered); it runs high when
                  recoveries are under-reported. The true value is most plausibly within that spread.
                </dd>
              </div>
            </dl>
            <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
              Nothing here is a forecast. These are descriptions of the recent past that depend on how complete
              reporting is. For decisions, rely on official guidance from WHO and the health authorities.
            </p>
          </section>

          <section aria-labelledby="signals-heading" id="signals" className="space-y-3">
            <h2 id="signals-heading" className={h2}>
              News signals
            </h2>
            <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
              Twice a day the tracker reads WHO and news feeds and records any country other than DR Congo that is
              reported to have cases linked to this outbreak. An entry is a lead to verify, not a confirmed case. The
              ledger keeps the date of the first mention, so once a country is officially confirmed we can measure how
              many days the news came earlier. It is only a useful early warning if that lead time turns out to be real
              and the false alarms are few, and the ledger exists to find out.
            </p>
          </section>

          <section aria-labelledby="provenance" className="space-y-3">
            <h2 id="provenance" className={h2}>
              Where the data comes from
            </h2>
            <p className="text-[0.9375rem] leading-relaxed text-ink-muted">{API_ATTRIBUTION}</p>
            <ul className="list-disc space-y-1.5 pl-5 text-[0.9375rem] leading-relaxed text-ink-muted">
              <li>
                One reading per UTC day, taken from the last revision of the article that day.
                {first && latest ? (
                  <>
                    {" "}
                    Currently {snapshots.length} readings, {first.date} to {latest.date}.
                  </>
                ) : null}
              </li>
              <li>
                History before {first?.date ?? "the first reading"} is not included: early versions of the article
                counted suspected deaths in the same field, which is a different definition.
              </li>
              <li>
                Revisions that break the rule that totals never fall (typos, vandalism, edits in progress) are removed
                when history is imported. Some days have no reading because the infobox could not be parsed.
              </li>
              <li>Please credit &ldquo;{outbreak.title}&rdquo; and link the source revision when you republish figures.</li>
            </ul>
          </section>
        </main>
      </div>
    </>
  );
}
