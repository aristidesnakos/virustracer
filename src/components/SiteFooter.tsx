import Link from "next/link";
import { COMMERCIAL_PATH } from "@/lib/commercial";

const LINK =
  "font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent";

export const FOOTER_LINKS = [
  { href: "/methodology", label: "Methodology" },
  { href: "/about", label: "About" },
  { href: "/data", label: "Data & API" },
  { href: COMMERCIAL_PATH, label: "Commercial data" },
] as const;

/** Disclaimer plus links to the trust pages; shared by the site-level pages. */
export default function SiteFooter() {
  return (
    <footer className="mt-10 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-t border-rule-strong pt-5">
      <p className="max-w-[46rem] text-[0.9375rem] text-ink-muted">
        Not an official public health resource. Figures are compiled from public sources —
        verify with official authorities.
      </p>
      <nav aria-label="Site" className="flex flex-wrap gap-x-5 text-[0.8125rem]">
        {FOOTER_LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={LINK}>
            {l.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
