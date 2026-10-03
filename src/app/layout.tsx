import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Literata } from "next/font/google";
import "./globals.css";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";

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
  keywords: ["outbreak tracker", "outbreak data", "disease outbreaks", "epidemic data", "outbreak figures"],
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
  return (
    <html lang="en" className={`${body.variable} ${journal.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
