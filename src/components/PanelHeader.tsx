import type { ReactNode } from "react";

/** Journal-style section heading: small "Fig. 1" kicker over a serif title. */
export default function PanelHeader({
  kicker,
  title,
  aside,
  id,
}: {
  kicker: string;
  title: ReactNode;
  aside?: ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div>
        <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-ink-faint">
          {kicker}
        </p>
        <h2 id={id} className="font-journal text-xl font-semibold leading-snug text-ink">
          {title}
        </h2>
      </div>
      {aside}
    </div>
  );
}
