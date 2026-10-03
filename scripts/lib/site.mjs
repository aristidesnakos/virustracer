// Site-level constants shared by the scripts (outbreak-specific settings live in
// scripts/lib/outbreak-registry.mjs). Plain `.mjs` so the scripts run on bare `node`.

// The permanent public home of the site. Keep in step with PRODUCTION_SITE_URL in
// src/lib/site.ts (tests/seo.test.ts checks they match).
export const SITE_URL = "https://outbreakfiles.com";

// Our own pages the archiver re-captures weekly, so the Internet Archive holds a
// history of what the site said, not just of what it cites.
export const SITE_PAGES = ["/", "/data", "/api/v1/toll"];
