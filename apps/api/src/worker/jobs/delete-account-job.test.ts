/**
 * Unit tests for handleDeleteAccountData (Module 7.5 + 10d-0a session revocation).
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../../db/connection", () => ({ getDb: vi.fn() }))
vi.mock("../../lib/account-deletion", () => ({
  purgeUserAccountRows: vi.fn().mockResolvedValue({ revokedSv: 9 }),
}))
vi.mock("../../middleware/auth", () => ({
  revokeSessionVersion: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("../../lib/sentry", () => ({ Sentry: { captureException: vi.fn() } }))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDbReturning(rows: unknown[]): any {
  return new Proxy({}, {
    get(_t, prop: string) {
      if (prop === "then") {
        return (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve)
      }
      if (prop === "transaction") {
        return async (fn: (tx: unknown) => Promise<unknown>) => fn(makeDbReturning(rows))
      }
      return (..._args: unknown[]) => makeDbReturning(rows)
    },
  })
}

import * as connection from "../../db/connection"
import { handleDeleteAccountData } from "./delete-account-job"
import { purgeUserAccountRows } from "../../lib/account-deletion"
import { revokeSessionVersion } from "../../middleware/auth"
import { Sentry } from "../../lib/sentry"

beforeEach(() => {
  vi.clearAllMocks()
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeJob(data: Record<string, unknown>): any {
  return { data }
}

describe("handleDeleteAccountData", () => {
  it("purges then revokes all sessions with the sessionVersion the purge returned", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{ isActive: true }]))

    await handleDeleteAccountData(fakeJob({ userId: 42, emailHash: "h", ipAddress: "", userAgent: "" }))

    expect(purgeUserAccountRows).toHaveBeenCalledOnce()
    expect(revokeSessionVersion).toHaveBeenCalledWith(42, 9)
  })

  it("is idempotent: skips purge and revoke when the account is already inactive", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{ isActive: false }]))

    await handleDeleteAccountData(fakeJob({ userId: 42, emailHash: "h", ipAddress: "", userAgent: "" }))

    expect(purgeUserAccountRows).not.toHaveBeenCalled()
    expect(revokeSessionVersion).not.toHaveBeenCalled()
  })

  it("Sentry-captures a revoke failure but does not throw (deletion already succeeded)", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{ isActive: true }]))
    vi.mocked(revokeSessionVersion).mockRejectedValueOnce(new Error("Redis down"))

    await expect(
      handleDeleteAccountData(fakeJob({ userId: 7, emailHash: "h", ipAddress: "", userAgent: "" })),
    ).resolves.toBeUndefined()

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: expect.objectContaining({ handler: "delete-account-job.revoke" }) }),
    )
  })
})
