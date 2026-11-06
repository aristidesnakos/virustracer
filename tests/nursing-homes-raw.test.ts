import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { archiveGzipText, readGzipText, sha256 } from "../scripts/lib/raw.mjs";
import { csvToNhsnRows, csvToRateRows, parseNhsnRows } from "../scripts/lib/nhsn.mjs";
import { buildStateFiles, csvToCitations, validateCitationRows } from "../scripts/lib/cms-f880.mjs";

const ROOT = resolve(__dirname, "..");
const DIR = join(ROOT, "data", "nursing-homes");
const read = (p: string) => JSON.parse(readFileSync(join(DIR, p), "utf8"));

describe("archiveGzipText", () => {
  it("writes once, accepts the same text again and refuses different text under the same name", () => {
    const root = mkdtempSync(join(tmpdir(), "nh-raw-"));
    try {
      const a = archiveGzipText(root, "cms-f880", "2026-10-01", "a,b\n1,2\n");
      expect(a).toMatchObject({ ok: true, written: true, rawSha256: sha256("a,b\n1,2\n") });
      if (!a.ok) return;
      expect(a.rawPath).toMatch(/^data\/raw\/nursing-homes\/cms-f880-2026-10-01-[0-9a-f]{12}\.csv\.gz$/);
      expect(readGzipText(root, a.rawPath)).toBe("a,b\n1,2\n");
      expect(archiveGzipText(root, "cms-f880", "2026-10-01", "a,b\n1,2\n")).toMatchObject({ ok: true, written: false });
      expect(archiveGzipText(root, "Bad Prefix", "2026-10-01", "x").ok).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// Every stored figure must be re-derivable from the archived extract it came from.
describe("stored nursing-home data matches its raw archive", () => {
  it("NHSN counts", () => {
    if (!existsSync(join(DIR, "respiratory/counts.json"))) return;
    const counts = read("respiratory/counts.json");
    const csv = readGzipText(ROOT, counts.rawPath);
    expect(sha256(csv)).toBe(counts.rawSha256);
    const parsed = parseNhsnRows(csvToNhsnRows(csv));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.rows).toEqual(counts.rows);
    for (const v of counts.versions) expect(existsSync(join(ROOT, v.rawPath))).toBe(true);
  });

  it("NHSN dashboard rates", () => {
    if (!existsSync(join(DIR, "respiratory/rates.json"))) return;
    const rates = read("respiratory/rates.json");
    const csv = readGzipText(ROOT, rates.rawPath);
    expect(sha256(csv)).toBe(rates.rawSha256);
    expect(csvToRateRows(csv)).toEqual(rates.rows);
  });

  it("CMS F880 citations, every state file", () => {
    if (!existsSync(join(DIR, "infection-control/index.json"))) return;
    const index = read("infection-control/index.json");
    const latest = index.releases.at(-1);
    expect(latest.release).toBe(index.latest);
    for (const r of index.releases) expect(existsSync(join(ROOT, r.rawPath))).toBe(true);
    const csv = readGzipText(ROOT, latest.rawPath);
    expect(sha256(csv)).toBe(latest.rawSha256);
    const rows = csvToCitations(csv);
    expect(validateCitationRows(rows, { modified: latest.release, reportedCount: latest.citations }).ok).toBe(true);
    const files = buildStateFiles(rows, { release: latest.release, released: latest.released });
    const onDisk = readdirSync(join(DIR, "infection-control/states")).sort();
    expect(onDisk).toEqual(Object.keys(files).map((s) => `${s}.json`));
    for (const [st, file] of Object.entries(files)) expect(read(`infection-control/states/${st}.json`)).toEqual(file);
  });
});
