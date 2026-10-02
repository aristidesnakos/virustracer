import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { outbreak } from "@/data/outbreak";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: outbreak.title,
  description: outbreak.description,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${geist.variable} h-full antialiased`}>
      <body className="h-full bg-gray-950 text-gray-100">{children}</body>
    </html>
  );
}
