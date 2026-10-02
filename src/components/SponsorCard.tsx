const MANGOOD_URL =
  "https://mangood.app/?utm_source=hantavirus-tracker&utm_medium=sponsor&utm_campaign=outbreak-dashboard";

export default function SponsorCard() {
  return (
    <a
      href={MANGOOD_URL}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className="group block rounded-xl border border-rule-strong bg-suspected-tint px-5 py-4 transition-colors hover:border-ink-faint"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-ink-muted">
          Recommended
        </span>
        <span className="text-[0.8125rem] font-bold uppercase tracking-[0.08em] text-suspected-text">
          Mangood
        </span>
      </div>
      <p className="mb-1 font-journal text-base font-semibold leading-snug text-ink">
        Know what&rsquo;s actually in your products.
      </p>
      <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
        Scan grooming &amp; supplement barcodes for endocrine disruptors, parabens, and underdosed
        formulas.
      </p>
      <p className="mt-2 text-[0.9375rem] font-semibold text-suspected-text underline decoration-suspected-text/40 underline-offset-4 group-hover:decoration-suspected-text">
        Get the app on iOS →<span className="sr-only"> (opens in a new tab)</span>
      </p>
    </a>
  );
}
