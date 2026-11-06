import { SCOPES, SEVERITY_LEVELS, fmtInt, type SeverityCode } from "@/lib/nursing-homes";

/**
 * CMS's scope/severity grid with a count in each cell. Severity rises from the bottom row
 * (potential for minimal harm) to the top (immediate jeopardy); scope from isolated to widespread.
 */
export default function SeverityGrid({ counts, caption }: { counts: Record<SeverityCode, number>; caption: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] border-collapse text-left text-[0.875rem]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-rule-strong text-[0.75rem] uppercase tracking-[0.08em] text-ink-faint">
            <th scope="col" className="py-2 pr-3 font-semibold">
              Severity
            </th>
            {SCOPES.map((s) => (
              <th key={s} scope="col" className="py-2 pr-3 text-center font-semibold">
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SEVERITY_LEVELS.map((l) => (
            <tr key={l.level} className="border-b border-rule align-top">
              <th scope="row" className="py-2.5 pr-3 font-medium text-ink">
                {l.label}
              </th>
              {l.codes.map((c) => (
                <td key={c} className={`py-2.5 pr-3 text-center tabular-nums ${l.level >= 3 ? "bg-death-tint/40" : ""}`}>
                  <span className="mr-1.5 font-mono text-[0.75rem] text-ink-faint">{c}</span>
                  <span className="font-semibold text-ink">{fmtInt(counts[c as SeverityCode])}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
