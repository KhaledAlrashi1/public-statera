import { describe, it, expect } from "vitest"
import type { Job } from "bullmq"
import { handlePing } from "./jobs/ping"

describe("handlePing", () => {
  it("resolves to undefined without throwing", async () => {
    const fakeJob = { id: "1", name: "ping", data: {} } as unknown as Job
    await expect(handlePing(fakeJob)).resolves.toBeUndefined()
  })
})
