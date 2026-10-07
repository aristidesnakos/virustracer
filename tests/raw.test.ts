import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { getOutbreak as getScriptOutbreak } from "../scripts/lib/outbreak-registry.mjs";
import {
  archiveInfobox,
  backfillRawForStore,
  rawRelPath,
  sha256,
  verifyRaw,
  verifyReportRaw,
} from "../scripts/lib/raw.mjs";
import { reportRawRelPath } from "../scripts/lib/eody.mjs";

const BLOCK = `{{Infobox outbreak
| name            = 2026 Ebola epidemic
| confirmed_cases = 8,245<ref name = "INSP-DRC" />
| suspected_cases = 347
| recovery_cases  = 2,140
| deaths          = 3,984 <!-- updated daily -->
}}`;
const LEAD = `{{Short description|Ebola epidemic}}\n${BLOCK}\n'''Ebola''' is a disease.`;
const NUMBERS = { confirmed: 8245, suspected: 347, deaths: 3984, recovered: 2140 };

type Snap = {
  date: string;
  confirmed: number;
  suspected: number | null;
  deaths: number;
  recovered: number | null;
  revid?: number;
  rawPath?: string;
  rawSha256?: string;
};
const snap = (over: Partial<Snap> = {}): Snap => ({ date: "2026-10-02", ...NUMBERS, revid: 1001, ...over });

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "raw-test-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("rawRelPath", () => {
  it("is keyed by revid", () => {
    expect(rawRelPath(1377979097)).toBe("data/raw/infobox/1377979097.txt");
  });
  it("rejects anything that is not a positive integer (no path tricks)", () => {
    for (const bad of [0, -1, 1.5, NaN, "../x" as unknown as number]) {
      expect(() => rawRelPath(bad)).toThrow();
    }
  });
});

describe("verifyRaw", () => {
  it("accepts raw text that re-parses to the snapshot's numbers", () => {
    expect(verifyRaw(snap(), BLOCK)).toEqual({ ok: true });
  });
  it("checks the stored checksum when the snapshot has one", () => {
    expect(verifyRaw(snap({ rawSha256: sha256(BLOCK) }), BLOCK).ok).toBe(true);
    const r = verifyRaw(snap({ rawSha256: sha256(BLOCK + " ") }), BLOCK);
    expect(r).toMatchObject({ ok: false });
  });
  it("rejects a number mismatch and names the field", () => {
    const r = verifyRaw(snap({ deaths: 3000 }), BLOCK);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/deaths/);
  });
  it("treats null and a blank optional field as equal", () => {
    const block = `{{Infobox outbreak\n| confirmed_cases = 10\n| suspected_cases =\n| deaths = 3\n}}`;
    expect(verifyRaw({ confirmed: 10, suspected: null, deaths: 3, recovered: null }, block).ok).toBe(true);
  });
  it("rejects text with no infobox", () => {
    expect(verifyRaw(snap(), "nothing here").ok).toBe(false);
  });
});

describe("archiveInfobox", () => {
  it("writes exactly the infobox block (not the whole lead) and returns its hash", () => {
    const res = archiveInfobox(root, 1001, LEAD);
    expect(res).toEqual({
      ok: true,
      rawPath: "data/raw/infobox/1001.txt",
      rawSha256: sha256(BLOCK),
      written: true,
    });
    expect(readFileSync(join(root, "data/raw/infobox/1001.txt"), "utf8")).toBe(BLOCK);
  });

  it("is idempotent: a second write of the same revision changes nothing", () => {
    archiveInfobox(root, 1001, LEAD);
    const file = join(root, "data/raw/infobox/1001.txt");
    const before = readFileSync(file, "utf8");
    const again = archiveInfobox(root, 1001, LEAD);
    expect(again).toMatchObject({ ok: true, written: false, rawSha256: sha256(BLOCK) });
    expect(readFileSync(file, "utf8")).toBe(before);
    expect(readdirSync(join(root, "data/raw/infobox"))).toEqual(["1001.txt"]);
  });

  it("never overwrites an existing file whose content differs", () => {
    const dir = join(root, "data/raw/infobox");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "1001.txt"), "original");
    const res = archiveInfobox(root, 1001, LEAD);
    expect(res.ok).toBe(false);
    expect(readFileSync(join(dir, "1001.txt"), "utf8")).toBe("original");
  });

  it("refuses when there is no infobox and writes nothing", () => {
    expect(archiveInfobox(root, 1001, "plain text").ok).toBe(false);
    expect(existsSync(join(root, "data"))).toBe(false);
  });

  it("stored file round-trips through verifyRaw (re-parse proves the snapshot)", () => {
    const res = archiveInfobox(root, 1001, LEAD);
    if (!res.ok) throw new Error("archive failed");
    const text = readFileSync(join(root, res.rawPath), "utf8");
    expect(verifyRaw(snap({ rawPath: res.rawPath, rawSha256: res.rawSha256 }), text)).toEqual({ ok: true });
  });
});

