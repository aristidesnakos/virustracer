const MANGOOD_URL =
  "https://mangood.app/?utm_source=hantavirus-tracker&utm_medium=sponsor&utm_campaign=outbreak-dashboard";

export default function SponsorCard() {
  return (
    <a
      href={MANGOOD_URL}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className="group shrink-0 block bg-gray-900/40 border border-white/[0.07] rounded-xl px-4 py-3 hover:border-white/[0.14] hover:bg-gray-900/60 transition-colors"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-gray-600">
          Sponsored
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/80">
          Mangood
        </span>
      </div>
      <p className="text-xs font-medium text-white/85 leading-snug mb-1">
        Know what&rsquo;s actually in your products.
      </p>
      <p className="text-[11px] text-gray-400 leading-relaxed">
        Scan grooming &amp; supplement barcodes for endocrine disruptors, parabens, and underdosed formulas.
      </p>
      <div className="mt-2 text-[11px] text-amber-400/70 group-hover:text-amber-400 transition-colors">
        Get the app on iOS →
      </div>
    </a>
  );
}
