/**
 * Pure debt payoff plan calculator — port of backend/debt_calculator.py.
 *
 * All arithmetic uses decimal.js. No Date objects, no Number() casts, no
 * JS arithmetic (+/-/ * /) on any balance, rate, payment, or interest value.
 * Calendar dates are string "YYYY-MM-DD" throughout so timezone poisoning
 * is impossible and Python byte-equivalence is trivial to verify.
 */

import Decimal from "decimal.js"

const MAX_MONTHS = 600

// ── Types ─────────────────────────────────────────────────────────────────────

export type DebtInput = {
  id?: number | null
  name?: string | null
  balance_kd: string | Decimal
  apr_pct?: string | Decimal | null
  minimum_payment_kd: string | Decimal
}

export type PayoffRow = {
  debt_id: number
  name: string
  balance: string
  rate: string
  months_to_payoff: number
  interest_paid: string
  payoff_date: string
}

export type PayoffPlan = {
  strategy: string
  total_months: number
  total_interest_paid: string
  debt_free_date: string
  payoff_order: PayoffRow[]
  debt_free_impossible: boolean
}

// ── Internal state ────────────────────────────────────────────────────────────

type DebtState = {
  debtId: number
  name: string
  initialBalance: Decimal
  balance: Decimal
  aprPct: Decimal
  minimumPayment: Decimal
  interestPaid: Decimal
  payoffMonth: number | null
}

// ── String-date arithmetic ────────────────────────────────────────────────────
// Integer month-counting only — no Date objects. Matches Python's date arithmetic
// which always lands on the first of the resulting month.

export function addMonths(yyyyMmDd: string, months: number): string {
  if (months <= 0) return yyyyMmDd
  const year = parseInt(yyyyMmDd.slice(0, 4), 10)
  const mon = parseInt(yyyyMmDd.slice(5, 7), 10)
  const totalMonths = (year * 12 + (mon - 1)) + months
  const newYear = Math.floor(totalMonths / 12)
  const newMon = (totalMonths % 12) + 1
  return `${newYear}-${String(newMon).padStart(2, "0")}-01`
}

// ── Decimal helpers ───────────────────────────────────────────────────────────

function q(d: Decimal): Decimal {
  return d.toDecimalPlaces(3, Decimal.ROUND_HALF_UP)
}

function toD(v: string | Decimal | null | undefined): Decimal {
  try { return new Decimal(String(v ?? "0")) } catch { return new Decimal(0) }
}

function fmt(d: Decimal): string {
  return q(d).toFixed(3)
}

// ── Normalization ─────────────────────────────────────────────────────────────

function normalizeDebts(debts: DebtInput[]): DebtState[] {
  const out: DebtState[] = []
  for (let idx = 0; idx < debts.length; idx++) {
    const row = debts[idx]
    const balance = q(Decimal.max(toD(row.balance_kd), new Decimal(0)))
    const minimum = q(Decimal.max(toD(row.minimum_payment_kd), new Decimal(0)))
    const aprPct = q(Decimal.max(toD(row.apr_pct ?? "0"), new Decimal(0)))
    if (balance.lte(0)) continue
    const debtId = row.id != null ? Number(row.id) : idx + 1
    out.push({
      debtId,
      name: (String(row.name ?? "")).trim() || `Debt ${idx + 1}`,
      initialBalance: balance,
      balance,
      aprPct,
      minimumPayment: minimum,
      interestPaid: new Decimal(0),
      payoffMonth: null,
    })
  }
  return out
}

function minimumRequired(debts: DebtState[]): Decimal {
  return q(debts.reduce((acc, d) => acc.plus(d.minimumPayment), new Decimal(0)))
}

// ── Public: minimum required ──────────────────────────────────────────────────

export function minimumRequiredPayment(debts: DebtInput[]): Decimal {
  return minimumRequired(normalizeDebts(debts))
}

// ── Sort key ──────────────────────────────────────────────────────────────────

function strategyKey(strategy: string, debt: DebtState): [Decimal, Decimal, string, number] {
  if (strategy === "avalanche") {
    // Highest APR first, then largest balance
    return [debt.aprPct.neg(), debt.balance.neg(), debt.name.toLowerCase(), debt.debtId]
  }
  // Snowball: smallest balance first, then highest APR
  return [debt.balance, debt.aprPct.neg(), debt.name.toLowerCase(), debt.debtId]
}

function sortByStrategy(debts: DebtState[], strategy: string): DebtState[] {
  return [...debts].sort((a, b) => {
    const ka = strategyKey(strategy, a)
    const kb = strategyKey(strategy, b)
    for (let i = 0; i < ka.length; i++) {
      const av = ka[i], bv = kb[i]
      if (av instanceof Decimal && bv instanceof Decimal) {
        if (!av.equals(bv)) return av.lt(bv) ? -1 : 1
      } else {
        if (av < bv) return -1
        if (av > bv) return 1
      }
    }
    return 0
  })
}

// ── Empty / impossible plan builders ─────────────────────────────────────────

function buildEmptyPlan(strategy: string, startDate: string): PayoffPlan {
  return {
    strategy,
    total_months: 0,
    total_interest_paid: "0.000",
    debt_free_date: startDate,
    payoff_order: [],
    debt_free_impossible: false,
  }
}

