import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Module 10f: mock ioredis for the hermetic unit suite so no test dials a
    // real Redis (which otherwise hangs to the 5s timeout). Skipped under
    // INTEGRATION=true, where worker.integration.test.ts needs a real BullMQ
    // connection. See src/test/redis-mock.setup.ts.
    setupFiles: process.env.INTEGRATION === "true" ? [] : ["./src/test/redis-mock.setup.ts"],
    // Task B / B1: runs once per run, in the Node context, BEFORE any test file.
    // No-ops unless INTEGRATION==="true" (see the early return in the file); under
    // INTEGRATION it SCAN+DELs `rl:*` on the app Redis db so back-to-back runs
    // don't inherit the prior run's 60s-TTL rate-limit counters (F-1(b)).
    globalSetup: ["./src/test/rl-flush.globalSetup.ts"],
    env: {
      STATERA_DEV_MODE: "true",
    },
  },
})
