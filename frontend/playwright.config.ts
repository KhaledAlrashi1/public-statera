import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  // visual.spec.ts requires a running backend (login) and committed baseline
  // snapshots. Exclude it from the default CI run. Use `npm run test:e2e:visual`
  // locally after updating snapshots with `--update-snapshots`.
  testIgnore: process.env.CI ? ["**/visual.spec.ts"] : [],
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run build && npm run preview -- --host 127.0.0.1 --port 4173",
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
