import { defineConfig, devices } from "@playwright/test";

// Next 16 enforces a project-singleton lock on `next dev`, so we can't spin up
// a parallel server on a different port. Point Playwright at whatever port the
// existing dev server is using (default 3000; override with PLAYWRIGHT_PORT).
const PORT = process.env.PLAYWRIGHT_PORT ?? "3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
