// CSV/XLSX import routes — Flask port of routes/upload.py (upload_preview :994, import_commit :1162).
// Thin orchestration; the work is in lib/import-lib.ts. Response shapes stay top-level (ok + fields,
// not under `data`) and error extras are spread top-level, matching the already-wired apps/web
// uploadApi + ImportDialogs (which read err.meta === the whole response body). See import-lib.ts
// deviation blocks 1-7.

import { Hono } from "hono"
import { z } from "zod"
import { getDb } from "../db/connection"
import { requireAuth } from "../middleware/auth"
import { createRateLimiter } from "../lib/rate-limit"
import { Sentry } from "../lib/sentry"
import { recordEvent, recordEventOnce } from "../lib/product-events-lib"
import { cacheBustDashboardMetrics, cacheBustSafeToSpend } from "../lib/analytics-cache"
import {
  getDemoWorkspaceState,
  clearDemoWorkspace,
  DEMO_REPLACED_WITH_IMPORT_EVENT,
} from "../lib/demo-data-lib"
import {
  MAX_UPLOAD_ROWS,
  MAX_UPLOAD_SIZE_BYTES,
  ColumnMappingRequiredError,
  FilePreviewError,
  readTabularFile,
  dfToPreviewRows,
  buildPreviewDuplicateHints,
  computeFileHash,
  validateRowsForCommit,
  planRows,
  applyPlanWithRetry,
  orderedRowResults,
  summarizeImportResults,
  hasBlockingRowResults,
  loadExistingByIds,
  type RowResult,
} from "../lib/import-lib"

export const uploadRouter = new Hono()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function err(c: any, message: string, status: number, code: string, extra: Record<string, unknown> = {}) {
  return c.json({ ok: false, data: null, error: message, code, ...extra }, status)
}

// ── POST /api/transactions/upload-preview (Flask upload_preview :994) ──────────
uploadRouter.post("/upload-preview", requireAuth, createRateLimiter(10, 60), async (c) => {
  const { userId } = c.var.session

  let body: Record<string, unknown>
  try {
    body = await c.req.parseBody()
  } catch {
    return err(c, "Please choose a CSV or Excel file.", 400, "upload_preview_file_required")
  }
  const file = body["file"]
  if (!(file instanceof File) || !file.name) {
    return err(c, "Please choose a CSV or Excel file.", 400, "upload_preview_file_required")
  }

  // Size limit enforced in-handler (deviation 2): 12 MB → 400 FILE_TOO_LARGE.
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return err(c, `File is too large. Maximum upload size is ${MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)} MB.`, 400, "FILE_TOO_LARGE", {
      max_size_bytes: MAX_UPLOAD_SIZE_BYTES,
    })
  }

  let userMapping: Record<string, string> | null = null
  const columnMapRaw = body["column_map"]
  if (typeof columnMapRaw === "string" && columnMapRaw) {
    try {
      const parsed = JSON.parse(columnMapRaw)
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object")
      userMapping = parsed as Record<string, string>
    } catch {
      return err(c, "Invalid column_map value.", 400, "upload_preview_invalid_mapping")
    }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const fileHash = computeFileHash(bytes)

  let mapped
  let preview
  try {
    mapped = await readTabularFile(bytes, file.name, userMapping)
    preview = dfToPreviewRows(mapped.rows)
  } catch (e) {
    if (e instanceof ColumnMappingRequiredError) {
      const displayMap: Record<string, string> = { date: "date", name: "name", amount: "amount_kd", amount_kd: "amount_kd" }
      const missingColumns = e.missingRequired.map((col) => displayMap[col] ?? col)
      const missingText = missingColumns.length ? missingColumns.join(", ") : "date, name, amount_kd"
      return err(c, `Missing required columns: ${missingText}.`, 400, "MISSING_COLUMNS", {
        missing_columns: missingColumns,
        all_columns: e.allColumns,
        suggested_mapping: e.suggestedMapping,
        raw_rows: e.rawRows,
      })
    }
    if (e instanceof FilePreviewError) {
      return err(c, e.message, 400, e.code, e.meta)
    }
    const msg = (e instanceof Error ? e.message : "").toLowerCase()
    if (msg.includes("utf-8") && (msg.includes("decode") || msg.includes("encoded"))) {
      return err(c, "CSV files must be UTF-8 encoded.", 400, "NON_UTF8_FILE")
    }
    if (msg.includes("file is empty") || msg.includes("no columns to parse")) {
      return err(c, "Uploaded file contains no data rows.", 400, "EMPTY_FILE")
    }
    Sentry.captureException(e, { tags: { handler: "upload.preview", userId } })
    return err(c, "Failed to process file. Please check the format.", 400, "upload_preview_parse_failed")
  }

  const { rows, skipped, flaggedRows, skippedRows } = preview
  if (mapped.rows.length === 0) {
    return err(c, "Uploaded file contains no data rows.", 400, "EMPTY_FILE")
  }
  if (rows.length === 0) {
    if (flaggedRows.length > 0) {
      return err(c, "No valid rows were found. All amount values were negative or zero. Check if your file uses negative values for expenses — enter the absolute value instead.", 400, "INVALID_ROWS", {
        input_rows: mapped.rows.length, skipped, skipped_row_details: skippedRows.slice(0, 100),
        skipped_row_count: skippedRows.length, flagged_rows: flaggedRows.slice(0, 50), flagged_count: flaggedRows.length,
      })
    }
    return err(c, "No valid rows were found. Check date and amount formats.", 400, "INVALID_ROWS", {
      input_rows: mapped.rows.length, skipped, skipped_row_details: skippedRows.slice(0, 100), skipped_row_count: skippedRows.length,
    })
  }

  const PREVIEW_CAP = 2000
  const previewRows = rows.slice(0, PREVIEW_CAP)
  const db = getDb()
  const hints = await buildPreviewDuplicateHints(db, previewRows, userId)
  const decorated = previewRows.map((row) => {
    const hint = hints.get(row.row_index)
    return hint ? { ...row, ...hint } : row
  })
  const capped = rows.length > PREVIEW_CAP
  const rowsTruncated = Math.max(rows.length - PREVIEW_CAP, 0)

  return c.json({
    ok: true,
    count: rows.length,
    preview_count: previewRows.length,
    skipped,
    skipped_rows: skippedRows.slice(0, 100),
    skipped_row_count: skippedRows.length,
    flagged_count: flaggedRows.length,
    flagged_rows: flaggedRows.slice(0, 50),
    capped,
    rows_truncated: rowsTruncated,
    preview_rows: decorated,
    file_hash: fileHash,
    original_columns: mapped.colmap,
    schema: ["transaction_id", "date", "merchant", "category", "name", "amount_kd", "memo"],
    note: "Edit rows client-side, then POST to /transactions/import-commit.",
  })
})

