import { describe, it, expect } from "vitest"
import { buildActivationReport } from "./activation-reporting-lib"

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

// A DB that returns different rows on successive awaits.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSequentialDb(sequence: unknown[][]): any {
  let call = 0
  function make(): unknown {
    return new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "then") {
            const rows = sequence[call++] ?? []
            return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
              Promise.resolve(rows).then(resolve, reject)
          }
          return (..._args: unknown[]) => make()
        },
      },
    )
  }
  return make()
}

const NOW = new Date("2026-05-13T12:00:00.000Z")

// ── buildActivationReport — window shape ─────────────────────────────────────

describe("buildActivationReport — window", () => {
  it("returns correct window fields for days=7", async () => {
    const db = makeDbReturning([])
    const report = await buildActivationReport(7, db, { nowUtc: NOW })
    expect(report.window.days).toBe(7)
    expect(report.window.start).toBe("2026-05-07T00:00:00+00:00")
    expect(report.window.end_exclusive).toBe("2026-05-14T00:00:00+00:00")
    expect(report.window.as_of).toMatch(/\+00:00$/)
  })

  it("clamps days to minimum 1", async () => {
    const db = makeDbReturning([])
    const report = await buildActivationReport(0, db, { nowUtc: NOW })
    expect(report.window.days).toBe(1)
  })

  it("produces daily array with one entry per calendar day", async () => {
    const db = makeDbReturning([])
    const report = await buildActivationReport(3, db, { nowUtc: NOW })
    expect(report.daily).toHaveLength(3)
    expect(report.daily[0]!.date).toBe("2026-05-11")
    expect(report.daily[1]!.date).toBe("2026-05-12")
    expect(report.daily[2]!.date).toBe("2026-05-13")
  })
})

// ── buildActivationReport — summary zero state ────────────────────────────────

describe("buildActivationReport — all-zero DB", () => {
  it("returns zero counts and null percentages when no data", async () => {
    const db = makeDbReturning([])
    const report = await buildActivationReport(7, db, { nowUtc: NOW })
    expect(report.summary.users_created).toBe(0)
    expect(report.summary.activated_any).toBe(0)
    expect(report.summary.signup_completed).toBe(0)
    expect(report.summary.activation_rate_from_signup_pct).toBeNull()
    expect(report.summary.budget_rate_from_signup_pct).toBeNull()
    expect(report.summary.median_hours_signup_to_activation).toBeNull()
    expect(report.summary.demo_to_import_users).toBe(0)
  })

  it("returns zero activation_paths when no events", async () => {
    const db = makeDbReturning([])
    const report = await buildActivationReport(7, db, { nowUtc: NOW })
    expect(report.activation_paths.demo_data_loaded).toBe(0)
    expect(report.activation_paths.demo_replaced_with_import).toBe(0)
    expect(report.activation_paths.import_completed).toBe(0)
  })

  it("fills daily rows with zero counts", async () => {
    const db = makeDbReturning([])
    const report = await buildActivationReport(2, db, { nowUtc: NOW })
    for (const day of report.daily) {
      expect(day.activated_any).toBe(0)
      expect(day.app_opened).toBe(0)
      expect(day.users_created).toBe(0)
      expect(day.signup_completed).toBe(0)
    }
  })
})

// ── buildActivationReport — pct helper ───────────────────────────────────────

describe("buildActivationReport — percentage calculations", () => {
  it("computes activation_rate_from_signup_pct correctly", async () => {
    // We can't easily inject per-query results without a sequential mock, so
    // we test the pct helper indirectly via a full report with known data.
    // 10 signups, 5 activated → 50.0%
    const db = makeSequentialDb([
      // eventCountRows: signup_completed=10, first_budget_set=0, others=0
      [
        { eventName: "signup_completed", count: "10" },
        { eventName: "first_budget_set", count: "3" },
      ],
      // usersCreated
      [{ count: "10" }],
      // activatedRow (activated_any)
      [{ count: "5" }],
      // demoImportRows
      [],
      // signupRows
      [],
      // firstActivationRows
      [],
      // dailySignupRows
      [],
      // dailyEventRows
      [],
      // dailyActivatedRows
      [],
    ])
    const report = await buildActivationReport(7, db, { nowUtc: NOW })
    expect(report.summary.signup_completed).toBe(10)
    expect(report.summary.first_budget_set).toBe(3)
    expect(report.summary.activated_any).toBe(5)
    expect(report.summary.activation_rate_from_signup_pct).toBe(50)
    expect(report.summary.budget_rate_from_signup_pct).toBe(30)
  })

  it("returns null percentages when signup_completed is 0 (divide-by-zero guard)", async () => {
    const db = makeSequentialDb([
      [{ eventName: "first_budget_set", count: "5" }], // no signup_completed
      [{ count: "5" }],  // usersCreated
      [{ count: "5" }],  // activatedAny
      [],                // demoImportRows
      [],                // signupRows
      [],                // firstActivationRows
      [],                // dailySignupRows
      [],                // dailyEventRows
      [],                // dailyActivatedRows
    ])
    const report = await buildActivationReport(7, db, { nowUtc: NOW })
    expect(report.summary.signup_completed).toBe(0)
    expect(report.summary.activation_rate_from_signup_pct).toBeNull()
    expect(report.summary.budget_rate_from_signup_pct).toBeNull()
  })
})

// ── buildActivationReport — demo_to_import_users ─────────────────────────────

