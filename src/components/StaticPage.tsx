import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import { SITE_NAME } from "@/lib/site";

export const PROSE_H2 = "font-journal text-2xl font-semibold leading-snug text-ink";
export const PROSE_P = "text-[0.9375rem] leading-relaxed text-ink-muted";
export const PROSE_LINK =
  "font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent";

/** Shell for the site's text pages (/methodology, /about): back link, title, intro, body, footer. */
export default function StaticPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <div className="mx-auto w-full max-w-[56rem] px-[clamp(1rem,3vw,2.5rem)] pb-16">
        <header className="pt-7 pb-5 border-b-4 border-double border-ink">
          <p className="mb-2 text-[0.8125rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            <Link href="/" className={PROSE_LINK}>
              ← {SITE_NAME}
            </Link>
          </p>
          <h1 className="font-journal text-[clamp(1.875rem,4.2vw,2.5rem)] font-bold leading-[1.1] text-ink">
            {title}
          </h1>
          <div className="mt-3 max-w-[40rem] text-base text-ink-muted">{intro}</div>
        </header>
        <main id="main" className="space-y-12 pt-8">
          {children}
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
