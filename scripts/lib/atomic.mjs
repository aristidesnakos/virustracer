// Atomic JSON/text writes: write a temp file in the same directory, then rename it over the
// target, so a process killed mid-write (a step timeout, say) never leaves a half-written
// data file. Unit-tested in tests/atomic.test.ts.
import { writeFileSync, renameSync, unlinkSync, readdirSync, existsSync } from "node:fs";
import { dirname, basename, join } from "node:path";

/** Hidden, ends in .tmp (git-ignored via `data/**\/*.tmp`), and carries the pid. */
export function tempPathFor(path, pid = process.pid) {
  return join(dirname(path), `.${basename(path)}.${pid}.tmp`);
}

/**
 * @param {string} path
 * @param {string} data
 * @param {{write?: typeof writeFileSync, rename?: typeof renameSync, unlink?: typeof unlinkSync}} [fs]
 */
export function writeFileAtomic(path, data, fs = {}) {
  const { write = writeFileSync, rename = renameSync, unlink = unlinkSync } = fs;
  const tmp = tempPathFor(path);
  try {
    write(tmp, data);
    rename(tmp, path);
  } catch (err) {
    try {
      unlink(tmp);
    } catch {
      // nothing to clean up
    }
    throw err;
  }
}

/** Remove temp files an earlier killed run left in `dir`. Returns the names removed. */
export function removeStaleTemps(dir) {
  if (!existsSync(dir)) return [];
  const removed = [];
  for (const name of readdirSync(dir)) {
    if (/^\..+\.\d+\.tmp$/.test(name)) {
      try {
        unlinkSync(join(dir, name));
        removed.push(name);
      } catch {
        // best effort
      }
    }
  }
  return removed;
}
