import { defineConfig, devices } from "@playwright/test";

// Runs against the dev server that is already up (seeded DB): serial, generous timeouts, one retry.
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  retries: 1,
  timeout: 3 * 60_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.EVRA_URL ?? "http://localhost:3000",
    navigationTimeout: 60_000,
    actionTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" }, testMatch: /(auth-onboarding|accessibility)\.spec\.ts/ },
  ],
});
