/*
 * Magic-link sign-in tokens (Module 10e).
 *
 * ORPHAN CLASS — read before changing the cleanup job. A row created by the
 * SIGN-UP path has user_id = NULL: nobody holds that email yet. purgeUserAccountRows
 * deletes by user_id and therefore CANNOT reach these rows. Their only bound is
 * handleCleanupAccountTokens (worker/jobs/maintenance-jobs.ts), which makes that job
 * a data-minimisation control, not housekeeping. If the job stops, Statera accumulates
 * the email addresses of people who never became users, indefinitely.
 *
 * Deliberate deviations / design notes:
 * - token_hash is an UNSALTED SHA-256 of 32 CSPRNG bytes. Unsalted is adequate and
 *   correct here: the pre-image is 256 bits of uniform randomness, so there is no
 *   dictionary to build and a salt would only prevent a rainbow table that cannot exist.
 *   The raw token is NEVER stored — it exists only in the mailed URL.
 * - lib/crypto.ts (enc1: AES-256-GCM) is deliberately NOT used: it is reversible, and
 *   reversibility is precisely the property being avoided. A DB read must not yield a
 *   usable sign-in token.
 * - consumed_at doubles as the SUPERSESSION marker (10e-R2). "Actually clicked" vs
 *   "invalidated by a re-request" is distinguished by the security_events audit trail,
 *   not by a second column.
 * - request_ip / user_agent are deliberately ABSENT. security_events already records
 *   both for the request and consume events, and does so on a surface that is exported,
 *   purged, and age-bounded — none of which is true of this table.
 */

import { sql } from "drizzle-orm"
import { datetime, index, int, mysqlTable, varchar } from "drizzle-orm/mysql-core"
import { users } from "./users"

export const magicLinkTokens = mysqlTable(
  "magic_link_tokens",
  {
    id: int("id").primaryKey().autoincrement(),
    // Normalized: trim + lowercase ONLY (never Gmail dot-stripping or +tag removal).
    email: varchar("email", { length: 255 }).notNull(),
    // SHA-256 hex of 32 CSPRNG bytes. Raw token never stored.
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    // NULL on the sign-up path (no user exists yet); backfilled on consume.
    userId: int("user_id").references(() => users.id),
    expiresAt: datetime("expires_at", { fsp: 3 }).notNull(),
    consumedAt: datetime("consumed_at", { fsp: 3 }),
    createdAt: datetime("created_at", { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [
    index("ix_magic_link_tokens_email").on(t.email),
    index("ix_magic_link_tokens_user_id").on(t.userId),
    index("ix_magic_link_tokens_expires_at").on(t.expiresAt),
    index("ix_magic_link_tokens_consumed_at").on(t.consumedAt),
  ],
)
