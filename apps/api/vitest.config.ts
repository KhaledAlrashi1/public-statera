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
    env: {
      STATERA_DEV_MODE: "true",
    },
  },
})
