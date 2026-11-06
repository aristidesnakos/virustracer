import { test, expect } from "@playwright/test";

test.describe("nursing-home pages", () => {
  test("hub links both datasets and is linked from the home page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /homes cited for infection-control deficiencies/i }).click();
    await expect(page).toHaveURL(/\/nursing-homes\/infection-control$/);
    await page.goto("/nursing-homes");
    await expect(page.getByRole("heading", { level: 1, name: "Nursing homes" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Rates and counts by state/ })).toHaveAttribute("href", "/nursing-homes/respiratory");
  });

  test("respiratory page states how fresh each source is and switches measure", async ({ page }) => {
    await page.goto("/nursing-homes/respiratory");
    const fresh = page.getByTestId("freshness");
    await expect(fresh).toContainText("Rates run to the week ending");
    await expect(fresh).toContainText("Counts");
    const hosp = page.getByRole("button", { name: "Hospitalisations" });
    // The chart is a client component; retry the click until it has hydrated.
    await expect(async () => {
      await hosp.click();
      await expect(hosp).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
    }).toPass();
    await expect(page.getByText("Hospitalisations per 100,000 residents, United States, weekly")).toBeVisible();
  });

  test("a state page lists cited homes with survey dates and filters by search", async ({ page }) => {
    await page.goto("/nursing-homes/infection-control/vt");
    await expect(page.getByTestId("release")).toContainText("CMS release");
    const list = page.getByTestId("facility-list");
    await expect(list.locator("> li").first()).toContainText("Cited for an infection-control deficiency on");
    await expect(page.locator("main")).not.toContainText(/outbreak|infected/i);
    const total = await list.locator("> li").count();
    await page.getByLabel("Search by home, city, ZIP or CCN").fill("zzzz-no-such-home");
    await expect(list.locator("> li")).toHaveCount(0);
    await page.getByLabel("Search by home, city, ZIP or CCN").fill("");
    await expect(list.locator("> li")).toHaveCount(total);
  });
});
