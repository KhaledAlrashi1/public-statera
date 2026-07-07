/**
 * Unit tests for the 8f-2 re-purge timestamp gate (matchTombstonesForRepurge).
 *
 * Pure function — no DB. The scratch-DB scenario runners are exercised live in the drill,
 * not here. This locks the Privacy §7 gate semantics: re-purge iff a tombstone for the
 * user's email STRICTLY post-dates the backup snapshot.
 */

import { describe, it, expect } from "vitest"
import { matchTombstonesForRepurge } from "./restore-repurge-lib"
import { hashEmail } from "./account-deletion"

const T = new Date("2026-07-05T00:00:00Z") // backup snapshot instant

describe("matchTombstonesForRepurge — timestamp gate", () => {
  it("purges a user whose tombstone post-dates the backup", () => {
    const users = [{ id: 1, email: "alice@example.com" }]
    const tombstones = [{ emailHash: hashEmail("alice@example.com"), createdAt: new Date(T.getTime() + 1000) }]
    const matches = matchTombstonesForRepurge(users, tombstones, T)
    expect(matches).toEqual([{ userId: 1, emailHash: hashEmail("alice@example.com") }])
  })

  it("does NOT purge a user whose tombstone pre-dates the backup (already in backup / reactivation)", () => {
    const users = [{ id: 2, email: "bob@example.com" }]
    const tombstones = [{ emailHash: hashEmail("bob@example.com"), createdAt: new Date(T.getTime() - 1000) }]
    expect(matchTombstonesForRepurge(users, tombstones, T)).toEqual([])
  })

  it("purges on a tombstone exactly at the snapshot instant (>= boundary — restored data can only be pre-deletion)", () => {
    const users = [{ id: 3, email: "carol@example.com" }]
    const tombstones = [{ emailHash: hashEmail("carol@example.com"), createdAt: new Date(T.getTime()) }]
    expect(matchTombstonesForRepurge(users, tombstones, T)).toEqual([
      { userId: 3, emailHash: hashEmail("carol@example.com") },
    ])
  })

  it("does NOT purge a user with no matching tombstone", () => {
    const users = [{ id: 4, email: "dave@example.com" }]
    const tombstones = [{ emailHash: hashEmail("someone-else@example.com"), createdAt: new Date(T.getTime() + 5000) }]
    expect(matchTombstonesForRepurge(users, tombstones, T)).toEqual([])
  })

  it("matches by normalized email hash (case/whitespace-insensitive, mirrors hashEmail)", () => {
    const users = [{ id: 5, email: "  Eve@Example.COM  " }]
    const tombstones = [{ emailHash: hashEmail("eve@example.com"), createdAt: new Date(T.getTime() + 1000) }]
    const matches = matchTombstonesForRepurge(users, tombstones, T)
    expect(matches).toHaveLength(1)
    expect(matches[0]?.userId).toBe(5)
  })

  it("selects exactly the post-backup matches in a mixed set (known-answer shape)", () => {
    const users = [
      { id: 1, email: "post@example.com" },   // tombstone after  → purge
      { id: 2, email: "pre@example.com" },    // tombstone before → survive
      { id: 3, email: "clean@example.com" },  // no tombstone     → survive
    ]
    const tombstones = [
      { emailHash: hashEmail("post@example.com"), createdAt: new Date(T.getTime() + 1000) },
      { emailHash: hashEmail("pre@example.com"), createdAt: new Date(T.getTime() - 1000) },
    ]
    const matches = matchTombstonesForRepurge(users, tombstones, T)
    expect(matches).toEqual([{ userId: 1, emailHash: hashEmail("post@example.com") }])
  })
})
