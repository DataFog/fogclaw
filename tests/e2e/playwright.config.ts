import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  timeout: 120_000,
  retries: 0,
  workers: 1, // Sequential — tests share session state
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    browserName: "chromium",
    video: "on",
    screenshot: "on",
    trace: "on-first-retry",
  },
  outputDir: "./test-results",
});
