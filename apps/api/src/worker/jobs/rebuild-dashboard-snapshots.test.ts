/**
 * Unit tests for rebuild-dashboard-snapshots job handler.
 *
 * DB and Redis are injected via mocks. Verifies:
 * - rebuildDashboardSnapshot is called for each eligible user
 * - cacheBustDashboardMetrics is called with { includeSnapshots: false }
 * - per-user errors are isolated (batch continues, markWorkerTaskFinished = success)
 * - batch-level DB error marks the task as failure
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Job } from "bullmq"

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../../lib/sentry", () => ({ Sentry: { captureException: vi.fn() } }))
vi.mock("../../lib/analytics-cache", () => ({
  cacheBustDashboardMetrics: vi.fn().mockResolvedValue(0),
}))
vi.mock("../../lib/dashboard-snapshot-lib", () => ({
  currentMonthKeyUtc: () => "2026-01",
  rebuildDashboardSnapshot: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("../task-runs", () => ({
  markWorkerTaskStarted: vi.fn().mockResolvedValue(undefined),
  markWorkerTaskFinished: vi.fn().mockResolvedValue(undefined),
}))

// ── DB mock ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDbReturningUsers(userRows: { id: number }[]): any {
  return new Proxy(
    {},
    {
      get() {
        return (..._args: unknown[]) =>
          new Proxy(
            {},
            {
              get(_t, prop: string) {
                if (prop === "then") {
                  return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
                    Promise.resolve(userRows).then(resolve, reject)
                }
                return (..._inner: unknown[]) => makeDbReturningUsers(userRows)
              },
            },
          )
      },
    },
  )
}

// DB that throws on the first call (simulates batch-level failure)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeThrowingDb(): any {
  return new Proxy(
    {},
    {
      get() {
        return () => { throw new Error("DB connection refused") }
      },
    },
  )
}

// ── getDb mock ────────────────────────────────────────────────────────────────

import * as connection from "../../db/connection"

// ── Imports under test (after vi.mock declarations) ───────────────────────────

import { handleRebuildDashboardSnapshots } from "./rebuild-dashboard-snapshots"
import { cacheBustDashboardMetrics } from "../../lib/analytics-cache"
import { rebuildDashboardSnapshot } from "../../lib/dashboard-snapshot-lib"
import { markWorkerTaskStarted, markWorkerTaskFinished } from "../task-runs"

const fakeJob = {} as Job

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("handleRebuildDashboardSnapshots — single eligible user", () => {
  it("calls rebuildDashboardSnapshot for the user", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturningUsers([{ id: 42 }]))
    await handleRebuildDashboardSnapshots(fakeJob)
    expect(rebuildDashboardSnapshot).toHaveBeenCalledWith(42, expect.anything(), {
      monthsCount: expect.any(Number),
      windowEndMonth: "2026-01",
    })
  })

  it("calls cacheBustDashboardMetrics with includeSnapshots: false", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturningUsers([{ id: 42 }]))
    await handleRebuildDashboardSnapshots(fakeJob)
    expect(cacheBustDashboardMetrics).toHaveBeenCalledWith(42, expect.anything(), {
      includeSnapshots: false,
    })
  })

  it("marks task as success", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturningUsers([{ id: 42 }]))
    await handleRebuildDashboardSnapshots(fakeJob)
    expect(markWorkerTaskStarted).toHaveBeenCalledWith("rebuild-dashboard-snapshots")
    expect(markWorkerTaskFinished).toHaveBeenCalledWith(
      "rebuild-dashboard-snapshots",
      "success",
      undefined,
    )
  })
})

describe("handleRebuildDashboardSnapshots — multiple users", () => {
  it("processes all eligible users", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(
      makeDbReturningUsers([{ id: 1 }, { id: 2 }, { id: 3 }]),
    )
    await handleRebuildDashboardSnapshots(fakeJob)
    expect(rebuildDashboardSnapshot).toHaveBeenCalledTimes(3)
    expect(cacheBustDashboardMetrics).toHaveBeenCalledTimes(3)
  })
})

describe("handleRebuildDashboardSnapshots — per-user error isolation", () => {
  it("continues processing remaining users when one fails", async () => {
    vi.mocked(rebuildDashboardSnapshot)
      .mockRejectedValueOnce(new Error("timeout for user 1"))
      .mockResolvedValue(undefined)

    vi.spyOn(connection, "getDb").mockReturnValue(
      makeDbReturningUsers([{ id: 1 }, { id: 2 }]),
    )
    await handleRebuildDashboardSnapshots(fakeJob)

    // Both were attempted; user 2 succeeded
    expect(rebuildDashboardSnapshot).toHaveBeenCalledTimes(2)
    // cacheBust only called for the successful user
    expect(cacheBustDashboardMetrics).toHaveBeenCalledTimes(1)
    expect(cacheBustDashboardMetrics).toHaveBeenCalledWith(2, expect.anything(), {
      includeSnapshots: false,
    })
  })

  it("still marks batch as success when only per-user errors occur", async () => {
    vi.mocked(rebuildDashboardSnapshot).mockRejectedValue(new Error("per-user failure"))
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturningUsers([{ id: 99 }]))
    await handleRebuildDashboardSnapshots(fakeJob)
    expect(markWorkerTaskFinished).toHaveBeenCalledWith(
      "rebuild-dashboard-snapshots",
      "success",
      undefined,
    )
  })
})

describe("handleRebuildDashboardSnapshots — no eligible users", () => {
  it("marks task as success with empty user list", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturningUsers([]))
    await handleRebuildDashboardSnapshots(fakeJob)
    expect(rebuildDashboardSnapshot).not.toHaveBeenCalled()
    expect(markWorkerTaskFinished).toHaveBeenCalledWith(
      "rebuild-dashboard-snapshots",
      "success",
      undefined,
    )
  })
})

describe("handleRebuildDashboardSnapshots — batch-level DB failure", () => {
  it("marks task as failure when DB query throws", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeThrowingDb())
    await handleRebuildDashboardSnapshots(fakeJob)
    expect(markWorkerTaskFinished).toHaveBeenCalledWith(
      "rebuild-dashboard-snapshots",
      "failure",
      expect.any(String),
    )
  })
})
