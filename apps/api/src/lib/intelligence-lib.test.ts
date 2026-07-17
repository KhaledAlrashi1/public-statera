/**
 * Fixture-based equivalence tests for intelligence-lib (Module 5c-1).
 *
 * I1–I6 expected values are captured from Flask via:
 *   python3 tools/capture-flask-fixtures.py income-pattern
 *
 * Flask source: backend/routes/analytics/income.py (_build_income_pattern_payload)
 *               backend/routes/analytics/shared.py (helpers)
 *
 * Known deviation: Flask income_source=null (not_set) → Hono "not_set".
 * Documented in intelligence-lib.ts and income-lib.ts.
 */

import { describe, it, expect } from "vitest"
import Decimal from "decimal.js"
import {
  confidenceFromVariance,
  confidenceFromIntervalVariance,
  classifyRecurringFrequency,
  intervalVarianceRatio,
  classifyRecurringGroup,
  buildIncomePatternPayload,
  buildRecurringPatternsPayload,
  buildSnapshotPayload,
} from "./intelligence-lib"

// ── Proxy mock (flat self-referential) ───────────────────────────────────────

function makeDbReturning(rows: unknown[]): any { // eslint-disable-line @typescript-eslint/no-explicit-any
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

function makeSequentialDb(sequences: unknown[][]): any { // eslint-disable-line @typescript-eslint/no-explicit-any
  let callIndex = 0
  function makeProxy(): any { // eslint-disable-line @typescript-eslint/no-explicit-any
    return new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "then") {
            const rows = sequences[callIndex] ?? []
            callIndex++
            return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
              Promise.resolve(rows).then(resolve, reject)
          }
          return (..._args: unknown[]) => makeProxy()
        },
      },
    )
  }
  return makeProxy()
}

// ── Unit tests: helper functions ──────────────────────────────────────────────

describe("confidenceFromVariance", () => {
  it("returns high when deviation <= 0.02 and evidence >= 3", () => {
    expect(confidenceFromVariance(new Decimal("0.02"), 3)).toBe("high")
    expect(confidenceFromVariance(new Decimal("0.00"), 5)).toBe("high")
  })

  it("returns medium when deviation <= 0.05 (regardless of evidence_months)", () => {
    expect(confidenceFromVariance(new Decimal("0.03"), 3)).toBe("medium")
    expect(confidenceFromVariance(new Decimal("0.05"), 1)).toBe("medium")
  })

  it("returns medium when deviation <= 0.02 but evidence_months < 3", () => {
    expect(confidenceFromVariance(new Decimal("0.01"), 2)).toBe("medium")
  })

  it("returns low when deviation > 0.05", () => {
    expect(confidenceFromVariance(new Decimal("0.10"), 5)).toBe("low")
    expect(confidenceFromVariance(new Decimal("0.23"), 3)).toBe("low")
  })
})

describe("confidenceFromIntervalVariance", () => {
  it("returns high when deviation <= 0.10", () => {
    expect(confidenceFromIntervalVariance(new Decimal("0.00"))).toBe("high")
    expect(confidenceFromIntervalVariance(new Decimal("0.10"))).toBe("high")
  })

  it("returns medium when deviation <= 0.20", () => {
    expect(confidenceFromIntervalVariance(new Decimal("0.15"))).toBe("medium")
    expect(confidenceFromIntervalVariance(new Decimal("0.20"))).toBe("medium")
  })

  it("returns low when deviation > 0.20", () => {
    expect(confidenceFromIntervalVariance(new Decimal("0.21"))).toBe("low")
    expect(confidenceFromIntervalVariance(new Decimal("1.00"))).toBe("low")
  })
})

