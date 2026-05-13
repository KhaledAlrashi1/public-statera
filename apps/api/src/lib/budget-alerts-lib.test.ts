import { describe, it, expect } from "vitest"
import Decimal from "decimal.js"
import {
  buildBudgetAlertKey,
  parseBudgetAlertIdentity,
  collectMonthAlertKeySets,
  loadDismissedBudgetAlertKeys,
  listActiveBudgetAlerts,
  formatMonthLabel,
  roundRatio,
  BUDGET_ALERT_EVENT_NAME,
  BUDGET_ALERT_DISMISSED_EVENT_NAME,
} from "./budget-alerts-lib"

// ── DB mock ───────────────────────────────────────────────────────────────────

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

// ── buildBudgetAlertKey ───────────────────────────────────────────────────────

describe("buildBudgetAlertKey", () => {
  it("formats as YYYY-MM:categoryId", () => {
    expect(buildBudgetAlertKey("2026-05", 7)).toBe("2026-05:7")
  })
})

// ── parseBudgetAlertIdentity ──────────────────────────────────────────────────

describe("parseBudgetAlertIdentity", () => {
  it("returns [key, month] from fully populated properties", () => {
    const props = JSON.stringify({ alert_key: "2026-05:3", month: "2026-05" })
    expect(parseBudgetAlertIdentity(props)).toEqual(["2026-05:3", "2026-05"])
  })

  it("derives month from alertKey when month field is absent", () => {
    const props = JSON.stringify({ alert_key: "2026-05:3" })
    expect(parseBudgetAlertIdentity(props)).toEqual(["2026-05:3", "2026-05"])
  })

  it("builds alertKey from month + category_id when key field is absent", () => {
    const props = JSON.stringify({ month: "2026-05", category_id: 3 })
    expect(parseBudgetAlertIdentity(props)).toEqual(["2026-05:3", "2026-05"])
  })

  it("returns [null, null] when propertiesJson is null", () => {
    expect(parseBudgetAlertIdentity(null)).toEqual([null, null])
  })

  it("returns [null, null] when propertiesJson is empty object", () => {
    expect(parseBudgetAlertIdentity("{}")).toEqual([null, null])
  })

  it("returns [null, null] when month is invalid format", () => {
    const props = JSON.stringify({ alert_key: "bad-key:3", month: "26-5" })
    expect(parseBudgetAlertIdentity(props)).toEqual([null, null])
  })

  it("returns [null, null] for malformed JSON", () => {
    expect(parseBudgetAlertIdentity("{not json}")).toEqual([null, null])
  })
})

// ── formatMonthLabel ──────────────────────────────────────────────────────────

describe("formatMonthLabel", () => {
  it("formats YYYY-MM as 'Month YYYY'", () => {
    expect(formatMonthLabel("2026-05")).toBe("May 2026")
  })

  it("formats January correctly", () => {
    expect(formatMonthLabel("2025-01")).toBe("January 2025")
  })

  it("returns 'Invalid Date' for unparseable input (toLocaleString does not throw)", () => {
    expect(formatMonthLabel("invalid")).toBe("Invalid Date")
  })
})

// ── roundRatio ────────────────────────────────────────────────────────────────

describe("roundRatio", () => {
  it("returns spent / budget rounded to 4 decimal places", () => {
    const spent = new Decimal("190")
    const budget = new Decimal("200")
    expect(roundRatio(spent, budget)).toBe(0.95)
  })

  it("returns 0 when budget is zero", () => {
    expect(roundRatio(new Decimal("100"), new Decimal("0"))).toBe(0)
  })

  it("rounds to 4 decimal places", () => {
    const result = roundRatio(new Decimal("1"), new Decimal("3"))
    expect(String(result)).toMatch(/^\d+\.\d{1,4}$/)
    expect(result).toBe(0.3333)
  })
})

// ── collectMonthAlertKeySets ──────────────────────────────────────────────────

describe("collectMonthAlertKeySets", () => {
  it("returns empty sets when no events exist", async () => {
    const db = makeDbReturning([])
    const result = await collectMonthAlertKeySets("2026-05", db)
    expect(result.existing.size).toBe(0)
    expect(result.dismissed.size).toBe(0)
  })

  it("populates existing set from budget_alert events", async () => {
    const db = makeDbReturning([
      {
        userId: 1,
        eventName: BUDGET_ALERT_EVENT_NAME,
        propertiesJson: JSON.stringify({ alert_key: "2026-05:3", month: "2026-05" }),
      },
    ])
    const { existing, dismissed } = await collectMonthAlertKeySets("2026-05", db)
    expect(existing.has("1||2026-05:3")).toBe(true)
    expect(dismissed.size).toBe(0)
  })

  it("populates dismissed set from budget_alert_dismissed events", async () => {
    const db = makeDbReturning([
      {
        userId: 2,
        eventName: BUDGET_ALERT_DISMISSED_EVENT_NAME,
        propertiesJson: JSON.stringify({ alert_key: "2026-05:7", month: "2026-05" }),
      },
    ])
    const { existing, dismissed } = await collectMonthAlertKeySets("2026-05", db)
    expect(dismissed.has("2||2026-05:7")).toBe(true)
    expect(existing.size).toBe(0)
  })

  it("ignores events for a different month", async () => {
    const db = makeDbReturning([
      {
        userId: 1,
        eventName: BUDGET_ALERT_EVENT_NAME,
        propertiesJson: JSON.stringify({ alert_key: "2026-04:3", month: "2026-04" }),
      },
    ])
    const { existing } = await collectMonthAlertKeySets("2026-05", db)
    expect(existing.size).toBe(0)
  })
})

