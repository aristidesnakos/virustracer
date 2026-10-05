import { readFileSync } from "node:fs";
import path from "node:path";
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

// brand/mark.svg is the source of truth for the logo. The inline BrandMark and
// the published icon.svg both copy it, so a hand edit to any one of them (or a
// forgotten `node scripts/build-brand.mjs`) should fail loudly here.
describe("brand mark", () => {
  const read = (...parts: string[]) => readFileSync(path.resolve(import.meta.dirname, "..", ...parts), "utf8");
  const source = read("brand/mark.svg");
  const component = read("src/components/BrandMark.tsx");
  const published = read("src/app/icon.svg");

  const all = (svg: string, tag: string, name: string) =>
    [...svg.matchAll(new RegExp(`<${tag}\\b[^>]*?\\s${name}="([^"]+)"`, "g"))].map((m) => m[1]);

  it("has the same shapes in the header component as in the source", () => {
    expect(all(source, "path", "d")).toHaveLength(1);
    expect(all(component, "path", "d")).toEqual(all(source, "path", "d"));
    for (const name of ["cx", "cy", "r"]) {
      expect(all(component, "circle", name)).toEqual(all(source, "circle", name));
    }
  });

  it("uses the light-page palette of the source in the header component", () => {
    const light = source.match(/\.body \{ fill: (#[0-9a-f]{6}) \}\s*\.pip \{ fill: (#[0-9a-f]{6}) \}/i);
    expect(light).toBeTruthy();
    expect(component).toContain(light![1]);
    expect(component).toContain(light![2]);
  });

  it("publishes icon.svg from the current source", () => {
    expect(all(published, "path", "d")).toEqual(all(source, "path", "d"));
    expect(all(published, "circle", "r")).toEqual(all(source, "circle", "r"));
    for (const colour of source.match(/#[0-9a-f]{6}/gi) ?? []) expect(published).toContain(colour);
  });
});
