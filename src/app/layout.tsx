import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Literata } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import AlertsInterestWidget from "@/components/AlertsInterestWidget";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";
import { dataFastScript } from "@/lib/analytics-script";

// Body: Atkinson Hyperlegible, drawn by the Braille Institute for maximum
// character distinction. Headings and figures: Literata, a reading serif.
const body = Atkinson_Hyperlegible_Next({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});
const journal = Literata({
  variable: "--font-journal",
  subsets: ["latin"],
  display: "swap",
});

// Site-level defaults. Every page sets its own title, description and canonical
// (so none is set here, or each page would inherit "/"); these cover pages that don't.
const SITE_TITLE = `${SITE_NAME}: ${SITE_TAGLINE}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s · ${SITE_NAME}` },
  description: SITE_TAGLINE,
  applicationName: SITE_NAME,
  keywords: ["current outbreaks", "disease outbreaks 2026", "outbreak tracker", "disease outbreak map", "outbreaks around the world"],
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" },
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
    title: SITE_TITLE,
    description: SITE_TAGLINE,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_TAGLINE,
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f7f3eb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const datafast = dataFastScript();
  return (
    <html lang="en" className={`${body.variable} ${journal.variable} antialiased`}>
      <body>
        {children}
        <AlertsInterestWidget />
        {/* DataFast page analytics and goals; only when its public website id is configured. */}
        {datafast && (
          <Script
            src={datafast.src}
            data-website-id={datafast.websiteId}
            data-domain={datafast.domain}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