function buildImpossiblePlan(strategy: string, totalInterest: Decimal): PayoffPlan {
  return {
    strategy,
    total_months: MAX_MONTHS,
    total_interest_paid: fmt(totalInterest),
    debt_free_date: "",
    payoff_order: [],
    debt_free_impossible: true,
  }
}

// ── Simulation ────────────────────────────────────────────────────────────────

function simulatePlan(
  debtsRaw: DebtInput[],
  monthlyPaymentRaw: string | Decimal,
  strategy: string,
  startDate: string,
): PayoffPlan {
  const debts = normalizeDebts(debtsRaw)
  if (debts.length === 0) return buildEmptyPlan(strategy, startDate)

  const monthlyPayment = q(toD(monthlyPaymentRaw))

  let month = 0
  while (debts.some((d) => d.balance.gt(0))) {
    month++
    if (month > MAX_MONTHS) {
      const totalInterest = debts.reduce((acc, d) => acc.plus(d.interestPaid), new Decimal(0))
      return buildImpossiblePlan(strategy, totalInterest)
    }

    const active = debts.filter((d) => d.balance.gt(0))
    const startingTotal = q(active.reduce((acc, d) => acc.plus(d.balance), new Decimal(0)))

    // Interest accrues first
    for (const debt of active) {
      if (debt.aprPct.lte(0)) continue
      const monthlyRate = debt.aprPct.div(new Decimal(1200))
      const interest = q(debt.balance.mul(monthlyRate))
      if (interest.lte(0)) continue
      debt.balance = q(debt.balance.plus(interest))
      debt.interestPaid = q(debt.interestPaid.plus(interest))
    }

    // Apply minimums in id order
    let remaining = monthlyPayment
    const byId = [...active].sort((a, b) => a.debtId - b.debtId)
    for (const debt of byId) {
      if (remaining.lte(0)) break
      const due = Decimal.min(debt.minimumPayment, debt.balance)
      if (due.lte(0)) continue
      const pay = Decimal.min(due, remaining)
      debt.balance = q(Decimal.max(new Decimal(0), debt.balance.minus(pay)))
      remaining = q(Decimal.max(new Decimal(0), remaining.minus(pay)))
    }

    // Apply surplus to strategy target
    while (remaining.gt(0)) {
      const activeTargets = debts.filter((d) => d.balance.gt(0))
      if (activeTargets.length === 0) break
      const target = sortByStrategy(activeTargets, strategy)[0]
      const pay = Decimal.min(target.balance, remaining)
      target.balance = q(Decimal.max(new Decimal(0), target.balance.minus(pay)))
      remaining = q(Decimal.max(new Decimal(0), remaining.minus(pay)))
      if (pay.lte(0)) break
    }

    const endingTotal = q(debts.filter((d) => d.balance.gt(0)).reduce((acc, d) => acc.plus(d.balance), new Decimal(0)))
    if (endingTotal.gte(startingTotal) && endingTotal.gt(0)) {
      const totalInterest = debts.reduce((acc, d) => acc.plus(d.interestPaid), new Decimal(0))
      return buildImpossiblePlan(strategy, totalInterest)
    }

    for (const debt of debts) {
      if (debt.payoffMonth === null && debt.balance.lte(0)) {
        debt.balance = new Decimal(0)
        debt.payoffMonth = month
      }
    }
  }

  const payoffRows: PayoffRow[] = []
  let totalInterest = new Decimal(0)
  for (const debt of debts) {
    const payoffMonth = debt.payoffMonth ?? 0
    const payoffDate = addMonths(startDate, Math.max(0, payoffMonth - 1))
    totalInterest = totalInterest.plus(debt.interestPaid)
    payoffRows.push({
      debt_id: debt.debtId,
      name: debt.name,
      balance: fmt(debt.initialBalance),
      rate: fmt(debt.aprPct),
      months_to_payoff: payoffMonth,
      interest_paid: fmt(debt.interestPaid),
      payoff_date: payoffDate,
    })
  }

  payoffRows.sort((a, b) => {
    if (a.months_to_payoff !== b.months_to_payoff) return a.months_to_payoff - b.months_to_payoff
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  })

  const totalMonths = payoffRows.reduce((max, r) => Math.max(max, r.months_to_payoff), 0)
  const debtFreeDate = addMonths(startDate, Math.max(0, totalMonths - 1))

  return {
    strategy,
    total_months: totalMonths,
    total_interest_paid: fmt(totalInterest),
    debt_free_date: debtFreeDate,
    payoff_order: payoffRows,
    debt_free_impossible: false,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function avalanchePlan(
  debts: DebtInput[],
  monthlyPayment: string | Decimal,
  startDate = "2026-01-01",
): PayoffPlan {
  return simulatePlan(debts, monthlyPayment, "avalanche", startDate)
}

export function snowballPlan(
  debts: DebtInput[],
  monthlyPayment: string | Decimal,
  startDate = "2026-01-01",
): PayoffPlan {
  return simulatePlan(debts, monthlyPayment, "snowball", startDate)
}
