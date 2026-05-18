import type { FeedItem } from "@/lib/live-data";

const SOURCE_COLORS: Record<string, string> = {
  WHO: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  "WHO News": "text-blue-400 bg-blue-400/10 border-blue-400/20",
  ProMED: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  CDC: "text-green-400 bg-green-400/10 border-green-400/20",
  PHAC: "text-green-400 bg-green-400/10 border-green-400/20",
};

function SourceChip({ source }: { source: string }) {
  const cls =
    SOURCE_COLORS[source] ?? "text-gray-400 bg-gray-400/10 border-gray-400/20";
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium border ${cls}`}
    >
      {source}
    </span>
  );
}

export default function FeedUpdates({
  items,
  lastFetched,
}: {
  items: FeedItem[];
  lastFetched: string;
}) {
  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600 text-xs">
        No feed items yet. Run the data pipeline to populate.
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
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h2 className="text-sm font-semibold text-white/90 uppercase tracking-wider">
          Official Feed Updates
        </h2>
        {fetchedLabel && (
          <span className="text-xs text-gray-600">Fetched {fetchedLabel}</span>
        )}
      </div>

      <ul className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
        {items.map((item) => (
          <li
            key={item.id}
            className="border border-white/[0.06] rounded-lg px-3.5 py-3 hover:border-white/[0.1] hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-white/85 hover:text-white leading-snug line-clamp-2 transition-colors"
              >
                {item.title}
              </a>
              <SourceChip source={item.source} />
            </div>
            <p className="text-xs text-gray-400 leading-relaxed line-clamp-3">
              {item.summary}
            </p>
            <div className="mt-1.5 text-[10px] text-gray-600">
              {new Date(item.date).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