// ── loadDismissedBudgetAlertKeys ──────────────────────────────────────────────

describe("loadDismissedBudgetAlertKeys", () => {
  it("returns empty set when no dismissed events exist", async () => {
    const db = makeDbReturning([])
    const result = await loadDismissedBudgetAlertKeys(1, "2026-05", db)
    expect(result.size).toBe(0)
  })

  it("returns alert keys for matching month", async () => {
    const db = makeDbReturning([
      { propertiesJson: JSON.stringify({ alert_key: "2026-05:3", month: "2026-05" }) },
    ])
    const result = await loadDismissedBudgetAlertKeys(1, "2026-05", db)
    expect(result.has("2026-05:3")).toBe(true)
  })

  it("ignores keys for a different month", async () => {
    const db = makeDbReturning([
      { propertiesJson: JSON.stringify({ alert_key: "2026-04:3", month: "2026-04" }) },
    ])
    const result = await loadDismissedBudgetAlertKeys(1, "2026-05", db)
    expect(result.size).toBe(0)
  })
})

// ── listActiveBudgetAlerts ────────────────────────────────────────────────────

function makeAlertEvent(overrides: Record<string, unknown> = {}) {
  const props = {
    alert_key: "2026-05:1",
    month: "2026-05",
    category: "Groceries",
    category_id: 1,
    budget_kd: "200.000",
    spent_kd: "190.000",
    ratio: 0.95,
    threshold: 0.9,
    ...overrides,
  }
  return {
    id: 1,
    eventName: BUDGET_ALERT_EVENT_NAME,
    propertiesJson: JSON.stringify(props),
    eventTs: new Date("2026-05-10T09:00:00.000Z"),
  }
}

describe("listActiveBudgetAlerts", () => {
  it("returns an active alert for the correct month", async () => {
    const db = makeDbReturning([makeAlertEvent()])
    const items = await listActiveBudgetAlerts(1, "2026-05", db)
    expect(items).toHaveLength(1)
    expect(items[0]!.alert_key).toBe("2026-05:1")
    expect(items[0]!.category).toBe("Groceries")
    expect(items[0]!.ratio).toBe(0.95)
    expect(items[0]!.type).toBe("budget_alert")
  })

  it("excludes dismissed alerts", async () => {
    const rows = [
      makeAlertEvent(),
      {
        id: 2,
        eventName: BUDGET_ALERT_DISMISSED_EVENT_NAME,
        propertiesJson: JSON.stringify({ alert_key: "2026-05:1", month: "2026-05" }),
        eventTs: new Date("2026-05-11T09:00:00.000Z"),
      },
    ]
    const db = makeDbReturning(rows)
    const items = await listActiveBudgetAlerts(1, "2026-05", db)
    expect(items).toHaveLength(0)
  })

  it("ignores alerts for a different month", async () => {
    const db = makeDbReturning([makeAlertEvent({ alert_key: "2026-04:1", month: "2026-04" })])
    const items = await listActiveBudgetAlerts(1, "2026-05", db)
    expect(items).toHaveLength(0)
  })

  it("deduplicates: only the first (most recent) alert per key is returned", async () => {
    const rows = [
      { ...makeAlertEvent(), id: 10, eventTs: new Date("2026-05-12T00:00:00Z") },
      { ...makeAlertEvent(), id: 5,  eventTs: new Date("2026-05-10T00:00:00Z") },
    ]
    const db = makeDbReturning(rows)
    const items = await listActiveBudgetAlerts(1, "2026-05", db)
    expect(items).toHaveLength(1)
    expect(items[0]!.id).toBe(10)
  })

  it("sorts by ratio descending", async () => {
    const rows = [
      makeAlertEvent({ alert_key: "2026-05:1", ratio: 0.92, category_id: 1 }),
      makeAlertEvent({ alert_key: "2026-05:2", ratio: 0.98, category_id: 2 }),
    ]
    const db = makeDbReturning(rows)
    const items = await listActiveBudgetAlerts(1, "2026-05", db)
    expect(items[0]!.ratio).toBe(0.98)
    expect(items[1]!.ratio).toBe(0.92)
  })

  it("respects the limit option", async () => {
    const rows = [1, 2, 3, 4, 5].map((i) =>
      makeAlertEvent({ alert_key: `2026-05:${i}`, category_id: i }),
    )
    const db = makeDbReturning(rows)
    const items = await listActiveBudgetAlerts(1, "2026-05", db, { limit: 2 })
    expect(items).toHaveLength(2)
  })

  it("formats created_at as ISO +00:00 timestamp", async () => {
    const db = makeDbReturning([makeAlertEvent()])
    const items = await listActiveBudgetAlerts(1, "2026-05", db)
    expect(items[0]!.created_at).toMatch(/\+00:00$/)
  })
})
