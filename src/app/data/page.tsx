import type { Metadata } from "next";
import Link from "next/link";
import { getDefaultOutbreak, listOutbreaks } from "@/data/outbreaks";
import { MAX_LIMIT, attributionFor } from "@/lib/api";
import { ASSUMPTIONS } from "@/lib/metrics";
import { OUTBREAKS_API_PATH, legacyApiPath, outbreakApiPath, outbreakPath } from "@/lib/outbreak-paths";
import { DATA_LICENSE, DATA_LICENSE_NAME, SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/site";
import { getTollData } from "@/lib/toll";

const outbreak = getDefaultOutbreak();

export const metadata: Metadata = {
  title: "Data & API",
  alternates: { canonical: "/data" },
  // Page-level openGraph/twitter replace the layout's wholesale, so repeat the shared fields.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
    url: "/data",
    title: `Data & API · ${SITE_NAME}`,
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `Data & API · ${SITE_NAME}`,
    images: ["/opengraph-image"],
  },
  description:
    "Free, keyless JSON and CSV access to the daily outbreak figures for every outbreak tracked, with the source revision for every reading, plus how the growth and reproduction estimates are calculated.",
};

const slugParam = "<slug>";

// Per-outbreak endpoints, shown with a `<slug>` placeholder and a worked example for the default outbreak.
const OUTBREAK_ENDPOINTS = [
  {
    path: outbreakApiPath(slugParam, "toll"),
    what: "One row per day of cumulative confirmed, suspected, deaths and recovered, each linked to the exact Wikipedia revision it was read from.",
    params: [
      ["from, to", "Inclusive date range, YYYY-MM-DD."],
      ["limit", `Keep only the most recent N rows (1–${MAX_LIMIT}).`],
      ["format", "json (default) or csv."],
    ],
    example: `${outbreakApiPath(outbreak.slug, "toll")}?from=2026-09-01&format=csv`,
  },
  {
    path: outbreakApiPath(slugParam, "metrics"),
    what: "Derived indicators: new cases and deaths per 7 days, growth rate, doubling or halving time, reproduction number (Rt) and three fatality ratios, with their assumptions.",
    params: [
      ["include=daily", "Add the day-by-day series (new cases, 7-day average, interpolated flag)."],
      ["format=csv", "Return the daily series as CSV."],
    ],
    example: `${outbreakApiPath(outbreak.slug, "metrics")}?include=daily`,
  },
  {
    path: outbreakApiPath(slugParam, "signals"),
    what: "Countries the news has linked to the outbreak, when each was first mentioned, and, once officially confirmed, how far the news led.",
    params: [],
    example: outbreakApiPath(outbreak.slug, "signals"),
  },
] as const;

const code = "overflow-x-auto rounded-lg border border-rule bg-sunk p-4 font-mono text-[0.875rem] leading-relaxed text-ink";
const h2 = "font-journal text-2xl font-semibold leading-snug text-ink";
const link =
  "font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent";

