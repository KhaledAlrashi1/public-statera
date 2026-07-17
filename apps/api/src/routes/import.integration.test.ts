// Integration tests — requires a running MySQL instance.
// Run with: INTEGRATION=true pnpm --filter statera-api test
//
// CSV import (10b-3) atomicity + dup-handling behavior against real MySQL. The route's commit
// orchestration (validate → plan → precheck → db.transaction{ per-row savepoint apply, atomic
// throw }) is mirrored by runCommit() below so the real lib functions + real savepoints are
// exercised. Not part of the hermetic CI gate (INTEGRATION-gated local discipline).
//
// Cases:
//   1. happy path — a valid batch commits every row.
//   2. atomic precheck rollback — a within-batch triplet duplicate blocks the whole batch; zero
//      rows are written.
//   3. per-row savepoint isolation + atomic apply rollback — one plan fails at persist (savepoint
//      rolls it back to skipped_invalid); atomic mode then rolls the whole outer transaction back,
//      so a good row applied before it is also undone.
//   4. import_row_hash idempotency — re-importing the same file_hash marks every row idempotent
//      and writes nothing new.
//   5. transaction_id → update.
//   6. demo-replace — replace_demo_data clears the demo and imports in one atomic transaction;
//      the memorized rows primed by the demo survive (10b-2 quirk).

import { describe, it, expect, afterEach } from "vitest"
import { and, eq } from "drizzle-orm"
import { getDb } from "../db/connection"
import { users, userProfiles } from "../db/schema/users"
import { transactions } from "../db/schema/transactions"
import { budgets } from "../db/schema/budgets"
import { memorizedTransactions } from "../db/schema/memorized-transactions"
import { productEvents } from "../db/schema/product-events"
import { categories } from "../db/schema/categories"
import { merchants } from "../db/schema/merchants"
import {
  validateRowsForCommit,
  planRows,
  applyPlanWithRetry,
  orderedRowResults,
  summarizeImportResults,
  hasBlockingRowResults,
  loadExistingByIds,
  computeImportRowHash,
  type RowResult,
} from "../lib/import-lib"
import { buildNameKey } from "../lib/transaction-lib"
import { loadDemoWorkspace, clearDemoWorkspace, getDemoWorkspaceState } from "../lib/demo-data-lib"

const RUN = process.env["INTEGRATION"] === "true"
const TEST_RUN_ID = `import_integ_${process.pid}_${Date.now()}`
let testUserId = -1

