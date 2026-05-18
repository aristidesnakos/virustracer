import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MV Hondius Hantavirus Tracker",
  description:
    "Unofficial real-time surveillance dashboard tracking the 2026 MV Hondius hantavirus outbreak. Data compiled from WHO, CDC, and regional health authorities.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="h-full bg-gray-950 text-gray-100">{children}</body>
    </html>
  );
}
