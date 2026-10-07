import type { Metadata } from "next";
import Link from "next/link";
import StaticPage, { PROSE_H2, PROSE_LINK, PROSE_P, ProseTable } from "@/components/StaticPage";
import { CORRECTIONS_URL, REPO_URL } from "@/lib/methodology";
import { DATA_LICENSE, DATA_LICENSE_NAME, SITE_NAME, absoluteUrl } from "@/lib/site";

const OWNER = "Ari Nakos";

const description = `Who runs ${SITE_NAME}, where its outbreak figures come from, how they are checked, and how to report a correction.`;

export const metadata: Metadata = {
  title: "About",
  description,
  alternates: { canonical: "/about" },
  // Page-level openGraph/twitter replace the layout's wholesale, so repeat the shared fields.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
    url: "/about",
    title: `About · ${SITE_NAME}`,
    description,
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `About · ${SITE_NAME}`,
    description,
    images: ["/opengraph-image"],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  "@id": absoluteUrl("/about#page"),
  url: absoluteUrl("/about"),
  name: `About ${SITE_NAME}`,
  description,
  inLanguage: "en",
  isPartOf: { "@id": absoluteUrl("/#website") },
  about: { "@id": absoluteUrl("/#organization") },
  author: { "@type": "Person", name: OWNER },
};

export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // "<" is escaped so no field value can close the script element.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <StaticPage title={`About ${SITE_NAME}`} intro={
          <p>
            Who runs {SITE_NAME}, where its data comes from, how to report an error and how to reuse the figures.
          </p>
        }>
        <section aria-labelledby="who" className="space-y-3">
          <h2 id="who" className={PROSE_H2}>
            Who runs it
          </h2>
          <p className={PROSE_P}>
            {SITE_NAME} is run by {OWNER}, an independent developer. It is not affiliated with WHO, any
            government or any health agency, and it is not an official public health resource. It exists to put
            the current figures for each outbreak in one place, each tied to the source it came from, and to keep
            that record after the news moves on.
          </p>
        </section>

        <section aria-labelledby="data" className="space-y-3">
          <h2 id="data" className={PROSE_H2}>
            Where the data comes from
          </h2>
          <ProseTable
            caption="The three layers of data on the site and where each comes from"
            head={["Layer", "Entered", "Source"]}
            rows={[
              [
                "Headline totals",
                "Automatically, twice a day",
                "Each outbreak\u2019s Wikipedia infobox, which cites the health ministries and WHO, or the health authority\u2019s weekly report where there is no infobox (West Nile virus in Greece: EODY). Every reading links to the exact revision or report it came from.",
              ],
              [
                "Milestones, country tables and summaries",
                "By hand",
                "Official situation reports, each with its source.",
              ],
              [
                "News items",
                "Automatically, from feeds",
                "WHO and news feeds. Where a summary is written automatically, it is a pointer to the original article, not a finding of ours.",
              ],
            ]}
          />
          <p className={PROSE_P}>
            How each layer is checked, how reporting lag is handled and how outbreaks are ranked is on the{" "}
            <Link href="/methodology" className={PROSE_LINK}>
              Methodology
            </Link>{" "}
            page.
          </p>
        </section>

        <section aria-labelledby="corrections" className="space-y-3">
          <h2 id="corrections" className={PROSE_H2}>
            Corrections
          </h2>
          <p className={PROSE_P}>
            If a figure, date or source looks wrong, please{" "}
            <a href={CORRECTIONS_URL} className={PROSE_LINK} rel="noopener">
              open an issue on GitHub
            </a>{" "}
            with a link to the page and to the source you think is right. Corrections to hand-entered data are made
            in the open, in the public history of the repository, so every change can be seen.
          </p>
        </section>

        <section aria-labelledby="reuse" className="space-y-3">
          <h2 id="reuse" className={PROSE_H2}>
            Reusing the data
          </h2>
          <p className={PROSE_P}>
            The figures are free to reuse under{" "}
            <a href={DATA_LICENSE} className={PROSE_LINK} rel="license noopener">
              {DATA_LICENSE_NAME}
            </a>
            , through a keyless JSON and CSV API described on the{" "}
            <Link href="/data" className={PROSE_LINK}>
              Data &amp; API
            </Link>{" "}
            page. The code that collects and checks them is{" "}
            <a href={REPO_URL} className={PROSE_LINK} rel="noopener">
              public on GitHub
            </a>
            .
          </p>
        </section>
      </StaticPage>
    </>
  );
}
