"use client";

import { useState } from "react";
import { monitoringData } from "@/data/outbreak";
import type { CandidateSignal } from "@/lib/candidates-data";

const STATUS_COLORS: Record<string, string> = {
  "Active monitoring": "text-yellow-400 bg-yellow-400/10",
  "All contacts negative": "text-green-400 bg-green-400/10",
  "1 symptomatic": "text-orange-400 bg-orange-400/10",
  "1 confirmed case": "text-red-400 bg-red-400/10",
  "Origin / crew monitoring": "text-blue-400 bg-blue-400/10",
  "1 death confirmed": "text-red-500 bg-red-500/10",
};

function StatusChip({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? "text-gray-400 bg-gray-400/10";
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
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

  const curatedIsos = new Set(monitoringData.map((r) => r.iso));
  const unconfirmed = dedupeCandidates(candidates, curatedIsos);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-white/90 uppercase tracking-wider">
          Monitoring by Country
        </h2>
        <span className="text-xs text-gray-500">CDC · WHO · Regional health authorities</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-gray-950 z-10">
            <tr className="text-gray-500 border-b border-white/10">
              <th className="text-left py-2 pr-3 font-medium">Country</th>
              <th className="text-right py-2 px-2 font-medium">Confirmed</th>
              <th className="text-right py-2 px-2 font-medium">Deaths</th>
              <th className="text-right py-2 px-2 font-medium">Monitored</th>
              <th className="text-left py-2 pl-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {monitoringData.map((row) => (
              <>
                <tr
                  key={row.iso}
                  className="border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition-colors"
                  onClick={() => setExpanded(expanded === row.iso ? null : row.iso)}
                >
                  <td className="py-2.5 pr-3 font-medium text-white/85">
                    <span className="mr-1.5">{row.flag}</span>
                    {row.country}
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums">
                    {row.confirmed > 0 ? (
                      <span className="text-orange-400 font-semibold">{row.confirmed}</span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums">
                    {row.deaths > 0 ? (
                      <span className="text-red-400 font-semibold">{row.deaths}</span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums text-yellow-300/80">
                    {row.monitored > 0 ? row.monitored : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="py-2.5 pl-3">
                    <StatusChip status={row.status} />
                  </td>
                </tr>
                {expanded === row.iso && (
                  <tr key={`${row.iso}-detail`} className="border-b border-white/5 bg-white/[0.02]">
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
              </>
            ))}

            {unconfirmed.length > 0 && (
              <>
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
                    <>
                      <tr
                        key={key}
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
                              ~{c.casesMentioned}
                            </span>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums">
                          {c.deathsMentioned ? (
                            <span className="text-gray-400 italic">
                              ~{c.deathsMentioned}
                            </span>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums">
                          {c.monitoredMentioned ? (
                            <span className="text-gray-400 italic">
                              ~{c.monitoredMentioned}
                            </span>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                        <td className="py-2.5 pl-3">
                          <span className="inline-block rounded px-2 py-0.5 text-xs font-medium text-gray-400 bg-gray-400/10 border border-gray-400/20">
                            Unverified
                          </span>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr
                          key={`${key}-detail`}
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
                    </>
                  );
                })}
              </>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/10 bg-gray-950">
              <td className="py-2.5 pr-3 font-semibold text-white/70 text-xs">Total</td>
              <td className="py-2.5 px-2 text-right tabular-nums font-semibold text-orange-400">
                {monitoringData.reduce((s, r) => s + r.confirmed, 0)}
              </td>
              <td className="py-2.5 px-2 text-right tabular-nums font-semibold text-red-400">
                {monitoringData.reduce((s, r) => s + r.deaths, 0)}
              </td>
              <td className="py-2.5 px-2 text-right tabular-nums font-semibold text-yellow-300/80">
                {monitoringData.reduce((s, r) => s + r.monitored, 0)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
