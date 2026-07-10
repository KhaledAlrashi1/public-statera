// Phase 4 / Module 10a — backend side of the API-call contract.
//
// Reads apps/web/contract/frontend-calls.json (the committed capture of every
// URL api.ts requests) and asserts each (method, path) resolves to a mounted
// Hono route. Resolution is ground-truth: unmounted /api/* paths hit app.notFound
// → 404, while every mounted business route runs requireAuth → 401 before any
// handler/DB. So `status !== 404` == "route is mounted" with no DB needed.
//
// ALLOWLIST holds the (method, path) pairs that are intentionally NOT mounted yet
// but still have a live UI caller. Each entry is annotated with its Phase 4 10b
// disposition; when 10b mounts a route (it starts resolving) or removes the UI
// caller (it drops out of the fixture), the corresponding allowlist line must be
// deleted — the test forces this by failing on stale allowlist entries.

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { describe, it, expect, vi } from "vitest"

// Route resolution is checked via app.request, which runs the middleware chain.
// requireAuth throws 401 (no cookie) before any IO, so authed routes are fast.
// The one non-authed handler in the fixture (POST /api/auth/2fa/verify) runs its
// rate limiter first, which would hit Redis and hang — mock rate limiting to a
// pass-through so no route reaches real IO. We only care about 404-vs-not.
vi.mock("../lib/rate-limit", () => {
  const passthrough = async (_c: unknown, next: () => Promise<void>) => {
    await next()
  }
  return {
    createRateLimiter: () => passthrough,
    searchRateLimit: passthrough,
    importRateLimit: passthrough,
    exportRateLimit: passthrough,
    readRateLimit: passthrough,
    writeRateLimit: passthrough,
    heavyWriteRateLimit: passthrough,
  }
})

import { createApp } from "../app"

type FrontendCall = { method: string; path: string }

const FIXTURE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../web/contract/frontend-calls.json",
)

// (method, path) that are known-unmounted with a live UI caller. Delete a line
// when its 10b disposition lands.
// Empty as of 10b-3: every frontend api.ts call now resolves to a mounted Hono route.
// 10b closed the last two entries (CSV import upload-preview + import-commit).
const ALLOWLIST: Array<{ method: string; path: string; disposition: string }> = []

const key = (c: { method: string; path: string }) => `${c.method.toUpperCase()} ${c.path}`

function loadFixture(): FrontendCall[] {
  return JSON.parse(readFileSync(FIXTURE, "utf8")) as FrontendCall[]
}

const app = createApp()

async function isMounted(call: FrontendCall): Promise<boolean> {
  const res = await app.request(call.path, { method: call.method })
  return res.status !== 404
}

describe("frontend→backend route contract", () => {
  const fixture = loadFixture()
  const allowed = new Set(ALLOWLIST.map(key))

  it("fixture is non-empty (capture ran)", () => {
    expect(fixture.length).toBeGreaterThan(0)
  })

  it("every frontend call resolves to a mounted route (or is an annotated allowlist entry)", async () => {
    const unmounted: string[] = []
    for (const call of fixture) {
      if (await isMounted(call)) continue
      if (allowed.has(key(call))) continue
      unmounted.push(key(call))
    }
    expect(
      unmounted,
      unmounted.length
        ? `Frontend calls a route that is not mounted in Hono:\n  ${unmounted.join(
            "\n  ",
          )}\nEither mount the route in apps/api or remove the caller in apps/web. ` +
            `If it is an intentional deferral with a live UI caller, add it to ALLOWLIST with a 10b disposition.`
        : "",
    ).toEqual([])
  })

  it("allowlist has no stale entries (all still unmounted AND still called)", async () => {
    const fixtureKeys = new Set(fixture.map(key))
    const stale: string[] = []
    for (const entry of ALLOWLIST) {
      const k = key(entry)
      if (!fixtureKeys.has(k)) {
        stale.push(`${k} — no longer called by the frontend (UI caller removed); delete this allowlist line`)
        continue
      }
      if (await isMounted(entry)) {
        stale.push(`${k} — now mounted in Hono; delete this allowlist line`)
      }
    }
    expect(stale, stale.length ? stale.join("\n") : "").toEqual([])
  })
})
