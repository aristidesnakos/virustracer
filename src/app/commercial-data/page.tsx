import type { Metadata } from "next";
import Link from "next/link";
import CommercialInterestForm from "@/components/CommercialInterestForm";
import StaticPage, { PROSE_H2, PROSE_LINK, PROSE_P } from "@/components/StaticPage";
import { COMMERCIAL_PATH, PILOT_PRICE_USD_PER_MONTH } from "@/lib/commercial";
import { DATA_LICENSE, DATA_LICENSE_NAME, SITE_NAME } from "@/lib/site";

// A demand test (see src/lib/commercial.ts): describes a paid feed that is not
// built yet, says so up front, and takes no payment.

const title = "Bird flu data for egg and poultry buyers";
const description = `A planned paid feed of H5N1 detections in poultry, dairy herds and people, checked daily and traceable to the official notice. Not built yet: ${SITE_NAME} is looking for pilot customers.`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: COMMERCIAL_PATH },
  // Page-level openGraph/twitter replace the layout's wholesale, so repeat the shared fields.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
    url: COMMERCIAL_PATH,
    title: `${title} · ${SITE_NAME}`,
    description,
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${title} · ${SITE_NAME}`,
    description,
    images: ["/opengraph-image"],
  },
};

const FEATURES: [string, string][] = [
  [
    "Every new detection, daily.",
    "Commercial and backyard poultry flocks by state and county with the number of birds affected, dairy herd detections and human cases, from USDA APHIS and CDC. United States first; other countries if pilot customers need them.",
  ],
  [
    "One table back to 2022.",
    "The same columns for every source, as CSV and a JSON API, with the full history to check past buying decisions against.",
  ],
  [
    "Alerts for the places you buy from.",
    "An email or webhook when a detection is confirmed in the states you choose.",
  ],
  [
    "A record you can audit.",
    "Every row links to the official notice, with an archived copy and its SHA-256 hash, as the public dashboards on this site already do.",
  ],
];

export default function CommercialDataPage() {
  return (
    <StaticPage
      title={title}
      intro={
        <p>
          A planned feed of H5N1 detections in poultry, dairy herds and people, checked every day and traceable to the
          official notice.
        </p>
      }
    >
      <section aria-labelledby="status" className="space-y-3 rounded-xl border border-rule-strong bg-panel p-5">
        <h2 id="status" className="font-journal text-xl font-semibold text-ink">
          Not available yet
        </h2>
        <p className={PROSE_P}>
          This page asks whether the feed is worth building. Nothing is sold or charged here. If you join the pilot
          list, we will email you to ask how you buy, and you decide later whether to take part.
        </p>
      </section>

      <section aria-labelledby="what" className="space-y-3">
        <h2 id="what" className={PROSE_H2}>
          What you would get
        </h2>
        <ul className={`list-disc space-y-2 pl-5 ${PROSE_P}`}>
          {FEATURES.map(([lead, rest]) => (
            <li key={lead}>
              <strong className="font-semibold text-ink">{lead}</strong> {rest}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="price" className="space-y-3">
        <h2 id="price" className={PROSE_H2}>
          Price
        </h2>
        <p className="font-journal text-3xl font-bold text-ink">
          ${PILOT_PRICE_USD_PER_MONTH}
          <span className="ml-1 font-sans text-base font-normal text-ink-muted">per month, per team</span>
        </p>
        <p className={PROSE_P}>
          Billed monthly, no annual contract. Need other countries, species or a custom export? Say so in the form.
        </p>
        <p className={PROSE_P}>
          The outbreak dashboards, CSV files and <Link href="/data" className={PROSE_LINK}>API</Link> on this site
          stay free, under{" "}
          <a href={DATA_LICENSE} className={PROSE_LINK} rel="license noopener">
            {DATA_LICENSE_NAME}
          </a>
          . The fee would pay for the daily checking, the history, the alerts and a person who answers when a number
          looks wrong.
        </p>
      </section>

      <section aria-labelledby="pilot" className="space-y-4">
        <h2 id="pilot" className={PROSE_H2}>
          Join the pilot list
        </h2>
        <p className={PROSE_P}>
          {SITE_NAME} is run by Ari Nakos (<Link href="/about" className={PROSE_LINK}>about</Link>), who reads every
          reply. Your address is used only to write to you about this feed.
        </p>
        <CommercialInterestForm />
      </section>
    </StaticPage>
  );
}
