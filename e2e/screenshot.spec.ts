import { test } from "@playwright/test";

test("capture dashboard screenshots", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.waitForSelector(".maplibregl-canvas", { timeout: 15_000 });
  // give map a moment to finish loading sources
  await page.waitForTimeout(2000);

  await page.screenshot({
    path: "test-results/screenshots/dashboard-1440.png",
    fullPage: false,
  });

  // Zoom into the strip
  const strip = page.getByTestId("stat-strip");
  await strip.screenshot({ path: "test-results/screenshots/strip.png" });

  // Zoom into the map by clipping to its bounding box rather than selecting
  // the canvas (MapLibre's canvas-container has zero layout size).
  const mapHost = page.locator(".maplibregl-map").first();
  const box = await mapHost.boundingBox();
  if (box) {
    await page.screenshot({
      path: "test-results/screenshots/map.png",
      clip: box,
    });
  }

  if (errors.length > 0) {
    console.log("\n=== Browser errors ===");
    for (const e of errors) console.log(e);
  }
});