// import-commit body — tolerates unknown fields (Flask parity: `atomic` accepted-but-ignored).
const ImportCommitSchema = z
  .object({
    rows: z.array(z.unknown()).optional(),
    allow_duplicates: z.unknown().optional(),
    replace_demo_data: z.unknown().optional(),
    file_hash: z.string().optional(),
    batch_id: z.string().optional(),
  })
  .passthrough()

// Thrown inside the db.transaction to force a whole-batch rollback (atomic mode).
class AtomicApplyRollback extends Error {
  ordered: RowResult[]
  constructor(ordered: RowResult[]) {
    super("import_atomic_apply_rollback")
    this.ordered = ordered
  }
}

// ── POST /api/transactions/import-commit (Flask import_commit :1162) ───────────
uploadRouter.post("/import-commit", requireAuth, createRateLimiter(10, 60), async (c) => {
  const { userId } = c.var.session
  const db = getDb()

  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    raw = {}
  }
  const parsed = ImportCommitSchema.safeParse(raw ?? {})
  const payload = parsed.success ? parsed.data : {}

  const rows = Array.isArray(payload.rows) ? payload.rows : []
  const allowDups = Boolean(payload.allow_duplicates)
  const replaceDemoData = Boolean(payload.replace_demo_data)
  const fileHash = (typeof payload.file_hash === "string" ? payload.file_hash.trim() : "") || null
  const batchId = (typeof payload.batch_id === "string" ? payload.batch_id.trim() : "") || null

  if (rows.length === 0) {
    return err(c, "No rows provided.", 400, "import_rows_required")
  }
  if (rows.length > MAX_UPLOAD_ROWS) {
    return err(c, `Too many rows (${rows.length.toLocaleString()}). Maximum is ${MAX_UPLOAD_ROWS.toLocaleString()}.`, 400, "import_rows_limit_exceeded", { max_rows: MAX_UPLOAD_ROWS })
  }

  const importBatchId = batchId ?? (fileHash ? crypto.randomUUID() : null)

  // Demo-workspace guard (Flask :1175-1183). Read-only; runs before any writes.
  const demoState = await getDemoWorkspaceState(db, userId)
  if (demoState.active && !replaceDemoData) {
    return err(c, "Demo data is still active. Clear it or replace it during import to avoid mixing sample and real records.", 409, "demo_data_replace_required", { ...demoState })
  }

  const { validRows, rowResults, autoExcludedRows } = validateRowsForCommit(rows)
  const existingById = await loadExistingByIds(
    db, userId, validRows.filter((r) => r.transactionId !== null).map((r) => r.transactionId as number),
  )
  const { plans, rowResults: planningResults } = await planRows(db, validRows, { userId, fileHash, allowDups, existingById })
  for (const [k, v] of planningResults) rowResults.set(k, v)

  // Atomic precheck (Flask :1200-1229): any blocker before apply ⇒ nothing is written.
  const precheckBlocking = hasBlockingRowResults([...rowResults.values()])
  if (precheckBlocking) {
    for (const plan of plans) {
      if (!rowResults.has(plan.row.rowIndex)) {
        rowResults.set(plan.row.rowIndex, {
          row_index: plan.row.rowIndex, status: "blocked_atomic", error_code: "import_atomic_pending",
          message: "This row was not saved because another row in the batch needs attention.",
        })
      }
    }
    const ordered = orderedRowResults(rows.length, rowResults)
    const summary = summarizeImportResults({ totalRows: rows.length, validRows: validRows.length, plannedRows: plans.length, rowResults: ordered })
    return err(c, "Import blocked. Fix or exclude the flagged rows, then try again.", 409, "import_atomic_precheck_failed", {
      row_results: ordered, summary, auto_excluded_count: autoExcludedRows.length, auto_excluded_rows: autoExcludedRows,
    })
  }

  let demoReplacedSummary: Record<string, unknown> | null = null
  let committed: { ordered: RowResult[]; summary: ReturnType<typeof summarizeImportResults> } | null = null
  try {
    committed = await db.transaction(async (tx: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = tx as any
      if (demoState.active && replaceDemoData && plans.length > 0) {
        demoReplacedSummary = { ...(await clearDemoWorkspace(t, userId)) }
      }
      const categoryCache = new Map<string, { id: number; name: string }>()
      for (const plan of plans) {
        rowResults.set(plan.row.rowIndex, await applyPlanWithRetry(t, plan, userId, categoryCache, importBatchId))
      }
      const ordered = orderedRowResults(rows.length, rowResults)
      const summary = summarizeImportResults({ totalRows: rows.length, validRows: validRows.length, plannedRows: plans.length, rowResults: ordered })
      // Atomic apply blocker (Flask :1275): throw ⇒ whole transaction (incl. demo clear) rolls back.
      if (hasBlockingRowResults(ordered)) throw new AtomicApplyRollback(ordered)
      return { ordered, summary }
    })
  } catch (e) {
    if (e instanceof AtomicApplyRollback) {
      let rolledBack = 0
      const rollbackResults = e.ordered.map((r) => {
        if (r.status === "created" || r.status === "updated") {
          rolledBack += 1
          return { ...r, status: "rolled_back", error_code: "import_atomic_rolled_back", message: "This row was not saved because another row in the batch failed." }
        }
        return r
      })
      const summary = summarizeImportResults({ totalRows: rows.length, validRows: validRows.length, plannedRows: plans.length, rowResults: e.ordered })
      const rollbackSummary = { ...summary, imported: 0, created: 0, updated: 0, rolled_back: rolledBack }
      const message = rolledBack > 0
        ? "Import rolled back. Fix the flagged rows and try again so the batch can import cleanly."
        : "Import blocked during commit. No rows were saved. Fix or exclude the flagged rows, then try again."
      return err(c, message, 409, "import_atomic_apply_failed", {
        row_results: rollbackResults, summary: rollbackSummary, auto_excluded_count: autoExcludedRows.length, auto_excluded_rows: autoExcludedRows,
      })
    }
    Sentry.captureException(e, { tags: { handler: "upload.importCommit", userId } })
    return err(c, "Commit failed. Please try again.", 500, "import_commit_failed")
  }

  const { ordered, summary } = committed
  const imported = summary.imported
  const demoReplaced: Record<string, unknown> | null = demoReplacedSummary

  if (imported > 0) {
    try {
      await recordEvent(userId, "import_performed", { imported }, db)
      await recordEventOnce(userId, "import_completed", { imported }, db)
      if (demoReplaced) {
        await recordEvent(userId, DEMO_REPLACED_WITH_IMPORT_EVENT, { imported, ...(demoReplaced as Record<string, unknown>) }, db)
      }
    } catch (e) {
      Sentry.captureException(e, { tags: { handler: "upload.importCommit.events", userId } })
    }
  }
  if (imported > 0 || demoReplaced !== null) {
    ;(async () => {
      try {
        await Promise.all([cacheBustDashboardMetrics(userId, db), cacheBustSafeToSpend(userId)])
      } catch (e) {
        Sentry.captureException(e, { tags: { handler: "upload.importCommit.cacheBust", userId } })
      }
    })()
  }

  return c.json({
    ok: true,
    imported,
    imported_count: imported,
    created: summary.created,
    updated: summary.updated,
    unchanged: summary.unchanged,
    import_batch_id: importBatchId,
    skipped: summary.skipped,
    skipped_duplicate: summary.skipped_duplicate,
    skipped_idempotent: summary.skipped_idempotent,
    failed_internal: summary.failed_internal,
    auto_excluded_count: autoExcludedRows.length,
    auto_excluded_rows: autoExcludedRows,
    row_results: ordered,
    summary,
    demo_workspace_replaced: demoReplacedSummary,
  })
})