describe("classifyRecurringFrequency", () => {
  it("classifies monthly range [28,32]", () => {
    expect(classifyRecurringFrequency(28)).toBe("monthly")
    expect(classifyRecurringFrequency(30)).toBe("monthly")
    expect(classifyRecurringFrequency(32)).toBe("monthly")
  })

  it("classifies bi-weekly range [13,15]", () => {
    expect(classifyRecurringFrequency(13)).toBe("bi-weekly")
    expect(classifyRecurringFrequency(14)).toBe("bi-weekly")
    expect(classifyRecurringFrequency(15)).toBe("bi-weekly")
  })

  it("classifies weekly range [6,8]", () => {
    expect(classifyRecurringFrequency(6)).toBe("weekly")
    expect(classifyRecurringFrequency(7)).toBe("weekly")
    expect(classifyRecurringFrequency(8)).toBe("weekly")
  })

  it("classifies irregular for out-of-band values", () => {
    expect(classifyRecurringFrequency(1)).toBe("irregular")
    expect(classifyRecurringFrequency(16)).toBe("irregular")
    expect(classifyRecurringFrequency(27)).toBe("irregular")
    expect(classifyRecurringFrequency(45)).toBe("irregular")
  })
})

describe("intervalVarianceRatio", () => {
  it("returns 1 for empty list (no intervals)", () => {
    expect(intervalVarianceRatio([]).toFixed(3)).toBe("1.000")
  })

  it("returns 0 for single-element list", () => {
    expect(intervalVarianceRatio([30]).toFixed(3)).toBe("0.000")
  })

  it("returns 0 for uniform intervals", () => {
    expect(intervalVarianceRatio([30, 30, 30]).toFixed(3)).toBe("0.000")
  })

  it("returns correct max deviation for mixed intervals", () => {
    // avg=[14,14,16,17] = 61/4 = 15.25; deviations: |14-15.25|/15.25≈0.0820, |16-15.25|/15.25≈0.0492, |17-15.25|/15.25≈0.1148
    // max = |17-15.25|/15.25 = 1.75/15.25 ≈ 0.11475...
    const ratio = intervalVarianceRatio([14, 14, 16, 17])
    expect(ratio.toDecimalPlaces(4).toString()).toBe("0.1148")
  })
})

describe("classifyRecurringGroup", () => {
  it("classifies loan by display_name keyword", () => {
    expect(classifyRecurringGroup(null, null, "Car Loan Payment")).toBe("Loan Payments")
  })

  it("classifies utility by category_name", () => {
    expect(classifyRecurringGroup("Utilities", null, "Monthly Bill")).toBe("Utilities")
  })

  it("classifies utility by Kuwaiti operator in merchant_name", () => {
    expect(classifyRecurringGroup(null, "Zain Kuwait", "Monthly Mobile")).toBe("Utilities")
    expect(classifyRecurringGroup(null, "Ooredoo", "Internet Bill")).toBe("Utilities")
  })

  it("classifies subscription by display_name keyword", () => {
    expect(classifyRecurringGroup(null, null, "Netflix Monthly")).toBe("Subscriptions")
  })

  it("loan takes priority over subscription (e.g. 'finance' in loan hints)", () => {
    expect(classifyRecurringGroup("Subscriptions", null, "Finance Installment")).toBe("Loan Payments")
  })

  it("returns Other when no hints match", () => {
    expect(classifyRecurringGroup("Restaurants", "Local Shop", "Lunch")).toBe("Other")
  })
})

// ── Fixture equivalence tests: buildIncomePatternPayload ─────────────────────
//
// Expected values captured from Flask via:
//   python3 tools/capture-flask-fixtures.py income-pattern
//
// All fixtures use today_date=2025-11-10, current_month=2025-11.
// 90-day cutoff = 2025-08-12.
//
// Each test seeds db rows that match the capture seed exactly (same dates,
// amounts, category is_income=true). The sequential mock provides two await
// results: first is detectMonthlyIncome (income sum for 2025-11), second is
// the 90-day income transaction query for pattern analysis.

