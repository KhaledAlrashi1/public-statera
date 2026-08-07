/**
 * B4-1b — dashboard snapshot SERVING-TIER behaviour across the validator boundary.
 *
 * Ruling: B4-1-R10 (review-channel block "B4-1a approval and E-1/E-2 acceptance,
 * 2026-08-06"); Phase A approved by "B4-1b Phase A approval — bucket guard in, T3
 * added, self-referential SHA barred, 2026-08-06". Phase A + approval recorded in
 * docs/modules/phase4-task-b.md.
 *
 * WHY A NEW FILE (B4-1b-R5). The behaviour under test spans two libs — the
 * analytics-cache tier orchestration and the snapshot-lib shape validation — and
 * neither existing file can host it:
 *   - analytics-cache.test.ts declares vi.mock("./dashboard-snapshot-lib") at module
 *     scope with loadDashboardSnapshot: async () => null, so the real validator could
 *     never run. That is the 7.5 fix-forward mock-contamination pattern: a test that
 *     cannot execute what it claims.
 *   - aggregation.test.ts mocks ../lib/analytics-cache wholesale, so
 *     getDashboardMetricsWithCache is a stub there.
 *   - dashboard-snapshot-lib.test.ts could host it, but its header says "unit tests
 *     for dashboard-snapshot-lib.ts" and importing the cache orchestrator would make
 *     that false while hiding tier behaviour where nobody looks for it.
 *
 * TIER DISCRIMINATOR. `cacheStatus` is the pre-header form of the same signal the
 * R3 capture asserts: routes/aggregation.ts:577 does nothing but
 * c.header("X-Cache-Status", cacheStatus). T1 additionally asserts the served
 * VALUES are the recompute's rather than the stored row's, which discriminates the
 * tier without going through cacheStatus at all.
 *
 * CLOCK-INDEPENDENT by construction: currentMonthKey and snapshotMonthsCount are
 * passed explicitly, so isSnapshotEligible never consults the wall clock. No clock
 * pin is needed here (contrast B4-1a's CF6, where the routes derive their own
 * windows).
 */

import { describe, expect, it, vi } from "vitest"
import { getDashboardMetricsWithCache } from "./analytics-cache"
import { rebuildDashboardSnapshot } from "./dashboard-snapshot-lib"

vi.mock("./sentry", () => ({ Sentry: { captureException: vi.fn() } }))

// ── Residue immunity (B4-1b-R6(d)) ───────────────────────────────────────────
// Under INTEGRATION the module-wide ioredis mock is absent (vitest.config.ts sets
// setupFiles: [] in that mode), so cacheGet/cacheSet hit REAL Redis on db 1 and the
// Tier-1 key `dashboard_metrics:{userId}:{months}:{until}` survives its 900s TTL
// between runs — a Tier-1 hit would short-circuit before either tier under test.
// A unique-per-run userId yields a fresh key every run with NO manual precondition,
// mirroring routes/client-errors.integration.test.ts's unique-per-run X-Real-IP.
const RUN_SEED = Date.now() % 100_000_000
let userSeq = 0
const uniqueUserId = (): number => RUN_SEED * 10 + userSeq++

// ── Fixtures ─────────────────────────────────────────────────────────────────
// Recompute source. Values are deliberately DISJOINT from every stored-row value
// below, so "which tier served this?" is answerable from the payload alone.
const TX_ROWS = [
  { ym: "2026-04", catName: "Transport", total: "22.222", isIncome: 0 },
  { ym: "2026-05", catName: "Groceries", total: "11.111", isIncome: 0 },
  { ym: "2026-05", catName: "Salary", total: "3333.333", isIncome: 1 },
]

// monthly[] money is entirely STRING-typed in both stored rows, so the PRE-EXISTING
// monthly check cannot fire. Only the expense_by_category guard is under test.
const STORED_MONTHLY = [
  { month: "2026-04", income_kd: "0.000", expense_kd: "7.000" },
  { month: "2026-05", income_kd: "2000.000", expense_kd: "200.625" },
]

function storedRow(expenseByCategory: unknown, userId: number): unknown {
  return {
    id: 1,
    userId,
    monthsCount: 2,
    windowEndMonth: "2026-05",
    monthsJson: JSON.stringify(["2026-04", "2026-05"]),
    monthlyJson: JSON.stringify(STORED_MONTHLY),
    expenseByCategoryJson: JSON.stringify(expenseByCategory),
    computedAt: new Date("2026-05-15T00:00:00.000Z"),
  }
}

const OPTS = {
  months: 2,
  endYear: 2026,
  endMonth: 5,
  cycleEnabled: false,
  currentMonthKey: "2026-05",
  snapshotMonthsCount: 2,
} as const

type Captured = Record<string, unknown>

// Shape-dispatching db: a bare select() is the snapshot LOAD
// (dashboard-snapshot-lib.ts:277, the only projection-less select on this path);
// a projected select({...}) is the recompute query. Every values({...}) argument
// handed to db.insert(...) is recorded so the WRITE path can be observed directly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeTierDb(snapshotRows: unknown[], captured: Captured[] = []): any {
  let pending: unknown[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function chain(): any {
    return new Proxy(
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
              pending = args[0] && typeof args[0] === "object" ? TX_ROWS : snapshotRows
            }
            if (prop === "values" && args[0] && typeof args[0] === "object") {
              captured.push(args[0] as Captured)
            }
            return chain()
          }
        },
      },
    )
  }
  return chain()
}