async function setupTestUser(): Promise<number> {
  const db = getDb()
  const [{ id }] = await db.insert(users).values({
    email: `${TEST_RUN_ID}@test.invalid`, authProvider: "test", externalId: TEST_RUN_ID, displayName: "Test User",
  }).$returningId()
  return id
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countRows(table: any, userId: number): Promise<number> {
  const db = getDb()
  const rows = await db.select({ id: table.id }).from(table).where(eq(table.userId, userId))
  return rows.length
}

async function cleanup(userId: number): Promise<void> {
  const db = getDb()
  await db.delete(productEvents).where(eq(productEvents.userId, userId))
  await db.delete(memorizedTransactions).where(eq(memorizedTransactions.userId, userId))
  await db.delete(transactions).where(eq(transactions.userId, userId))
  await db.delete(budgets).where(eq(budgets.userId, userId))
  await db.delete(categories).where(eq(categories.userId, userId))
  await db.delete(merchants).where(eq(merchants.userId, userId))
  await db.delete(userProfiles).where(eq(userProfiles.userId, userId))
  await db.delete(users).where(eq(users.id, userId))
}

afterEach(async () => {
  if (testUserId === -1) return
  await cleanup(testUserId)
  testUserId = -1
})

type CommitOutcome =
  | { kind: "ok"; ordered: RowResult[]; summary: ReturnType<typeof summarizeImportResults> }
  | { kind: "precheck_blocked"; ordered: RowResult[] }
  | { kind: "apply_rolled_back"; ordered: RowResult[] }

// Mirrors routes/upload.ts import-commit orchestration (real lib + real savepoints).
async function runCommit(
  userId: number,
  rows: unknown[],
  opts: { fileHash?: string | null; allowDups?: boolean; replaceDemo?: boolean } = {},
): Promise<CommitOutcome> {
  const db = getDb()
  const fileHash = opts.fileHash ?? null
  const { validRows, rowResults } = validateRowsForCommit(rows)
  const existingById = await loadExistingByIds(db, userId, validRows.filter((r) => r.transactionId !== null).map((r) => r.transactionId as number))
  const { plans, rowResults: planningResults } = await planRows(db, validRows, { userId, fileHash, allowDups: Boolean(opts.allowDups), existingById })
  for (const [k, v] of planningResults) rowResults.set(k, v)

  if (hasBlockingRowResults([...rowResults.values()])) {
    for (const plan of plans) if (!rowResults.has(plan.row.rowIndex)) rowResults.set(plan.row.rowIndex, { row_index: plan.row.rowIndex, status: "blocked_atomic", error_code: "import_atomic_pending" })
    return { kind: "precheck_blocked", ordered: orderedRowResults(rows.length, rowResults) }
  }

  const demoState = await getDemoWorkspaceState(db, userId)
  try {
    const ordered = await db.transaction(async (tx: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = tx as any
      if (demoState.active && opts.replaceDemo && plans.length > 0) await clearDemoWorkspace(t, userId)
      const cache = new Map<string, { id: number; name: string }>()
      for (const plan of plans) rowResults.set(plan.row.rowIndex, await applyPlanWithRetry(t, plan, userId, cache, "batch-1"))
      const ord = orderedRowResults(rows.length, rowResults)
      if (hasBlockingRowResults(ord)) throw Object.assign(new Error("atomic"), { ord })
      return ord
    })
    return { kind: "ok", ordered, summary: summarizeImportResults({ totalRows: rows.length, validRows: validRows.length, plannedRows: plans.length, rowResults: ordered }) }
  } catch (e) {
    const ord = (e as { ord?: RowResult[] }).ord
    if (ord) return { kind: "apply_rolled_back", ordered: ord }
    throw e
  }
}

function row(date: string, name: string, amount: string, extra: Record<string, unknown> = {}) {
  return { date, name, amount_kd: amount, category: "Groceries", ...extra }
}

describe.skipIf(!RUN)("CSV import — happy path (real MySQL)", () => {
  it("commits every valid row", async () => {
    testUserId = await setupTestUser()
    const out = await runCommit(testUserId, [
      row("2026-01-01", "Coffee", "1.500"),
      row("2026-01-02", "Lunch", "3.250"),
      row("2026-01-03", "Fuel", "5.000"),
    ])
    expect(out.kind).toBe("ok")
    if (out.kind === "ok") {
      expect(out.summary.created).toBe(3)
      expect(out.summary.imported).toBe(3)
    }
    expect(await countRows(transactions, testUserId)).toBe(3)
  })
})

describe.skipIf(!RUN)("CSV import — atomic precheck rollback (real MySQL)", () => {
  it("a within-batch duplicate blocks the whole batch; zero rows written", async () => {
    testUserId = await setupTestUser()
    const out = await runCommit(testUserId, [
      row("2026-01-01", "Coffee", "1.500"),
      row("2026-01-01", "Coffee", "1.500"), // triplet dup → skipped_duplicate (blocking)
      row("2026-01-02", "Lunch", "3.250"),
    ])
    expect(out.kind).toBe("precheck_blocked")
    expect(await countRows(transactions, testUserId)).toBe(0)
  })
})

describe.skipIf(!RUN)("CSV import — savepoint isolation + atomic apply rollback (real MySQL)", () => {
  it("a persist failure rolls its savepoint back to skipped_invalid, then atomic rolls the batch back", async () => {
    testUserId = await setupTestUser()
    const db = getDb()
    // Craft plans directly: one good insert + one that fails at persist (existing_transaction_id
    // that does not belong to the user → persistPlannedRow throws import_row_transaction_not_found).
    const { validRows } = validateRowsForCommit([row("2026-02-01", "Good", "2.000")])
    const good = validRows[0]
    const badRowSrc = validateRowsForCommit([row("2026-02-02", "Bad", "9.000")]).validRows[0]
    const badPlan = { row: { ...badRowSrc, rowIndex: 1 }, existingTransactionId: 999999999, importRowHash: null }
    const goodPlan = { row: { ...good, rowIndex: 0 }, existingTransactionId: null, importRowHash: null }

    const rowResults = new Map<number, RowResult>()
    let threw = false
    try {
      await db.transaction(async (tx: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const t = tx as any
        const cache = new Map<string, { id: number; name: string }>()
        rowResults.set(0, await applyPlanWithRetry(t, goodPlan, testUserId, cache, "b"))
        rowResults.set(1, await applyPlanWithRetry(t, badPlan, testUserId, cache, "b"))
        const ord = orderedRowResults(2, rowResults)
        expect(ord[0].status).toBe("created") // savepoint committed the good row within the tx
        expect(ord[1].status).toBe("skipped_invalid") // bad row's savepoint rolled back, batch not poisoned
        expect(ord[1].error_code).toBe("import_row_transaction_not_found")
        if (hasBlockingRowResults(ord)) throw new Error("atomic")
      })
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
    // Atomic mode: the good row was rolled back with the outer transaction.
    expect(await countRows(transactions, testUserId)).toBe(0)
  })
})

describe.skipIf(!RUN)("CSV import — import_row_hash idempotency (real MySQL)", () => {
  it("re-importing the same file_hash writes nothing new", async () => {
    testUserId = await setupTestUser()
    const fileHash = "deadbeef".repeat(8)
    const rows = [
      row("2026-03-01", "Rent", "450.000", { row_index: 0 }),
      row("2026-03-02", "Water", "12.000", { row_index: 1 }),
    ]
    const first = await runCommit(testUserId, rows, { fileHash })
    expect(first.kind).toBe("ok")
    expect(await countRows(transactions, testUserId)).toBe(2)

    const second = await runCommit(testUserId, rows, { fileHash })
    expect(second.kind).toBe("ok")
    if (second.kind === "ok") expect(second.summary.skipped_idempotent).toBe(2)
    expect(await countRows(transactions, testUserId)).toBe(2) // unchanged
    void computeImportRowHash // referenced for parity documentation
  })
})

describe.skipIf(!RUN)("CSV import — transaction_id update (real MySQL)", () => {
  it("a row carrying an existing transaction_id updates it", async () => {
    testUserId = await setupTestUser()
    const db = getDb()
    const first = await runCommit(testUserId, [row("2026-04-01", "Original", "10.000")])
    expect(first.kind).toBe("ok")
    const [inserted] = await db.select({ id: transactions.id }).from(transactions).where(and(eq(transactions.userId, testUserId), eq(transactions.nameKey, buildNameKey("Original"))))
    const out = await runCommit(testUserId, [row("2026-04-01", "Renamed", "10.000", { transaction_id: inserted.id })])
    expect(out.kind).toBe("ok")
    if (out.kind === "ok") expect(out.summary.updated).toBe(1)
    const [updated] = await db.select({ name: transactions.name }).from(transactions).where(eq(transactions.id, inserted.id))
    expect(updated.name).toBe("Renamed")
    expect(await countRows(transactions, testUserId)).toBe(1) // update, not insert
  })
})

describe.skipIf(!RUN)("CSV import — demo replace (real MySQL)", () => {
  it("replace_demo_data clears the demo and imports atomically; memorized rows survive", async () => {
    testUserId = await setupTestUser()
    const db = getDb()
    await db.transaction(async (tx: unknown) => loadDemoWorkspace(tx as never, testUserId))
    const demoTxns = await countRows(transactions, testUserId)
    expect(demoTxns).toBeGreaterThan(0)
    const memorizedBefore = await countRows(memorizedTransactions, testUserId)
    expect(memorizedBefore).toBeGreaterThan(0)

    const out = await runCommit(testUserId, [row("2026-05-01", "Real expense", "7.500")], { replaceDemo: true })
    expect(out.kind).toBe("ok")
    if (out.kind === "ok") expect(out.summary.created).toBe(1)

    // Demo transactions gone; exactly the one imported row remains.
    expect(await countRows(transactions, testUserId)).toBe(1)
    expect(await countRows(budgets, testUserId)).toBe(0)
    // Memorized rows primed by the demo survive the clear (10b-2 inherited quirk).
    expect(await countRows(memorizedTransactions, testUserId)).toBeGreaterThanOrEqual(memorizedBefore)
  })
})
