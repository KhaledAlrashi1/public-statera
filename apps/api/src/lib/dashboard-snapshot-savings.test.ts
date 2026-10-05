// MOB-R55 P2 — R3 moves savings-kind categories out of expense_kd into savings_kd; the per-category
// breakdown keeps the savings row under its own name.
import { describe, expect, it, vi } from "vitest"
import { computeDashboardMetricsPayload } from "./dashboard-snapshot-lib"

vi.mock("./sentry", () => ({ Sentry: { captureException: vi.fn() } }))

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

describe("computeDashboardMetricsPayload — savings split (MOB-R55 P2)", () => {
  it("income 100, expenses 40, savings 30: expense_kd 40, savings_kd 30, breakdown keeps Savings", async () => {
    const rows = [
      { ym: "2026-01", catName: "Salary", total: "100.000", isIncome: 1 },
      { ym: "2026-01", catName: "Groceries", total: "40.000", isIncome: 0 },
      { ym: "2026-01", catName: "Savings & investing", total: "30.000", isIncome: 0 },
    ]
    const payload = await computeDashboardMetricsPayload(10, makeDbReturning(rows), {
      months: 1,
      endYear: 2026,
      endMonth: 1,
      cycleEnabled: false,
    })
    expect(payload.monthly).toEqual([
      { month: "2026-01", income_kd: "100.000", expense_kd: "40.000", savings_kd: "30.000" },
    ])
    expect(payload.expense_by_category["2026-01"]).toEqual({ Groceries: "40.000", "Savings & investing": "30.000" })
  })
})
