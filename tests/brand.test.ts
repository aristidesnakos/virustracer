import { describe, it, expect } from "vitest";
import { listOutbreaks } from "@/data/outbreaks";
import { API_ATTRIBUTION } from "@/lib/api";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// The site holds several outbreaks, so its name must never collapse back into
// one outbreak's title (H1, share card) or vice versa.
describe("site brand", () => {
  it("names the site, not an outbreak", () => {
    expect(SITE_NAME).toBe("Outbreak Files");
    for (const o of listOutbreaks()) {
      expect(o.title, o.slug).not.toBe(SITE_NAME);
      expect(o.seoTitle, o.slug).not.toBe(SITE_NAME);
    }
  });

  it("credits the site and keeps the CC BY-SA attribution in API responses", () => {
    expect(API_ATTRIBUTION.startsWith(`${SITE_NAME} (${new URL(SITE_URL).host}, unofficial).`)).toBe(true);
    expect(API_ATTRIBUTION).toContain("Wikipedia");
    expect(API_ATTRIBUTION).toContain("CC BY-SA 4.0");
  });
});
