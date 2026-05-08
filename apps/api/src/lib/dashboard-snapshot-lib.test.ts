/**
 * Unit tests for dashboard-snapshot-lib.ts.
 *
 * DB is injected via a minimal Proxy mock — no live connection needed.
 * Fixture values are derived from the same Flask computation logic; monetary
 * comparisons use byte-for-byte string matching (never Number/parseFloat).
 */

import { describe, expect, it, vi } from "vitest"
import {
  buildMonthWindow,
  computeDashboardMetricsPayload,
  isSnapshotEligible,
  loadDashboardSnapshot,
  persistDashboardSnapshot,
  rebuildDashboardSnapshot,
} from "./dashboard-snapshot-lib"

// ── Sentry mock ───────────────────────────────────────────────────────────────
vi.mock("./sentry", () => ({ Sentry: { captureException: vi.fn() } }))

// ── DB mock ───────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDbReturning(rows: unknown[]): any {
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
                    Promise.resolve(rows).then(resolve, reject)
                }
                return (..._inner: unknown[]) => makeDbReturning(rows)
              },
            },
          )
      },
    },
  )
}

// ── buildMonthWindow ──────────────────────────────────────────────────────────

describe("buildMonthWindow", () => {
  it("produces the correct 3-month window ending at 2026-01", () => {
    expect(buildMonthWindow(2026, 1, 3)).toEqual(["2025-11", "2025-12", "2026-01"])
  })

  it("produces the correct 2-month window ending at 2026-02", () => {
    expect(buildMonthWindow(2026, 2, 2)).toEqual(["2026-01", "2026-02"])
  })

  it("handles year boundary correctly (Dec → Jan)", () => {
    const keys = buildMonthWindow(2026, 1, 2)
    expect(keys).toEqual(["2025-12", "2026-01"])
  })

  it("returns a single key for months=1", () => {
    expect(buildMonthWindow(2026, 3, 1)).toEqual(["2026-03"])
  })
})

// ── isSnapshotEligible ────────────────────────────────────────────────────────

describe("isSnapshotEligible", () => {
  it("returns false when cycle is enabled", () => {
    expect(isSnapshotEligible(24, 2026, 1, true, "2026-01", 24)).toBe(false)
  })

  it("returns false when months !== snapshotMonthsCount", () => {
    expect(isSnapshotEligible(12, 2026, 1, false, "2026-01", 24)).toBe(false)
  })

  it("returns false when window end month differs from current month", () => {
    expect(isSnapshotEligible(24, 2026, 2, false, "2026-01", 24)).toBe(false)
  })

  it("returns true when all conditions match", () => {
    expect(isSnapshotEligible(24, 2026, 1, false, "2026-01", 24)).toBe(true)
  })
})

// ── loadDashboardSnapshot — missing row ───────────────────────────────────────

describe("loadDashboardSnapshot — no matching row", () => {
  it("returns null when the table has no matching snapshot", async () => {
    const result = await loadDashboardSnapshot(1, makeDbReturning([]), 24, "2026-01")
    expect(result).toBeNull()
  })
})

// ── loadDashboardSnapshot — valid row ─────────────────────────────────────────

const VALID_MONTHLY = [
  { month: "2025-12", income_kd: "500.000", expense_kd: "200.000" },
  { month: "2026-01", income_kd: "600.000", expense_kd: "300.000" },
]
const VALID_EBC = {
  "2025-12": { Food: "200.000" },
  "2026-01": { Food: "150.000", Transport: "150.000" },
}

function makeSnapshotRow(overrides: Partial<Record<string, unknown>> = {}): unknown {
  return {
    id: 1,
    userId: 10,
    monthsCount: 24,
    windowEndMonth: "2026-01",
    monthsJson: JSON.stringify(["2025-12", "2026-01"]),
    monthlyJson: JSON.stringify(VALID_MONTHLY),
    expenseByCategoryJson: JSON.stringify(VALID_EBC),
    computedAt: new Date("2026-01-15T12:00:00Z"),
    ...overrides,
  }
}