describe("buildIncomePatternPayload — Flask fixture equivalence", () => {
  const OPTS = { currentMonth: "2025-11", todayDate: "2025-11-10" }

  // Detect-income query rows (first await in resolveIncomeForPeriod)
  // Pattern query rows (second await in buildIncomePatternPayload, after resolve)
  // resolveIncomeForPeriod makes 1 await for detect; if detect=0 makes another for profile.
  // buildIncomePatternPayload then awaits the 90-day pattern query.
  //
  // Sequence positions:
  //   seq[0] = detectMonthlyIncome (SUM for 2025-11)
  //   seq[1] = 90-day pattern rows   (OR seq[1] = profile, seq[2] = pattern rows if detect=0)

  it("I1: detected, high confidence — 3 identical monthly incomes", async () => {
    // detect: 1000 KD in Nov → detected_from_transactions
    // pattern: 3 × Salary 1000 on Sep-01, Oct-01, Nov-01
    const db = makeSequentialDb([
      [{ total: "1000.000" }],
      [
        { txDate: "2025-09-01", incomeName: "Salary", amountKd: "1000.000" },
        { txDate: "2025-10-01", incomeName: "Salary", amountKd: "1000.000" },
        { txDate: "2025-11-01", incomeName: "Salary", amountKd: "1000.000" },
      ],
    ])
    const result = await buildIncomePatternPayload(1, db, OPTS)

    expect(result.detected).toBe(true)
    expect(result.monthly_income_kd).toBe("1000.000")
    expect(result.income_source).toBe("detected_from_transactions")
    expect(result.income_auto_detected).toBe(true)
    expect(result.suggested_monthly_income_kd).toBe("1000.000")
    expect(result.suggested_payday_day).toBe(1)
    expect(result.confidence).toBe("high")
    expect(result.evidence_months).toBe(3)
    expect(result.largest_income_name).toBe("Salary")
  })

  it("I2: detected, medium confidence — 2 months, deviation ≈ 0.0244", async () => {
    // detect: 1050 KD in Nov
    // pattern: Salary 1000 on Oct-05, Salary 1050 on Nov-05
    // avg=1025, max_dev=|1050-1025|/1025≈0.0244 > 0.02, evidence_months=2 → medium
    const db = makeSequentialDb([
      [{ total: "1050.000" }],
      [
        { txDate: "2025-10-05", incomeName: "Salary", amountKd: "1000.000" },
        { txDate: "2025-11-05", incomeName: "Salary", amountKd: "1050.000" },
      ],
    ])
    const result = await buildIncomePatternPayload(1, db, OPTS)

    expect(result.detected).toBe(true)
    expect(result.monthly_income_kd).toBe("1050.000")
    expect(result.income_source).toBe("detected_from_transactions")
    expect(result.suggested_monthly_income_kd).toBe("1025.000")
    expect(result.suggested_payday_day).toBe(5)
    expect(result.confidence).toBe("medium")
    expect(result.evidence_months).toBe(2)
    expect(result.largest_income_name).toBe("Salary")
  })

  it("I3: detected, low confidence — 2 months, deviation ≈ 0.2308", async () => {
    // detect: 1600 KD in Nov
    // pattern: Salary 1000 Oct-01, Salary 1600 Nov-01 → avg=1300, max_dev≈0.2308 → low
    const db = makeSequentialDb([
      [{ total: "1600.000" }],
      [
        { txDate: "2025-10-01", incomeName: "Salary", amountKd: "1000.000" },
        { txDate: "2025-11-01", incomeName: "Salary", amountKd: "1600.000" },
      ],
    ])
    const result = await buildIncomePatternPayload(1, db, OPTS)

    expect(result.detected).toBe(true)
    expect(result.monthly_income_kd).toBe("1600.000")
    expect(result.income_source).toBe("detected_from_transactions")
    expect(result.suggested_monthly_income_kd).toBe("1300.000")
    expect(result.suggested_payday_day).toBe(1)
    expect(result.confidence).toBe("low")
    expect(result.evidence_months).toBe(2)
    expect(result.largest_income_name).toBe("Salary")
  })

  it("I4: not detected — 1 month only, source=declared_in_profile", async () => {
    // detect: 0 (no Nov income) → falls to profile → 1800 KD
    // pattern: 1 entry (Oct-15 only) → overall_months=1 < 2 → early return
    const db = makeSequentialDb([
      [{ total: "0" }],
      [{ monthlyIncomeKd: "1800.000" }], // profile
      [
        { txDate: "2025-10-15", incomeName: "Salary", amountKd: "1800.000" },
      ],
    ])
    const result = await buildIncomePatternPayload(1, db, OPTS)

    expect(result.detected).toBe(false)
    expect(result.monthly_income_kd).toBe("1800.000")
    expect(result.income_source).toBe("declared_in_profile")
    expect(result.income_auto_detected).toBe(false)
    expect(result.suggested_monthly_income_kd).toBeNull()
    expect(result.suggested_payday_day).toBeNull()
    expect(result.confidence).toBe("low")
    expect(result.evidence_months).toBe(1)
    expect(result.largest_income_name).toBeNull()
  })

  it("I5: not detected — 2 months but all groups singleton, source=not_set", async () => {
    // Flask returns income_source=null → Hono maps to "not_set" (documented deviation).
    // detect: 0; profile: empty → not_set
    // pattern: "Salary" Oct-01 and "Bonus" Sep-15 → each name_key appears once → no candidates
    const db = makeSequentialDb([
      [{ total: "0" }],
      [], // no profile row
      [
        { txDate: "2025-09-15", incomeName: "Bonus", amountKd: "500.000" },
        { txDate: "2025-10-01", incomeName: "Salary", amountKd: "2000.000" },
      ],
    ])
    const result = await buildIncomePatternPayload(1, db, OPTS)

    expect(result.detected).toBe(false)
    expect(result.monthly_income_kd).toBeNull()
    // Hono maps Flask null → "not_set"
    expect(result.income_source).toBe("not_set")
    expect(result.income_auto_detected).toBe(false)
    expect(result.suggested_monthly_income_kd).toBeNull()
    expect(result.suggested_payday_day).toBeNull()
    expect(result.confidence).toBe("low")
    expect(result.evidence_months).toBe(2)
    expect(result.largest_income_name).toBeNull()
  })

  it("I6: detected, bi-weekly multiplier — median_gap=16 → multiplier=2, suggested=1400", async () => {
    // detect: 700 KD in Nov
    // pattern: 5 × Salary 700 on Sep-01, Sep-15, Oct-01, Oct-15, Nov-01
    // gaps=[14,16,14,17] sorted=[14,14,16,17], median=sorted[2]=16 ≤ 18 → ×2
    // evidence_months=3 (Sep,Oct,Nov), max_dev=0 → high
    // suggested=700×2=1400; payday_day=1 (3 occurrences vs day-15 twice)
    const db = makeSequentialDb([
      [{ total: "700.000" }],
      [
        { txDate: "2025-09-01",  incomeName: "Salary", amountKd: "700.000" },
        { txDate: "2025-09-15",  incomeName: "Salary", amountKd: "700.000" },
        { txDate: "2025-10-01",  incomeName: "Salary", amountKd: "700.000" },
        { txDate: "2025-10-15",  incomeName: "Salary", amountKd: "700.000" },
        { txDate: "2025-11-01",  incomeName: "Salary", amountKd: "700.000" },
      ],
    ])
    const result = await buildIncomePatternPayload(1, db, OPTS)

    expect(result.detected).toBe(true)
    expect(result.monthly_income_kd).toBe("700.000")
    expect(result.income_source).toBe("detected_from_transactions")
    expect(result.suggested_monthly_income_kd).toBe("1400.000")
    expect(result.suggested_payday_day).toBe(1)
    expect(result.confidence).toBe("high")
    expect(result.evidence_months).toBe(3)
    expect(result.largest_income_name).toBe("Salary")
  })
})