export default function DataPage() {
  const toll = getTollData(outbreak.slug);
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
            <Link href={outbreakPath(outbreak.slug)} className={link}>
              ← {outbreak.title}
            </Link>
          </p>
          <h1 className="font-journal text-[clamp(1.875rem,4.2vw,2.5rem)] font-bold leading-[1.1] text-ink">
            Data &amp; API
          </h1>
          <p className="mt-3 max-w-[40rem] text-base text-ink-muted">
            The numbers on the dashboard are free to use under {DATA_LICENSE_NAME}. No account, no key, and any website can
            call them from the browser. Every figure points back to the source revision it came from, so you can check it.
          </p>
        </header>

        <main id="main" className="space-y-12 pt-8">
          <section aria-labelledby="endpoints" className="space-y-6">
            <h2 id="endpoints" className={h2}>
              Endpoints
            </h2>
            <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
              Every outbreak has its own set of endpoints, addressed by its slug. Start from the list to find them.
              The examples below use the default outbreak, <span className="font-mono">{outbreak.slug}</span>.
            </p>

            <div className="panel">
              <h3 className="font-mono text-base font-semibold text-ink">GET {OUTBREAKS_API_PATH}</h3>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">
                Every outbreak tracked: slug, title, disease, status, places, source, the latest confirmed cases and
                deaths with their date, and links to its page and its endpoints.
              </p>
              <p className="mt-3 text-[0.9375rem]">
                <a href={OUTBREAKS_API_PATH} className={link}>
                  Try it: <span className="font-mono">{OUTBREAKS_API_PATH}</span>
                </a>
              </p>
            </div>

            {OUTBREAK_ENDPOINTS.map((e) => (
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

            <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
              An unknown slug returns <span className="font-mono">404</span> with a JSON{" "}
              <span className="font-mono">{"{ \"error\": ... }"}</span> body, like every other error.
            </p>

            <div className="panel">
              <h3 className="text-base font-semibold text-ink">Un-prefixed endpoints are permanent aliases</h3>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">
                <span className="font-mono">{legacyApiPath("toll")}</span>,{" "}
                <span className="font-mono">{legacyApiPath("metrics")}</span> and{" "}
                <span className="font-mono">{legacyApiPath("signals")}</span> always return the default outbreak
                (currently <span className="font-mono">{outbreak.slug}</span>), with the same parameters and the same
                response as its per-outbreak endpoints. They will keep working, so existing scripts need no change.
                New integrations should use the per-outbreak paths.
              </p>
            </div>

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
              <pre className={code}>{`const res = await fetch("${outbreakApiPath(outbreak.slug, "metrics")}");   // or the full https:// address
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
                  Lipsitch, 2007). The serial interval is set per disease, below. Where no source has been verified for
                  a disease, Rt is left out rather than borrowed from another one. It describes recent transmission and
                  lags real changes.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">Case fatality, three ways</dt>
                <dd className="text-ink-muted">
                  <span className="font-mono">naive</span> is deaths ÷ confirmed cases; it is too low while cases are
                  still unresolved. <span className="font-mono">delayAdjusted</span> divides deaths by the cases
                  confirmed some days earlier (set per disease, below), which accounts for the lag from confirmation to
                  death; it is left out where that delay has no verified source. <span className="font-mono">resolved</span> is deaths ÷ (deaths + recovered); it runs high when
                  recoveries are under-reported. The true value is most plausibly within that spread.
                </dd>
              </div>
            </dl>
            <h3 className="font-semibold text-ink">Assumptions by outbreak</h3>
            <ul className="space-y-2 text-[0.9375rem] leading-relaxed text-ink-muted" data-testid="assumptions-by-outbreak">
              {listOutbreaks().map((o) => (
                <li key={o.slug}>
                  <span className="font-semibold text-ink">{o.title}.</span>{" "}
                  {o.metrics.serialInterval ? (
                    <>
                      Serial interval μ = {o.metrics.serialInterval.meanDays} days, σ = {o.metrics.serialInterval.sdDays}{" "}
                      days ({o.metrics.serialInterval.source}).
                    </>
                  ) : (
                    <>Rt not reported. {o.metrics.rtNote ?? "No serial interval has been verified for this disease."}</>
                  )}{" "}
                  {o.metrics.caseToDeathDays !== null
                    ? `Confirmation-to-death delay ${o.metrics.caseToDeathDays} days.`
                    : "Delay-adjusted fatality not reported."}
                </li>
              ))}
            </ul>
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
            <p className="text-[0.9375rem] leading-relaxed text-ink-muted">{attributionFor(outbreak)}</p>
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
              <li>
                Licence:{" "}
                <a href={DATA_LICENSE} className="underline underline-offset-2" rel="license noopener">
                  {DATA_LICENSE_NAME}
                </a>
                . Credit &ldquo;{SITE_NAME}&rdquo; (
                <a href={absoluteUrl("/")} className="underline underline-offset-2">
                  {new URL(SITE_URL).host}
                </a>
                ) and link the source revision when you republish figures. If you
                adapt the data, share the result under the same licence.
              </li>
            </ul>
          </section>
        </main>
      </div>
    </>
  );
}
