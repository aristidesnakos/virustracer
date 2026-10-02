import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Literata } from "next/font/google";
import "./globals.css";
import { outbreak } from "@/data/outbreak";

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
  title: outbreak.title,
  description: outbreak.description,
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
