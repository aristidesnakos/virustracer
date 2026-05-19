import { test, expect } from "@playwright/test";

test.describe("dashboard", () => {
  test("renders stat strip and map", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /mv hondius hantavirus tracker/i }),
    ).toBeVisible();

    // Stat strip — every tracked metric is on screen.
    const strip = page.getByTestId("stat-strip");
    await expect(strip).toBeVisible();
    for (const label of [
      "Confirmed cases",
      "Deaths",
      "Probable",
      "Under monitoring",
      "Ship status",
    ]) {
      await expect(strip.getByText(label, { exact: true })).toBeVisible();
    }

    // Delta badges are labeled for screen readers.
    await expect(
      page.getByLabel(/confirmed cases change in last 7 days/i),
    ).toBeVisible();

    // Map container mounts and the MapLibre canvas attaches.
    const mapCanvas = page.locator(".maplibregl-canvas");
    await expect(mapCanvas).toBeVisible({ timeout: 15_000 });
  });
});
