// Shared by scripts/update-toll.mjs (daily snapshot) and scripts/backfill-toll.mjs
// (one-off history import), so both always read the same Wikipedia article.

// To track a different outbreak, change this to the exact title of the English
// Wikipedia article whose lead section contains an `{{Infobox outbreak}}` with
// confirmed_cases / deaths fields (e.g. "2018–2020_Kivu_Ebola_epidemic").
// Redirects are followed automatically.
export const PAGE_TITLE = "2026_Ebola_epidemic";

export const USER_AGENT =
  "virustracer/1.0 (https://github.com/aristidesnakos/virustracer; death-toll tracker)";

export const SNAPSHOT_SOURCE = "Wikipedia infobox (cites INSP DRC / WHO)";
