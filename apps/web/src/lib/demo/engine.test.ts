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
  it("dates are day offsets from Kuwait's today: 21:00Z is already the next day in Kuwait", () => {
    expect(materializeSample(sample, new Date("2026-10-24T20:59:00Z")).todayIso).toBe("2026-10-24")
    expect(materializeSample(sample, new Date("2026-10-24T21:00:00Z")).todayIso).toBe("2026-10-25")
    const s = createDemoState(sample, new Date("2026-10-09T09:00:00Z"))
    const dinner = s.rows.find((r) => r.name === "Dinner with friends")!
    expect(dinner.date).toBe("2026-10-09")
  })

  it("on every day of a year: the history is the current payday period and the two before it, and only Dining is over its budget", () => {
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