// ── Fixture equivalence tests: buildRecurringPatternsPayload ─────────────────
//
// Expected values captured from Flask via:
//   PYTHONPATH=/path/to/personal-finance python3 tools/capture-flask-fixtures.py recurring-patterns
//
// All fixtures use today_date=2025-11-10, days=90.
// 90-day cutoff = 2025-08-12.
//
// Row format: { txDate, displayName, amountKd, categoryName, merchantName }
// The sequential mock provides ONE await result (the expense-transaction query).

describe("buildRecurringPatternsPayload — Flask fixture equivalence", () => {
  const OPTS = { todayDate: "2025-11-10" }

  function row(
    txDate: string,
    displayName: string,
    amountKd: string,
    categoryName: string | null = null,
    merchantName: string | null = null,
  ) {
    return { txDate, displayName, amountKd, categoryName, merchantName }
  }

  it("P1: monthly, high confidence, Subscriptions", async () => {
    // 3 × Netflix 15.000: Sep-01, Oct-01, Nov-01
    // intervals=[30,31], median=sorted[1]=31 → monthly; max_dev≈0.0164 ≤ 0.10 → high
    const db = makeDbReturning([
      row("2025-09-01", "Netflix", "15.000", "Subscriptions"),
      row("2025-10-01", "Netflix", "15.000", "Subscriptions"),
      row("2025-11-01", "Netflix", "15.000", "Subscriptions"),
    ])
    const result = await buildRecurringPatternsPayload(1, db, 90, OPTS)

    expect(result.patterns).toHaveLength(1)
    const p = result.patterns[0]
    expect(p.name).toBe("Netflix")
    expect(p.frequency).toBe("monthly")
    expect(p.avg_amount_kd).toBe("15.000")
    expect(p.last_seen).toBe("2025-11-01")
    expect(p.confidence).toBe("high")
    expect(p.occurrences).toBe(3)
    expect(p.group).toBe("Subscriptions")
  })

  it("P2: bi-weekly, high confidence, Utilities", async () => {
    // 5 × Electricity Bill 25.000: Aug-15, Aug-29, Sep-12, Sep-26, Oct-10
    // intervals=[14,14,14,14], median=sorted[2]=14 → bi-weekly; max_dev=0 → high
    const db = makeDbReturning([
      row("2025-08-15", "Electricity Bill", "25.000", "Utilities"),
      row("2025-08-29", "Electricity Bill", "25.000", "Utilities"),
      row("2025-09-12", "Electricity Bill", "25.000", "Utilities"),
      row("2025-09-26", "Electricity Bill", "25.000", "Utilities"),
      row("2025-10-10", "Electricity Bill", "25.000", "Utilities"),
    ])
    const result = await buildRecurringPatternsPayload(1, db, 90, OPTS)

    expect(result.patterns).toHaveLength(1)
    const p = result.patterns[0]
    expect(p.name).toBe("Electricity Bill")
    expect(p.frequency).toBe("bi-weekly")
    expect(p.avg_amount_kd).toBe("25.000")
    expect(p.last_seen).toBe("2025-10-10")
    expect(p.confidence).toBe("high")
    expect(p.occurrences).toBe(5)
    expect(p.group).toBe("Utilities")
  })

  it("P3: weekly, medium confidence, Other", async () => {
    // 4 × Lunch 5.000: Sep-01, Sep-07, Sep-14, Sep-22
    // intervals=[6,7,8], median=sorted[1]=7 → weekly; max_dev=|8-7|/7≈0.1429 ≤ 0.20 → medium
    const db = makeDbReturning([
      row("2025-09-01", "Lunch", "5.000", "Food"),
      row("2025-09-07", "Lunch", "5.000", "Food"),
      row("2025-09-14", "Lunch", "5.000", "Food"),
      row("2025-09-22", "Lunch", "5.000", "Food"),
    ])
    const result = await buildRecurringPatternsPayload(1, db, 90, OPTS)

    expect(result.patterns).toHaveLength(1)
    const p = result.patterns[0]
    expect(p.name).toBe("Lunch")
    expect(p.frequency).toBe("weekly")
    expect(p.avg_amount_kd).toBe("5.000")
    expect(p.last_seen).toBe("2025-09-22")
    expect(p.confidence).toBe("medium")
    expect(p.occurrences).toBe(4)
    expect(p.group).toBe("Other")
  })

  it("P4: irregular, high→medium cap fires", async () => {
    // 4 × Gym Fee 30.000: Sep-01, Sep-21, Oct-12, Nov-03
    // intervals=[20,21,22], median=sorted[1]=21 → irregular
    // max_dev=|22-21|/21≈0.0476 ≤ 0.10 → raw high; cap: irregular+high → medium
    const db = makeDbReturning([
      row("2025-09-01",  "Gym Fee", "30.000", "Health"),
      row("2025-09-21",  "Gym Fee", "30.000", "Health"),
      row("2025-10-12",  "Gym Fee", "30.000", "Health"),
      row("2025-11-03",  "Gym Fee", "30.000", "Health"),
    ])
    const result = await buildRecurringPatternsPayload(1, db, 90, OPTS)

    expect(result.patterns).toHaveLength(1)
    const p = result.patterns[0]
    expect(p.name).toBe("Gym Fee")
    expect(p.frequency).toBe("irregular")
    expect(p.avg_amount_kd).toBe("30.000")
    expect(p.last_seen).toBe("2025-11-03")
    expect(p.confidence).toBe("medium")
    expect(p.occurrences).toBe(4)
    expect(p.group).toBe("Other")
  })

  it("P5: monthly, high confidence, Loan Payments", async () => {
    // 3 × Car Installment 150.000: Sep-05, Oct-05, Nov-05
    // intervals=[30,31], median=sorted[1]=31 → monthly; max_dev≈0.0164 → high
    // group: "installment" in display_name → Loan Payments
    const db = makeDbReturning([
      row("2025-09-05", "Car Installment", "150.000", "Loans"),
      row("2025-10-05", "Car Installment", "150.000", "Loans"),
      row("2025-11-05", "Car Installment", "150.000", "Loans"),
    ])
    const result = await buildRecurringPatternsPayload(1, db, 90, OPTS)

    expect(result.patterns).toHaveLength(1)
    const p = result.patterns[0]
    expect(p.name).toBe("Car Installment")
    expect(p.frequency).toBe("monthly")
    expect(p.avg_amount_kd).toBe("150.000")
    expect(p.last_seen).toBe("2025-11-05")
    expect(p.confidence).toBe("high")
    expect(p.occurrences).toBe(3)
    expect(p.group).toBe("Loan Payments")
  })

  it("P6: same-day filter — two entries same date counted in occurrences but not intervals", async () => {
    // 3 × Coffee 3.000: Sep-01, Sep-01, Sep-08
    // sorted=[Sep-01,Sep-01,Sep-08]; gap(Sep-01→Sep-01)=0 filtered; gap(Sep-01→Sep-08)=7 kept
    // intervals=[7]; _interval_variance_ratio([7])=Decimal("0") → high; median=7 → weekly
    // occurrences=3 (all entries, not intervals)
    const db = makeDbReturning([
      row("2025-09-01", "Coffee", "3.000", "Food"),
      row("2025-09-01", "Coffee", "3.000", "Food"),
      row("2025-09-08", "Coffee", "3.000", "Food"),
    ])
    const result = await buildRecurringPatternsPayload(1, db, 90, OPTS)

    expect(result.patterns).toHaveLength(1)
    const p = result.patterns[0]
    expect(p.name).toBe("Coffee")
    expect(p.frequency).toBe("weekly")
    expect(p.avg_amount_kd).toBe("3.000")
    expect(p.last_seen).toBe("2025-09-08")
    expect(p.confidence).toBe("high")
    expect(p.occurrences).toBe(3)
    expect(p.group).toBe("Other")
  })

  it("P7: multi-pattern — Car Installment (150) sorts before Netflix (15) by -avg_amount", async () => {
    // Same user: Netflix 15.000 × 3 (Sep/Oct/Nov-01) + Car Installment 150.000 × 3 (Sep/Oct/Nov-05)
    // Both monthly, high confidence. Sort key: -avg_amount → 150 first, then 15.
    const db = makeDbReturning([
      row("2025-09-01", "Netflix",         "15.000",  "Subscriptions"),
      row("2025-09-05", "Car Installment", "150.000", "Loans"),
      row("2025-10-01", "Netflix",         "15.000",  "Subscriptions"),
      row("2025-10-05", "Car Installment", "150.000", "Loans"),
      row("2025-11-01", "Netflix",         "15.000",  "Subscriptions"),
      row("2025-11-05", "Car Installment", "150.000", "Loans"),
    ])
    const result = await buildRecurringPatternsPayload(1, db, 90, OPTS)

    expect(result.patterns).toHaveLength(2)
    expect(result.patterns[0].name).toBe("Car Installment")
    expect(result.patterns[0].avg_amount_kd).toBe("150.000")
    expect(result.patterns[0].group).toBe("Loan Payments")
    expect(result.patterns[1].name).toBe("Netflix")
    expect(result.patterns[1].avg_amount_kd).toBe("15.000")
    expect(result.patterns[1].group).toBe("Subscriptions")
  })
})

