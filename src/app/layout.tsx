import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Literata } from "next/font/google";
import "./globals.css";
import { outbreak } from "@/data/outbreak";
import { SITE_NAME, SITE_URL } from "@/lib/site";

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

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: outbreak.seoTitle, template: `%s · ${SITE_NAME}` },
  description: outbreak.description,
  applicationName: SITE_NAME,
  keywords: [...outbreak.keywords],
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" },
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
    title: outbreak.seoTitle,
    description: outbreak.description,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: outbreak.seoTitle,
    description: outbreak.description,
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
