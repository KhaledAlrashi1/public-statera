/**
 * Fixture-based equivalence tests against the Python debt_calculator.py
 * reference implementation. Expected values are hardcoded from a single
 * Python run — assertions are byte-for-byte string equality to catch subtle
 * rounding-mode divergences between Python Decimal and decimal.js.
 */
import { describe, it, expect } from "vitest"
import Decimal from "decimal.js"
import { avalanchePlan, snowballPlan, minimumRequiredPayment, addMonths } from "./debt-calculator"

// ── addMonths ─────────────────────────────────────────────────────────────────

describe("addMonths", () => {
  it("returns same date for 0 months", () => {
    expect(addMonths("2026-01-01", 0)).toBe("2026-01-01")
  })
  it("handles year rollover", () => {
    expect(addMonths("2026-11-01", 2)).toBe("2027-01-01")
  })
  it("handles Dec → Jan rollover", () => {
    expect(addMonths("2026-12-01", 1)).toBe("2027-01-01")
  })
  it("advances single month", () => {
    expect(addMonths("2026-01-01", 5)).toBe("2026-06-01")
  })
})

// ── minimumRequiredPayment ────────────────────────────────────────────────────

describe("minimumRequiredPayment", () => {
  it("returns 0 for empty list", () => {
    expect(minimumRequiredPayment([]).toFixed(3)).toBe("0.000")
  })
  it("returns sum of minimums", () => {
    const debts = [
      { balance_kd: "300.000", minimum_payment_kd: "15.000" },
      { balance_kd: "500.000", minimum_payment_kd: "20.000" },
    ]
    expect(minimumRequiredPayment(debts).toFixed(3)).toBe("35.000")
  })
  it("skips zero-balance debts", () => {
    const debts = [
      { balance_kd: "0.000", minimum_payment_kd: "10.000" },
      { balance_kd: "200.000", minimum_payment_kd: "25.000" },
    ]
    expect(minimumRequiredPayment(debts).toFixed(3)).toBe("25.000")
  })
})

// ── Fixture 1: single debt, avalanche ────────────────────────────────────────
// Python: avalanche_plan([{'id':1,'name':'Visa','balance_kd':'500.000',
//   'apr_pct':'18.000','minimum_payment_kd':'25.000'}], Decimal('100.000'),
//   start_date=date(2026,1,1))

describe("Fixture 1 — single debt, avalanche", () => {
  const debts = [{ id: 1, name: "Visa", balance_kd: "500.000", apr_pct: "18.000", minimum_payment_kd: "25.000" }]
  const plan = avalanchePlan(debts, new Decimal("100.000"), "2026-01-01")

  it("strategy", () => expect(plan.strategy).toBe("avalanche"))
  it("total_months", () => expect(plan.total_months).toBe(6))
  it("total_interest_paid", () => expect(plan.total_interest_paid).toBe("23.767"))
  it("debt_free_date", () => expect(plan.debt_free_date).toBe("2026-06-01"))
  it("debt_free_impossible", () => expect(plan.debt_free_impossible).toBe(false))
  it("payoff_order[0].balance", () => expect(plan.payoff_order[0].balance).toBe("500.000"))
  it("payoff_order[0].rate", () => expect(plan.payoff_order[0].rate).toBe("18.000"))
  it("payoff_order[0].interest_paid", () => expect(plan.payoff_order[0].interest_paid).toBe("23.767"))
  it("payoff_order[0].payoff_date", () => expect(plan.payoff_order[0].payoff_date).toBe("2026-06-01"))
})

// ── Fixture 2: single debt, snowball = avalanche ──────────────────────────────

describe("Fixture 2 — single debt, snowball matches avalanche", () => {
  const debts = [{ id: 1, name: "Visa", balance_kd: "500.000", apr_pct: "18.000", minimum_payment_kd: "25.000" }]
  const plan = snowballPlan(debts, new Decimal("100.000"), "2026-01-01")

  it("strategy", () => expect(plan.strategy).toBe("snowball"))
  it("total_months", () => expect(plan.total_months).toBe(6))
  it("total_interest_paid", () => expect(plan.total_interest_paid).toBe("23.767"))
  it("debt_free_date", () => expect(plan.debt_free_date).toBe("2026-06-01"))
})

