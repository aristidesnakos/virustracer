/**
 * Compact table for many rows of figures (one row per state): it keeps its columns on a
 * phone and scrolls sideways, with the first column pinned, instead of stacking each row
 * into a block as ProseTable does, which would make a 54-row table pages long.
 */
export default function NumberTable({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-rule" tabIndex={0} role="region" aria-label={caption}>
      <table className="w-full border-collapse text-left text-[0.875rem] text-ink-muted">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-rule-strong text-[0.75rem] uppercase tracking-[0.06em] text-ink-faint">
            {head.map((h, i) => (
              <th
                key={i}
                scope="col"
                className={`px-3 py-2 align-bottom font-semibold ${i === 0 ? "sticky left-0 bg-paper text-left" : "text-right"}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, r) => (
            <tr key={r} className="border-b border-rule last:border-b-0">
              {cells.map((cell, c) =>
                c === 0 ? (
                  <th key={c} scope="row" className="sticky left-0 whitespace-nowrap bg-paper px-3 py-1.5 text-left font-medium text-ink">
                    {cell}
                  </th>
                ) : (
                  <td key={c} className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
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
