import { describe, it, expect } from "vitest";
import { OUTBREAKS_API_PATH, legacyApiPath, outbreakApiPath, outbreakPath } from "@/lib/outbreak-paths";

describe("outbreak paths", () => {
  it("builds page and API paths from a slug", () => {
    expect(outbreakPath("ebola-bundibugyo-2026")).toBe("/outbreaks/ebola-bundibugyo-2026");
    expect(outbreakApiPath("ebola-bundibugyo-2026", "toll")).toBe("/api/v1/outbreaks/ebola-bundibugyo-2026/toll");
    expect(OUTBREAKS_API_PATH).toBe("/api/v1/outbreaks");
  });

  it("keeps the legacy un-prefixed API paths", () => {
    expect(legacyApiPath("toll")).toBe("/api/v1/toll");
    expect(legacyApiPath("metrics")).toBe("/api/v1/metrics");
    expect(legacyApiPath("signals")).toBe("/api/v1/signals");
  });
});
