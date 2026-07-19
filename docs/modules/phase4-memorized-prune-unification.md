# Phase 4 — 10d — memorized-prune rule unification (Option A) — Approved Phase A + Rulings

**Module:** `TODO(memorized-prune-rule-unification)`, Module 10d.
**Persisted:** 2026-07-18, before any implementation (persist-first discipline).
**Base:** `docs/phase-4-open` at `3b16523` (after B2 module close).
**Baseline:** hermetic `pnpm --filter statera-api test` = **675 passed / 16 skipped / 49 files**, exit 0; `tsc --noEmit` = 0.

This file is the surviving source of truth for the unification: the choice (Option A), the approved Phase A, the approval conditions, and the drafted CLAUDE.md behavior-change sentence. It supersedes any relayed-in-conversation memory.

---

## 1. Operator ruling — Option A (count-tiered everywhere), 2026-07-18 (verbatim)

> **ATTRIBUTION:** the operator delegated the choice to the review channel's recommendation (2026-07-18, "go with the option you think is best long-term"); the channel recommended A; this block is therefore an OPERATOR ruling, dated 2026-07-18, citable as such.
>
> **RULING:** the unified retention policy for `memorized_transactions` is the COUNT-TIERED rule (personal_statera lineage, `suggestions.py:114-118` / `:150-166`): non-pinned rows with `count==1` prune at `last_seen < now−90d`; `count==2` at `< now−180d`; `count≥3` are NEVER auto-pruned; pinned rows are never auto-pruned. Both call sites — the inline per-user prune (`routes/memorized.ts`) and the batch job (`worker/jobs/maintenance-jobs.ts` `cleanup-memorized-transactions`) — converge on this one rule.
>
> **RATIONALE (recorded):** (i) provenance — neither Flask app ran two rules; the Hono split is a port splice (inline from personal_statera, batch from personal-finance). personal_statera's count-tiered rule is the NEWER deliberate design (`is_pinned` column added; "count >= 3 → never auto-pruned" docstring); the batch job accidentally resurrected the older app's rule. (ii) Module 11 invests in the suggest engine, which ranks by count desc — the current batch rule evicts precisely the strongest suggestions, with NO rebuild path in Hono (Flask's `rebuild_memorized_from_transactions` was never ported). (iii) growth is bounded in practice (~one row per distinct merchant per user); stale rows are a ranking concern, not a deletion concern.
>
> **IMPLEMENTATION CONSTRAINTS (Phase A proposal required before code):**
> M1 — SINGLE-SOURCE: one predicate definition + one set of constants, shared by both call sites (lib-level; the drift existed because two hand-written copies existed). The batch job's hardcoded 180/90 literals are eliminated.
> M2 — ORACLE TESTS: threshold/equivalence tests pinning the unified rule against the personal_statera source as oracle (boundary cases: count 1/2/3 at, just-under, just-over each cutoff; pinned immunity; count≥3 immortality). These are NEW mandatory work.
> M3 — CLIENT-OBSERVABLE CHANGE, NAMED: rows that today are batch-deleted (non-pinned, count≥3, idle >180d) will now survive. Behavior change by ruling, recorded here and in CLAUDE.md — not a no-behavior-change refactor.
> M4 — MODULE 11 BOUNDARY: touches but does NOT decide `TODO(memorized-cascade-decision)` — that remains Module 11 scope. Record the interaction, decide nothing.
> M5 — SCHEDULE UNCHANGED: the 6h batch cadence (`MAINT_MEMORIZED_INTERVAL_HOURS`) is out of scope; only the predicate changes.

---

## 2. Approved Phase A proposal (MP-A1)

**Decision:** both call sites converge on the count-tiered rule = the current inline rule (`memorized.ts:39-40, 98-115`); the **batch job changes** to adopt it.

### M1 — shared lib `apps/api/src/lib/memorized-prune.ts` (NEW)
```ts
export const MEMORIZED_PRUNE_DAYS_COUNT_1 = 90   // count==1 prunes older than this
export const MEMORIZED_PRUNE_DAYS_COUNT_2 = 180  // count==2 prunes older than this

// Returns affectedRows. userId omitted → all-users (batch); present → scoped (inline).
export async function deleteStaleMemorizedRows(
  db: Pick<ReturnType<typeof getDb>, "delete">,   // MP-C2: typed, not `any`
  opts: { userId?: number; now?: Date } = {},
): Promise<number> {
  const now = opts.now ?? new Date()
  const cutoff1 = new Date(now.getTime() - MEMORIZED_PRUNE_DAYS_COUNT_1 * 86_400_000)
  const cutoff2 = new Date(now.getTime() - MEMORIZED_PRUNE_DAYS_COUNT_2 * 86_400_000)
  const conds = [
    eq(memorizedTransactions.isPinned, false),
    or(
      and(eq(memorizedTransactions.count, 1), lt(memorizedTransactions.lastSeen, cutoff1)),
      and(eq(memorizedTransactions.count, 2), lt(memorizedTransactions.lastSeen, cutoff2)),
    ),
  ]
  if (opts.userId !== undefined) conds.push(eq(memorizedTransactions.userId, opts.userId))
  const [result] = await db.delete(memorizedTransactions).where(and(...conds))
  return result?.affectedRows ?? 0
}
```
Error handling stays call-site-specific (different Sentry tags + batch task-tracking); the lib fn is the pure delete only.

### Both call-site diffs (sketch)
- **Inline `routes/memorized.ts`:** delete local constants (39-40) + predicate body (94-115); the local `pruneStaleMemorized(userId, db)` wrapper keeps its try/catch + Sentry `handler: "pruneStaleMemorized"` tag and delegates to `deleteStaleMemorizedRows(db, { userId })`. Call site `:332` unchanged. Rule unchanged for this site (already count-tiered) — predicate merely moves to the lib.
- **Batch `worker/jobs/maintenance-jobs.ts`:** delete cutoffs (111-112) + predicate (113-126); replace with `const deleted = await deleteStaleMemorizedRows(db)` + `console.log(… memorized_deleted=${deleted})`. Surrounding try/catch + `markWorkerTaskStarted/Finished` unchanged. Comment `:108-110` rewritten to cite the unified lib + personal_statera lineage. **This is where the rule changes** (age-OR-lowcount → count-tiered).

### Flagged deviation (accepted, MP-A1)
Inline currently expresses the date comparison as a raw SQL string truncated to whole seconds (`lastSeen < 'YYYY-MM-DD HH:MM:SS'`); the unified lib uses `lt(lastSeen, <Date>)` (ms precision, the batch's idiomatic form). **Sub-second difference at a day-granularity boundary — immaterial, no wire contract.**

### M2 — Oracle test plan
NEW INTEGRATION-gated file `lib/memorized-prune.integration.test.ts` (dedicated `*.integration.test.ts`, no module-level db mock). Seeds boundary rows for a fixed `opts.now` and asserts the exact survivor set against the personal_statera oracle (strict `<` cutoff):

| Seeded row (not pinned unless noted) | Oracle expectation |
|---|---|
| count==1, idle 91d | pruned |
| count==1, idle 89d | survives |
| count==1, idle exactly 90d | survives (strict `<`) |
| count==2, idle 181d | pruned |
| count==2, idle 179d | survives |
| count==2, idle 120d (90–180 gap) | survives (tier distinction) |
| count==3, idle 400d | survives (immortality) |
| pinned, count==1, idle 200d | survives (pinned immunity) |
| second user's count==1, idle 200d | pruned when `userId` omitted; survives when scoped to user A |

**MP-C1 (determinism):** every case injects a FIXED `opts.now`; all seeded `lastSeen` derive from it (never wall-clock). A wall-clock "exactly 90d" case is flaky by construction — the lib recomputes `now` ms later, flipping strict-`<` at the boundary. The close-out coverage map states the fixed-now construction.

Existing hermetic `maintenance-jobs.test.ts` task-tracking cases stay (possible mock-shape touch to expose `affectedRows` for the `[result]` destructure — no case-count change). `memorized.test.ts` mock-chain ordering cases unaffected.

### M5 — schedule unchanged
`MAINT_MEMORIZED_INTERVAL_HOURS` (6h) + `scheduler.ts` out of scope; only the predicate changes.

### Projected baseline delta (from 675 / 16 / 49)
Hermetic passed **unchanged at 675**; **files 49→50**; **skipped 16→~24** (new integration file's ~8 cases skip hermetically); `tsc` 0. INTEGRATION live-stack run mandatory this cycle (new integration file) — verbatim tail + exit code in close-out. Exact counts pinned at close-out.

---

## 3. Approval — MP-A1..N1 (channel, 2026-07-18, verbatim)

> **MP-A1 (approval):** the Phase A is approved as proposed — M1 shared lib (memorized-prune.ts, constants moved not duplicated, pure delete with call-site-specific error handling), both call-site sketches, the flagged seconds→milliseconds precision deviation (accepted: immaterial at day granularity, no wire contract), M2 integration-gated oracle file, M3/M4/M5 statements, and the projected delta (hermetic 675 unchanged, files 49→50, skipped 16→~24; exact counts pinned at close-out).
>
> **MP-C1 (determinism, blocking):** every oracle boundary case injects a FIXED `opts.now` and derives all seeded `lastSeen` values from it. A wall-clock-seeded "exactly 90d" case is flaky by construction. The close-out's coverage map must state the fixed-now construction.
>
> **MP-C2 (typing):** `db` parameter typed with the codebase's actual Drizzle db type if one is in use at comparable seams; `any` acceptable ONLY if it is the existing convention there, stated explicitly in the close-out either way. Types are claims; no fresh `any` at a new seam by default.
>
> **MP-C3 (M3 draft):** the exact CLAUDE.md behavior-change sentence is drafted verbatim in the persisted bundle (not described — drafted), and lands in CLAUDE.md at close-out.
>
> **MP-N1 (recorded, no action):** the unified `eq(count,1)` predicate leaves a hypothetical `count==0` row immortal where the old batch `lte(count,1)` caught it. Immaterial (schema defaults count to 1, increment-only); recorded to prevent rediscovery.
>
> **SEQUENCE:** persist-first (Phase A + operator ruling + this approval → docs/modules/phase4-memorized-prune-unification.md) → implement → close-out from 675/16/49 with three sections embedded + coverage map + the INTEGRATION=true run's verbatim tail and exit code (new integration file ⇒ live-stack run is mandatory this cycle).

### MP-C2 resolution (recorded here; restated at close-out)
The typed convention at comparable lib seams is a local `Pick<ReturnType<typeof getDb>, …>`: `account-deletion.ts:61` picks `"insert" | "delete" | "update" | "select"`; `data-export-lib.ts:90` picks `"select"`. `deleteStaleMemorizedRows` needs only `delete`, so `db: Pick<ReturnType<typeof getDb>, "delete">`. **No fresh `any`** at the new seam (the `any` at `transaction-lib.ts`/the inline wrapper is a different, older convention not adopted here).

### MP-N1 note (recorded, no action)
Under the unified `eq(count, 1)` predicate a hypothetical `count==0` row is immortal, where the old batch `lte(count, 1)` would have caught it at >90d idle. Unreachable in practice: `count` schema-defaults to 1 (`memorized-transactions.ts:26`) and is only ever incremented (`count + 1`); no code path writes 0. Recorded to prevent rediscovery; no code guards it.

---

## 4. MP-C3 — CLAUDE.md behavior-change sentence, DRAFTED VERBATIM (lands at close-out)

> **TODO(memorized-prune-rule-unification) — DONE (2026-07-18):** the two divergent memorized-prune policies were unified onto the **count-tiered** rule (personal_statera lineage) via a new shared lib `apps/api/src/lib/memorized-prune.ts` (`deleteStaleMemorizedRows(db, { userId?, now? })`; constants `MEMORIZED_PRUNE_DAYS_COUNT_1 = 90` / `MEMORIZED_PRUNE_DAYS_COUNT_2 = 180`), consumed by BOTH the inline per-user prune (`routes/memorized.ts`, unchanged rule — predicate moved to the lib) and the batch job (`worker/jobs/maintenance-jobs.ts` `cleanup-memorized-transactions`, hardcoded 180/90 literals eliminated). **Client-observable behavior change (by operator ruling, Option A, 2026-07-18):** the batch job NO LONGER deletes non-pinned memorized rows with `count ≥ 3` idle > 180 days — those now survive indefinitely (matching the inline rule and personal_statera's "count >= 3 → never auto-pruned" design). All other prune outcomes are byte-identical to the prior state. The 6h batch schedule (`MAINT_MEMORIZED_INTERVAL_HOURS`) is unchanged (M5). This does NOT decide `TODO(memorized-cascade-decision)` (whether deleting priming transactions cascade-prunes memorized rows), which remains Module 11 scope (M4). Oracle boundary equivalence pinned by `lib/memorized-prune.integration.test.ts` against the personal_statera source (fixed-`now` construction per MP-C1).
