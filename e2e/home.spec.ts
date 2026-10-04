import { test, expect } from "@playwright/test";

test.describe("home", () => {
  test("lists the Ebola outbreak and links to its dashboard", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1, name: "Outbreak Files" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Outbreaks we are tracking" }),
    ).toBeVisible();

    const card = page.getByRole("article").filter({ hasText: /ebola outbreak 2026/i });
    await expect(card).toBeVisible();
    await expect(card.getByText("Deaths", { exact: true })).toBeVisible();
    await expect(card.getByTestId("trend-statement")).toBeVisible();
    await expect(page.getByRole("link", { name: "How we rank and count" })).toHaveAttribute(
      "href",
      "/methodology#ranking",
    );

    await card.getByRole("link", { name: /ebola outbreak 2026/i }).first().click();
    await expect(page).toHaveURL(/\/outbreaks\/ebola-bundibugyo-2026$/);
    await expect(page.getByTestId("stat-strip")).toBeVisible();
  });

  test("methodology and about pages are linked from the footer", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Site" });
    await nav.getByRole("link", { name: "Methodology" }).click();
    await expect(page.getByRole("heading", { name: "How the home page orders outbreaks" })).toBeVisible();
    await page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "About" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "About Outbreak Files" })).toBeVisible();
  });

  test("unknown outbreak is a 404", async ({ page }) => {
    const res = await page.goto("/outbreaks/not-a-real-outbreak");
    expect(res?.status()).toBe(404);
  });
});
