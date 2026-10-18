// MOB-R112 D2 — the one server definition of an income extra (lib/income-extras.ts). Against real
// MySQL the same rule is pinned by routes/income-extras.integration.test.ts.
import { describe, it, expect } from "vitest"
import { MySqlDialect } from "drizzle-orm/mysql-core"
import { INCOME_EXTRA_NAMES, incomeExtraFilter, sumIncomeExtrasBetween } from "./income-extras"

const dialect = new MySqlDialect()

describe("income extras (MOB-R112 D2)", () => {
  it("are exactly Bonus, Commission and Other income; a salary row is not one", () => {
    expect([...INCOME_EXTRA_NAMES]).toEqual(["bonus", "commission", "other income"])
    // The two demo salary row names (API demo "Income: Salary"; the no-signup sample "Salary").
    expect(INCOME_EXTRA_NAMES as readonly string[]).not.toContain("income: salary")
    expect(INCOME_EXTRA_NAMES as readonly string[]).not.toContain("salary")
  })

  it("the filter is the payday-lib income rule AND the trimmed, lower-cased name in the list", () => {
    const q = dialect.sqlToQuery(incomeExtraFilter())
    expect(q.sql).toBe(
      "((`categories`.`is_income` IS TRUE OR LOWER(COALESCE(`categories`.`name`, '')) LIKE 'income%') AND " +
        "LOWER(TRIM(COALESCE(`transactions`.`name`, ''))) IN (?, ?, ?))",
    )
    expect(q.params).toEqual(["bonus", "commission", "other income"])
  })

  it("sums the period's extras; no rows is zero", async () => {
    const dbWith = (rows: unknown[]) =>
      new Proxy({}, {
        get(_t, prop: string) {
          if (prop === "then") return (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve)
          return () => dbWith(rows)
        },
      }) as never
    expect((await sumIncomeExtrasBetween(1, "2026-10-01", "2026-10-31", dbWith([{ total: "12.500" }]))).toFixed(3)).toBe("12.500")
    expect((await sumIncomeExtrasBetween(1, "2026-10-01", "2026-10-31", dbWith([{ total: null }]))).toFixed(3)).toBe("0.000")
  })
})
