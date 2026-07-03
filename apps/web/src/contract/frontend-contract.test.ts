// Phase 4 / Module 10a — frontend side of the API-call contract.
//
// 1. Meta guard: every method on an EXERCISED api object is actually invoked, and
//    no INVOCATION names a method that no longer exists.
// 2. Fixture guard: the calls api.ts makes still match the committed
//    apps/web/contract/frontend-calls.json. When they drift, regenerate with
//    `pnpm --filter statera-frontend contract:generate` and review the diff.
//
// The committed fixture is consumed by apps/api's contract test, which asserts
// each (method, path) resolves to a mounted Hono route.

import { describe, it, expect } from "vitest"
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { captureFrontendCalls, exercisedMethodGaps, type FrontendCall } from "./capture"

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), "../../contract/frontend-calls.json")

describe("frontend API contract", () => {
  it("exercises every exported method on the covered api objects", () => {
    const { missing, unknown } = exercisedMethodGaps()
    expect(
      { missing, unknown },
      missing.length
        ? `Add an INVOCATION in capture.ts for: ${missing.join(", ")}`
        : `Remove stale INVOCATION source(s) in capture.ts: ${unknown.join(", ")}`,
    ).toEqual({ missing: [], unknown: [] })
  })

  it("frontend-calls.json matches the calls api.ts makes", async () => {
    const captured = await captureFrontendCalls()

    if (process.env.UPDATE_CONTRACT === "1") {
      writeFileSync(FIXTURE, `${JSON.stringify(captured, null, 2)}\n`)
      return
    }

    let committed: FrontendCall[] = []
    try {
      committed = JSON.parse(readFileSync(FIXTURE, "utf8")) as FrontendCall[]
    } catch {
      // Missing/unreadable fixture → falls through to the mismatch assertion.
    }

    expect(
      captured,
      "Frontend API-call contract is stale: apps/web/contract/frontend-calls.json " +
        "no longer matches the calls api.ts makes. Regenerate with " +
        "`pnpm --filter statera-frontend contract:generate`, review the diff, and " +
        "make sure apps/api's contract test still passes.",
    ).toEqual(committed)
  })
})
