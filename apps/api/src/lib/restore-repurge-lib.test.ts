/**
 * Unit tests for the 8f-2 re-purge timestamp gate (matchTombstonesForRepurge).
 *
 * Pure function — no DB. The scratch-DB scenario runners are exercised live in the drill,
 * not here. This locks the Privacy §7 gate semantics: re-purge iff a tombstone for the
 * user's email STRICTLY post-dates the backup snapshot.
 */

import { describe, it, expect } from "vitest"
import { getTableName } from "drizzle-orm"
import { OWNED_TABLES, matchTombstonesForRepurge } from "./restore-repurge-lib"
import { hashEmail, purgeUserAccountRows } from "./account-deletion"
import { securityEvents } from "../db/schema"

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

// ── F8 guard: OWNED_TABLES ↔ purgeUserAccountRows (10e-R17) ───────────────────
//
// OWNED_TABLES was the one site in the A6 new-table consequence chain with NOTHING behind
// it: four sites go red when missed, this one is silent, and the miss is observable only
// during a disaster-recovery drill — i.e. at the worst possible moment.
//
// The list is DERIVED, not mirrored. A hand-written constant listing the purge's tables
// could not detect the drift it exists to catch: a table added to the purge and missed in
// OWNED_TABLES would be missed in the hand-written list too, and the assertion would stay
// green through exactly the failure it was built for. So the list is obtained by EXECUTING
// purgeUserAccountRows against a recording mock and resolving each captured table object
// through drizzle's getTableName — the artifact itself is the source.
//
// LIMITATION, recorded rather than glossed (the CF8 multi-path lesson): this observes only
// the deletes on the path the mock drives. purgeUserAccountRows is straight-line today, so
// that is every delete. If it ever gains a CONDITIONAL delete, this guard sees only the
// branch taken and the other arm becomes an unobserved path — capture both arms or record
// the gap at that time.

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

/** Runs the real purge against a recording mock and returns the SQL names it deleted from. */
async function derivePurgeDeleteTables(): Promise<string[]> {
  const deleted: string[] = []
  const mockDb = {
    select: () => makeProxy([{ sessionVersion: 1 }]),
    insert: () => makeProxy(),
    delete: (table: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deleted.push(getTableName(table as any))
      return makeProxy()
    },
    update: () => makeProxy(),
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await purgeUserAccountRows(1, "h".repeat(64), "", "", mockDb as any)
  return deleted
}

describe("OWNED_TABLES ↔ purgeUserAccountRows (F8 guard)", () => {
  it("is exactly the purge's delete list, in order, minus security_events", async () => {
    const purged = await derivePurgeDeleteTables()
    const securityEventsTable = getTableName(securityEvents)

    // NON-VACUITY, and it is load-bearing: the filter below removes the ONE documented
    // difference (security_events is purged, but its tombstone rows must survive, so it is
    // deliberately absent from OWNED_TABLES — see the comment at its declaration). If
    // security_events were ever dropped from the purge, that filter would silently become a
    // no-op and this guard would keep passing while no longer encoding anything. Asserting
    // the difference is PRESENT is what stops the guard from decaying into a tautology.
    expect(purged).toContain(securityEventsTable)

    // Ordered equality, not set equality: order is what a set comparison cannot observe, and
    // the insert POSITION of a new table in the purge is part of what is being pinned.
    expect(purged.filter((t) => t !== securityEventsTable)).toEqual([...OWNED_TABLES])
  })

  it("derives real table names, not undefined (the observer can see what it claims to)", async () => {
    const purged = await derivePurgeDeleteTables()
    expect(purged.length).toBeGreaterThan(1)
    expect(purged.every((t) => typeof t === "string" && t.length > 0)).toBe(true)
  })
})
