import { Hono } from "hono"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../lib/analytics-cache", () => ({
  cacheBustDashboardMetrics: vi.fn().mockResolvedValue(0),
  cacheBustSafeToSpend: vi.fn().mockResolvedValue(0),
}))
vi.mock("../lib/sentry", () => ({ Sentry: { captureException: vi.fn() } }))
vi.mock("../db/connection", () => ({ getDb: vi.fn() }))
vi.mock("../lib/rate-limit", () => ({
  searchRateLimit: (_c: unknown, next: () => Promise<void>) => next(),
  importRateLimit: (_c: unknown, next: () => Promise<void>) => next(),
  exportRateLimit: (_c: unknown, next: () => Promise<void>) => next(),
}))

import { getDb } from "../db/connection"
import { createSessionToken } from "../middleware/auth"
import { transactionsRouter } from "../routes/transactions"
import { currentMonthKeyUtc } from "./dashboard-snapshot-lib"
import { loadDemoWorkspace } from "./demo-data-lib"

function chain(result: unknown): object {
  return new Proxy({}, {
    get(_t, prop: string) {
      if (prop === "then") return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej)
      if (prop === "$returningId") return () => Promise.resolve([{ id: 99 }])
      return (..._a: unknown[]) => chain(result)
    },
  })
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb = (result: unknown = []): any => new Proxy({}, {
  get(_t, prop: string) {
    if (prop === "transaction") return async (cb: (tx: unknown) => Promise<unknown>) => cb(mockDb(result))
    return (..._a: unknown[]) => chain(result)
  },
})

describe("one clock: Kuwait (MOB-R84 C5)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-31T21:30:00Z"))
  })
  afterEach(() => vi.useRealTimers())

  it("the jobs' month is Kuwait's: 2026-11 at 21:30Z on 31 Oct, still 2026-10 at 20:59Z", () => {
    expect(currentMonthKeyUtc()).toBe("2026-11")
    vi.setSystemTime(new Date("2026-10-31T20:59:00Z"))
    expect(currentMonthKeyUtc()).toBe("2026-10")
  })

  it("/api/transactions/summary with no month answers Kuwait's month", async () => {
    vi.mocked(getDb).mockReturnValue(mockDb([{ count: 0 }]))
    const app = new Hono().route("/api/transactions", transactionsRouter)
    const token = await createSessionToken({ userId: 1, externalId: "t", authProvider: "test", sv: 1 })
    const res = await app.request("/api/transactions/summary", { headers: { Authorization: `Bearer ${token}` } })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { data: { month: string } }).data.month).toBe("2026-11")
  })

  it("the demo workspace is seeded for Kuwait's month", async () => {
    const summary = await loadDemoWorkspace(mockDb([]), 1)
    expect(summary.month).toBe("2026-11")
  })
})
