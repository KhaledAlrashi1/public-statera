// MOB-R60 C2 / MOB-R62 F4 — a stored R3 snapshot row without the current version is a miss (its
// expense_kd may still include savings), and a row with it is served.
import { describe, expect, it, vi } from "vitest"
import { getDashboardMetricsWithCache } from "./analytics-cache"
import { loadDashboardSnapshot } from "./dashboard-snapshot-lib"

vi.mock("./sentry", () => ({ Sentry: { captureException: vi.fn() } }))

// MOB-R114 D2 — Tier 1 inert in BOTH modes (the money-wire-shape.test.ts precedent): under
// INTEGRATION the global stub is absent, and a real Redis would serve read 2 from Tier 1, so a
// dropped snapshot write-back would stay green. With Redis inert, read 2 can only be Tier 2.
vi.mock("ioredis", async () => {
  const { RedisMock } = await import("../test/redis-mock.setup")
  return { default: RedisMock, Redis: RedisMock }
})

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

const MONTHLY = [{ month: "2026-01", income_kd: "100.000", expense_kd: "40.000", savings_kd: "30.000", extras_kd: "0.000" }]

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
    const older = await loadDashboardSnapshot(10, makeDbReturning([row(JSON.stringify({ v: 2, monthly: MONTHLY }))]), 24, "2026-01")
    expect(older).toBeNull()
  })

  it("serves a row stored with the current version", async () => {
    const result = await loadDashboardSnapshot(
      10,
      makeDbReturning([row(JSON.stringify({ v: 3, monthly: MONTHLY }))]),
      24,
      "2026-01",
    )
    expect(result).not.toBeNull()
    expect(result!.monthly[0].savings_kd).toBe("30.000")
    expect(result!.monthly[0].expense_kd).toBe("40.000")
  })
})

// MOB-R114 D2 — recomputed once. A stored v2 row is a miss; read 1 recomputes and writes the row
// back as v3 (analytics-cache.ts Tier 3 → persistDashboardSnapshot); read 2 is served from that
// row, so the compute ran once across both reads.
describe("getDashboardMetricsWithCache — a stored v2 row is recomputed once (MOB-R114 D2)", () => {
  it("read 1 computes and stores v3; read 2 is served from the stored row", async () => {
    // One stored row per window, as the unique key allows. A bare select() is the snapshot load;
    // a projected select({...}) is the recompute query (one per compute).
    let stored: Record<string, unknown> = row(JSON.stringify({ v: 2, monthly: MONTHLY })) as Record<string, unknown>
    let computeCalls = 0
    const TX_ROWS = [{ ym: "2026-01", catName: "Food", total: "40.000", isIncome: 0, extras: "0.000" }]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function db(): any {
      let pending: unknown[] = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain = (): any =>
        new Proxy(
          {},
          {
            get(_t, prop: string) {
              if (prop === "then") {
                const rows = pending
                pending = []
                return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
                  Promise.resolve(rows).then(res, rej)
              }
              return (...args: unknown[]) => {
                if (prop === "select") {
                  if (args[0] && typeof args[0] === "object") {
                    computeCalls++
                    pending = TX_ROWS
                  } else {
                    pending = [stored]
                  }
                }
                if (prop === "values" && args[0] && typeof args[0] === "object") {
                  stored = { ...stored, ...(args[0] as Record<string, unknown>) }
                }
                return chain()
              }
            },
          },
        )
      return chain()
    }
    const opts = {
      months: 1, endYear: 2026, endMonth: 1, cycleEnabled: false,
      currentMonthKey: "2026-01", snapshotMonthsCount: 1,
    }
    stored = { ...stored, monthsCount: 1, monthsJson: JSON.stringify(["2026-01"]) }

    const read1 = await getDashboardMetricsWithCache(10, db(), opts)
    expect(read1.cacheStatus).toBe("miss")
    expect(computeCalls).toBe(1)
    expect(JSON.parse(String(stored.monthlyJson)).v).toBe(3)

    const read2 = await getDashboardMetricsWithCache(10, db(), opts)
    expect(read2.cacheStatus).toBe("snapshot")
    expect(computeCalls).toBe(1)
  })
})
