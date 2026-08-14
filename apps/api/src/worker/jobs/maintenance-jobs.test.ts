/**
 * Unit tests for maintenance-jobs handlers.
 *
 * DB is mocked via the flat self-referential proxy pattern (see income-lib.test.ts).
 * Each delete operation resolves to [{ affectedRows: N }] matching Drizzle MySQL's
 * ResultSetHeader return shape.
 *
 * Verifies per-handler:
 * - markWorkerTaskStarted called with correct task name
 * - markWorkerTaskFinished called with "success" on clean run
 * - markWorkerTaskFinished called with "failure" + error string on DB error
 * - Sentry.captureException called on DB error
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Job } from "bullmq"

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../../lib/sentry", () => ({ Sentry: { captureException: vi.fn() } }))
vi.mock("../task-runs", () => ({
  markWorkerTaskStarted: vi.fn().mockResolvedValue(undefined),
  markWorkerTaskFinished: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("../../lib/env", () => ({
  env: {
    securityEventsRetentionDays: 365,
    productEventsRetentionDays: 90,
  },
}))

// ── DB mock helpers ───────────────────────────────────────────────────────────

// Flat self-referential proxy that resolves any await to `resolveValue`.
// Works for delete().where() (chain depth 2) and any deeper chain.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDbReturning(resolveValue: unknown): any {
  return new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve(resolveValue).then(resolve, reject)
        }
        return (..._args: unknown[]) => makeDbReturning(resolveValue)
      },
    },
  )
}

// Proxy that throws on the first method call to simulate a DB error.
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

// ── Imports under test (after vi.mock declarations) ───────────────────────────

import * as connection from "../../db/connection"
import {
  TASK_CLEANUP_ACCOUNT_TOKENS,
  TASK_CLEANUP_MEMORIZED,
  TASK_CLEANUP_PRODUCT_EVENTS,
  TASK_CLEANUP_SECURITY_DATA,
  handleCleanupAccountTokens,
  handleCleanupMemorizedTransactions,
  handleCleanupProductEvents,
  handleCleanupSecurityData,
} from "./maintenance-jobs"
import { markWorkerTaskStarted, markWorkerTaskFinished } from "../task-runs"
import { Sentry } from "../../lib/sentry"

const fakeJob = {} as Job

// delete().where() resolves to [ResultSetHeader, ...]; handlers destructure [result]
const DELETE_RESULT = [{ affectedRows: 0 }]

beforeEach(() => {
  vi.clearAllMocks()
})

// ── cleanup-account-tokens ────────────────────────────────────────────────────

describe("handleCleanupAccountTokens", () => {
  it("marks task started and finished with success on clean run", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning(DELETE_RESULT))
    await handleCleanupAccountTokens(fakeJob)
    expect(markWorkerTaskStarted).toHaveBeenCalledWith(TASK_CLEANUP_ACCOUNT_TOKENS)
    expect(markWorkerTaskFinished).toHaveBeenCalledWith(
      TASK_CLEANUP_ACCOUNT_TOKENS,
      "success",
      undefined,
    )
  })

  it("marks task as failure and reports to Sentry on DB error", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeThrowingDb())
    await handleCleanupAccountTokens(fakeJob)
    expect(markWorkerTaskFinished).toHaveBeenCalledWith(
      TASK_CLEANUP_ACCOUNT_TOKENS,
      "failure",
      expect.any(String),
    )
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledOnce()
  })

  // 10e-1: the log line IS the on-box activation discriminator (A6.7). At 10e-close the
  // operator greps the worker journal, and PASS requires the two magic_* fields — a pre-10e
  // worker prints the old two-field line, a stopped worker prints nothing, and the three
  // outcomes are distinguishable only because these field names exist. A discriminator that
  // is asserted nowhere is a claim, so it is pinned here rather than read off the source.
  it("logs all four delete counters, so the 10e-close on-box discriminator exists", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{ affectedRows: 3 }]))
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    await handleCleanupAccountTokens(fakeJob)
    const line = log.mock.calls.map((c) => String(c[0])).join("\n")
    log.mockRestore()

    expect(line).toContain(`[${TASK_CLEANUP_ACCOUNT_TOKENS}]`)
    expect(line).toContain("expired_deleted=3")
    expect(line).toContain("used_deleted=3")
    expect(line).toContain("magic_expired_deleted=3")
    expect(line).toContain("magic_consumed_deleted=3")
  })
})

// ── cleanup-security-data ─────────────────────────────────────────────────────

describe("handleCleanupSecurityData", () => {
  it("marks task started and finished with success on clean run", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning(DELETE_RESULT))
    await handleCleanupSecurityData(fakeJob)
    expect(markWorkerTaskStarted).toHaveBeenCalledWith(TASK_CLEANUP_SECURITY_DATA)
    expect(markWorkerTaskFinished).toHaveBeenCalledWith(
      TASK_CLEANUP_SECURITY_DATA,
      "success",
      undefined,
    )
  })

  it("marks task as failure and reports to Sentry on DB error", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeThrowingDb())
    await handleCleanupSecurityData(fakeJob)
    expect(markWorkerTaskFinished).toHaveBeenCalledWith(
      TASK_CLEANUP_SECURITY_DATA,
      "failure",
      expect.any(String),
    )
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledOnce()
  })
})

// ── cleanup-product-events ────────────────────────────────────────────────────

describe("handleCleanupProductEvents", () => {
  it("marks task started and finished with success on clean run", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning(DELETE_RESULT))
    await handleCleanupProductEvents(fakeJob)
    expect(markWorkerTaskStarted).toHaveBeenCalledWith(TASK_CLEANUP_PRODUCT_EVENTS)
    expect(markWorkerTaskFinished).toHaveBeenCalledWith(
      TASK_CLEANUP_PRODUCT_EVENTS,
      "success",
      undefined,
    )
  })

  it("marks task as failure and reports to Sentry on DB error", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeThrowingDb())
    await handleCleanupProductEvents(fakeJob)
    expect(markWorkerTaskFinished).toHaveBeenCalledWith(
      TASK_CLEANUP_PRODUCT_EVENTS,
      "failure",
      expect.any(String),
    )
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledOnce()
  })
})

// ── cleanup-memorized-transactions ────────────────────────────────────────────

describe("handleCleanupMemorizedTransactions", () => {
  it("marks task started and finished with success on clean run", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning(DELETE_RESULT))
    await handleCleanupMemorizedTransactions(fakeJob)
    expect(markWorkerTaskStarted).toHaveBeenCalledWith(TASK_CLEANUP_MEMORIZED)
    expect(markWorkerTaskFinished).toHaveBeenCalledWith(
      TASK_CLEANUP_MEMORIZED,
      "success",
      undefined,
    )
  })

  it("marks task as failure and reports to Sentry on DB error", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeThrowingDb())
    await handleCleanupMemorizedTransactions(fakeJob)
    expect(markWorkerTaskFinished).toHaveBeenCalledWith(
      TASK_CLEANUP_MEMORIZED,
      "failure",
      expect.any(String),
    )
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledOnce()
  })
})
