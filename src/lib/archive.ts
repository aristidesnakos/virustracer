import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Server-side only (reads the filesystem). Written by scripts/archive-sources.mjs.

export type ArchiveStatus = "archived" | "pending" | "failed";

export interface ArchiveEntry {
  archivedUrl: string | null;
  archivedAt: string | null;
  status: ArchiveStatus;
  attempts: number;
  lastAttempt: string | null;
  title: string;
  publishedAt: string | null;
  source: string;
  kind: string;
  /** Slug of the outbreak that first cited the URL; absent for our own pages. */
  outbreak?: string;
  resolvedUrl: string | null;
  contentHash?: string;
}

export interface ArchiveLedger {
  lastRun: string;
  entries: Record<string, ArchiveEntry>;
}

const ARCHIVE_PATH = resolve(process.cwd(), "data/archive.json");

const EMPTY = (): ArchiveLedger => ({ lastRun: "", entries: {} });

/** Reads the ledger; a missing or malformed file yields an empty one. */
export function getArchiveLedger(): ArchiveLedger {
  if (!existsSync(ARCHIVE_PATH)) return EMPTY();
  try {
    const raw = JSON.parse(readFileSync(ARCHIVE_PATH, "utf-8")) as Partial<ArchiveLedger> | null;
    if (!raw || typeof raw.entries !== "object" || raw.entries === null) return EMPTY();
    return { lastRun: typeof raw.lastRun === "string" ? raw.lastRun : "", entries: raw.entries };
  } catch {
    return EMPTY();
  }
}

/**
 * The Wayback URL for an original URL, or null if it is not (yet) archived.
 * Pass an already-loaded `ledger` when looking up many URLs.
 */
export function archivedUrlFor(
  url: string,
  ledger: ArchiveLedger = getArchiveLedger(),
): string | null {
  const entry = ledger.entries[url];
  return entry && entry.status === "archived" && entry.archivedUrl ? entry.archivedUrl : null;
}
