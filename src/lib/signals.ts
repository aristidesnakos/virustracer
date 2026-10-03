import { readFileSync, existsSync } from "fs";
import { outbreakDataPath } from "./outbreak-data";
import type { MonitoringEntry } from "@/data/outbreaks";
import { daysBetween } from "./outbreak-trend";

// Server-side only (reads the filesystem), except `classifySignals`, which is pure.

/** One row per country, written by scripts/fetch-feeds.mjs (never pruned). */
export interface LedgerSignal {
  iso: string;
  country: string;
  flag: string;
  firstSeen: string;
  lastSeen: string;
  firstSourceTitle: string;
  firstSourceUrl: string;
  firstSourceName: string;
  mentions: number;
  maxCasesMentioned: number | null;
  maxDeathsMentioned: number | null;
}

export interface SignalsLedger {
  lastUpdated: string;
  signals: LedgerSignal[];
}

export type SignalStatus = "unverified" | "confirmed";

export interface ClassifiedSignal extends LedgerSignal {
  status: SignalStatus;
  /** Official first-confirmation date, when the curated table states one. */
  confirmedOn: string | null;
  /**
   * Days the news led the official confirmation. Null until both dates are known;
   * negative if the news came after the confirmation.
   */
  leadDays: number | null;
}

export function getSignalsLedger(slug: string): SignalsLedger {
  const path = outbreakDataPath(slug, "signals");
  if (!existsSync(path)) return { lastUpdated: "", signals: [] };
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as Partial<SignalsLedger>;
    return {
      lastUpdated: typeof raw.lastUpdated === "string" ? raw.lastUpdated : "",
      signals: Array.isArray(raw.signals) ? raw.signals : [],
    };
  } catch {
    return { lastUpdated: "", signals: [] };
  }
}

/**
 * Join the ledger with the curated country table. A signal counts as confirmed
 * once the table lists that country with at least one confirmed case; the lead
 * time needs the curated `firstConfirmed` date as well.
 */
export function classifySignals(
  signals: readonly LedgerSignal[],
  table: readonly MonitoringEntry[],
): ClassifiedSignal[] {
  return signals.map((s) => {
    const row = table.find((e) => e.iso === s.iso && !e.parentIso);
    const confirmed = !!row && row.confirmed > 0;
    const confirmedOn = confirmed ? (row?.firstConfirmed ?? null) : null;
    return {
      ...s,
      status: confirmed ? "confirmed" : "unverified",
      confirmedOn,
      leadDays: confirmedOn ? daysBetween(s.firstSeen, confirmedOn) : null,
    };
  });
}
