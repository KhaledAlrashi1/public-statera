/**
 * Unit tests for buildUserDataExport (Module 10c-1, GDPR right-to-access).
 *
 * Uses a per-table fake db: each select().from(table) resolves to rows keyed by the
 * imported schema table object, so a multi-table export can be asserted end-to-end
 * without a real database. Sequential awaits in the lib make the per-chain `table`
 * capture unambiguous.
 */

import { describe, it, expect } from "vitest"
import { buildUserDataExport, DATA_EXPORT_EXCLUSIONS } from "./data-export-lib"
import {
  users,
  userProfiles,
  categories,
  merchants,
  transactions,
  budgets,
  memorizedTransactions,
  templateSuggestionFeedback,
  securityEvents,
  productEvents,
} from "../db/schema"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeDb(rowsByTable: Map<unknown, unknown[]>): any {
  return {
    select() {
      let table: unknown
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        from(t: unknown) {
          table = t
          return chain
        },
        where() {
          return chain
        },
        limit() {
          return chain
        },
        orderBy() {
          return chain
        },
        then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
          return Promise.resolve(rowsByTable.get(table) ?? []).then(resolve, reject)
        },
      }
      return chain
    },
  }
}

const D = new Date("2026-06-01T10:00:00.000Z")

function fullRows(): Map<unknown, unknown[]> {
  return new Map<unknown, unknown[]>([
    [
      users,
      [
        {
          id: 42,
          email: "user@example.com",
          authProvider: "google",
          displayName: "Test User",
          firstName: "Test",
          lastName: "User",
          totpEnabled: true,
          isActive: true,
          lastLoginAt: D,
          createdAt: D,
        },
      ],
    ],
    [
      userProfiles,
      [
        {
          monthlyIncomeKd: "1500.000",
          paydayDay: 25,
          country: "KW",
          timezone: "Asia/Kuwait",
          emailNotificationsEnabled: true,
          setupGuideSeen: true,
          setupGuideDismissed: false,
          createdAt: D,
          updatedAt: D,
        },
      ],
    ],
    [categories, [{ id: 1, name: "Groceries", isIncome: false, isSystem: false }]],
    [merchants, [{ id: 7, name: "Lulu" }]],
    [
      transactions,
      [
        {
          id: 100,
          date: "2026-05-15",
          source: "manual",
          name: "Lulu run",
          memo: null,
          amountKd: "12.500",
          categoryId: 1,
          merchantId: 7,
          importBatchId: null,
          createdAt: D,
          updatedAt: D,
        },
      ],
    ],
    [budgets, [{ id: 5, month: "2026-05", categoryId: 1, amountKd: "300.000", updatedAt: D }]],
    [
      memorizedTransactions,
      [
        {
          id: 9,
          canonical: "Lulu",
          norm: "lulu",
          categoryId: 1,
          merchantId: 7,
          count: 4,
          lastSeen: D,
          isPinned: false,
          pinnedAt: null,
        },
      ],
    ],
    // Seeded with one row to prove the section serializes rows when present, even
    // though this feature produces no rows in the real deployment (always [] there).
    [
      templateSuggestionFeedback,
      [
        {
          id: 12,
          signatureKey: "sig-abc",
          acceptedCount: 3,
          rejectedCount: 1,
          lastAcceptedAt: D,
          lastRejectedAt: null,
          createdAt: D,
          updatedAt: D,
        },
      ],
    ],
    [
      securityEvents,
      [
        {
          id: 55,
          eventType: "login.success",
          ipAddress: "1.2.3.4",
          userAgent: "curl",
          detailsJson: '{"foo":"bar"}',
          createdAt: D,
        },
      ],
    ],
    [
      productEvents,
      [{ id: 88, eventName: "app_opened", propertiesJson: null, eventTs: D }],
    ],
  ])
}

describe("buildUserDataExport — full data", () => {
  it("serializes every section with the expected shape", async () => {
    const result = await buildUserDataExport(fakeDb(fullRows()), 42)
    expect(result).not.toBeNull()
    const { export: ex, counts } = result!

    expect(typeof ex.generated_at).toBe("string")
    expect(ex.generated_at).toMatch(/\+00:00$/)

    expect(ex.user).toMatchObject({
      id: 42,
      email: "user@example.com",
      auth_provider: "google",
      display_name: "Test User",
      first_name: "Test",
      last_name: "User",
      totp_enabled: true,
      is_active: true,
      created_at: "2026-06-01T10:00:00+00:00",
    })

    expect(ex.profile).toMatchObject({
      monthly_income_kd: "1500.000",
      payday_day: 25,
      country: "KW",
      timezone: "Asia/Kuwait",
      email_notifications_enabled: true,
    })

    expect(ex.categories).toEqual([{ id: 1, name: "Groceries", is_income: false, is_system: false }])
    expect(ex.merchants).toEqual([{ id: 7, name: "Lulu" }])

    expect(ex.transactions[0]).toMatchObject({
      id: 100,
      date: "2026-05-15",
      name: "Lulu run",
      amount_kd: "12.500",
      category_id: 1,
      merchant_id: 7,
    })

    expect(ex.budgets[0]).toMatchObject({ month: "2026-05", amount_kd: "300.000" })
    expect(ex.template_suggestion_feedback[0]).toMatchObject({
      signature_key: "sig-abc",
      accepted_count: 3,
      rejected_count: 1,
    })
    expect(ex.security_events[0]).toMatchObject({ event_type: "login.success", ip_address: "1.2.3.4" })
    expect(ex.product_events[0]).toMatchObject({ event_name: "app_opened" })

    expect(counts).toEqual({
      categories: 1,
      merchants: 1,
      transactions: 1,
      budgets: 1,
      memorized_transactions: 1,
      template_suggestion_feedback: 1,
      security_events: 1,
      product_events: 1,
    })
  })

  it("exports memorized_transactions.norm (deliberate derived-data asymmetry)", async () => {
    const result = await buildUserDataExport(fakeDb(fullRows()), 42)
    const mem = result!.export.memorized_transactions[0]
    expect(mem.norm).toBe("lulu")
    expect(mem.canonical).toBe("Lulu")
  })

  it("omits transactions.name_key and transactions.import_row_hash", async () => {
    const result = await buildUserDataExport(fakeDb(fullRows()), 42)
    const tx = result!.export.transactions[0]
    expect(tx).not.toHaveProperty("name_key")
    expect(tx).not.toHaveProperty("import_row_hash")
  })
})