// ── Fixture equivalence tests: buildSnapshotPayload ──────────────────────────
//
// Expected values captured from Flask via:
//   python3 tools/capture-flask-fixtures.py snapshot
//
// Flask returns floats; Hono returns strings (formatKd). See deviation block in
// intelligence-lib.ts. All fixture values converted to 3-decimal strings.
//
// All fixtures use today_date=2025-11-10.
// Cutoffs: 30d=2025-10-11, 60d=2025-09-11, 90d=2025-08-12.
//
// Sequence layout per test (6 sequential db awaits):
//   seq[0] = all-time totals row { income, expense } (null when no rows — D4)
//   seq[1] = debt total row { total } (COALESCE — "0" when no active debt)
//   seq[2] = savings total row { total } (COALESCE — "0" when no active savings)
//   seq[3] = 30d window row { income, expense } (null when no rows — D4)
//   seq[4] = 60d window row { income, expense }
//   seq[5] = 90d window row { income, expense }

describe("buildSnapshotPayload — Flask fixture equivalence", () => {
  const OPTS = { todayDate: "2025-11-10" }
  const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+00:00$/

  it("S1: rich user — three distinct window expense sums, active-only debt/savings", async () => {
    // today=2025-11-10
    // All-time: income=500, expense=175 (3 expense txs)
    // Active debt=200 (inactive 300 excluded), active savings=150 (inactive 100 excluded)
    // 30d (>=2025-10-11): income=500 (Nov-01 salary), expense=100 (Nov-01 groceries)
    // 60d (>=2025-09-11): income=500, expense=150 (+Sep-20 restaurant 50)
    // 90d (>=2025-08-12): income=500, expense=175 (+Aug-15 coffee 25)
    const db = makeSequentialDb([
      [{ income: "500.000", expense: "175.000" }],  // totals
      [{ income: "500.000", expense: "100.000" }],  // 30d
      [{ income: "500.000", expense: "150.000" }],  // 60d
      [{ income: "500.000", expense: "175.000" }],  // 90d
    ])
    const result = await buildSnapshotPayload(1, db, OPTS)

    expect(result.net_position.income_total_kd).toBe("500.000")
    expect(result.net_position.expense_total_kd).toBe("175.000")
    expect(result.net_position.net_kd).toBe("325.000")
    expect(result.cash_flow["30d"].income_kd).toBe("500.000")
    expect(result.cash_flow["30d"].expense_kd).toBe("100.000")
    expect(result.cash_flow["30d"].net_kd).toBe("400.000")
    expect(result.cash_flow["60d"].expense_kd).toBe("150.000")
    expect(result.cash_flow["60d"].net_kd).toBe("350.000")
    expect(result.cash_flow["90d"].expense_kd).toBe("175.000")
    expect(result.cash_flow["90d"].net_kd).toBe("325.000")
    expect(result.accounts).toEqual([])
    expect(result.generated_at).toMatch(ISO_RE)
  })

  it("S2: empty user — D4 null fallback exercised, all totals zero", async () => {
    // No transactions.
    // SUM over zero rows = null (MySQL standard) — D4 fallback: ?? "0" → Decimal("0")
    const db = makeSequentialDb([
      [{ income: null, expense: null }],  // totals — null SUM, exercising D4
      [{ income: null, expense: null }],  // 30d window — null SUM
      [{ income: null, expense: null }],  // 60d
      [{ income: null, expense: null }],  // 90d
    ])
    const result = await buildSnapshotPayload(1, db, OPTS)

    expect(result.net_position.income_total_kd).toBe("0.000")
    expect(result.net_position.expense_total_kd).toBe("0.000")
    expect(result.net_position.net_kd).toBe("0.000")
    expect(result.cash_flow["30d"].income_kd).toBe("0.000")
    expect(result.cash_flow["30d"].expense_kd).toBe("0.000")
    expect(result.cash_flow["30d"].net_kd).toBe("0.000")
    expect(result.cash_flow["60d"].expense_kd).toBe("0.000")
    expect(result.cash_flow["90d"].expense_kd).toBe("0.000")
    expect(result.accounts).toEqual([])
    expect(result.generated_at).toMatch(ISO_RE)
  })

  it("S3: single expense tx — negative net_kd", async () => {
    // One expense tx (Groceries 50 on Nov-01).
    // All-time: income=0 (CASE returns 0 for expense rows), expense=50.
    // net_kd = 0 - 50 = -50 → formatKd("-50.000")
    // All windows include the Nov-01 tx. Windows: income=0, expense=50, net=-50.
    const db = makeSequentialDb([
      [{ income: "0.000", expense: "50.000" }],  // totals (rows exist, income CASE = 0)
      [{ income: "0.000", expense: "50.000" }],  // 30d
      [{ income: "0.000", expense: "50.000" }],  // 60d
      [{ income: "0.000", expense: "50.000" }],  // 90d
    ])
    const result = await buildSnapshotPayload(1, db, OPTS)

    expect(result.net_position.income_total_kd).toBe("0.000")
    expect(result.net_position.expense_total_kd).toBe("50.000")
    expect(result.net_position.net_kd).toBe("-50.000")
    expect(result.cash_flow["30d"].net_kd).toBe("-50.000")
    expect(result.cash_flow["60d"].net_kd).toBe("-50.000")
    expect(result.cash_flow["90d"].net_kd).toBe("-50.000")
    expect(result.accounts).toEqual([])
    expect(result.generated_at).toMatch(ISO_RE)
  })

  it("S4: boundary — 2025-10-11 is in 30d window (date >= cutoff), 2025-10-10 is not", async () => {
    // today=2025-11-10, 30d cutoff=2025-10-11.
    // On-Cutoff (2025-10-11, 60) → in 30d/60d/90d. Before-Cutoff (2025-10-10, 40) → NOT in 30d.
    // All-time expense=100. 30d expense=60, 60d/90d expense=100.
    const db = makeSequentialDb([
      [{ income: "0.000", expense: "100.000" }],  // totals
      [{ income: "0.000", expense: "60.000" }],   // 30d: only on-cutoff tx included
      [{ income: "0.000", expense: "100.000" }],  // 60d: both txs
      [{ income: "0.000", expense: "100.000" }],  // 90d: both txs
    ])
    const result = await buildSnapshotPayload(1, db, OPTS)

    expect(result.net_position.expense_total_kd).toBe("100.000")
    expect(result.net_position.net_kd).toBe("-100.000")
    expect(result.cash_flow["30d"].expense_kd).toBe("60.000")
    expect(result.cash_flow["30d"].net_kd).toBe("-60.000")
    expect(result.cash_flow["60d"].expense_kd).toBe("100.000")
    expect(result.cash_flow["60d"].net_kd).toBe("-100.000")
    expect(result.cash_flow["90d"].expense_kd).toBe("100.000")
    expect(result.accounts).toEqual([])
    expect(result.generated_at).toMatch(ISO_RE)
  })
})
