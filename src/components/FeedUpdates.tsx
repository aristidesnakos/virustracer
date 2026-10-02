import type { FeedItem } from "@/lib/live-data";
import PanelHeader from "@/components/PanelHeader";

const SOURCE_COLORS: Record<string, string> = {
  WHO: "text-accent bg-accent-tint",
  "WHO News": "text-accent bg-accent-tint",
  ProMED: "text-confirmed bg-confirmed-tint",
  CDC: "text-good bg-good-tint",
  PHAC: "text-good bg-good-tint",
};

function SourceChip({ source }: { source: string }) {
  const cls = SOURCE_COLORS[source] ?? "text-ink-muted bg-sunk";
  return (
    <span
      className={`inline-block shrink-0 rounded-md px-2 py-0.5 text-[0.8125rem] font-semibold leading-snug ${cls}`}
    >
      {source}
    </span>
  );
}

export default function FeedUpdates({
  items,
  lastFetched,
  headingId,
}: {
  items: FeedItem[];
  lastFetched: string;
  headingId?: string;
}) {
  if (items.length === 0) {
    return (
      <div>
        <PanelHeader kicker="Notes" id={headingId} title={<>News &amp; official updates</>} />
        <p className="max-w-[65ch] text-ink-muted">
          No articles yet. The feed refreshes automatically twice a day (08:00 and 20:00 UTC).
        </p>
      </div>
    );
  }

  const fetchedLabel = lastFetched
    ? new Date(lastFetched).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
        timeZoneName: "short",
      })
    : null;

  return (
    <div className="flex flex-col">
      <PanelHeader
        kicker="Notes"
        id={headingId}
        title={<>News &amp; official updates</>}
        aside={
          fetchedLabel ? (
            <span className="text-[0.8125rem] text-ink-faint">Fetched {fetchedLabel}</span>
          ) : undefined
        }
      />

      {/* Long list: scrolls inside the panel; focusable so keyboard users can scroll it. */}
      <ul
        tabIndex={0}
        aria-label="Recent news and official updates"
        className="max-h-[38rem] divide-y divide-rule overflow-y-auto border-t border-rule pr-2"
      >
        {items.map((item) => (
          <li key={item.id} className="py-4">
            <div className="mb-1.5 flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 basis-[14rem] font-journal text-base font-semibold leading-snug text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
              >
                {item.title}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <SourceChip source={item.source} />
            </div>
            <p className="line-clamp-3 text-[0.9375rem] leading-relaxed text-ink-muted">
              {item.summary}
            </p>
            <p className="mt-1.5 text-[0.8125rem] text-ink-faint">
              {new Date(item.date).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
