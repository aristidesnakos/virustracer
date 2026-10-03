import Link from "next/link";
import { Children, isValidElement } from "react";
import { DevFeedback } from "@/components/dev/DevFeedback";
import SiteFooter from "@/components/SiteFooter";
import { SITE_NAME } from "@/lib/site";

export const PROSE_H2 = "scroll-mt-8 font-journal text-2xl font-semibold leading-snug text-ink";
export const PROSE_P = "text-[0.9375rem] leading-relaxed text-ink-muted";
export const PROSE_LINK =
  "font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent";

/** A short aside under a section's main content: one fact, set apart from the prose around it. */
export const PROSE_NOTE = `border-l-2 border-rule-strong pl-3 ${PROSE_P}`;

/**
 * Comparison table for the text pages. The first column is the row header; `caption` is read
 * by screen readers only, the section heading above is the visible title. Below `sm` each row
 * stacks into a block and every cell after the first carries its column title, so nothing
 * has to squeeze into a few words per line. Display is overridden there, which makes some
 * browsers drop the table semantics, so the roles are stated explicitly.
 */
export function ProseTable({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table role="table" className={`w-full border-collapse text-left max-sm:block ${PROSE_P}`}>
        <caption className="sr-only">{caption}</caption>
        <thead role="rowgroup" className="max-sm:sr-only">
          <tr
            role="row"
            className="border-b border-rule-strong text-[0.8125rem] uppercase tracking-[0.08em] text-ink-faint"
          >
            {head.map((h, i) => (
              <th key={i} role="columnheader" scope="col" className="py-2 pr-5 font-semibold last:pr-0">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup" className="max-sm:block">
          {rows.map((cells, r) => (
            <tr key={r} role="row" className="border-b border-rule align-top max-sm:block max-sm:py-3">
              {cells.map((cell, c) =>
                c === 0 ? (
                  <th
                    key={c}
                    role="rowheader"
                    scope="row"
                    className="whitespace-nowrap py-3 pr-5 text-left font-semibold text-ink max-sm:block max-sm:whitespace-normal max-sm:py-0 max-sm:pb-1"
                  >
                    {cell}
                  </th>
                ) : (
                  <td
                    key={c}
                    role="cell"
                    data-label={head.length > 2 ? head[c] : undefined}
                    className="py-3 pr-5 last:pr-0 max-sm:block max-sm:py-1 max-sm:pr-0 max-sm:before:block max-sm:before:text-[0.75rem] max-sm:before:font-semibold max-sm:before:uppercase max-sm:before:tracking-[0.08em] max-sm:before:text-ink-faint max-sm:before:content-[attr(data-label)]"
                  >
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
        <main id="main" className="flex flex-col gap-12 pt-8">
          {Children.map(children, (child) => {
            const id = isValidElement<{ "aria-labelledby"?: string }>(child)
              ? child.props["aria-labelledby"]
              : undefined;
            return id ? <DevFeedback name={`${title}.${id}`}>{child}</DevFeedback> : child;
          })}
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
