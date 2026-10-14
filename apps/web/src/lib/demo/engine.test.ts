// MOB-R95 C4, C5, C6 — the demo's sample and answers, without a browser: dates follow Kuwait's today, the history
// is the current payday period and the two before it, exactly one category is over its budget on every day of the
// year, and /log's writes change only the state.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { periodKeyForDate, shiftKey } from "../payday-months"
import { createDemoState, demoAnswer, DEMO_REFUSAL, DemoUnknownCallError, materializeSample, type DemoSample } from "./engine"

const sample = JSON.parse(readFileSync(resolve(__dirname, "sample.json"), "utf8")) as DemoSample
const body = <T,>(r: { body: unknown }) => (r.body as { data: T }).data

describe("the demo's sample and answers (MOB-R95 C4, C5)", () => {
  it("today's rows are day offsets from Kuwait's today: 21:00Z is already the next day in Kuwait", () => {
    expect(materializeSample(sample, new Date("2026-10-24T20:59:00Z")).todayIso).toBe("2026-10-24")
    expect(materializeSample(sample, new Date("2026-10-24T21:00:00Z")).todayIso).toBe("2026-10-25")
    const s = createDemoState(sample, new Date("2026-10-09T09:00:00Z"))
    const dinner = s.rows.find((r) => r.name === "Dinner with friends")!
    expect(dinner.date).toBe("2026-10-09")
  })

  it("on every day of a year: the history is the current payday period and the two before it, and only Dining is over its budget", () => {
    // MOB-R96 B4 — also, on every day: each period holds one row of each monthly item, on a fixed day of the
    // month (B1); the variable categories move by 10% or more between the two complete periods, and each complete
    // period's expenses are 50–85% of income (B2); Plan never reads over overall (B3).
    const MONTHLY_CATEGORIES = new Set(["Salary", "Rent", "Bills", "Subscriptions"])
    const VARIABLE = ["Dining", "Groceries", "Shopping", "Transport"]
    const monthlyItems = [...new Set(sample.transactions.filter((t) => MONTHLY_CATEGORIES.has(t.category ?? "")).map((t) => t.name))]
    expect(monthlyItems.sort()).toEqual(["Apartment rent", "Electricity", "Mobile plan", "Netflix", "Salary"])
    const income = Number(sample.profile.monthly_income_kd)
    const spentIn = (s: ReturnType<typeof createDemoState>, key: string) =>
      body<{ spent_by_category: Record<string, number> }>(demoAnswer(s, "GET", `/api/analytics/budget-metrics?month=${key}&range=month`)).spent_by_category
    const start = Date.parse("2026-10-09T09:00:00Z")
    for (let d = 0; d < 400; d++) {
      const now = new Date(start + d * 86_400_000)
      const s = createDemoState(sample, now)
      const current = periodKeyForDate(25, s.todayIso)
      const keys = new Set(s.rows.map((r) => periodKeyForDate(25, r.date)))
      expect([...keys].sort()).toEqual([shiftKey(current, -2), shiftKey(current, -1), current])
      const metrics = body<{ spent_by_category: Record<string, number> }>(demoAnswer(s, "GET", `/api/analytics/budget-metrics?month=${current}&range=month`))
      const budgets = body<{ items: Array<{ category: string; amount_kd: string }> }>(demoAnswer(s, "GET", `/api/budgets?month=${current}`))
      const over = budgets.items.filter((b) => (metrics.spent_by_category[b.category] ?? 0) > Number(b.amount_kd)).map((b) => b.category)
      expect(over, s.todayIso).toEqual(["Dining"])

      // B3 — Plan's overall figure (BudgetPage: every category's spend against the budget total) is never over.
      const planSpent = Object.values(metrics.spent_by_category).reduce((a, v) => a + v, 0)
      const planBudget = budgets.items.reduce((a, b) => a + Number(b.amount_kd), 0)
      expect(planSpent, s.todayIso).toBeLessThanOrEqual(planBudget)

      // B1, B4 — one row of each monthly item in each complete period, at most one in the current one (Salary,
      // on its first day, always), and every row of an item on the same day of the month.
      for (const name of monthlyItems) {
        const rows = s.rows.filter((r) => r.name === name)
        for (const key of [shiftKey(current, -2), shiftKey(current, -1)]) {
          expect(rows.filter((r) => periodKeyForDate(25, r.date) === key), `${s.todayIso} ${name} ${key}`).toHaveLength(1)
        }
        const inCurrent = rows.filter((r) => periodKeyForDate(25, r.date) === current).length
        if (name === "Salary") expect(inCurrent, `${s.todayIso} Salary ${current}`).toBe(1)
        else expect(inCurrent, `${s.todayIso} ${name} ${current}`).toBeLessThanOrEqual(1)
        expect(new Set(rows.map((r) => r.date.slice(8, 10))).size, `${s.todayIso} ${name} day of month`).toBe(1)
      }
      expect(s.rows.find((r) => r.name === "Salary" && periodKeyForDate(25, r.date) === current)?.date.slice(8, 10)).toBe("25")

      // B2 — the two complete periods: each variable category moves by 10% or more; expenses 50–85% of income.
      const before = spentIn(s, shiftKey(current, -2))
      const after = spentIn(s, shiftKey(current, -1))
      for (const c of VARIABLE) {
        expect(Math.abs(after[c] - before[c]) / before[c], `${s.todayIso} ${c}`).toBeGreaterThanOrEqual(0.1)
      }
      for (const spent of [before, after]) {
        const expenses = Object.values(spent).reduce((a, v) => a + v, 0)
        expect(expenses, s.todayIso).toBeGreaterThanOrEqual(0.5 * income)
        expect(expenses, s.todayIso).toBeLessThanOrEqual(0.85 * income)
      }
    }
  })

  it("answers with the server's envelope and its money as 3-decimal strings", () => {
    const s = createDemoState(sample, new Date("2026-10-09T09:00:00Z"))
    const sts = body<Record<string, unknown>>(demoAnswer(s, "GET", "/api/analytics/safe-to-spend"))
    expect(sts.month).toBe("2026-10")
    expect(sts.cycle_start).toBe("2026-09-25")
    expect(sts.cycle_end).toBe("2026-10-24")
    expect(sts.monthly_income_kd).toBe("1200.000")
    expect(sts.income_source).toBe("declared_in_profile")
    expect(String(sts.daily_rate_kd)).toMatch(/^\d+\.\d{3}$/)
  })

  it("C6: logging, editing and deleting change only this state; a new state starts again from the sample; other writes refuse", () => {
    const now = new Date("2026-10-09T09:00:00Z")
    const s = createDemoState(sample, now)
    const created = demoAnswer(s, "POST", "/api/transactions", { date: "2026-10-09", category: "Dining", merchant: "Talabat", name: "Lunch", amount_kd: "4.5" })
    expect(created.status).toBe(201)
    const id = body<{ item: { id: number; amount_kd: string } }>(created).item.id
    expect(body<{ item: { amount_kd: string } }>(demoAnswer(s, "PATCH", `/api/transactions/${id}`, { amount_kd: "5.250" })).item.amount_kd).toBe("5.250")
    expect(demoAnswer(s, "GET", `/api/transactions/${id}`).status).toBe(200)
    expect(demoAnswer(s, "DELETE", `/api/transactions/${id}`).status).toBe(200)
    expect(demoAnswer(s, "GET", `/api/transactions/${id}`).status).toBe(404)

    demoAnswer(s, "POST", "/api/transactions", { date: "2026-10-09", category: "Dining", name: "Kept?", amount_kd: "1" })
    const fresh = createDemoState(sample, now)
    expect(fresh.rows.some((r) => r.name === "Kept?")).toBe(false)
    expect(fresh.rows).toHaveLength(createDemoState(sample, now).rows.length)

    const refused = demoAnswer(s, "POST", "/api/budgets", { month: "2026-10", items: [] })
    expect(refused.status).toBe(403)
    expect((refused.body as { error: string }).error).toBe(DEMO_REFUSAL)
    expect(() => demoAnswer(s, "GET", "/api/analytics/snapshot")).toThrow(DemoUnknownCallError)
  })
})
