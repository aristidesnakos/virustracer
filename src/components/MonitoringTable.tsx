"use client";

import { Fragment, useState } from "react";
import { monitoringData } from "@/data/outbreak";
import type { CandidateSignal } from "@/lib/candidates-data";

const fmt = (n: number) => n.toLocaleString("en-US");

function cfr(deaths: number, confirmed: number): string | null {
  return confirmed > 0 ? `${((deaths / confirmed) * 100).toFixed(1)}%` : null;
}

function statusClasses(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("epicentre")) return "text-red-400 bg-red-400/10";
  if (s.includes("high fatality") || s.includes("spreading") || s.includes("newest"))
    return "text-orange-400 bg-orange-400/10";
  if (s.includes("recovered") || s.includes("declared over"))
    return "text-green-400 bg-green-400/10";
  if (s.includes("no new cases")) return "text-blue-400 bg-blue-400/10";
  return "text-gray-400 bg-gray-400/10";
}

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${statusClasses(status)}`}
    >
      {status}
    </span>
  );
}

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

export default function MonitoringTable({
  candidates = [],
}: {
  candidates?: CandidateSignal[];
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
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-white/90 uppercase tracking-wider">
          By Country &amp; Province
        </h2>
        <span className="text-xs text-gray-500">WHO · INSP DRC · Regional health authorities</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-gray-950 z-10">
            <tr className="text-gray-500 border-b border-white/10">
              <th className="text-left py-2 pr-3 font-medium">Region</th>
              <th className="text-right py-2 px-2 font-medium">Confirmed</th>
              <th className="text-right py-2 px-2 font-medium">Deaths</th>
              <th className="text-right py-2 px-2 font-medium">CFR</th>
              <th className="text-left py-2 pl-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {monitoringData.map((row) => {
              const isProvince = Boolean(row.parentIso);
              const rowCfr = cfr(row.deaths, row.confirmed);
              return (
                <Fragment key={row.iso}>
                  <tr
                    data-testid={`row-${row.iso}`}
                    data-province={isProvince ? "true" : undefined}
                    className={`border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition-colors ${
                      isProvince ? "text-[11px] opacity-75" : ""
                    }`}
                    onClick={() => setExpanded(expanded === row.iso ? null : row.iso)}
                  >
                    <td
                      className={`py-2.5 pr-3 font-medium text-white/85 ${isProvince ? "pl-5" : ""}`}
                    >
                      {isProvince ? (
                        <span className="mr-1.5 text-gray-500" aria-hidden>
                          ↳
                        </span>
                      ) : (
                        <span className="mr-1.5">{row.flag}</span>
                      )}
                      {row.country}
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums">
                      {row.confirmed > 0 ? (
                        <span className="text-orange-400 font-semibold">{fmt(row.confirmed)}</span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums">
                      {row.deaths > 0 ? (
                        <span className="text-red-400 font-semibold">{fmt(row.deaths)}</span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-gray-300">
                      {rowCfr ?? <span className="text-gray-600">—</span>}
                    </td>
                    <td className="py-2.5 pl-3">
                      <StatusChip status={row.status} />
                    </td>
                  </tr>
                  {expanded === row.iso && (
                    <tr className="border-b border-white/5 bg-white/[0.02]">
                      <td colSpan={5} className="px-3 py-3">
                        <p className="text-gray-300 leading-relaxed mb-2">{row.detail}</p>
                        <div className="flex items-center gap-4 text-gray-500 italic">
                          <span>Source: {row.source}</span>
                          <span>·</span>
                          <span>As of {new Date(row.asOf).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}

            {unconfirmed.length > 0 && (
              <Fragment>
                <tr className="bg-gray-950">
                  <td
                    colSpan={5}
                    className="pt-4 pb-1.5 text-[10px] uppercase tracking-wider text-gray-500 font-medium"
                  >
                    Unconfirmed · extracted from news feed
                  </td>
                </tr>
                {unconfirmed.map((c) => {
                  const key = `cand-${c.iso}`;
                  const isOpen = expanded === key;
                  return (
                    <Fragment key={key}>
                      <tr
                        className="border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition-colors"
                        onClick={() => setExpanded(isOpen ? null : key)}
                      >
                        <td className="py-2.5 pr-3 font-medium text-white/65">
                          <span className="mr-1.5">{c.flag}</span>
                          {c.country}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums">
                          {c.casesMentioned ? (
                            <span className="text-gray-400 italic">
                              ~{fmt(c.casesMentioned)}
                            </span>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums">
                          {c.deathsMentioned ? (
                            <span className="text-gray-400 italic">
                              ~{fmt(c.deathsMentioned)}
                            </span>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums">
                          <span className="text-gray-600">—</span>
                        </td>
                        <td className="py-2.5 pl-3">
                          <span className="inline-block rounded px-2 py-0.5 text-xs font-medium text-gray-400 bg-gray-400/10 border border-gray-400/20">
                            Unverified
                          </span>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr
                          className="border-b border-white/5 bg-white/[0.02]"
                        >
                          <td colSpan={5} className="px-3 py-3">
                            <p className="text-gray-300 leading-relaxed mb-2">
                              {c.context}
                            </p>
                            <div className="flex items-center gap-3 text-gray-500 italic flex-wrap">
                              <a
                                href={c.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400/70 hover:text-blue-400 not-italic transition-colors"
                              >
                                {c.sourceName} →
                              </a>
                              <span>·</span>
                              <span>
                                {new Date(c.date).toLocaleDateString("en-GB", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </span>
                              <span>·</span>
                              <span className="text-gray-600">
                                Auto-extracted from news — not officially confirmed
                              </span>
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
            <tr className="border-t border-white/10 bg-gray-950">
              <td className="py-2.5 pr-3 font-semibold text-white/70 text-xs">Total</td>
              <td className="py-2.5 px-2 text-right tabular-nums font-semibold text-orange-400">
                {fmt(totalConfirmed)}
              </td>
              <td className="py-2.5 px-2 text-right tabular-nums font-semibold text-red-400">
                {fmt(totalDeaths)}
              </td>
              <td className="py-2.5 px-2 text-right tabular-nums font-semibold text-gray-300">
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
