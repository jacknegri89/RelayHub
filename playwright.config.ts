import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  timeout: 60_000,
  use: {
    baseURL: process.env.RELAYHUB_BASE_URL ?? "http://localhost:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.CHROMIUM_PATH && {
          launchOptions: { executablePath: process.env.CHROMIUM_PATH },
        }),
      },
    },
  ],
});