// ── Secret-field negative assertion (10c-1 ruling 3) ──────────────────────────
// The exported user object must NEVER carry credential / auth-infrastructure material.
// This is the /me-stub defect class applied to a user-downloadable file: a leak here
// ships secrets in an artifact that leaves our custody.
describe("buildUserDataExport — secret-field negative assertion", () => {
  it("user object contains no totp_secret, totp_backup_codes_json, session_version, or external_id", async () => {
    const result = await buildUserDataExport(fakeDb(fullRows()), 42)
    const user = result!.export.user
    expect(user.totp_secret).toBeUndefined()
    expect(user.totp_backup_codes_json).toBeUndefined()
    expect(user.session_version).toBeUndefined()
    expect(user.external_id).toBeUndefined()
    expect(user).not.toHaveProperty("totp_secret")
    expect(user).not.toHaveProperty("totp_backup_codes_json")
    expect(user).not.toHaveProperty("session_version")
    expect(user).not.toHaveProperty("external_id")
  })
})

// ── Empty-state (10c-1 ruling 4) ──────────────────────────────────────────────
describe("buildUserDataExport — empty state (new user, zero rows)", () => {
  it("returns every array section empty, profile null, counts all zero", async () => {
    const rows = new Map<unknown, unknown[]>([
      [
        users,
        [
          {
            id: 7,
            email: "new@example.com",
            authProvider: "google",
            displayName: null,
            firstName: null,
            lastName: null,
            totpEnabled: false,
            isActive: true,
            lastLoginAt: null,
            createdAt: D,
          },
        ],
      ],
    ])
    const result = await buildUserDataExport(fakeDb(rows), 7)
    expect(result).not.toBeNull()
    const { export: ex, counts } = result!

    expect(ex.profile).toBeNull()
    expect(ex.categories).toEqual([])
    expect(ex.merchants).toEqual([])
    expect(ex.transactions).toEqual([])
    expect(ex.budgets).toEqual([])
    expect(ex.memorized_transactions).toEqual([])
    expect(ex.template_suggestion_feedback).toEqual([])
    expect(ex.security_events).toEqual([])
    expect(ex.product_events).toEqual([])

    expect(Object.values(counts).every((n) => n === 0)).toBe(true)

    // Still a real user, secrets still absent.
    expect(ex.user).toMatchObject({ id: 7, email: "new@example.com", last_login_at: null })
    expect(ex.user).not.toHaveProperty("external_id")
  })
})

// ── User-not-found ────────────────────────────────────────────────────────────
describe("buildUserDataExport — user not found", () => {
  it("returns null when the user row does not exist", async () => {
    const result = await buildUserDataExport(fakeDb(new Map()), 999)
    expect(result).toBeNull()
  })
})

// ── Exclusions constant (feeds meta.excluded — see route test) ────────────────
describe("DATA_EXPORT_EXCLUSIONS", () => {
  it("documents both field-level and table-level departures from export=purge", () => {
    expect(DATA_EXPORT_EXCLUSIONS.length).toBe(7)
    const joined = DATA_EXPORT_EXCLUSIONS.join(" ")
    expect(joined).toContain("external_id")
    expect(joined).toContain("totp_secret")
    expect(joined).toContain("name_key")
    expect(joined).toContain("import_row_hash")
    expect(joined).toContain("dashboard_snapshots")
    // template_suggestion_feedback is INCLUDED (always []), NOT excluded.
    expect(joined).not.toContain("template_suggestion_feedback")
  })

  // Full deep-equal of the real list — the route test asserts pass-through against a
  // mocked stand-in, so this is the only place the exact meta.excluded content is pinned.
  it("is exactly the seven documented exclusions, in order", () => {
    expect(DATA_EXPORT_EXCLUSIONS).toEqual([
      "users.external_id — authentication-infrastructure (IdP-issued cross-service identifier)",
      "users.totp_secret / users.totp_backup_codes_json / users.session_version — authentication-infrastructure / credential material",
      "transactions.name_key — derived normalization key, redundant with transactions.name",
      "transactions.import_row_hash — import-dedup infrastructure",
      "dashboard_snapshots — derived aggregation cache, reconstructable from transactions/budgets",
      "account_action_tokens — short-lived authentication tokens",
      "security_events tombstone rows — account-deletion audit records not tied to the user",
    ])
  })
})
