import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:4391",
    viewport: { width: 1440, height: 1000 },
    headless: true,
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_USE_BUNDLED === "true"
          ? undefined
          : process.env.PLAYWRIGHT_CHROME ||
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node tests/e2e/server.js",
    url: "http://127.0.0.1:4391/api/health",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