describe("loadDashboardSnapshot — valid row", () => {
  it("returns the parsed payload", async () => {
    const result = await loadDashboardSnapshot(10, makeDbReturning([makeSnapshotRow()]), 24, "2026-01")
    expect(result).not.toBeNull()
    expect(result!.months).toEqual(["2025-12", "2026-01"])
    expect(result!.monthly[0].income_kd).toBe("500.000")
    expect(result!.monthly[1].expense_kd).toBe("300.000")
    expect(result!.expense_by_category["2026-01"]["Food"]).toBe("150.000")
    expect(result!.cycle_enabled).toBe(false)
    expect(result!.cycle_start).toBeNull()
  })
})

// ── loadDashboardSnapshot — float rejection (Refinement 1) ───────────────────

describe("loadDashboardSnapshot — float monetary values are rejected", () => {
  it("returns null when income_kd is a number (float snapshot)", async () => {
    const floatMonthly = [{ month: "2026-01", income_kd: 1234.567, expense_kd: "300.000" }]
    const row = makeSnapshotRow({ monthlyJson: JSON.stringify(floatMonthly) })
    const result = await loadDashboardSnapshot(10, makeDbReturning([row]), 24, "2026-01")
    expect(result).toBeNull()
  })

  it("returns null when expense_kd is a number (float snapshot)", async () => {
    const floatMonthly = [{ month: "2026-01", income_kd: "500.000", expense_kd: 456.789 }]
    const row = makeSnapshotRow({ monthlyJson: JSON.stringify(floatMonthly) })
    const result = await loadDashboardSnapshot(10, makeDbReturning([row]), 24, "2026-01")
    expect(result).toBeNull()
  })
})

// ── loadDashboardSnapshot — corrupt JSON shapes ───────────────────────────────

describe("loadDashboardSnapshot — corrupt JSON shapes are rejected", () => {
  it("returns null when monthsJson is not a JSON array", async () => {
    const row = makeSnapshotRow({ monthsJson: '"not-an-array"' })
    const result = await loadDashboardSnapshot(10, makeDbReturning([row]), 24, "2026-01")
    expect(result).toBeNull()
  })

  it("returns null when monthlyJson is not a JSON array", async () => {
    const row = makeSnapshotRow({ monthlyJson: '{"key": "value"}' })
    const result = await loadDashboardSnapshot(10, makeDbReturning([row]), 24, "2026-01")
    expect(result).toBeNull()
  })

  it("returns null when expenseByCategoryJson is a JSON array instead of object", async () => {
    const row = makeSnapshotRow({ expenseByCategoryJson: "[]" })
    const result = await loadDashboardSnapshot(10, makeDbReturning([row]), 24, "2026-01")
    expect(result).toBeNull()
  })

  it("returns null when monthlyJson contains malformed JSON", async () => {
    const row = makeSnapshotRow({ monthlyJson: "not-valid-json" })
    const result = await loadDashboardSnapshot(10, makeDbReturning([row]), 24, "2026-01")
    expect(result).toBeNull()
  })
})

// ── persistDashboardSnapshot — smoke test ────────────────────────────────────

describe("persistDashboardSnapshot", () => {
  it("resolves without throwing", async () => {
    const payload = {
      months: ["2026-01"],
      monthly: [{ month: "2026-01", income_kd: "500.000", expense_kd: "200.000" }],
      expense_by_category: { "2026-01": { Food: "200.000" } },
      cycle_enabled: false,
      cycle_start: null,
      cycle_end: null,
    }
    await expect(persistDashboardSnapshot(10, makeDbReturning([]), 24, "2026-01", payload)).resolves.toBeUndefined()
  })
})

// ── computeDashboardMetricsPayload — Fixture A: two months, mixed rows ────────
// today=2026-01-15, window 2 months: 2025-12 and 2026-01
// Rows:
//   2025-12 | Food | 200.000 | expense
//   2026-01 | Food | 150.000 | expense
//   2026-01 | Transport | 100.000 | expense
//   2026-01 | (Income category) | 600.000 | income
// Expected:
//   2025-12: income=0.000, expense=200.000, ebc={Food:200.000}
//   2026-01: income=600.000, expense=250.000, ebc={Food:150.000, Transport:100.000}