// Flattens a two-level expense_by_category map to [path, typeof, value] triples.
function leafTypes(map: Record<string, Record<string, unknown>>): Array<[string, string, unknown]> {
  const out: Array<[string, string, unknown]> = []
  for (const [month, bucket] of Object.entries(map)) {
    for (const [category, amount] of Object.entries(bucket)) {
      out.push([`${month}.${category}`, typeof amount, amount])
    }
  }
  return out
}

describe("B4-1b — expense_by_category leaves are policed at the snapshot tier", () => {
  it("T1: a number-leafed stored snapshot is REJECTED and Tier 3 recompute serves instead", async () => {
    const userId = uniqueUserId()
    const row = storedRow(
      {
        "2026-04": { Transport: 7 },
        "2026-05": { Groceries: 160.125, Uncategorized: "40.500" },
      },
      userId,
    )
    const { payload, cacheStatus } = await getDashboardMetricsWithCache(
      userId,
      makeTierDb([row]),
      OPTS,
    )
    const leaves = leafTypes(payload.expense_by_category)
    console.log(`\n### T1 cacheStatus=${cacheStatus} leaves=${JSON.stringify(leaves)}`)

    // (1) Tier 3 ran.
    expect(cacheStatus).toBe("miss")
    // (2) No non-string leaf reaches the caller.
    expect(leaves.filter(([, t]) => t !== "string")).toEqual([])
    // (3) Independent of cacheStatus: the served values are the RECOMPUTE's, not
    //     the stored row's. "Uncategorized" exists only in the stored row.
    expect(payload.expense_by_category["2026-05"].Groceries).toBe("11.111")
    expect(payload.expense_by_category["2026-04"].Transport).toBe("22.222")
    expect(payload.expense_by_category["2026-05"].Uncategorized).toBeUndefined()
  })

  it("T2: a string-leafed stored snapshot is still ACCEPTED and served from Tier 2", async () => {
    const userId = uniqueUserId()
    const row = storedRow(
      {
        "2026-04": { Transport: "7.000" },
        "2026-05": { Groceries: "160.125", Uncategorized: "40.500" },
      },
      userId,
    )
    const { payload, cacheStatus } = await getDashboardMetricsWithCache(
      userId,
      makeTierDb([row]),
      OPTS,
    )
    const leaves = leafTypes(payload.expense_by_category)
    console.log(`\n### T2 cacheStatus=${cacheStatus} leaves=${JSON.stringify(leaves)}`)

    // Without this the fix passes trivially under a validator that rejects everything.
    expect(cacheStatus).toBe("snapshot")
    expect(leaves.filter(([, t]) => t !== "string")).toEqual([])
    // Served values are the STORED row's, not the recompute's.
    expect(payload.expense_by_category["2026-05"].Groceries).toBe("160.125")
    expect(payload.expense_by_category["2026-05"].Uncategorized).toBe("40.500")
  })

  it("T3: both persistDashboardSnapshot entry points store STRING expense_by_category leaves", async () => {
    // B4-1b-R4: the fail-safe property of the T1 rejection rests entirely on the
    // write path being unable to emit a number. That premise was proven once by a
    // throwaway probe; a premise proven by a deleted artifact is not a guard, so it
    // is asserted here at the db.insert(...).values({...}) boundary for BOTH writers.
    // WRITER 1 — worker path.
    const w1: Captured[] = []
    await rebuildDashboardSnapshot(uniqueUserId(), makeTierDb([], w1), {
      monthsCount: 2,
      windowEndMonth: "2026-05",
    })
    expect(w1).toHaveLength(1)
    const w1Leaves = leafTypes(JSON.parse(w1[0].expenseByCategoryJson as string))
    console.log(`\n### T3 WRITER 1 rebuildDashboardSnapshot = ${w1[0].expenseByCategoryJson as string}`)
    expect(w1Leaves.length).toBeGreaterThan(0)
    expect(w1Leaves.filter(([, t]) => t !== "string")).toEqual([])

    // WRITER 2 — request path. An empty snapshot row set misses Tier 2, which is the
    // identical `if (snapshot)`-false branch a validator rejection produces.
    const w2: Captured[] = []
    const { cacheStatus } = await getDashboardMetricsWithCache(
      uniqueUserId(),
      makeTierDb([], w2),
      OPTS,
    )
    expect(cacheStatus).toBe("miss")
    expect(w2).toHaveLength(1)
    const w2Leaves = leafTypes(JSON.parse(w2[0].expenseByCategoryJson as string))
    console.log(`### T3 WRITER 2 getDashboardMetricsWithCache = ${w2[0].expenseByCategoryJson as string}`)
    expect(w2Leaves.length).toBeGreaterThan(0)
    expect(w2Leaves.filter(([, t]) => t !== "string")).toEqual([])

    // CONTROL — the observation mechanism is not vacuously green: given a number
    // leaf, leafTypes reports one. Without this, two empty filters prove nothing.
    const control = leafTypes(JSON.parse('{"2026-05":{"Food":150.5,"Fuel":"10.000"}}'))
    console.log(`### T3 CONTROL = ${JSON.stringify(control)}`)
    expect(control.filter(([, t]) => t !== "string")).toHaveLength(1)
  })
})
