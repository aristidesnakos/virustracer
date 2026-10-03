import type { Metadata } from "next";
import Link from "next/link";
import OutbreakCard from "@/components/OutbreakCard";
import { DevFeedback } from "@/components/dev/DevFeedback";
import SiteFooter from "@/components/SiteFooter";
import { listOutbreaks } from "@/data/outbreaks";
import {
  buildSnapshot,
  compareSnapshots,
  describeHome,
  groupByStatus,
  type OutbreakSnapshot,
} from "@/lib/home-snapshot";
import { outbreakPath } from "@/lib/outbreak-paths";
import { SITE_NAME, SITE_TAGLINE, absoluteUrl } from "@/lib/site";
import { getTollData } from "@/lib/toll";

function loadSnapshots(): OutbreakSnapshot[] {
  return listOutbreaks()
    .map((o) => buildSnapshot(o, getTollData(o.slug)))
    .sort(compareSnapshots);
}

// The description names the top outbreaks with their current numbers, so it is
// built from the data rather than fixed.
export function generateMetadata(): Metadata {
  const description = describeHome(loadSnapshots(), SITE_TAGLINE);
  return {
    title: { absolute: `${SITE_NAME}: ${SITE_TAGLINE}` },
    description,
    alternates: { canonical: "/" },
    // Page-level openGraph/twitter replace the layout's wholesale, so repeat the shared fields.
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_US",
      title: SITE_NAME,
      description,
      url: "/",
    },
    twitter: { card: "summary_large_image", title: SITE_NAME, description },
  };
}

function homeJsonLd(ranked: readonly OutbreakSnapshot[]) {
  return {
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
      {
        "@type": "CollectionPage",
        "@id": absoluteUrl("/#page"),
        url: absoluteUrl("/"),
        name: "Outbreaks we are tracking",
        isPartOf: { "@id": absoluteUrl("/#website") },
        inLanguage: "en",
        mainEntity: {
          "@type": "ItemList",
          itemListOrder: "https://schema.org/ItemListOrderDescending",
          numberOfItems: ranked.length,
          itemListElement: ranked.map((s, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: absoluteUrl(outbreakPath(s.outbreak.slug)),
            name: s.outbreak.title,
          })),
        },
      },
    ],
  };
}

export default function HomePage() {
  const ranked = loadSnapshots();
  const groups = groupByStatus(ranked);
  // Stagger the entrance animation in ranked order across all groups.
  const position = new Map(ranked.map((s, i) => [s.outbreak.slug, i + 1]));

  return (
    <>
      <script
        type="application/ld+json"
        // "<" is escaped so no field value can close the script element.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(homeJsonLd(ranked)).replace(/</g, "\\u003c"),
        }}
      />
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <div className="mx-auto w-full max-w-[1360px] px-[clamp(1rem,3vw,2.5rem)] pb-10">
        <DevFeedback name="Home.Header">
          <header className="rise pt-7 pb-5 border-b-4 border-double border-ink">
            <h1 className="font-journal text-[clamp(1.875rem,4.2vw,2.875rem)] font-bold leading-[1.1] tracking-[-0.01em] text-ink">
              {SITE_NAME}
            </h1>
            <p className="mt-2 max-w-[46rem] text-base text-ink-muted">{SITE_TAGLINE}</p>
          </header>
        </DevFeedback>

        <main id="main" className="pt-6">
          <DevFeedback name="Home.OutbreaksSection">
            <section aria-labelledby="outbreaks-heading">
              <h2
                id="outbreaks-heading"
                className="font-journal text-xl font-semibold leading-snug text-ink"
              >
                Outbreaks we are tracking
              </h2>
              <p className="mt-1 max-w-[46rem] text-[0.9375rem] text-ink-muted">
                Grouped by status, then ordered by new deaths in the last 7 days. Numbers from
                different outbreaks are counted differently, so compare trends, not totals.{" "}
                <Link
                  href="/methodology#ranking"
                  className="font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
                >
                  How we rank and count
                </Link>
              </p>

              {groups.map((group) => (
                <section
                  key={group.status}
                  aria-labelledby={`status-${group.status}`}
                  className="mt-6"
                  data-testid={`status-group-${group.status}`}
                >
                  <h3
                    id={`status-${group.status}`}
                    className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-ink-faint"
                  >
                    {group.heading}{" "}
                    <span className="tabular-nums font-normal">({group.items.length})</span>
                  </h3>
                  <ul className="mt-3 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {group.items.map((snapshot) => (
                      <li
                        key={snapshot.outbreak.slug}
                        className="rise"
                        style={{ "--i": position.get(snapshot.outbreak.slug) } as React.CSSProperties}
                      >
                        <OutbreakCard
                          snapshot={snapshot}
                          headingId={`outbreak-${snapshot.outbreak.slug}`}
                          headingLevel={4}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </section>
          </DevFeedback>
        </main>

        <DevFeedback name="Home.Footer">
          <SiteFooter />
        </DevFeedback>
      </div>
    </>
  );
}