describe("backfillRawForStore", () => {
  const leads: Record<number, string> = { 1001: LEAD };
  const fetchLead = async (revid: number) => leads[revid] ?? null;
  const baseOpts = () => ({ repoRoot: root, fetchLead });

  it("dry-run verifies but writes no files and leaves the store unchanged", async () => {
    const store = { lastChecked: "x", snapshots: [snap()] };
    const logs: string[] = [];
    const { store: out, stats } = await backfillRawForStore(store, { ...baseOpts(), dryRun: true, log: (m) => logs.push(m) });
    expect(stats.wouldArchive).toBe(1);
    expect(out).toEqual(store);
    expect(existsSync(join(root, "data"))).toBe(false);
    expect(logs.join("\n")).toMatch(/would store data\/raw\/infobox\/1001\.txt/);
  });

  it("stores the raw file and adds only rawPath/rawSha256 when numbers match", async () => {
    const original = snap();
    const { store: out, stats } = await backfillRawForStore({ lastChecked: "x", snapshots: [original] }, baseOpts());
    expect(stats.archived).toBe(1);
    expect(out.snapshots[0]).toEqual({
      ...original,
      rawPath: "data/raw/infobox/1001.txt",
      rawSha256: sha256(BLOCK),
    });
    expect(readFileSync(resolve(root, "data/raw/infobox/1001.txt"), "utf8")).toBe(BLOCK);
  });

  it("skips and never overwrites numbers on a mismatch", async () => {
    const original = snap({ deaths: 3900 });
    const logs: string[] = [];
    const { store: out, stats } = await backfillRawForStore(
      { lastChecked: "x", snapshots: [original] },
      { ...baseOpts(), log: (m) => logs.push(m) },
    );
    expect(stats.mismatch).toBe(1);
    expect(out.snapshots[0]).toEqual(original);
    expect(existsSync(join(root, "data"))).toBe(false);
    expect(logs.join("\n")).toMatch(/MISMATCH/);
  });

  it("skips snapshots that already have rawPath, lack a revid, fail to fetch or have no infobox", async () => {
    const have = snap({ revid: 1, rawPath: "data/raw/infobox/1.txt", rawSha256: "h" });
    const noRev = snap({ date: "2026-10-03", revid: undefined });
    const missing = snap({ date: "2026-10-04", revid: 2 }); // fetchLead -> null
    const boom = snap({ date: "2026-10-05", revid: 3 });
    const calls: number[] = [];
    const { store: out, stats } = await backfillRawForStore(
      { lastChecked: "x", snapshots: [have, noRev, missing, boom] },
      {
        repoRoot: root,
        fetchLead: async (revid) => {
          calls.push(revid);
          if (revid === 3) throw new Error("HTTP 500");
          return null;
        },
      },
    );
    expect(stats).toMatchObject({ alreadyHave: 1, noRevid: 1, noInfobox: 1, fetchFailed: 1, archived: 0 });
    expect(calls).toEqual([2, 3]); // no request for the ones that needed none
    expect(out.snapshots).toEqual([have, noRev, missing, boom]);
  });

  it("pauses between requests but not before the first", async () => {
    leads[1002] = LEAD;
    const sleeps: number[] = [];
    await backfillRawForStore(
      { lastChecked: "", snapshots: [snap(), snap({ date: "2026-10-03", revid: 1002 })] },
      { ...baseOpts(), dryRun: true, delayMs: 250, sleep: async (ms) => void sleeps.push(ms) },
    );
    expect(sleeps).toEqual([250]);
  });
});

describe("archived files in data/outbreaks/<slug>/toll.json", () => {
  it("every snapshot with rawPath has a file that re-parses to its numbers and matches its checksum", () => {
    const repo = resolve(__dirname, "..");
    const outbreaks = join(repo, "data", "outbreaks");
    for (const slug of readdirSync(outbreaks)) {
      const tollJson = join(outbreaks, slug, "toll.json");
      if (!existsSync(tollJson)) continue;
      const store = JSON.parse(readFileSync(tollJson, "utf8"));
      for (const s of store.snapshots) {
        if (!s.rawPath) continue; // older readings are filled in by scripts/backfill-raw.mjs
        const text = readFileSync(join(repo, s.rawPath), "utf8");
        const toll = getScriptOutbreak(slug)?.toll;
        if (toll?.adapter === "eody-report") {
          // An official report's text, named by source, date and checksum.
          expect(s.rawPath).toBe(reportRawRelPath(toll.rawPrefix, s.date, sha256(text)));
          expect({ slug, date: s.date, ...verifyReportRaw(s, text) }).toEqual({ slug, date: s.date, ok: true });
          continue;
        }
        expect(s.rawPath).toBe(rawRelPath(s.revid));
        expect({ slug, date: s.date, ...verifyRaw(s, text, toll?.ignoreFields) }).toEqual({ slug, date: s.date, ok: true });
      }
    }
  });
});