// ── Fixture 3: two debts, avalanche vs snowball diverge ───────────────────────
// Card A: 200 KD @ 10% min 10; Card B: 600 KD @ 24% min 15; payment 100.
// Avalanche: Card B (24%) first. Snowball: Card A (200 KD) first.
// Python output captured 2026-05-07.

describe("Fixture 3 — two debts, avalanche (high-rate first)", () => {
  const debts = [
    { id: 1, name: "Card A", balance_kd: "200.000", apr_pct: "10.000", minimum_payment_kd: "10.000" },
    { id: 2, name: "Card B", balance_kd: "600.000", apr_pct: "24.000", minimum_payment_kd: "15.000" },
  ]
  const plan = avalanchePlan(debts, new Decimal("100.000"), "2026-01-01")

  it("total_months", () => expect(plan.total_months).toBe(9))
  it("total_interest_paid", () => expect(plan.total_interest_paid).toBe("62.401"))
  it("debt_free_date", () => expect(plan.debt_free_date).toBe("2026-09-01"))
  it("payoff_order[0].name (Card B paid first)", () => expect(plan.payoff_order[0].name).toBe("Card B"))
  it("payoff_order[0].interest_paid", () => expect(plan.payoff_order[0].interest_paid).toBe("50.529"))
  it("payoff_order[1].name", () => expect(plan.payoff_order[1].name).toBe("Card A"))
  it("payoff_order[1].interest_paid", () => expect(plan.payoff_order[1].interest_paid).toBe("11.872"))
})

describe("Fixture 3 — two debts, snowball (small balance first)", () => {
  const debts = [
    { id: 1, name: "Card A", balance_kd: "200.000", apr_pct: "10.000", minimum_payment_kd: "10.000" },
    { id: 2, name: "Card B", balance_kd: "600.000", apr_pct: "24.000", minimum_payment_kd: "15.000" },
  ]
  const plan = snowballPlan(debts, new Decimal("100.000"), "2026-01-01")

  it("total_months", () => expect(plan.total_months).toBe(9))
  it("total_interest_paid", () => expect(plan.total_interest_paid).toBe("75.886"))
  it("debt_free_date", () => expect(plan.debt_free_date).toBe("2026-09-01"))
  it("payoff_order[0].name (Card A paid first)", () => expect(plan.payoff_order[0].name).toBe("Card A"))
  it("payoff_order[0].months_to_payoff", () => expect(plan.payoff_order[0].months_to_payoff).toBe(3))
  it("payoff_order[0].interest_paid", () => expect(plan.payoff_order[0].interest_paid).toBe("2.911"))
  it("payoff_order[1].interest_paid", () => expect(plan.payoff_order[1].interest_paid).toBe("72.975"))
})

// ── Fixture 4: minimum payment exactly equals monthly_payment ─────────────────
// 200 KD @ 0% APR, minimum 50. Payment = 50 = minimum_required.
// Python: 4 months, 0.000 interest.

describe("Fixture 4 — payment equals minimum required (edge case)", () => {
  const debts = [{ id: 1, name: "Loan", balance_kd: "200.000", apr_pct: "0.000", minimum_payment_kd: "50.000" }]
  const plan = avalanchePlan(debts, new Decimal("50.000"), "2026-01-01")

  it("total_months", () => expect(plan.total_months).toBe(4))
  it("total_interest_paid", () => expect(plan.total_interest_paid).toBe("0.000"))
  it("debt_free_date", () => expect(plan.debt_free_date).toBe("2026-04-01"))
  it("debt_free_impossible", () => expect(plan.debt_free_impossible).toBe(false))
})

// ── Edge: empty debt list ─────────────────────────────────────────────────────

describe("edge — empty debt list", () => {
  it("avalanche returns empty plan", () => {
    const plan = avalanchePlan([], new Decimal("100.000"), "2026-01-01")
    expect(plan.total_months).toBe(0)
    expect(plan.payoff_order).toHaveLength(0)
    expect(plan.debt_free_impossible).toBe(false)
  })
})
