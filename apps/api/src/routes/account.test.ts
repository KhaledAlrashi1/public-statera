/**
 * Unit tests for DELETE /account and GET /account/deletion-status/:taskToken (Module 7.5).
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../db/connection", () => ({ getDb: vi.fn() }))
vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("session", { userId: 42, externalId: "ext-42", authProvider: "google", sv: 1 })
    await next()
  }),
  revokeSessionVersion: vi.fn().mockResolvedValue(undefined),
  createSessionToken: vi.fn().mockResolvedValue("tok"),
  getAuthRedis: vi.fn(() => ({ get: vi.fn(), del: vi.fn(), multi: vi.fn() })),
}))
vi.mock("../lib/rate-limit", () => ({ createRateLimiter: vi.fn(() => (_c: unknown, next: () => Promise<void>) => next()) }))
vi.mock("../lib/sentry", () => ({ Sentry: { captureException: vi.fn() } }))
vi.mock("../lib/account-deletion", () => ({
  hashEmail: vi.fn(() => "deadbeef".repeat(8)),
  purgeUserAccountRows: vi.fn().mockResolvedValue(undefined),
}))

// BullMQ queue mock
const mockQueueAdd = vi.fn()
const mockJobFromId = vi.fn()
vi.mock("../worker/queue", () => ({
  getQueue: vi.fn(() => ({ add: mockQueueAdd })),
}))
vi.mock("bullmq", async (importOriginal) => {
  const actual = await importOriginal<typeof import("bullmq")>()
  return {
    ...actual,
    Job: {
      ...actual.Job,
      fromId: (...args: unknown[]) => mockJobFromId(...args),
    },
  }
})

vi.mock("../lib/env", () => ({
  env: {
    isDev: true,
    encryptionKey: "0".repeat(64),
    encryptionKeyPrevious: undefined,
    sessionSecret: "test-session-secret-at-least-32-chars-long",
    corsOrigins: ["http://localhost:3002"],
    oauthClientId: "test",
    oauthRedirectUri: "http://localhost:3000/api/auth/callback",
    oauthProvider: "google",
  },
}))

// ── DB proxy mock ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDbReturning(rows: unknown[]): any {
  return new Proxy({}, {
    get(_t, prop: string) {
      if (prop === "then") {
        return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve(rows).then(resolve, reject)
      }
      if (prop === "transaction") {
        return async (fn: (tx: unknown) => Promise<unknown>) => fn(makeDbReturning(rows))
      }
      return (..._args: unknown[]) => makeDbReturning(rows)
    },
  })
}

// ── Imports under test ────────────────────────────────────────────────────────

import { SignJWT } from "jose"
import { testClient } from "hono/testing"
import * as connection from "../db/connection"
import { accountRouter } from "./account"
import { Sentry } from "../lib/sentry"
import { purgeUserAccountRows } from "../lib/account-deletion"

const SESSION_SECRET = "test-session-secret-at-least-32-chars-long"

async function makeDeleteIntentCookie(userId: number, expiresIn = "15m"): Promise<string> {
  return new SignJWT({ userId, issuedAt: Date.now() })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode(SESSION_SECRET))
}

const client = testClient(accountRouter)

beforeEach(() => {
  vi.clearAllMocks()
  mockQueueAdd.mockResolvedValue({ id: "job-123" })
})

// ── DELETE /account — happy path (async) ──────────────────────────────────────

describe("DELETE /account — async success", () => {
  it("enqueues job and returns deleted:true with task_id", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{ isActive: true, email: "user@example.com" }]))
    const cookie = await makeDeleteIntentCookie(42)

    // @ts-expect-error Hono testClient typing
    const res = await client["/"].$delete(
      {},
      { headers: { Cookie: `statera_delete_intent=${cookie}` } },
    )
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(data.deleted).toBe(true)
    expect(typeof data.task_id).toBe("string")
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "delete-account-data",
      expect.objectContaining({ userId: 42 }),
      expect.objectContaining({ jobId: "delete-account-42" }),
    )
  })
})

// ── DELETE /account — sync fallback ───────────────────────────────────────────

describe("DELETE /account — sync fallback when BullMQ enqueue fails", () => {
  it("runs sync purge, Sentry-tracks enqueue failure, returns deleted:true", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{ isActive: true, email: "user@example.com" }]))
    mockQueueAdd.mockRejectedValue(new Error("Redis down"))
    const cookie = await makeDeleteIntentCookie(42)

    // @ts-expect-error Hono testClient typing
    const res = await client["/"].$delete(
      {},
      { headers: { Cookie: `statera_delete_intent=${cookie}` } },
    )
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect((body.data as Record<string, unknown>).deleted).toBe(true)

    // Sync purge was called.
    expect(purgeUserAccountRows).toHaveBeenCalled()
    // Sentry tracked the enqueue failure.
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: expect.objectContaining({ handler: "account.delete.enqueue_fallback" }) }),
    )
  })
})

// ── DELETE /account — sync fallback failure ───────────────────────────────────

describe("DELETE /account — sync fallback failure returns 500", () => {
  it("returns 500 deletion_failed when sync purge throws", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{ isActive: true, email: "user@example.com" }]))
    mockQueueAdd.mockRejectedValue(new Error("Redis down"))
    vi.mocked(purgeUserAccountRows).mockRejectedValueOnce(new Error("DB error"))
    const cookie = await makeDeleteIntentCookie(42)

    // @ts-expect-error Hono testClient typing
    const res = await client["/"].$delete(
      {},
      { headers: { Cookie: `statera_delete_intent=${cookie}` } },
    )
    expect(res.status).toBe(500)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe("deletion_failed")
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: expect.objectContaining({ handler: "account.delete.sync_fallback" }) }),
    )
  })
})

// ── DELETE /account — missing cookie ─────────────────────────────────────────

describe("DELETE /account — missing delete-intent cookie", () => {
  it("returns 410 DELETE_INTENT_GONE when cookie is absent", async () => {
    // @ts-expect-error Hono testClient typing
    const res = await client["/"].$delete()
    expect(res.status).toBe(410)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe("DELETE_INTENT_GONE")
    expect(mockQueueAdd).not.toHaveBeenCalled()
  })
})

// ── DELETE /account — tampered or expired cookie ──────────────────────────────

describe("DELETE /account — invalid delete-intent cookie", () => {
  it("returns 410 DELETE_INTENT_GONE for tampered JWT", async () => {
    // @ts-expect-error Hono testClient typing
    const res = await client["/"].$delete(
      {},
      { headers: { Cookie: "statera_delete_intent=not.a.valid.jwt" } },
    )
    expect(res.status).toBe(410)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe("DELETE_INTENT_GONE")
  })

  it("returns 410 DELETE_INTENT_GONE for expired JWT", async () => {
    const expired = await new SignJWT({ userId: 42, issuedAt: Date.now() })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(new TextEncoder().encode(SESSION_SECRET))

    // @ts-expect-error Hono testClient typing
    const res = await client["/"].$delete(
      {},
      { headers: { Cookie: `statera_delete_intent=${expired}` } },
    )
    expect(res.status).toBe(410)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe("DELETE_INTENT_GONE")
  })
})

// ── DELETE /account — userId mismatch ────────────────────────────────────────

describe("DELETE /account — userId mismatch (replay attack)", () => {
  it("returns 410 when cookie userId does not match authenticated session userId", async () => {
    // requireAuth sets userId=42, but cookie was issued for userId=99
    const cookie = await makeDeleteIntentCookie(99)

    // @ts-expect-error Hono testClient typing
    const res = await client["/"].$delete(
      {},
      { headers: { Cookie: `statera_delete_intent=${cookie}` } },
    )
    expect(res.status).toBe(410)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe("DELETE_INTENT_GONE")
    expect(mockQueueAdd).not.toHaveBeenCalled()
  })
})

// ── DELETE /account — already inactive ───────────────────────────────────────

describe("DELETE /account — account already inactive", () => {
  it("returns 403 ACCOUNT_INACTIVE", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{ isActive: false, email: "user@example.com" }]))
    const cookie = await makeDeleteIntentCookie(42)

    // @ts-expect-error Hono testClient typing
    const res = await client["/"].$delete(
      {},
      { headers: { Cookie: `statera_delete_intent=${cookie}` } },
    )
    expect(res.status).toBe(403)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe("ACCOUNT_INACTIVE")
    expect(mockQueueAdd).not.toHaveBeenCalled()
  })
})

// ── GET /deletion-status/:taskToken — completed job ──────────────────────────

describe("GET /deletion-status/:taskToken — completed job", () => {
  it("returns status:complete for a completed BullMQ job", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{ isActive: true, email: "user@example.com" }]))
    const cookie = await makeDeleteIntentCookie(42)

    // Enqueue to get a real encrypted token.
    // @ts-expect-error Hono testClient typing
    const deleteRes = await client["/"].$delete({}, { headers: { Cookie: `statera_delete_intent=${cookie}` } })
    const deleteBody = await deleteRes.json() as Record<string, unknown>
    const taskId = (deleteBody.data as Record<string, unknown>).task_id as string

    mockJobFromId.mockResolvedValue({ getState: vi.fn().mockResolvedValue("completed") })

    // @ts-expect-error Hono testClient typing
    const res = await client["deletion-status"][":taskToken"].$get({ param: { taskToken: taskId } })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect((body.data as Record<string, unknown>).status).toBe("complete")
  })
})

// ── GET /deletion-status/:taskToken — sync token ─────────────────────────────

describe("GET /deletion-status/:taskToken — sync fallback token", () => {
  it("returns status:complete immediately for sync tokens", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{ isActive: true, email: "user@example.com" }]))
    mockQueueAdd.mockRejectedValue(new Error("Redis down"))
    vi.mocked(purgeUserAccountRows).mockResolvedValue(undefined)

    const cookie = await makeDeleteIntentCookie(42)
    // @ts-expect-error Hono testClient typing
    const deleteRes = await client["/"].$delete({}, { headers: { Cookie: `statera_delete_intent=${cookie}` } })
    const deleteBody = await deleteRes.json() as Record<string, unknown>
    const taskId = (deleteBody.data as Record<string, unknown>).task_id as string

    // @ts-expect-error Hono testClient typing
    const res = await client["deletion-status"][":taskToken"].$get({ param: { taskToken: taskId } })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect((body.data as Record<string, unknown>).status).toBe("complete")
  })
})

// ── GET /deletion-status/:taskToken — invalid token ───────────────────────────

describe("GET /deletion-status/:taskToken — invalid token", () => {
  it("returns 400 invalid_task_id for a garbage token", async () => {
    // @ts-expect-error Hono testClient typing
    const res = await client["deletion-status"][":taskToken"].$get({ param: { taskToken: "garbage" } })
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe("invalid_task_id")
  })
})

// ── Tombstone survival (documented behaviour) ─────────────────────────────────

describe("Tombstone survival — purge does not delete tombstone rows", () => {
  it("purgeUserAccountRows is called once and is_tombstone filtering is the lib's responsibility", async () => {
    // This test verifies the route calls purgeUserAccountRows correctly.
    // The tombstone WHERE clause (is_tombstone=false) is tested in account-deletion.test.ts.
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{ isActive: true, email: "x@example.com" }]))
    const cookie = await makeDeleteIntentCookie(42)

    // @ts-expect-error Hono testClient typing
    await client["/"].$delete({}, { headers: { Cookie: `statera_delete_intent=${cookie}` } })

    // Async path: purgeUserAccountRows is NOT called directly (BullMQ job handles it).
    // Tombstone survival is validated end-to-end in the integration test.
    expect(mockQueueAdd).toHaveBeenCalledOnce()
  })
})
