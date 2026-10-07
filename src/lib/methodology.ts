// Values the /methodology page quotes from the data scripts. The scripts are
// .mjs and stay out of the app bundle, so the numbers are repeated here;
// tests/methodology.test.ts fails if they drift from scripts/lib/toll.mjs.

export const SANITY_CHECKS = {
  /** A new reading may not raise confirmed or deaths by more than this... */
  maxJumpPct: 25,
  /** ...unless the previous reading is older than this many days. */
  stalePrevDays: 7,
  /** The same for a weekly report (WEEKLY_STALE_PREV_DAYS). */
  weeklyStalePrevDays: 3,
} as const;

/** The scheduled data run, in UTC (.github/workflows/update-data.yml). */
export const UPDATE_TIMES_UTC = ["08:00", "20:00"] as const;

export const REPO_URL = "https://github.com/aristidesnakos/virustracer";
export const CORRECTIONS_URL = `${REPO_URL}/issues`;
