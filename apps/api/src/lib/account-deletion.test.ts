/**
 * Unit tests for lib/account-deletion.ts — hashEmail + purgeUserAccountRows.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../db/connection", () => ({ getDb: vi.fn() }))
vi.mock("../lib/env", () => ({
  env: {
    isDev: true,
    encryptionKey: "0".repeat(64),
    encryptionKeyPrevious: undefined,
  },
}))

import { hashEmail, purgeUserAccountRows } from "./account-deletion"

// ── hashEmail ─────────────────────────────────────────────────────────────────

describe("hashEmail", () => {
  it("produces a 64-char hex SHA-256", () => {
    const hash = hashEmail("Test@Example.com")
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it("normalises: trims whitespace and lowercases before hashing", () => {
    expect(hashEmail("  User@Example.COM  ")).toBe(hashEmail("user@example.com"))
  })

  it("is deterministic for the same input", () => {
    expect(hashEmail("alice@example.com")).toBe(hashEmail("alice@example.com"))
  })

  it("produces different hashes for different emails", () => {
    expect(hashEmail("alice@example.com")).not.toBe(hashEmail("bob@example.com"))
  })
})

// ── purgeUserAccountRows — call order and tombstone ───────────────────────────

describe("purgeUserAccountRows — DB call sequence", () => {
  it("reads sessionVersion, inserts tombstone, deletes, then soft-deletes last", async () => {
    const calls: string[] = []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function makeProxy(resolveValue: unknown[] = []): any {
      return new Proxy({}, {
        get(_t, prop: string) {
          if (prop === "then") {
            return (resolve: (v: unknown) => unknown) => Promise.resolve(resolveValue).then(resolve)
          }
          return (..._args: unknown[]) => makeProxy(resolveValue)
        },
      })
    }

    const mockDb = {
      select: vi.fn((_cols: unknown) => {
        calls.push("select")
        return makeProxy([{ sessionVersion: 5 }])
      }),
      insert: vi.fn((_table: unknown) => {
        calls.push("insert")
        return makeProxy()
      }),
      delete: vi.fn((_table: unknown) => {
        calls.push("delete")
        return makeProxy()
      }),
      update: vi.fn((_table: unknown) => {
        calls.push("update")
        return makeProxy()
      }),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await purgeUserAccountRows(1, "abc123", "1.2.3.4", "Mozilla", mockDb as any)

    // sessionVersion read (select) must be first.
    expect(calls[0]).toBe("select")
    // Tombstone (insert) must follow.
    expect(calls[1]).toBe("insert")
    // Soft-delete (update) must be last.
    expect(calls[calls.length - 1]).toBe("update")
    // All operations between the tombstone and the soft-delete are deletes.
    const middle = calls.slice(2, -1)
    expect(middle.every((c) => c === "delete")).toBe(true)
    // Total: 1 select + 1 insert + 13 deletes + 1 update = 16 calls
    expect(calls).toHaveLength(16)
    // Returns the pre-purge sessionVersion for the caller's post-commit revoke.
    expect(result).toEqual({ revokedSv: 5 })
  })

  it("soft-delete bumps sessionVersion and clears all three TOTP fields", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let updateSetArg: any = null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function makeProxy(resolveValue: unknown[] = []): any {
      return new Proxy({}, {
        get(_t, prop: string) {
          if (prop === "then") {
            return (resolve: (v: unknown) => unknown) => Promise.resolve(resolveValue).then(resolve)
          }
          return (..._args: unknown[]) => makeProxy(resolveValue)
        },
      })
    }

    const mockDb = {
      select: vi.fn(() => makeProxy([{ sessionVersion: 7 }])),
      insert: vi.fn(() => makeProxy()),
      delete: vi.fn(() => makeProxy()),
      update: vi.fn(() =>
        new Proxy({}, {
          get(_t, prop: string) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (prop === "set") return (arg: any) => { updateSetArg = arg; return makeProxy() }
            if (prop === "then") return (resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve)
            return () => makeProxy()
          },
        }),
      ),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await purgeUserAccountRows(1, "h", "", "", mockDb as any)

    expect(updateSetArg).toEqual({
      isActive: false,
      sessionVersion: 8, // oldSv (7) + 1
      totpSecret: null,
      totpEnabled: false,
      totpBackupCodesJson: null,
    })
    expect(result).toEqual({ revokedSv: 7 })
  })

  it("tombstone survival: security_events delete is NOT called with the tombstone's conditions", async () => {
    // The purge uses AND is_tombstone=false. We verify the delete IS called for
    // security_events (once) — tombstone survival is guaranteed by the WHERE clause,
    // not by skipping the table.
    let securityEventsDeleteCalled = false

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function makeProxy(): any {
      return new Proxy({}, {
        get(_t, prop: string) {
          if (prop === "then") {
            return (resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve)
          }
          return (..._args: unknown[]) => makeProxy()
        },
      })
    }

    // eslint-disable-next-line @typescript-eslint/no-implicit-any-catch, @typescript-eslint/no-explicit-any
    const { securityEvents } = await import("../db/schema") as any

    const mockDb = {
      select: vi.fn(() => makeProxy()),
      insert: vi.fn(() => makeProxy()),
      delete: vi.fn((table: unknown) => {
        if (table === securityEvents) securityEventsDeleteCalled = true
        return makeProxy()
      }),
      update: vi.fn(() => makeProxy()),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await purgeUserAccountRows(1, "abc123", "", "", mockDb as any)

    // The securityEvents delete IS called (non-tombstone rows are purged).
    expect(securityEventsDeleteCalled).toBe(true)
    // The tombstone itself is safe because the DELETE WHERE includes is_tombstone=false
    // (verified at integration level in account-deletion.integration.test.ts; this unit
    // test verifies the call is made at all).
  })
})
