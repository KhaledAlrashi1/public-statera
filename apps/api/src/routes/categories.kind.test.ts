// MOB-R55 P4 — GET /api/categories gives each category its kind under the one rule
// (lib/category-kind.ts).
import { describe, expect, it, vi } from "vitest"
import { Hono } from "hono"
import { categoriesRouter } from "./categories"
import { createSessionToken } from "../middleware/auth"
import { readJson } from "../test/json"

// Each successive await resolves the next entry: Q1 the user's categories, Q2 transaction counts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSequentialDb(sequences: unknown[][]): any {
  let callIndex = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function proxy(): any {
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
          return (..._args: unknown[]) => proxy()
        },
      },
    )
  }
  return proxy()
}

vi.mock("../db/connection", () => ({ getDb: vi.fn() }))
import { getDb } from "../db/connection"

const app = new Hono().route("/api/categories", categoriesRouter)

describe("GET /api/categories — kind (MOB-R55 P4)", () => {
  it("marks income, savings and expense categories", async () => {
    const cat = (id: number, name: string, isIncome: boolean) => ({ id, userId: 1, name, isIncome, isSystem: false })
    vi.mocked(getDb).mockReturnValue(
      makeSequentialDb([
        [cat(1, "Salary", true), cat(2, "Savings & investing", false), cat(3, "Groceries", false)],
        [],
      ]),
    )
    const token = await createSessionToken({ userId: 1, externalId: "test-ext", authProvider: "test", sv: 1 })
    const res = await app.request("/api/categories", { headers: { Authorization: `Bearer ${token}` } })
    expect(res.status).toBe(200)
    const body = await readJson(res)
    const items = body.data.items as Array<{ name: string; kind: string }>
    expect(items.map((i) => [i.name, i.kind])).toEqual([
      ["Salary", "income"],
      ["Savings & investing", "savings"],
      ["Groceries", "expense"],
    ])
  })
})
