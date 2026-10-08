// MOB-R91 C5 — the budget-alert job and the snapshot job follow each user's payday month. On 25 Oct 2026 (Kuwait):
// a user with no payday is checked at 2026-10; a user with payday 25 at 2026-11 (25 Oct – 24 Nov). With no payday
// users at all, the alert job runs one group, Kuwait's month, as before.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Job } from "bullmq"

vi.mock("../../lib/sentry", () => ({ Sentry: { captureException: vi.fn() } }))
vi.mock("../../lib/dashboard-snapshot-lib", () => ({
  currentMonthKeyUtc: vi.fn(() => "2026-10"),
  rebuildDashboardSnapshot: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("../../lib/analytics-cache", () => ({ cacheBustDashboardMetrics: vi.fn().mockResolvedValue(0) }))
vi.mock("../../lib/budget-alerts-lib", () => ({
  collectMonthAlertKeySets: vi.fn().mockResolvedValue({ existing: new Set(), dismissed: new Set() }),
  buildBudgetAlertKey: vi.fn((month: string, catId: number) => `${month}:${catId}`),
  roundRatio: vi.fn().mockReturnValue(0.95),
  formatMonthLabel: vi.fn(() => "x"),
  BUDGET_ALERT_EVENT_NAME: "budget_alert",
}))
vi.mock("../../lib/product-events-lib", () => ({ recordEvent: vi.fn().mockResolvedValue(true) }))
vi.mock("../queue", () => ({ getQueue: vi.fn(() => ({ add: vi.fn().mockResolvedValue(undefined) })) }))
vi.mock("../task-runs", () => ({
  markWorkerTaskStarted: vi.fn().mockResolvedValue(undefined),
  markWorkerTaskFinished: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("../../lib/email-templates", () => ({ sendTemplatedEmail: vi.fn().mockResolvedValue(true) }))

// Each awaited query answers with the next queued result, in order.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sequencedDb(results: unknown[][]): any {
  const chain = (): unknown =>
    new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "then") return (ok: (v: unknown) => unknown) => Promise.resolve(results.shift() ?? []).then(ok)
          return () => chain()
        },
      },
    )
  return { select: () => chain() }
}

import * as connection from "../../db/connection"
import { handleCheckBudgetAlerts } from "./budget-alerts-job"
import { handleRebuildDashboardSnapshots } from "./rebuild-dashboard-snapshots"
import { collectMonthAlertKeySets } from "../../lib/budget-alerts-lib"
import { recordEvent } from "../../lib/product-events-lib"
import { rebuildDashboardSnapshot } from "../../lib/dashboard-snapshot-lib"
import { markWorkerTaskFinished } from "../task-runs"

const row = (userId: number, categoryId: number) => ({ userId, categoryId, amountKd: "100.000", categoryName: "Food", spentKd: "95.000" })

beforeEach(() => {
  vi.clearAllMocks()
  // Set here, not only in the factories: restoreAllMocks below strips vi.fn implementations between tests.
  vi.mocked(collectMonthAlertKeySets).mockResolvedValue({ existing: new Set(), dismissed: new Set() })
  vi.mocked(recordEvent).mockResolvedValue(true)
  vi.mocked(rebuildDashboardSnapshot).mockResolvedValue(undefined)
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-24T22:30:00Z")) // 25 Oct 01:30 in Kuwait
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("jobs follow the payday month (MOB-R91 C5)", () => {
  it("the alert job checks the calendar group at Kuwait's month and a payday-25 user at her own month", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(sequencedDb([[{ userId: 2, payday: 25 }], [row(1, 7)], [row(2, 8)]]))
    await handleCheckBudgetAlerts({} as Job)
    expect(vi.mocked(collectMonthAlertKeySets).mock.calls.map((c) => c[0])).toEqual(["2026-10", "2026-11"])
    const months = vi.mocked(recordEvent).mock.calls.map((c) => [c[0], (c[2] as { month: string; alert_key: string }).month, (c[2] as { alert_key: string }).alert_key])
    expect(months).toEqual([[1, "2026-10", "2026-10:7"], [2, "2026-11", "2026-11:8"]])
    expect(vi.mocked(markWorkerTaskFinished)).toHaveBeenCalledWith("check-budget-alerts", "success", undefined)
  })

  it("with no payday that cuts months, the alert job runs one group, Kuwait's month, as before", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(sequencedDb([[{ userId: 3, payday: 1 }], [row(1, 7)]]))
    await handleCheckBudgetAlerts({} as Job)
    expect(vi.mocked(collectMonthAlertKeySets).mock.calls.map((c) => c[0])).toEqual(["2026-10"])
    expect(vi.mocked(recordEvent).mock.calls.map((c) => (c[2] as { month: string }).month)).toEqual(["2026-10"])
    expect(vi.mocked(markWorkerTaskFinished)).toHaveBeenCalledWith("check-budget-alerts", "success", undefined)
  })

  it("the snapshot job ends each user's window at her month, and passes her payday", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(sequencedDb([[{ id: 1, payday: null }, { id: 2, payday: 25 }, { id: 3, payday: 3 }]]))
    await handleRebuildDashboardSnapshots({} as Job)
    const calls = vi.mocked(rebuildDashboardSnapshot).mock.calls.map((c) => [c[0], c[2]?.windowEndMonth, c[2]?.payday])
    expect(calls).toEqual([[1, "2026-10", null], [2, "2026-11", 25], [3, "2026-10", 3]])
    expect(vi.mocked(markWorkerTaskFinished)).toHaveBeenCalledWith("rebuild-dashboard-snapshots", "success", undefined)
  })
})
