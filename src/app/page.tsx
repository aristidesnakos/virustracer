import type { Metadata } from "next";
import Link from "next/link";
import OutbreakCard from "@/components/OutbreakCard";
import { listOutbreaks } from "@/data/outbreaks";
import { getTollData } from "@/lib/toll";
import { mergeTimeline } from "@/lib/timeline";
import { latestFigures } from "@/lib/seo";
import { SITE_NAME, SITE_TAGLINE, absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME}: ${SITE_TAGLINE}` },
  description: SITE_TAGLINE,
  alternates: { canonical: "/" },
  // Page-level openGraph/twitter replace the layout's wholesale, so repeat the shared fields.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
    title: SITE_NAME,
    description: SITE_TAGLINE,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: SITE_NAME, description: SITE_TAGLINE },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": absoluteUrl("/#website"),
      url: absoluteUrl("/"),
      name: SITE_NAME,
      description: SITE_TAGLINE,
      inLanguage: "en",
      publisher: { "@id": absoluteUrl("/#organization") },
    },
    {
      "@type": "Organization",
      "@id": absoluteUrl("/#organization"),
      name: SITE_NAME,
      url: absoluteUrl("/"),
      description: SITE_TAGLINE,
    },
  ],
};

export default function HomePage() {
  const cards = listOutbreaks().map((outbreak) => {
    const toll = getTollData(outbreak.slug);
    const figures = latestFigures(mergeTimeline(outbreak.casesTimeline, toll.snapshots));
    return { outbreak, figures };
  });

  return (
    <>
      <script
        type="application/ld+json"
        // "<" is escaped so no field value can close the script element.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <div className="mx-auto w-full max-w-[1360px] px-[clamp(1rem,3vw,2.5rem)] pb-10">
        <header className="rise pt-7 pb-5 border-b-4 border-double border-ink">
          <h1 className="font-journal text-[clamp(1.875rem,4.2vw,2.875rem)] font-bold leading-[1.1] tracking-[-0.01em] text-ink">
            {SITE_NAME}
          </h1>
          <p className="mt-2 max-w-[46rem] text-base text-ink-muted">{SITE_TAGLINE}</p>
        </header>

        <main id="main" className="pt-6">
          <section aria-labelledby="outbreaks-heading">
            <h2
              id="outbreaks-heading"
              className="font-journal text-xl font-semibold leading-snug text-ink"
            >
              Outbreaks we are tracking
            </h2>
            <ul className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {cards.map(({ outbreak, figures }, i) => (
                <li
                  key={outbreak.slug}
                  className="rise"
                  style={{ "--i": i + 1 } as React.CSSProperties}
                >
                  <OutbreakCard
                    outbreak={outbreak}
                    figures={figures}
                    headingId={`outbreak-${outbreak.slug}`}
                  />
                </li>
              ))}
            </ul>
          </section>
        </main>

        <footer className="mt-10 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-t border-rule-strong pt-5">
          <p className="max-w-[46rem] text-[0.9375rem] text-ink-muted">
            Not an official public health resource. Data manually compiled from public sources —
            verify with official authorities.
          </p>
          <p className="text-[0.8125rem] text-ink-faint">
            <Link
              href="/data"
              className="font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
            >
              Data &amp; API
            </Link>
          </p>
        </footer>
      </div>
    </>
  );
}
