/*
 * Security-event audit writes.
 *
 * Promoted verbatim from routes/auth.ts in 10e-2-EXTRACT (10e-R63). The move is
 * mechanical: the function body, signature and Sentry tag are unchanged, and the
 * only edit is the added `export`. CLAUDE.md's helper index moved in the same commit.
 *
 * Why promoted: routes/magic-link.ts (10e-2) must emit the same audit rows, and the
 * helper was module-private, so the alternatives were a route→route import (which
 * grows the export surface of a file four wholesale-mocked test factories already
 * constrain — see 10e-R37) or a second copy that could drift in its Sentry tagging.
 *
 * Fire-and-forget by design (standing rule): the insert is deliberately not awaited
 * and cannot throw, so an audit-write failure never delays or fails the response it
 * describes. Failures are Sentry-captured, never silently swallowed.
 *
 * `getDb` is imported as a TYPE ONLY (erased at runtime, matching the precedent at
 * lib/account-deletion.ts:45), so this module adds no runtime dependency on the DB
 * connection singleton — callers pass their own `db`, which is what lets route tests
 * observe the insert through their existing capturing mock.
 */

import type { getDb } from "../db/connection"
import { securityEvents } from "../db/schema"
import { Sentry } from "./sentry"

// Fire-and-forget security event write. Never throws — Sentry-captured on failure.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function auditSecurityEvent(
  db: ReturnType<typeof getDb>,
  eventType: string,
  opts: { userId?: number | null; ipAddress?: string; userAgent?: string; details?: Record<string, unknown> } = {},
): void {
  db.insert(securityEvents)
    .values({
      userId: opts.userId ?? null,
      eventType,
      ipAddress: opts.ipAddress ?? null,
      userAgent: opts.userAgent ?? null,
      detailsJson: opts.details ? JSON.stringify(opts.details) : null,
    })
    .catch((err: unknown) =>
      Sentry.captureException(err, { tags: { handler: "auditSecurityEvent", eventType } }),
    )
}
