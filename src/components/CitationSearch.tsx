"use client";

import { useDeferredValue, useMemo, useState } from "react";
import {
  STATUS_LABEL,
  careCompareUrl,
  isHarm,
  longDate,
  severityWords,
  type CitationStatus,
  type SeverityCode,
} from "@/lib/nursing-homes";

/** [surveyDate, severity, complaint, standard, infectionControlInspection, status, correctionDate, underIdr, underIidr] */
export type CompactCitation = [string, SeverityCode, boolean, boolean, boolean, CitationStatus, string | null, boolean, boolean];

export interface FacilityCitations {
  ccn: string;
  name: string;
  city: string;
  zip: string;
  citations: CompactCitation[];
}

const PAGE = 40;
const LINK = "font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent";

function surveyKind(complaint: boolean, standard: boolean, ic: boolean): string {
  const kind = complaint && standard ? "Standard and complaint survey" : complaint ? "Complaint survey" : "Standard survey";
  return ic ? `${kind} (infection-control inspection)` : kind;
}

/** Searchable list of one state's cited homes: by name, city, ZIP or CCN, optionally G or above only. */
export default function CitationSearch({
  state,
  release,
  released,
  facilities,
}: {
  state: string;
  release: string;
  released: string;
  facilities: FacilityCitations[];
}) {
  const [query, setQuery] = useState("");
  const [harmOnly, setHarmOnly] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const q = useDeferredValue(query.trim().toUpperCase());

  const matches = useMemo(
    () =>
      facilities.filter(
        (f) =>
          (!q || f.name.toUpperCase().includes(q) || f.city.toUpperCase().includes(q) || f.zip.startsWith(q) || f.ccn === q) &&
          (!harmOnly || f.citations.some((c) => isHarm(c[1]))),
      ),
    [facilities, q, harmOnly],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-[0.8125rem] font-semibold text-ink-muted">
          Search by home, city, ZIP or CCN
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE);
            }}
            placeholder="e.g. Springfield"
            className="rounded-md border border-rule-strong bg-panel px-3 py-2 text-base font-normal text-ink outline-none focus:border-accent"
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-[0.9375rem] text-ink-muted">
          <input
            type="checkbox"
            checked={harmOnly}
            onChange={(e) => {
              setHarmOnly(e.target.checked);
              setShown(PAGE);
            }}
          />
          Only homes with a citation at G or above
        </label>
      </div>
      <p className="text-[0.875rem] text-ink-muted" aria-live="polite">
        {matches.length.toLocaleString("en-US")} of {facilities.length.toLocaleString("en-US")} homes
      </p>
      <ul className="space-y-4" data-testid="facility-list">
        {matches.slice(0, shown).map((f) => (
          <li key={f.ccn} className="rounded-lg border border-rule bg-panel p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="font-journal text-lg font-semibold leading-snug text-ink">{f.name}</h3>
              <a href={careCompareUrl(f.ccn, state)} className={`${LINK} text-[0.8125rem]`} rel="noopener">
                Medicare Care Compare
              </a>
            </div>
            <p className="text-[0.8125rem] text-ink-muted">
              {f.city}, {state} {f.zip} · CCN {f.ccn}
            </p>
            <ul className="mt-3 space-y-2.5">
              {f.citations.map(([date, sev, complaint, standard, ic, status, corrected, idr, iidr], i) => (
                <li key={i} className="border-l-2 border-rule-strong pl-3 text-[0.875rem] leading-relaxed text-ink-muted">
                  <p className="text-ink">
                    Cited for an infection-control deficiency on <strong>{longDate(date)}</strong>
                  </p>
                  <p>
                    <span className={`font-mono font-semibold ${isHarm(sev) ? "text-death" : "text-ink"}`}>{sev}</span>: {severityWords(sev)}
                  </p>
                  <p>
                    {surveyKind(complaint, standard, ic)} · {STATUS_LABEL[status]}
                    {corrected ? `, ${longDate(corrected)}` : ""}
                    {idr && " · Under informal dispute resolution"}
                    {iidr && " · Under independent dispute resolution"}
                  </p>
                  <p className="text-[0.75rem] text-ink-faint">
                    From the CMS release published {longDate(released)} (processed {longDate(release)})
                  </p>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {matches.length > shown && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="rounded-md border border-rule-strong px-4 py-2 text-[0.9375rem] font-medium text-ink hover:bg-sunk"
        >
          Show {Math.min(PAGE, matches.length - shown)} more
        </button>
      )}
    </div>
  );
}
