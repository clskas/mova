import { defineConfig, devices } from "@playwright/test";

const adminBaseUrl = process.env.ADMIN_BASE_URL ?? "http://localhost:3002";
const webBaseUrl = process.env.WEB_BASE_URL ?? "http://localhost:3001";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "admin",
      testMatch: [/admin-.*\.spec\.ts/, /health\.spec\.ts/],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: adminBaseUrl,
      },
    },
    {
      name: "web",
      testMatch: [/web-.*\.spec\.ts/, /health\.spec\.ts/],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: webBaseUrl,
      },
    },
  ],
});
