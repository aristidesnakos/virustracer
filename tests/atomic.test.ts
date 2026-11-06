import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileAtomic, removeStaleTemps, tempPathFor } from "../scripts/lib/atomic.mjs";

const dir = () => mkdtempSync(join(tmpdir(), "atomic-"));

describe("writeFileAtomic", () => {
  it("writes the file and leaves no temp file", () => {
    const d = dir();
    const p = join(d, "live.json");
    writeFileAtomic(p, '{"a":1}');
    expect(readFileSync(p, "utf8")).toBe('{"a":1}');
    expect(readdirSync(d)).toEqual(["live.json"]);
  });

  it("replaces an existing file whole", () => {
    const d = dir();
    const p = join(d, "x.json");
    writeFileSync(p, "old old old old");
    writeFileAtomic(p, "new");
    expect(readFileSync(p, "utf8")).toBe("new");
  });

  it("a failure before the rename leaves the original untouched and cleans the temp", () => {
    const d = dir();
    const p = join(d, "x.json");
    writeFileSync(p, "original");
    expect(() =>
      writeFileAtomic(p, "new", {
        write: (path: string, data: string) => {
          writeFileSync(path, data.slice(0, 1)); // half written
          throw new Error("disk full");
        },
      } as never),
    ).toThrow("disk full");
    expect(readFileSync(p, "utf8")).toBe("original");
    expect(readdirSync(d)).toEqual(["x.json"]);
  });

  it("removeStaleTemps deletes only leftover temp files", () => {
    const d = dir();
    writeFileSync(join(d, "live.json"), "{}");
    writeFileSync(tempPathFor(join(d, "live.json"), 4242), "half");
    expect(removeStaleTemps(d)).toEqual([".live.json.4242.tmp"]);
    expect(existsSync(join(d, "live.json"))).toBe(true);
    expect(readdirSync(d)).toEqual(["live.json"]);
    expect(removeStaleTemps(join(d, "missing"))).toEqual([]);
  });
});
