/**
 * Unit tests for budget-alerts job handlers.
 *
 * handleCheckBudgetAlerts: mocks currentMonthKeyUtc, collectMonthAlertKeySets,
 * recordEvent, and getQueue so the handler can be tested without Redis or MySQL.
 *
 * handleSendBudgetAlertEmail: uses the flat self-referential proxy for the DB
 * SELECT and mocks sendTemplatedEmail.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Job } from "bullmq"

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../../lib/sentry", () => ({ Sentry: { captureException: vi.fn() } }))
vi.mock("../../lib/dashboard-snapshot-lib", () => ({
  currentMonthKeyUtc: vi.fn(() => "2026-05"),
}))
vi.mock("../../lib/budget-alerts-lib", () => ({
  collectMonthAlertKeySets: vi.fn(),
  buildBudgetAlertKey: vi.fn((month: string, catId: number) => `${month}:${catId}`),
  roundRatio: vi.fn().mockReturnValue(0.95),
  formatMonthLabel: vi.fn(() => "May 2026"),
  BUDGET_ALERT_EVENT_NAME: "budget_alert",
}))
vi.mock("../../lib/product-events-lib", () => ({
  recordEvent: vi.fn().mockResolvedValue(true),
}))
// getQueue mocked with a stable factory — the add fn is overridden per-test in beforeEach.
vi.mock("../queue", () => ({ getQueue: vi.fn() }))
vi.mock("../task-runs", () => ({
  markWorkerTaskStarted: vi.fn().mockResolvedValue(undefined),
  markWorkerTaskFinished: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("../../lib/email-templates", () => ({
  sendTemplatedEmail: vi.fn().mockResolvedValue(true),
}))

// ── DB mock helpers ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDbReturning(rows: unknown[]): any {
  return new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve(rows).then(resolve, reject)
        }
        return (..._args: unknown[]) => makeDbReturning(rows)
      },
    },
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeThrowingDb(): any {
  return new Proxy(
    {},
    { get() { return () => { throw new Error("DB error") } } },
  )
}

// ── Imports under test ────────────────────────────────────────────────────────

import * as connection from "../../db/connection"
import {
  handleCheckBudgetAlerts,
  handleSendBudgetAlertEmail,
  TASK_CHECK_BUDGET_ALERTS,
} from "./budget-alerts-job"
import { collectMonthAlertKeySets, roundRatio } from "../../lib/budget-alerts-lib"
import { recordEvent } from "../../lib/product-events-lib"
import { getQueue } from "../queue"
import { markWorkerTaskStarted, markWorkerTaskFinished } from "../task-runs"
import { sendTemplatedEmail } from "../../lib/email-templates"
import { Sentry } from "../../lib/sentry"

const fakeJob = {} as Job

// Stable add mock: reset each test; getQueue always returns the same object.
let mockQueueAdd: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mockQueueAdd = vi.fn().mockResolvedValue(undefined)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(getQueue).mockReturnValue({ add: mockQueueAdd } as any)
})

// ── handleCheckBudgetAlerts ───────────────────────────────────────────────────

describe("handleCheckBudgetAlerts — success path", () => {
  it("calls markWorkerTaskStarted and markWorkerTaskFinished(success)", async () => {
    vi.mocked(collectMonthAlertKeySets).mockResolvedValue({
      existing: new Set(),
      dismissed: new Set(),
    })
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([]))
    await handleCheckBudgetAlerts(fakeJob)
    expect(markWorkerTaskStarted).toHaveBeenCalledWith(TASK_CHECK_BUDGET_ALERTS)
    expect(markWorkerTaskFinished).toHaveBeenCalledWith(TASK_CHECK_BUDGET_ALERTS, "success", undefined)
  })

  it("dispatches send-budget-alert-email and records event for over-threshold budget", async () => {
    vi.mocked(collectMonthAlertKeySets).mockResolvedValue({
      existing: new Set(),
      dismissed: new Set(),
    })
    const budgetRow = {
      userId: 1,
      categoryId: 3,
      amountKd: "200.000",
      categoryName: "Groceries",
      spentKd: "190.000",
    }
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([budgetRow]))

    await handleCheckBudgetAlerts(fakeJob)

    expect(recordEvent).toHaveBeenCalledWith(
      1,
      "budget_alert",
      expect.objectContaining({ alert_key: "2026-05:3", category: "Groceries" }),
      expect.anything(),
    )
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "send-budget-alert-email",
      expect.objectContaining({ userId: 1, category: "Groceries" }),
    )
  })

  it("skips budgets already in the existing set", async () => {
    vi.mocked(collectMonthAlertKeySets).mockResolvedValue({
      existing: new Set(["1||2026-05:3"]),
      dismissed: new Set(),
    })
    const budgetRow = { userId: 1, categoryId: 3, amountKd: "200.000", categoryName: "Groceries", spentKd: "190.000" }
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([budgetRow]))

    await handleCheckBudgetAlerts(fakeJob)

    expect(recordEvent).not.toHaveBeenCalled()
  })

  it("skips budgets in the dismissed set", async () => {
    vi.mocked(collectMonthAlertKeySets).mockResolvedValue({
      existing: new Set(),
      dismissed: new Set(["1||2026-05:3"]),
    })
    const budgetRow = { userId: 1, categoryId: 3, amountKd: "200.000", categoryName: "Groceries", spentKd: "190.000" }
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([budgetRow]))

    await handleCheckBudgetAlerts(fakeJob)

    expect(recordEvent).not.toHaveBeenCalled()
  })

  it("skips budgets below the threshold (roundRatio returns 0.5)", async () => {
    vi.mocked(collectMonthAlertKeySets).mockResolvedValue({ existing: new Set(), dismissed: new Set() })
    vi.mocked(roundRatio).mockReturnValueOnce(0.5)
    const budgetRow = { userId: 1, categoryId: 3, amountKd: "200.000", categoryName: "Groceries", spentKd: "100.000" }
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([budgetRow]))

    await handleCheckBudgetAlerts(fakeJob)

    expect(recordEvent).not.toHaveBeenCalled()
  })
})

describe("handleCheckBudgetAlerts — DB error", () => {
  it("marks task as failure and reports to Sentry", async () => {
    vi.mocked(collectMonthAlertKeySets).mockResolvedValue({ existing: new Set(), dismissed: new Set() })
    vi.spyOn(connection, "getDb").mockReturnValue(makeThrowingDb())

    await handleCheckBudgetAlerts(fakeJob)

    expect(markWorkerTaskFinished).toHaveBeenCalledWith(
      TASK_CHECK_BUDGET_ALERTS,
      "failure",
      expect.any(String),
    )
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledOnce()
  })
})

// ── handleSendBudgetAlertEmail ────────────────────────────────────────────────

function makeEmailJob(overrides: Record<string, unknown> = {}): Job {
  return {
    data: {
      userId: 1,
      alertKey: "2026-05:3",
      category: "Groceries",
      monthKey: "2026-05",
      budgetKd: "200.000",
      spentKd: "190.000",
      ratio: 0.95,
      threshold: 0.9,
      ...overrides,
    },
  } as Job
}

describe("handleSendBudgetAlertEmail — email notifications enabled", () => {
  it("returns { status: 'sent' } when sendTemplatedEmail returns true", async () => {
    const profileRow = { email: "user@example.com", emailNotificationsEnabled: true }
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([profileRow]))

    const result = await handleSendBudgetAlertEmail(makeEmailJob())
    expect(result).toEqual({ status: "sent" })
    expect(sendTemplatedEmail).toHaveBeenCalledWith(
      "user@example.com",
      expect.stringContaining("Groceries"),
      "budget_alert",
      expect.objectContaining({ ratio_pct: 95, category: "Groceries" }),
    )
  })

  it("returns { status: 'failed' } and reports to Sentry when sendTemplatedEmail returns false", async () => {
    vi.mocked(sendTemplatedEmail).mockResolvedValueOnce(false)
    const profileRow = { email: "user@example.com", emailNotificationsEnabled: true }
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([profileRow]))

    const result = await handleSendBudgetAlertEmail(makeEmailJob())
    expect(result).toEqual({ status: "failed" })
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledOnce()
  })
})

describe("handleSendBudgetAlertEmail — notifications disabled", () => {
  it("returns { status: 'skipped' } when emailNotificationsEnabled is false", async () => {
    const profileRow = { email: "user@example.com", emailNotificationsEnabled: false }
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([profileRow]))

    const result = await handleSendBudgetAlertEmail(makeEmailJob())
    expect(result).toEqual({ status: "skipped" })
    expect(sendTemplatedEmail).not.toHaveBeenCalled()
  })

  it("returns { status: 'skipped' } when no user profile row is found", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([]))

    const result = await handleSendBudgetAlertEmail(makeEmailJob())
    expect(result).toEqual({ status: "skipped" })
    expect(sendTemplatedEmail).not.toHaveBeenCalled()
  })
})

describe("handleSendBudgetAlertEmail — DB error", () => {
  it("returns { status: 'failed' } and reports to Sentry", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeThrowingDb())

    const result = await handleSendBudgetAlertEmail(makeEmailJob())
    expect(result).toEqual({ status: "failed" })
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledOnce()
  })
})
