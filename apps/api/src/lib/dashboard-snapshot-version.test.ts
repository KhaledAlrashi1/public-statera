// MOB-R60 C2 / MOB-R62 F4 — a stored R3 snapshot row without the current version is a miss (its
// expense_kd may still include savings), and a row with it is served.
import { describe, expect, it, vi } from "vitest"
import { loadDashboardSnapshot } from "./dashboard-snapshot-lib"

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

const MONTHLY = [{ month: "2026-01", income_kd: "100.000", expense_kd: "40.000", savings_kd: "30.000" }]

function row(monthlyJson: string): unknown {
  return {
    id: 1,
    userId: 10,
    monthsCount: 24,
    windowEndMonth: "2026-01",
    monthsJson: JSON.stringify(["2026-01"]),
    monthlyJson,
    expenseByCategoryJson: JSON.stringify({ "2026-01": { Food: "40.000", Savings: "30.000" } }),
    computedAt: new Date("2026-01-15T12:00:00Z"),
  }
}

describe("loadDashboardSnapshot — format version (MOB-R60 C2)", () => {
  it("reads a version-less or older-version stored row as a miss", async () => {
    // Every row written before K1 is a bare monthly array.
    const legacy = await loadDashboardSnapshot(10, makeDbReturning([row(JSON.stringify(MONTHLY))]), 24, "2026-01")
    expect(legacy).toBeNull()
    // A wrapped row from any other version is a miss too.
    const older = await loadDashboardSnapshot(10, makeDbReturning([row(JSON.stringify({ v: 1, monthly: MONTHLY }))]), 24, "2026-01")
    expect(older).toBeNull()
  })

  it("serves a row stored with the current version", async () => {
    const result = await loadDashboardSnapshot(
      10,
      makeDbReturning([row(JSON.stringify({ v: 2, monthly: MONTHLY }))]),
      24,
      "2026-01",
    )
    expect(result).not.toBeNull()
    expect(result!.monthly[0].savings_kd).toBe("30.000")
    expect(result!.monthly[0].expense_kd).toBe("40.000")
  })
})