describe("buildActivationReport — demo_to_import_users", () => {
  it("prefers demo_data_replaced_with_import count over intersection", async () => {
    const db = makeSequentialDb([
      [],  // eventCountRows
      [{ count: "0" }],  // usersCreated
      [{ count: "0" }],  // activatedAny
      [
        { userId: 1, eventName: "demo_data_loaded" },
        { userId: 1, eventName: "import_completed" },
        { userId: 2, eventName: "demo_data_replaced_with_import" },
      ],
      [], [], [], [], [],
    ])
    const report = await buildActivationReport(7, db, { nowUtc: NOW })
    // demoReplaceImportUsers.size = 1, so prefers that over intersection (also 1)
    expect(report.summary.demo_to_import_users).toBe(1)
    expect(report.activation_paths.demo_replaced_with_import).toBe(1)
    expect(report.activation_paths.demo_data_loaded).toBe(1)
    expect(report.activation_paths.import_completed).toBe(1)
  })

  it("falls back to intersection when demo_data_replaced_with_import is empty", async () => {
    const db = makeSequentialDb([
      [],
      [{ count: "0" }],
      [{ count: "0" }],
      [
        { userId: 1, eventName: "demo_data_loaded" },
        { userId: 1, eventName: "import_completed" },
        { userId: 2, eventName: "demo_data_loaded" },
      ],
      [], [], [], [], [],
    ])
    const report = await buildActivationReport(7, db, { nowUtc: NOW })
    // No demo_data_replaced_with_import → falls back to intersection: {1}
    expect(report.summary.demo_to_import_users).toBe(1)
    expect(report.activation_paths.demo_replaced_with_import).toBe(0)
  })
})

// ── buildActivationReport — median ────────────────────────────────────────────

describe("buildActivationReport — median_hours_signup_to_activation", () => {
  it("returns null when no matched signup+activation pairs", async () => {
    const db = makeDbReturning([])
    const report = await buildActivationReport(7, db, { nowUtc: NOW })
    expect(report.summary.median_hours_signup_to_activation).toBeNull()
  })

  it("computes median for an odd-length list", async () => {
    // 3 users: 1h, 3h, 5h → median = 3h
    const signupTs1 = new Date("2026-05-10T08:00:00Z")
    const signupTs2 = new Date("2026-05-10T08:00:00Z")
    const signupTs3 = new Date("2026-05-10T08:00:00Z")
    const act1 = new Date("2026-05-10T09:00:00Z") // 1h
    const act2 = new Date("2026-05-10T11:00:00Z") // 3h
    const act3 = new Date("2026-05-10T13:00:00Z") // 5h

    const db = makeSequentialDb([
      [],
      [{ count: "0" }],
      [{ count: "0" }],
      [],
      [
        { userId: 1, signupTs: signupTs1 },
        { userId: 2, signupTs: signupTs2 },
        { userId: 3, signupTs: signupTs3 },
      ],
      [
        { userId: 1, activationTs: act1 },
        { userId: 2, activationTs: act2 },
        { userId: 3, activationTs: act3 },
      ],
      [], [], [],
    ])
    const report = await buildActivationReport(7, db, { nowUtc: NOW })
    expect(report.summary.median_hours_signup_to_activation).toBe(3)
  })

  it("computes median for an even-length list (average of two middles)", async () => {
    // 2 users: 2h, 4h → median = 3h
    const signupTs = new Date("2026-05-10T08:00:00Z")
    const act1 = new Date("2026-05-10T10:00:00Z") // 2h
    const act2 = new Date("2026-05-10T12:00:00Z") // 4h

    const db = makeSequentialDb([
      [],
      [{ count: "0" }],
      [{ count: "0" }],
      [],
      [
        { userId: 1, signupTs },
        { userId: 2, signupTs },
      ],
      [
        { userId: 1, activationTs: act1 },
        { userId: 2, activationTs: act2 },
      ],
      [], [], [],
    ])
    const report = await buildActivationReport(7, db, { nowUtc: NOW })
    expect(report.summary.median_hours_signup_to_activation).toBe(3)
  })

  it("skips pairs where activation precedes signup", async () => {
    const signupTs = new Date("2026-05-10T10:00:00Z")
    const activationTsEarlier = new Date("2026-05-10T08:00:00Z") // before signup → skip

    const db = makeSequentialDb([
      [],
      [{ count: "0" }],
      [{ count: "0" }],
      [],
      [{ userId: 1, signupTs }],
      [{ userId: 1, activationTs: activationTsEarlier }],
      [], [], [],
    ])
    const report = await buildActivationReport(7, db, { nowUtc: NOW })
    expect(report.summary.median_hours_signup_to_activation).toBeNull()
  })
})

// ── buildActivationReport — JSON key order ────────────────────────────────────

describe("buildActivationReport — key ordering", () => {
  it("summary keys are in alphabetical order", async () => {
    const db = makeDbReturning([])
    const report = await buildActivationReport(1, db, { nowUtc: NOW })
    const keys = Object.keys(report.summary)
    expect(keys).toEqual([...keys].sort())
  })

  it("activation_paths keys are in alphabetical order", async () => {
    const db = makeDbReturning([])
    const report = await buildActivationReport(1, db, { nowUtc: NOW })
    const keys = Object.keys(report.activation_paths)
    expect(keys).toEqual([...keys].sort())
  })

  it("daily row keys are in alphabetical order", async () => {
    const db = makeDbReturning([])
    const report = await buildActivationReport(1, db, { nowUtc: NOW })
    const keys = Object.keys(report.daily[0]!)
    expect(keys).toEqual([...keys].sort())
  })

  it("window keys are in alphabetical order", async () => {
    const db = makeDbReturning([])
    const report = await buildActivationReport(1, db, { nowUtc: NOW })
    const keys = Object.keys(report.window)
    expect(keys).toEqual([...keys].sort())
  })
})
