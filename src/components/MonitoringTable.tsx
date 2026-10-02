"use client";

import { Fragment, useState } from "react";
import { monitoringData } from "@/data/outbreak";
import type { CandidateSignal } from "@/lib/candidates-data";
import PanelHeader from "@/components/PanelHeader";

const fmt = (n: number) => n.toLocaleString("en-US");

function cfr(deaths: number, confirmed: number): string | null {
  return confirmed > 0 ? `${((deaths / confirmed) * 100).toFixed(1)}%` : null;
}

function statusClasses(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("epicentre")) return "text-death bg-death-tint";
  if (s.includes("high fatality") || s.includes("spreading") || s.includes("newest"))
    return "text-suspected-text bg-suspected-tint";
  if (s.includes("recovered") || s.includes("declared over")) return "text-good bg-good-tint";
  if (s.includes("no new cases")) return "text-confirmed bg-confirmed-tint";
  return "text-ink-muted bg-sunk";
}

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-md px-2 py-0.5 text-[0.8125rem] font-semibold leading-snug ${statusClasses(status)}`}
    >
      {status}
    </span>
  );
}

const CELL = "px-2 py-3";
const ROW =
  "cursor-pointer border-b border-rule transition-colors hover:bg-sunk/70 [&:has(button[aria-expanded=true])]:bg-sunk/70";
const DETAIL_ROW = "border-b border-rule bg-sunk";

function dedupeCandidates(
  candidates: CandidateSignal[],
  curatedIsos: Set<string>,
): CandidateSignal[] {
  // Keep one entry per ISO (most recent), exclude countries already curated.
  const byIso = new Map<string, CandidateSignal>();
  const sorted = [...candidates].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  for (const c of sorted) {
    if (!c.iso || curatedIsos.has(c.iso)) continue;
    if (!byIso.has(c.iso)) byIso.set(c.iso, c);
  }
  return [...byIso.values()];
}

/**
 * The row's click handler lives on the <tr> (bigger target for pointer users);
 * this button is the keyboard/screen-reader handle. Its own click bubbles up to
 * the row, so it needs no handler of its own.
 */
function RowToggle({
  open,
  controls,
  children,
}: {
  open: boolean;
  controls: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={open ? controls : undefined}
      className="inline-flex items-center gap-1.5 text-left font-semibold text-inherit"
    >
      {children}
    </button>
  );
}

export default function MonitoringTable({
  candidates = [],
  headingId,
}: {
  candidates?: CandidateSignal[];
  headingId?: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  // Provinces contribute their parent country too, so a news candidate for "CD"
  // is not listed as unverified next to the curated DR Congo rows.
  const curatedIsos = new Set(
    monitoringData.flatMap((r) => (r.parentIso ? [r.iso, r.parentIso] : [r.iso])),
  );
  const countryRows = monitoringData.filter((r) => !r.parentIso);
  const totalConfirmed = countryRows.reduce((sum, r) => sum + r.confirmed, 0);
  const totalDeaths = countryRows.reduce((sum, r) => sum + r.deaths, 0);
  const unconfirmed = dedupeCandidates(candidates, curatedIsos);

  return (
    <div className="flex flex-col">
      <PanelHeader
        kicker="Table 1"
        id={headingId}
        title={<>By country &amp; province</>}
        aside={
          <span className="text-[0.8125rem] text-ink-faint">
            WHO · INSP DRC · Regional health authorities
          </span>
        }
      />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-[0.9375rem]">
          <caption className="sr-only">
            Confirmed cases, deaths and case fatality by country and province. Select a region to
            read its details.
          </caption>
          <thead>
            <tr className="border-b-2 border-ink bg-sunk text-[0.8125rem] uppercase tracking-[0.06em] text-ink-muted">
              <th scope="col" className="py-2.5 pl-3 pr-3 text-left font-semibold">
                Region
              </th>
              <th scope="col" className="px-2 py-2.5 text-right font-semibold">
                Confirmed
              </th>
              <th scope="col" className="px-2 py-2.5 text-right font-semibold">
                Deaths
              </th>
              <th scope="col" className="px-2 py-2.5 text-right font-semibold">
                CFR
              </th>
              <th scope="col" className="py-2.5 pl-3 pr-3 text-left font-semibold">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {monitoringData.map((row) => {
              const isProvince = Boolean(row.parentIso);
              const rowCfr = cfr(row.deaths, row.confirmed);
              const isOpen = expanded === row.iso;
              const detailId = `detail-${row.iso}`;
              return (
                <Fragment key={row.iso}>
                  <tr
                    data-testid={`row-${row.iso}`}
                    data-province={isProvince ? "true" : undefined}
                    className={`${ROW} ${isProvince ? "text-[0.875rem] text-ink-muted" : "text-ink"}`}
                    onClick={() => setExpanded(isOpen ? null : row.iso)}
                  >
                    <td className={`${CELL} pr-3 ${isProvince ? "pl-7" : "pl-3"}`}>
                      <RowToggle open={isOpen} controls={detailId}>
                        {isProvince ? (
                          <span className="text-ink-faint" aria-hidden>
                            ↳
                          </span>
                        ) : (
                          <span aria-hidden>{row.flag}</span>
                        )}
                        {row.country}
                      </RowToggle>
                    </td>
                    <td className={`${CELL} text-right tabular-nums`}>
                      {row.confirmed > 0 ? (
                        <span className="font-semibold text-confirmed">{fmt(row.confirmed)}</span>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </td>
                    <td className={`${CELL} text-right tabular-nums`}>
                      {row.deaths > 0 ? (
                        <span className="font-semibold text-death">{fmt(row.deaths)}</span>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </td>
                    <td className={`${CELL} text-right tabular-nums text-ink-muted`}>
                      {rowCfr ?? <span className="text-ink-faint">—</span>}
                    </td>
                    <td className={`${CELL} pl-3 pr-3`}>
                      <StatusChip status={row.status} />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr id={detailId} className={DETAIL_ROW}>
                      <td colSpan={5} className="px-3 py-4">
                        <p className="mb-2 max-w-[65ch] leading-relaxed text-ink">{row.detail}</p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem] text-ink-muted">
                          <span>Source: {row.source}</span>
                          <span aria-hidden>·</span>
                          <span>
                            As of{" "}
                            {new Date(row.asOf).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}

            {unconfirmed.length > 0 && (
              <Fragment>
                <tr>
                  <td
                    colSpan={5}
                    className="pb-2 pl-3 pt-6 text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-ink-muted"
                  >
                    Unconfirmed · extracted from news feed
                  </td>
                </tr>
                {unconfirmed.map((c) => {
                  const key = `cand-${c.iso}`;
                  const isOpen = expanded === key;
                  const detailId = `detail-${key}`;
                  return (
                    <Fragment key={key}>
                      <tr className={`${ROW} text-ink-muted`} onClick={() => setExpanded(isOpen ? null : key)}>
                        <td className={`${CELL} pl-3 pr-3`}>
                          <RowToggle open={isOpen} controls={detailId}>
                            <span aria-hidden>{c.flag}</span>
                            {c.country}
                          </RowToggle>
                        </td>
                        <td className={`${CELL} text-right tabular-nums`}>
                          {c.casesMentioned ? (
                            <span className="italic">~{fmt(c.casesMentioned)}</span>
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </td>
                        <td className={`${CELL} text-right tabular-nums`}>
                          {c.deathsMentioned ? (
                            <span className="italic">~{fmt(c.deathsMentioned)}</span>
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </td>
                        <td className={`${CELL} text-right tabular-nums`}>
                          <span className="text-ink-faint">—</span>
                        </td>
                        <td className={`${CELL} pl-3 pr-3`}>
                          <span className="inline-block rounded-md border border-rule-strong bg-sunk px-2 py-0.5 text-[0.8125rem] font-semibold leading-snug text-ink-muted">
                            Unverified
                          </span>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr id={detailId} className={DETAIL_ROW}>
                          <td colSpan={5} className="px-3 py-4">
                            <p className="mb-2 max-w-[65ch] leading-relaxed text-ink">{c.context}</p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-ink-muted">
                              <a
                                href={c.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-accent underline underline-offset-4"
                              >
                                {c.sourceName} →
                                <span className="sr-only"> (opens in a new tab)</span>
                              </a>
                              <span aria-hidden>·</span>
                              <span>
                                {new Date(c.date).toLocaleDateString("en-GB", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </span>
                              <span aria-hidden>·</span>
                              <span>Auto-extracted from news — not officially confirmed</span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </Fragment>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink">
              <td className="py-3 pl-3 pr-3 font-journal text-base font-bold text-ink">Total</td>
              <td className="px-2 py-3 text-right font-journal text-base font-bold tabular-nums text-confirmed">
                {fmt(totalConfirmed)}
              </td>
              <td className="px-2 py-3 text-right font-journal text-base font-bold tabular-nums text-death">
                {fmt(totalDeaths)}
              </td>
              <td className="px-2 py-3 text-right font-journal text-base font-bold tabular-nums text-ink-muted">
                {cfr(totalDeaths, totalConfirmed) ?? "—"}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
