import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./apps/observatory/tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:8017", trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
  webServer: {
    command: "pnpm fixture",
    url: "http://127.0.0.1:8017/api/repository",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