describe("computeDashboardMetricsPayload — Fixture A: two months mixed", () => {
  const mockRows = [
    { ym: "2025-12", catName: "Food", total: "200.000", isIncome: 0 },
    { ym: "2026-01", catName: "Food", total: "150.000", isIncome: 0 },
    { ym: "2026-01", catName: "Transport", total: "100.000", isIncome: 0 },
    { ym: "2026-01", catName: "Income", total: "600.000", isIncome: 1 },
  ]

  it("months array matches the requested window", async () => {
    const payload = await computeDashboardMetricsPayload(10, makeDbReturning(mockRows), {
      months: 2,
      endYear: 2026,
      endMonth: 1,
      cycleEnabled: false,
    })
    expect(payload.months).toEqual(["2025-12", "2026-01"])
  })

  it("accumulates expense correctly for 2025-12", async () => {
    const payload = await computeDashboardMetricsPayload(10, makeDbReturning(mockRows), {
      months: 2,
      endYear: 2026,
      endMonth: 1,
      cycleEnabled: false,
    })
    const dec = payload.monthly.find((m) => m.month === "2025-12")!
    expect(dec.income_kd).toBe("0.000")
    expect(dec.expense_kd).toBe("200.000")
  })

  it("accumulates income and expense separately for 2026-01", async () => {
    const payload = await computeDashboardMetricsPayload(10, makeDbReturning(mockRows), {
      months: 2,
      endYear: 2026,
      endMonth: 1,
      cycleEnabled: false,
    })
    const jan = payload.monthly.find((m) => m.month === "2026-01")!
    expect(jan.income_kd).toBe("600.000")
    expect(jan.expense_kd).toBe("250.000")
  })

  it("builds expense_by_category with string KD values", async () => {
    const payload = await computeDashboardMetricsPayload(10, makeDbReturning(mockRows), {
      months: 2,
      endYear: 2026,
      endMonth: 1,
      cycleEnabled: false,
    })
    expect(payload.expense_by_category["2026-01"]["Food"]).toBe("150.000")
    expect(payload.expense_by_category["2026-01"]["Transport"]).toBe("100.000")
    expect(payload.expense_by_category["2025-12"]["Food"]).toBe("200.000")
  })

  it("emits string KD values, not numbers", async () => {
    const payload = await computeDashboardMetricsPayload(10, makeDbReturning(mockRows), {
      months: 2,
      endYear: 2026,
      endMonth: 1,
      cycleEnabled: false,
    })
    for (const entry of payload.monthly) {
      expect(typeof entry.income_kd).toBe("string")
      expect(typeof entry.expense_kd).toBe("string")
    }
  })
})

// ── computeDashboardMetricsPayload — Fixture B: empty month ───────────────────
// A month with no transactions should still appear with 0.000 values.

describe("computeDashboardMetricsPayload — Fixture B: empty month emits zeroes", () => {
  it("emits 0.000 for months with no matching rows", async () => {
    const payload = await computeDashboardMetricsPayload(10, makeDbReturning([]), {
      months: 2,
      endYear: 2026,
      endMonth: 1,
      cycleEnabled: false,
    })
    expect(payload.months).toEqual(["2025-12", "2026-01"])
    for (const entry of payload.monthly) {
      expect(entry.income_kd).toBe("0.000")
      expect(entry.expense_kd).toBe("0.000")
    }
  })
})

// ── computeDashboardMetricsPayload — Fixture C: uncategorized ─────────────────
// Null catName should fall back to "Uncategorized".

describe("computeDashboardMetricsPayload — Fixture C: null catName becomes Uncategorized", () => {
  it("groups null category as Uncategorized in expense_by_category", async () => {
    const rows = [{ ym: "2026-01", catName: null, total: "75.000", isIncome: 0 }]
    const payload = await computeDashboardMetricsPayload(10, makeDbReturning(rows), {
      months: 1,
      endYear: 2026,
      endMonth: 1,
      cycleEnabled: false,
    })
    expect(payload.expense_by_category["2026-01"]["Uncategorized"]).toBe("75.000")
  })
})

// ── rebuildDashboardSnapshot — smoke test ────────────────────────────────────

describe("rebuildDashboardSnapshot", () => {
  it("resolves without throwing with an empty mock DB", async () => {
    await expect(
      rebuildDashboardSnapshot(10, makeDbReturning([]), {
        monthsCount: 2,
        windowEndMonth: "2026-01",
      }),
    ).resolves.toBeUndefined()
  })
})
