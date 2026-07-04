import React, { useEffect, useId, useRef, useState } from "react"
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Download, Filter, Plus, RotateCcw, Scissors, Undo2, Upload, X } from "lucide-react"
// @tanstack/react-virtual removed: the preview card (~380-480px per row) is too tall
// for virtualizer estimates (was 80px), causing absolute-positioned items to stack on
// each other. The desktop table is compact enough for 2000 rows without virtualization;
// the mobile card view uses native scroll.

import { ApiError, uploadApi } from "@/lib/api"
import { cn, fmt3, today } from "@/lib/utils"
import { validatePositiveAmount, validateRequiredDate } from "@/lib/validation"
import { useToast } from "@/components/ui/toaster"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import {
  type PreviewRow,
  normalizeAmountForInput,
  normalizeDateForInput,
  useSuggestions,
} from "./helpers"
import type { DemoWorkspaceState } from "@/types/api"

const IMPORT_UPLOAD_MAX_ROWS = 10_000
const IMPORT_PREVIEW_ROW_CAP = 2_000
const LARGE_SPREADSHEET_WARNING_BYTES = 5 * 1024 * 1024

function normalizePreviewTransactionId(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isInteger(raw)) return raw
  const text = String(raw ?? "").trim()
  if (!text) return undefined
  const normalized = Number(text)
  if (!Number.isInteger(normalized)) return undefined
  return normalized
}

function countCsvDataRows(text: string): number {
  const nonEmptyLines = text
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  return nonEmptyLines.length > 0 ? Math.max(nonEmptyLines.length - 1, 0) : 0
}

function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return file.text()
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."))
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "")
    reader.readAsText(file)
  })
}

async function inferImportLimitWarning(file: File): Promise<string | null> {
  const lowerName = file.name.toLowerCase()

  if (lowerName.endsWith(".csv")) {
    try {
      const csvText = await readFileText(file)
      const rowCount = countCsvDataRows(csvText)
      if (rowCount > IMPORT_UPLOAD_MAX_ROWS) {
        return `This CSV appears to contain ${rowCount.toLocaleString()} data rows. The maximum per import is ${IMPORT_UPLOAD_MAX_ROWS.toLocaleString()} rows. Split it into smaller files before uploading.`
      }
    } catch {
      return null
    }
    return null
  }

  if (lowerName.endsWith(".xlsx") && file.size >= LARGE_SPREADSHEET_WARNING_BYTES) {
    return `This spreadsheet is large and may exceed the ${IMPORT_UPLOAD_MAX_ROWS.toLocaleString()}-row import limit. If preview fails, split it into smaller files before uploading.`
  }

  return null
}

function useMinWidth(minWidthPx: number): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false
    }
    return window.matchMedia(`(min-width: ${minWidthPx}px)`).matches
  })

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return
    }

    const query = window.matchMedia(`(min-width: ${minWidthPx}px)`)
    const update = () => setMatches(query.matches)
    update()

    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", update)
      return () => query.removeEventListener("change", update)
    }

    query.addListener(update)
    return () => query.removeListener(update)
  }, [minWidthPx])

  return matches
}

// ============================================================
// Column Mapping Step
// ============================================================

type MappingState = {
  file: File
  allColumns: string[]
  suggestedMapping: Record<string, string>
  rawRows: Record<string, string>[]
}

export type SkippedRowDiagnostic = {
  row_number: number
  reason: string
  name?: string
  raw_date?: string
  raw_amount?: string
  raw_transaction_id?: string
}

export type FlaggedRowDiagnostic = {
  row_number: number
  reason: string
  name?: string
  raw_amount?: string
}

type ImportPreviewMeta = {
  capped: boolean
  totalCount: number
  rowsTruncated: number
  flaggedCount: number
  fileHash?: string
  flaggedRows: FlaggedRowDiagnostic[]
  skippedRows: SkippedRowDiagnostic[]
}

type ImportCommitRowResult = {
  row_index: number
  status: string
  error_code?: string
  message?: string
}

type ImportCommitDiagnostics = {
  code?: string
  message: string
  rowResults: ImportCommitRowResult[]
  summary?: Record<string, unknown>
}

type PreviewRowIssue = {
  key: string
  message: string
}

type PreviewRowValidation = {
  issues: PreviewRowIssue[]
  validItems: Array<{
    name: string
    category: string
    amount_kd: string
  }>
  total: number
}

const MAPPING_FIELDS = [
  { key: "date", label: "Date", required: true },
  { key: "name", label: "Description / Name", required: true },
  { key: "amount_kd", label: "Amount (KD)", required: true },
  { key: "category", label: "Category", required: false },
  { key: "merchant", label: "Merchant", required: false },
] as const

function parsePreviewAmount(value: string): number {
  return parseFloat(String(value || "").replace(/,/g, "")) || 0
}

function formatUploadPreviewError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "FILE_TOO_LARGE") {
      const maxRows = Number(err.meta?.max_rows)
      const rowCount = Number(err.meta?.row_count)
      if (Number.isFinite(maxRows) && Number.isFinite(rowCount)) {
        return `This file has ${rowCount.toLocaleString()} rows. Split it into files with ${maxRows.toLocaleString()} rows or fewer and try again.`
      }
      if (Number.isFinite(maxRows)) {
        return `This file is too large. Upload ${maxRows.toLocaleString()} rows or fewer and try again.`
      }
    }

    if (err.code === "INVALID_ROWS") {
      const inputRows = Number(err.meta?.input_rows)
      const skippedRows = Number(err.meta?.skipped_rows)
      if (Number.isFinite(inputRows) && Number.isFinite(skippedRows)) {
        return `We couldn't find valid transactions in that file. ${skippedRows.toLocaleString()} of ${inputRows.toLocaleString()} rows were skipped. Check the date and amount columns, then try again.`
      }
      return "We couldn't find valid transactions in that file. Check the date and amount columns, then try again."
    }

    if (err.code === "EMPTY_FILE") {
      return "That file has no data rows to preview."
    }
  }

  return err instanceof Error ? err.message : "We couldn't read that file right now."
}

function readSkippedRowDiagnostics(meta: Record<string, unknown> | undefined): SkippedRowDiagnostic[] {
  const raw = meta?.skipped_row_details ?? meta?.skipped_rows
  if (!Array.isArray(raw)) return []
  return raw.reduce<SkippedRowDiagnostic[]>((acc, row) => {
    if (!row || typeof row !== "object") return acc
    const rec = row as Record<string, unknown>
    const rowNumber = Number(rec.row_number)
    const reason = String(rec.reason || "").trim()
    if (!Number.isFinite(rowNumber) || !reason) return acc
    acc.push({
      row_number: rowNumber,
      reason,
      name: typeof rec.name === "string" ? rec.name : undefined,
      raw_date: typeof rec.raw_date === "string" ? rec.raw_date : undefined,
      raw_amount: typeof rec.raw_amount === "string" ? rec.raw_amount : undefined,
      raw_transaction_id: typeof rec.raw_transaction_id === "string" ? rec.raw_transaction_id : undefined,
    })
    return acc
  }, [])
}

function readFlaggedRowDiagnostics(meta: Record<string, unknown> | undefined): FlaggedRowDiagnostic[] {
  const raw = meta?.flagged_rows
  if (!Array.isArray(raw)) return []
  return raw.reduce<FlaggedRowDiagnostic[]>((acc, row) => {
    if (!row || typeof row !== "object") return acc
    const rec = row as Record<string, unknown>
    const rowNumber = Number(rec.row_number)
    const reason = String(rec.reason || "").trim()
    if (!Number.isFinite(rowNumber) || !reason) return acc
    acc.push({
      row_number: rowNumber,
      reason,
      name: typeof rec.name === "string" ? rec.name : undefined,
      raw_amount: typeof rec.raw_amount === "string" ? rec.raw_amount : undefined,
    })
    return acc
  }, [])
}

function validatePreviewRow(row: PreviewRow): PreviewRowValidation {
  const issues: PreviewRowIssue[] = []
  const validItems: PreviewRowValidation["validItems"] = []

  const dateValidation = validateRequiredDate(row.date || "")
  if (dateValidation.tone === "error") {
    issues.push({ key: "date", message: dateValidation.message })
  }

  const name = row.name.trim()
  const category = row.category.trim()
  const amount_kd = String(row.amount_kd || "").trim()

  if (!name) {
    issues.push({ key: "name", message: "Name is required." })
  }
  if (!category) {
    issues.push({ key: "category", message: "Category is required." })
  }
  const amountValidation = validatePositiveAmount(amount_kd, "Amount")
  if (amountValidation.tone === "error") {
    issues.push({ key: "amount", message: amountValidation.message })
  }

  if (name && category && amountValidation.tone === "valid") {
    validItems.push({ name, category, amount_kd })
  }

  if (validItems.length === 0 && issues.filter(i => i.key !== "date").length === 0) {
    issues.push({ key: "name", message: "Name is required." })
  }

  return {
    issues,
    validItems,
    total: validItems.reduce((sum, item) => sum + parsePreviewAmount(item.amount_kd), 0),
  }
}


function PreviewDiagnosticList({
  description,
  rows,
  title,
}: {
  description: string
  rows: Array<SkippedRowDiagnostic | FlaggedRowDiagnostic>
  title: string
}) {
  const [expanded, setExpanded] = useState(rows.length === 1)

  if (rows.length === 0) return null

  return (
    <div className="status-card status-card-warning">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={expanded}
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
        <span className="flex-1 text-sm font-medium text-foreground">{title}</span>
        <span className="mr-1.5 text-xs text-muted-foreground">
          {rows.length} {rows.length === 1 ? "row" : "rows"}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
            expanded && "rotate-180"
          )}
        />
      </button>
      {expanded ? (
        <div className="mt-2.5 space-y-2 pl-5">
          <p className="text-xs text-muted-foreground">{description}</p>
          <DiagnosticIssueRows rows={rows} />
        </div>
      ) : null}
    </div>
  )
}

function DiagnosticIssueRows({
  rows,
}: {
  rows: Array<SkippedRowDiagnostic | FlaggedRowDiagnostic>
}) {
  const visibleRows = rows.slice(0, 4)
  const hiddenCount = rows.length - visibleRows.length

  if (rows.length === 0) return null

  return (
    <div className="space-y-2">
      {visibleRows.map((row) => (
        <div
          key={`${row.row_number}-${row.reason}`}
          className="rounded-[var(--radius-inner)] border border-border/50 bg-background px-3 py-2"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Row {row.row_number}
          </p>
          <p className="mt-1 text-sm text-foreground">{row.reason}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {row.name ? `Name: ${row.name}` : "Name: (blank)"}
            {" · "}
            Date: {"raw_date" in row ? (row.raw_date || "(blank)") : "(not captured)"}
            {" · "}
            Amount: {row.raw_amount || "(blank)"}
          </p>
        </div>
      ))}
      {hiddenCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          {hiddenCount} more {hiddenCount === 1 ? "row" : "rows"} hidden.
        </p>
      ) : null}
    </div>
  )
}

function SourceIssueNote({
  flaggedCount,
  flaggedRows,
  skippedRows,
}: {
  flaggedCount: number
  flaggedRows: FlaggedRowDiagnostic[]
  skippedRows: SkippedRowDiagnostic[]
}) {
  const [expanded, setExpanded] = useState(false)
  const totalExcluded = Math.max(flaggedRows.length, flaggedCount)
  const totalSkipped = skippedRows.length
  const total = totalExcluded + totalSkipped

  if (total === 0) return null

  const parts: string[] = []
  if (totalExcluded > 0)
    parts.push(
      totalExcluded === 1
        ? "1 row excluded: zero or negative amount"
        : `${totalExcluded} rows excluded: zero or negative amounts`
    )
  if (totalSkipped > 0)
    parts.push(totalSkipped === 1 ? "1 row could not load" : `${totalSkipped} rows could not load`)

  const allRows: Array<SkippedRowDiagnostic | FlaggedRowDiagnostic> = [
    ...flaggedRows,
    ...skippedRows,
  ]

  return (
    <div className="rounded-[var(--radius-card)] border border-border/60 bg-muted/15 px-4 py-3 shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 text-left"
        aria-expanded={expanded}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/50 bg-background/80 text-muted-foreground shadow-sm">
          <AlertTriangle className="h-3.5 w-3.5" />
        </span>
        <span className="flex-1 text-sm text-muted-foreground">{parts.join(" · ")}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-150",
            expanded && "rotate-180"
          )}
        />
      </button>
      {expanded ? (
        <div className="mt-3 border-t border-border/40 pt-3">
          <DiagnosticIssueRows rows={allRows} />
        </div>
      ) : null}
    </div>
  )
}

function ImportCommitDiagnosticsBar({
  diagnostics,
  onViewDetails,
}: {
  diagnostics: ImportCommitDiagnostics | null
  onViewDetails: () => void
}) {
  if (!diagnostics) return null

  const rootCauseCount = diagnostics.rowResults.filter((row) =>
    ["skipped_duplicate", "skipped_invalid", "failed_internal"].includes(row.status)
  ).length

  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-destructive/25 bg-destructive/5 px-3.5 py-2.5 shadow-sm">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
      <p className="flex-1 truncate text-sm text-destructive">
        {diagnostics.message}
        {rootCauseCount > 0 && (
          <span className="text-destructive/75">
            {" "}·{" "}{rootCauseCount} {rootCauseCount === 1 ? "row needs" : "rows need"} attention.
          </span>
        )}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onViewDetails}
        className="h-7 shrink-0 border-destructive/30 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        View details
      </Button>
    </div>
  )
}

function ImportCommitDiagnosticsDialog({
  diagnostics,
  open,
  onClose,
  onJumpToRow,
}: {
  diagnostics: ImportCommitDiagnostics | null
  open: boolean
  onClose: () => void
  onJumpToRow: (rowIndex: number) => void
}) {
  if (!diagnostics) return null

  const rootCauseRows = diagnostics.rowResults.filter((row) =>
    ["skipped_duplicate", "skipped_invalid", "failed_internal"].includes(row.status)
  )
  const blockedRows = diagnostics.rowResults.filter((row) =>
    ["blocked_atomic", "rolled_back"].includes(row.status)
  )
  const rolledBack = Number(diagnostics.summary?.rolled_back || 0)

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-lg sm:w-full">
        <DialogHeader>
          <DialogTitle className="text-destructive">Import blocked</DialogTitle>
          <DialogDescription>
            {diagnostics.message}
            {rolledBack > 0
              ? ` ${rolledBack} previously applied row${rolledBack === 1 ? " was" : "s were"} rolled back.`
              : " Exclude or fix the rows below, then re-run the import."}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] space-y-2 overflow-auto pr-1">
          {rootCauseRows.map((row) => (
            <div
              key={`${row.row_index}-${row.status}-${row.error_code || ""}`}
              className="flex items-start gap-3 rounded-[var(--radius-inner)] border border-destructive/20 bg-background px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
                  Row {row.row_index + 1}
                </p>
                <p className="mt-0.5 text-sm text-foreground">{row.message || "Import blocked for this row."}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  onClose()
                  onJumpToRow(row.row_index)
                }}
                className="h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Go to row
              </Button>
            </div>
          ))}
          {blockedRows.length > 0 && (
            <p className="px-1 text-xs text-muted-foreground">
              {blockedRows.length} other {blockedRows.length === 1 ? "row was" : "rows were"} not imported because of the {rootCauseRows.length === 1 ? "issue" : "issues"} above.
            </p>
          )}
        </div>
        <div className="flex justify-end border-t border-border/40 pt-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function duplicateLabel(row: PreviewRow): string {
  switch (row.duplicate_reason) {
    case "import_row_duplicate_existing":
      return "Likely duplicate in your account"
    case "import_row_duplicate_batch":
      return "Duplicate inside this file"
    case "import_row_duplicate_fuzzy_existing":
      return "Potential duplicate in your account"
    case "import_row_duplicate_fuzzy_batch":
      return "Potential duplicate in this file"
    case "import_row_idempotent":
      return "Already imported before"
    default:
      return "Likely duplicate"
  }
}

function duplicateChipLabel(row: PreviewRow): string {
  switch (row.duplicate_reason) {
    case "import_row_duplicate_batch":
      return "Also in file"
    case "import_row_duplicate_fuzzy_existing":
      return "Potential duplicate"
    case "import_row_duplicate_fuzzy_batch":
      return "Potential match"
    case "import_row_idempotent":
      return "Already imported"
    default:
      return "Duplicate"
  }
}

function PreviewRowIssueRail({
  expanded,
  onToggle,
  row,
  validation,
}: {
  expanded: boolean
  onToggle: () => void
  row: PreviewRow
  validation: PreviewRowValidation
}) {
  const validationIssues = row.excluded ? [] : validation.issues
  const visibleIssues = validationIssues.slice(0, 3)
  const hiddenCount = validationIssues.length - visibleIssues.length

  if (!row.likely_dup && !row.excluded && validationIssues.length === 0) return null

  let annotationText: string
  let annotationClass: string
  let pillClass: string
  let dotClass: string

  if (row.excluded) {
    annotationText = "Excluded"
    annotationClass = "text-muted-foreground"
    pillClass = "border-border/55 bg-background/70 hover:border-border/70"
    dotClass = "bg-muted-foreground/70"
  } else if (row.likely_dup && validationIssues.length > 0) {
    annotationText = `${duplicateChipLabel(row)} · ${validationIssues.length} field issue${validationIssues.length === 1 ? "" : "s"}`
    annotationClass = "text-destructive"
    pillClass = "border-destructive/20 bg-destructive/5 hover:border-destructive/35"
    dotClass = "bg-destructive"
  } else if (row.likely_dup) {
    annotationText = duplicateChipLabel(row)
    annotationClass = "text-warning"
    pillClass = "border-warning/25 bg-warning/5 hover:border-warning/40"
    dotClass = "bg-warning"
  } else {
    annotationText = `${validationIssues.length} field issue${validationIssues.length === 1 ? "" : "s"}`
    annotationClass = "text-destructive"
    pillClass = "border-destructive/20 bg-destructive/5 hover:border-destructive/35"
    dotClass = "bg-destructive"
  }

  const hasDetails =
    (!row.excluded && Boolean(row.duplicate_message)) || visibleIssues.length > 0

  return (
    <div className="mb-2.5">
      {hasDetails ? (
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-sm transition-colors",
            annotationClass,
            pillClass
          )}
          aria-expanded={expanded}
          aria-label="Issue details"
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />
          <span>{annotationText}</span>
          <ChevronDown className={cn("h-3 w-3 transition-transform duration-150", expanded && "rotate-180")} />
        </button>
      ) : (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-sm",
            annotationClass,
            pillClass
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />
          <span>{annotationText}</span>
        </span>
      )}
      {expanded && hasDetails ? (
        <div className="mt-2 rounded-[var(--radius-inner)] border border-border/45 bg-muted/15 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          {row.duplicate_message ? (
            <p>
              <span className="font-medium text-foreground/80">{duplicateLabel(row)}: </span>
              {row.duplicate_message}
            </p>
          ) : null}
          <div className={cn("space-y-0.5", row.duplicate_message && visibleIssues.length > 0 && "mt-1.5")}>
            {visibleIssues.map((issue) => (
              <p key={issue.key}>{issue.message}</p>
            ))}
          </div>
          {hiddenCount > 0 ? (
            <p className={cn(visibleIssues.length > 0 && "mt-1")}>
              {hiddenCount} more issue{hiddenCount === 1 ? "" : "s"}.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function ColumnMappingStep({
  allColumns,
  suggestedMapping,
  rawRows,
  loading,
  onApply,
  onBack,
}: {
  allColumns: string[]
  suggestedMapping: Record<string, string>
  rawRows: Record<string, string>[]
  loading: boolean
  onApply: (mapping: Record<string, string>) => void
  onBack: () => void
}) {
  const [mapping, setMapping] = React.useState<Record<string, string>>(
    () => ({ ...suggestedMapping })
  )
  const selectedColumns = Object.values(mapping).filter((value) => value)
  const duplicateColumns = Array.from(
    new Set(selectedColumns.filter((value, idx) => selectedColumns.indexOf(value) !== idx))
  )

  const isValid = MAPPING_FIELDS.filter((f) => f.required).every(
    (f) => mapping[f.key] && mapping[f.key] !== ""
  ) && duplicateColumns.length === 0

  const previewRows = rawRows.slice(0, 3)

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium">Map your columns</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          We couldn't auto-detect all required columns from your file. Match each field to the correct column below.
        </p>
      </div>

      {/* Sample data table */}
      {previewRows.length > 0 && (
        <div className="surface-scroll-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                {allColumns.map((col) => (
                  <th key={col} className="th-standard whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, i) => (
                <tr key={i} className="border-b border-border/40 last:border-0">
                  {allColumns.map((col) => (
                    <td key={col} className="max-w-[160px] truncate whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                      {row[col] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mapping form */}
      <div className="space-y-3">
        {MAPPING_FIELDS.map((field) => (
          <div key={field.key} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="sm:w-40 sm:shrink-0">
              <span className="text-sm font-medium">{field.label}</span>
              {field.required && <span className="ml-1 text-destructive">*</span>}
            </div>
            <Select
              value={mapping[field.key] ?? ""}
              onValueChange={(v) =>
                setMapping((prev) => ({ ...prev, [field.key]: v === "__skip__" ? "" : v }))
              }
            >
              <SelectTrigger className="w-full flex-1">
                <SelectValue placeholder="Select a column…" />
              </SelectTrigger>
              <SelectContent>
                {!field.required && (
                  <SelectItem value="__skip__">
                    <span className="text-muted-foreground">(skip)</span>
                  </SelectItem>
                )}
                {allColumns.map((col) => (
                  <SelectItem key={col} value={col}>
                    {col}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
      {duplicateColumns.length > 0 ? (
        <div className="status-card status-card-warning">
          Each field must use a different source column. Duplicate selection: {duplicateColumns.join(", ")}.
        </div>
      ) : null}

      <div className="flex flex-col-reverse justify-end gap-2 pt-1 sm:flex-row">
        <Button variant="outline" onClick={onBack} disabled={loading} className="w-full sm:w-auto">
          Back
        </Button>
        <Button
          variant="default"
          onClick={() => onApply(mapping)}
          loading={loading}
          disabled={!isValid || loading}
          className="w-full sm:w-auto"
        >
          {loading ? "Applying…" : "Apply Mapping"}
        </Button>
      </div>
    </div>
  )
}

function ImportCSVSection({
  onPreviewReady,
}: {
  onPreviewReady: (rows: PreviewRow[], meta: ImportPreviewMeta) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [mappingState, setMappingState] = useState<MappingState | null>(null)
  const [mappingLoading, setMappingLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorSkippedRows, setErrorSkippedRows] = useState<SkippedRowDiagnostic[]>([])
  const [errorFlaggedRows, setErrorFlaggedRows] = useState<FlaggedRowDiagnostic[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectionWarning, setSelectionWarning] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const selectionVersionRef = useRef(0)

  const processPreviewResponse = (data: Record<string, unknown>, idx_offset = 0): PreviewRow[] =>
    ((data.preview_rows || data.rows || []) as Record<string, unknown>[]).map(
      (r, idx) => {
        // If the server sent a legacy items array, use its first element's fields.
        const firstItem = r.items && Array.isArray(r.items) && r.items.length > 0
          ? (r.items as Array<Record<string, unknown>>)[0]
          : null
        return {
          transaction_id: normalizePreviewTransactionId(r.transaction_id),
          row_index: typeof r.row_index === "number" ? r.row_index : idx + idx_offset,
          date: normalizeDateForInput(r.date),
          merchant: String(r.merchant || ""),
          memo: String(r.memo || ""),
          name: String(firstItem?.name ?? r.name ?? ""),
          category: String(firstItem?.category ?? r.category ?? ""),
          amount_kd: normalizeAmountForInput(firstItem?.amount_kd ?? r.amount_kd),
          likely_dup: Boolean(r.likely_dup),
          duplicate_reason: typeof r.duplicate_reason === "string" ? r.duplicate_reason : null,
          duplicate_message: typeof r.duplicate_message === "string" ? r.duplicate_message : null,
          excluded: false,
          _key: idx + idx_offset,
        } satisfies PreviewRow
      }
    )

  const applyColumnMappingError = (err: unknown, file: File) => {
    if (!(err instanceof ApiError) || err.code !== "MISSING_COLUMNS") return false
    setMappingState({
      file,
      allColumns: Array.isArray(err.meta?.all_columns)
        ? err.meta?.all_columns.filter((value): value is string => typeof value === "string")
        : [],
      suggestedMapping:
        err.meta?.suggested_mapping && typeof err.meta.suggested_mapping === "object"
          ? (Object.fromEntries(
              Object.entries(err.meta.suggested_mapping as Record<string, unknown>).filter(
                ([, value]) => typeof value === "string"
              )
            ) as Record<string, string>)
          : {},
      rawRows: Array.isArray(err.meta?.raw_rows)
        ? (err.meta.raw_rows as Array<Record<string, string>>)
        : [],
    })
    setError(null)
    setErrorSkippedRows([])
    setErrorFlaggedRows([])
    return true
  }

  const handleUpload = async () => {
    const file = selectedFile ?? fileRef.current?.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    setErrorSkippedRows([])
    setErrorFlaggedRows([])
    try {
      const data = await uploadApi.preview(file)
      const rows = processPreviewResponse(data)
      onPreviewReady(rows, {
        capped: Boolean(data.capped),
        totalCount: Number(data.count || 0),
        rowsTruncated: Number(data.rows_truncated || 0),
        flaggedCount: Number(data.flagged_count || 0),
        fileHash: typeof data.file_hash === "string" ? data.file_hash : undefined,
        flaggedRows: readFlaggedRowDiagnostics(data as Record<string, unknown>),
        skippedRows: readSkippedRowDiagnostics(data as Record<string, unknown>),
      })
      if (fileRef.current) fileRef.current.value = ""
      setSelectedFile(null)
      setSelectionWarning(null)
    } catch (err) {
      if (applyColumnMappingError(err, file)) return
      setError(formatUploadPreviewError(err))
      setErrorSkippedRows(err instanceof ApiError ? readSkippedRowDiagnostics(err.meta) : [])
      setErrorFlaggedRows(err instanceof ApiError ? readFlaggedRowDiagnostics(err.meta) : [])
    } finally {
      setUploading(false)
    }
  }

  const handleApplyMapping = async (confirmedMapping: Record<string, string>) => {
    if (!mappingState) return
    setMappingLoading(true)
    setError(null)
    setErrorSkippedRows([])
    setErrorFlaggedRows([])
    try {
      const data = await uploadApi.preview(mappingState.file, confirmedMapping)
      setMappingState(null)
      const rows = processPreviewResponse(data)
      onPreviewReady(rows, {
        capped: Boolean(data.capped),
        totalCount: Number(data.count || 0),
        rowsTruncated: Number(data.rows_truncated || 0),
        flaggedCount: Number(data.flagged_count || 0),
        fileHash: typeof data.file_hash === "string" ? data.file_hash : undefined,
        flaggedRows: readFlaggedRowDiagnostics(data as Record<string, unknown>),
        skippedRows: readSkippedRowDiagnostics(data as Record<string, unknown>),
      })
      if (fileRef.current) fileRef.current.value = ""
      setSelectedFile(null)
      setSelectionWarning(null)
    } catch (err) {
      if (applyColumnMappingError(err, mappingState.file)) {
        setError("We couldn't apply that mapping. Check your selections and try again.")
        return
      }
      setError(formatUploadPreviewError(err))
      setErrorSkippedRows(err instanceof ApiError ? readSkippedRowDiagnostics(err.meta) : [])
      setErrorFlaggedRows(err instanceof ApiError ? readFlaggedRowDiagnostics(err.meta) : [])
    } finally {
      setMappingLoading(false)
    }
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectionVersion = selectionVersionRef.current + 1
    selectionVersionRef.current = selectionVersion
    const file = event.target.files?.[0] ?? null
    setSelectedFile(file)
    setError(null)
    setErrorSkippedRows([])
    setErrorFlaggedRows([])

    if (!file) {
      setSelectionWarning(null)
      return
    }

    const warning = await inferImportLimitWarning(file)
    if (selectionVersionRef.current !== selectionVersion) return
    setSelectionWarning(warning)
  }

  if (mappingState) {
    return (
        <div className="space-y-4">
        <ColumnMappingStep
          allColumns={mappingState.allColumns}
          suggestedMapping={mappingState.suggestedMapping}
          rawRows={mappingState.rawRows}
          loading={mappingLoading}
          onApply={handleApplyMapping}
          onBack={() => { setMappingState(null); setError(null) }}
        />
        {error && (
          <div className="status-card status-card-danger">
            {error}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Upload a CSV or Excel file to preview and import transactions.
      </p>
      <div className="status-card status-card-neutral">
        Maximum {IMPORT_UPLOAD_MAX_ROWS.toLocaleString()} rows per import. Preview shows up to{" "}
        {IMPORT_PREVIEW_ROW_CAP.toLocaleString()} rows at a time for review.
      </div>
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:flex-wrap sm:items-center">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx"
          onChange={handleFileChange}
          className="w-full text-sm text-muted-foreground file:mr-3 file:h-10 file:cursor-pointer file:rounded-md file:border file:border-border file:bg-muted file:px-4 file:text-sm file:font-medium file:text-foreground file:transition-colors hover:file:bg-accent"
        />
        <Button
          variant="default"
          onClick={handleUpload}
          loading={uploading}
          disabled={uploading || !selectedFile}
          className="w-full sm:w-auto"
        >
          {uploading ? "Uploading..." : "Preview & Import"}
        </Button>
      </div>
      {selectionWarning && (
        <div className="status-card status-card-warning">
          {selectionWarning}
        </div>
      )}
      {error && (
        <div className="status-card status-card-danger">
          {error}
        </div>
      )}
      <PreviewDiagnosticList
        title="Rows skipped during preview"
        description="These rows could not be previewed from the uploaded file."
        rows={errorSkippedRows}
      />
      <PreviewDiagnosticList
        title="Rows excluded from preview"
        description="These rows had unsupported amounts and were excluded before import."
        rows={errorFlaggedRows}
      />
    </div>
  )
}

// ============================================================
// ImportDialog
// ============================================================

export function ImportDialog({
  open,
  onOpenChange,
  onPreviewReady,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onPreviewReady: (rows: PreviewRow[], meta?: ImportPreviewMeta) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl space-y-5 sm:w-full">
        <DialogHeader>
          <DialogTitle>Import Transactions</DialogTitle>
          <DialogDescription>
            Import transactions from a CSV or Excel file.
          </DialogDescription>
        </DialogHeader>
        <div className="pt-2">
          <ImportCSVSection
            onPreviewReady={(rows, meta) => {
              onOpenChange(false)
              onPreviewReady(rows, meta)
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Split helpers
// ============================================================

type SplitEntry = {
  id: number
  name: string
  category: string
  amount_kd: string
}

function splitGroupId(): string {
  return `sg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

function SplitRowEditor({
  originalRow,
  catListId,
  nameListId,
  onConfirm,
  onCancel,
}: {
  originalRow: PreviewRow
  catListId: string
  nameListId: string
  onConfirm: (splits: SplitEntry[]) => void
  onCancel: () => void
}) {
  const originalMils = Math.round(
    (parseFloat(String(originalRow.amount_kd || "").replace(/,/g, "")) || 0) * 1000
  )
  const originalDisplay = (originalMils / 1000).toFixed(3)

  let splitIdCounter = 0
  const nextSplitId = () => --splitIdCounter

  const [splits, setSplits] = useState<SplitEntry[]>(() => [
    { id: nextSplitId(), name: originalRow.name, category: originalRow.category, amount_kd: "" },
    { id: nextSplitId(), name: "", category: "", amount_kd: "" },
  ])

  const toMils = (s: string) => {
    const v = parseFloat(String(s || "").replace(/,/g, ""))
    return Number.isFinite(v) && v > 0 ? Math.round(v * 1000) : 0
  }

  const allocatedMils = splits.reduce((sum, s) => sum + toMils(s.amount_kd), 0)
  const remainingMils = originalMils - allocatedMils
  const allFilled = splits.every(
    (s) => s.name.trim() && s.category.trim() && toMils(s.amount_kd) > 0
  )
  const canConfirm = allFilled && remainingMils === 0 && splits.length >= 2

  const updateSplit = (idx: number, field: keyof Omit<SplitEntry, "id">, value: string) => {
    setSplits((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)))
  }

  return (
    <div className="space-y-3 rounded-[var(--radius-card)] border border-primary/20 bg-primary/[0.03] p-4">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary/70">
          Split transaction
        </p>
        <p className="mt-0.5 text-sm text-foreground">
          {originalRow.name || "(no name)"} · KD {originalDisplay} · {originalRow.date}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Each split becomes a separate transaction after import.
        </p>
      </div>

      {/* Column headers — match the item grid */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(80px,140px)_96px_32px] gap-2 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
        <span>Name</span>
        <span>Category</span>
        <span className="text-right">Amount (KD)</span>
        <span />
      </div>

      {/* Split rows */}
      <div className="space-y-1.5">
        {splits.map((split, idx) => (
          <div
            key={split.id}
            className="grid grid-cols-[minmax(0,1fr)_minmax(80px,140px)_96px_32px] items-center gap-2"
          >
            <Input
              value={split.name}
              onChange={(e) => updateSplit(idx, "name", e.target.value)}
              placeholder={idx === 0 ? originalRow.name || "Name" : "Name"}
              list={nameListId}
              className="h-8 border-border/35 bg-background/70 text-sm shadow-none hover:border-border/60 focus:bg-background"
            />
            <Input
              value={split.category}
              onChange={(e) => updateSplit(idx, "category", e.target.value)}
              placeholder={idx === 0 ? originalRow.category || "Category" : "Category"}
              list={catListId}
              className="h-8 border-border/35 bg-background/70 text-sm shadow-none hover:border-border/60 focus:bg-background"
            />
            <Input
              type="text"
              inputMode="decimal"
              placeholder="0.000"
              value={split.amount_kd}
              onChange={(e) => updateSplit(idx, "amount_kd", e.target.value)}
              className="h-8 border-border/35 bg-background/70 text-right text-sm tabular-nums shadow-none hover:border-border/60 focus:bg-background"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setSplits((prev) => prev.filter((_, i) => i !== idx))}
              disabled={splits.length <= 2}
              className="h-8 w-8 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
              aria-label={`Remove split ${idx + 1}`}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>

      {splits.length < 10 && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setSplits((prev) => [...prev, { id: nextSplitId(), name: "", category: "", amount_kd: "" }])}
          className="h-auto w-full gap-1 py-1.5 text-xs text-primary hover:bg-primary/10"
        >
          <Plus className="h-3 w-3" />
          Add split
        </Button>
      )}

      {/* Running total + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-primary/15 pt-3">
        <div className="text-xs">
          {remainingMils === 0 ? (
            <span className="font-medium text-success">Total matches · KD {originalDisplay}</span>
          ) : remainingMils > 0 ? (
            <span className="text-muted-foreground">
              KD {(remainingMils / 1000).toFixed(3)} of KD {originalDisplay} unallocated
            </span>
          ) : (
            <span className="font-medium text-destructive">
              KD {(Math.abs(remainingMils) / 1000).toFixed(3)} over total
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="h-8 px-3 text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => onConfirm(splits)}
            disabled={!canConfirm}
            className="h-8 px-3 text-xs"
          >
            Confirm {splits.length} splits
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// PreviewImportDialog
// ============================================================

export function PreviewImportDialog({
  open,
  onOpenChange,
  initialRows,
  onImportComplete,
  categories,
  merchants,
  capped,
  totalCount,
  rowsTruncated,
  flaggedCount,
  flaggedRows,
  skippedRows,
  fileHash,
  demoWorkspace,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initialRows: PreviewRow[]
  onImportComplete: () => void
  categories: string[]
  merchants: string[]
  capped?: boolean
  totalCount?: number
  rowsTruncated?: number
  flaggedCount?: number
  flaggedRows?: FlaggedRowDiagnostic[]
  skippedRows?: SkippedRowDiagnostic[]
  fileHash?: string
  demoWorkspace?: DemoWorkspaceState
}) {
  const toast = useToast()
  const { suggestions, fetchSuggestions, lookup } = useSuggestions()
  const previewNameListId = useId()
  const previewCatListId = useId()
  const previewMerchantListId = useId()
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [removedStack, setRemovedStack] = useState<
    Array<{ row: PreviewRow; index: number }>
  >([])
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [commitDiagnostics, setCommitDiagnostics] = useState<ImportCommitDiagnostics | null>(null)
  const [showIssuesOnly, setShowIssuesOnly] = useState(false)
  const [currentIssuePos, setCurrentIssuePos] = useState(0)
  const [replaceDemoData, setReplaceDemoData] = useState(Boolean(demoWorkspace?.active))
  const [importSummary, setImportSummary] = useState<{
    created: number
    updated: number
    unchanged: number
    skipped: number
    skippedDup: number
    skippedIdempotent: number
  } | null>(null)
  const [expandedRowIssueKeys, setExpandedRowIssueKeys] = useState<Record<number, boolean>>({})
  const [showCommitDetails, setShowCommitDetails] = useState(false)
  const [splittingRowKey, setSplittingRowKey] = useState<number | null>(null)
  const dialogOpenRef = useRef(open)
  const rowContainerRef = useRef<HTMLDivElement | null>(null)
  const rowElementRefs = useRef<Record<number, HTMLElement | null>>({})
  const keyCounter = useRef(0)
  // 1024 px: table needs ~840 px minimum (fixed column widths + padding). Below 1024
  // the dialog is too narrow for the items grid and inputs overlap each other.
  const isDesktop = useMinWidth(1024)

  useEffect(() => {
    dialogOpenRef.current = open
  }, [open])

  useEffect(() => {
    if (open) {
      keyCounter.current = initialRows.length
      setRows(
        initialRows.map((r, i) => ({
          ...r,
          excluded: Boolean(r.excluded),
          _key: i,
        }))
      )
      setRemovedStack([])
      setError(null)
      setCommitDiagnostics(null)
      setImportSummary(null)
      setShowIssuesOnly(false)
      setCurrentIssuePos(0)
      setExpandedRowIssueKeys({})
      setShowCommitDetails(false)
      setSplittingRowKey(null)
      setReplaceDemoData(Boolean(demoWorkspace?.active))
    }
  }, [demoWorkspace?.active, initialRows, open])
  const rowValidation = rows.map(validatePreviewRow)
  const includedRowCount = rows.filter((row) => !row.excluded).length
  const excludedRowCount = rows.length - includedRowCount
  const invalidRowCount = rows.reduce((count, row, idx) => {
    if (row.excluded) return count
    return count + (rowValidation[idx].issues.length > 0 ? 1 : 0)
  }, 0)
  const likelyDuplicateCount = rows.reduce((count, row) => count + (!row.excluded && row.likely_dup ? 1 : 0), 0)
  const likelyReimport = rows.length > 0 && likelyDuplicateCount > 0 && likelyDuplicateCount / rows.length > 0.7
  const readyCount = includedRowCount
  const warningCount = likelyDuplicateCount
  const issueRowIndexes = rows.reduce<number[]>((indexes, row, rowIdx) => {
    const validation = rowValidation[rowIdx]
    if (row.likely_dup || row.excluded || (!row.excluded && validation.issues.length > 0)) indexes.push(rowIdx)
    return indexes
  }, [])
  const visibleRowIndexes = showIssuesOnly
    ? issueRowIndexes
    : rows.map((_row, rowIdx) => rowIdx)
  const visibleRows = visibleRowIndexes.map((rowIdx) => rows[rowIdx])
  const canToggleIssuesOnly = showIssuesOnly || issueRowIndexes.length > 0
  const issueIndexes = visibleRows.reduce<number[]>((indexes, row, index) => {
    const validation = rowValidation[visibleRowIndexes[index]]
    if (row.likely_dup || row.excluded || (!row.excluded && validation.issues.length > 0)) indexes.push(index)
    return indexes
  }, [])
  const allValid = includedRowCount > 0 && invalidRowCount === 0
  useEffect(() => {
    if (issueIndexes.length === 0) {
      setCurrentIssuePos(0)
      return
    }
    setCurrentIssuePos((value) => Math.min(value, issueIndexes.length - 1))
  }, [issueIndexes.length, showIssuesOnly])

  const updateRow = (idx: number, updater: (row: PreviewRow) => PreviewRow) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? updater(r) : r)))
  }

  const deleteRow = (idx: number) => {
    setRemovedStack((prev) => [...prev, { row: rows[idx], index: idx }])
    setRows((prev) => prev.filter((_, i) => i !== idx))
  }

  const toggleRowExcluded = (idx: number, excluded: boolean) => {
    updateRow(idx, (row) => ({ ...row, excluded }))
  }

  const undoDelete = () => {
    if (removedStack.length === 0) return
    const last = removedStack[removedStack.length - 1]
    setRemovedStack((prev) => prev.slice(0, -1))
    setRows((prev) => {
      const next = [...prev]
      const insertAt = Math.min(last.index, next.length)
      next.splice(insertAt, 0, last.row)
      return next
    })
  }

  const resetRows = () => {
    setRows(initialRows.map((r, i) => ({ ...r, excluded: false, _key: i })))
    setRemovedStack([])
    setError(null)
    setCommitDiagnostics(null)
    setExpandedRowIssueKeys({})
    setSplittingRowKey(null)
  }

  const commitSplit = (originalRowIdx: number, splits: SplitEntry[]) => {
    const originalRow = rows[originalRowIdx]
    const groupId = splitGroupId()
    const newRows: PreviewRow[] = splits.map((split, i) => ({
      ...originalRow,
      _key: ++keyCounter.current,
      name: split.name.trim(),
      category: split.category.trim(),
      amount_kd: parseFloat(split.amount_kd).toFixed(3),
      split_group_id: groupId,
      likely_dup: false,
      duplicate_reason: null,
      duplicate_message: null,
    }))
    setRows((prev) => {
      const next = [...prev]
      next.splice(originalRowIdx, 1, ...newRows)
      return next
    })
    setSplittingRowKey(null)
  }

  const downloadCSV = () => {
    if (rows.length === 0) return
    const esc = (s: string) => {
      s = String(s ?? "")
      if (s.includes('"')) s = s.replace(/"/g, '""')
      if (/[",\n\r]/.test(s)) s = `"${s}"`
      return s
    }
    const header = "transaction_id,date,merchant,category,name,amount_kd,memo"
    const lines = [header]
    for (const row of rows) {
      if (row.name.trim()) {
        lines.push(
          [
            row.transaction_id ? String(row.transaction_id) : "",
            row.date,
            row.merchant || "",
            row.category,
            row.name,
            fmt3(row.amount_kd),
            row.memo || "",
          ]
            .map(esc)
            .join(",")
        )
      }
    }
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, "0")
    a.href = url
    a.download = `expense-preview-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.csv`
    document.body.appendChild(a)
    a.click()
    URL.revokeObjectURL(url)
    a.remove()
  }

  const undoImportBatch = async (batchId: string) => {
    try {
      const result = await uploadApi.deleteImportBatch(batchId)
      onImportComplete()
      setImportSummary(null)
      onOpenChange(false)
      toast.success(
        `${result.deleted_count} imported transaction${result.deleted_count === 1 ? "" : "s"} removed.`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : "We couldn't undo that import right now."
      toast.error(msg)
    }
  }

  const handleImport = async () => {
    setError(null)
    setCommitDiagnostics(null)
    if (!allValid) {
      setError("Please fix highlighted rows before importing.")
      return
    }

    setImporting(true)
    try {
      const payload = rows.flatMap((row, rowIdx) => {
        if (row.excluded) return []
        const validation = rowValidation[rowIdx]
        const item = validation.validItems[0]
        if (!item) return []
        return [{
          transaction_id: row.transaction_id,
          row_index: row.row_index,
          date: row.date,
          merchant: row.merchant,
          memo: row.memo || "",
          category: item.category,
          name: item.name,
          amount_kd: parsePreviewAmount(item.amount_kd).toFixed(3),
        }]
      })

      const result = await uploadApi.importCommit(payload, {
        replaceDemoData,
        atomic: true,
        fileHash,
      })
      onImportComplete()
      const importedCount = Number(result.imported || 0)
      const importBatchId =
        typeof result.import_batch_id === "string" && result.import_batch_id.trim()
          ? result.import_batch_id
          : null
      setImportSummary({
        created: result.created || 0,
        updated: result.updated || 0,
        unchanged: result.unchanged || 0,
        skipped: result.skipped || 0,
        skippedDup: result.skipped_duplicate || 0,
        skippedIdempotent: result.skipped_idempotent || 0,
      })
      if (importedCount > 0 && importBatchId) {
        const expiresAt = Date.now() + 60_000
        let undone = false
        toast.success(
          `${importedCount} transaction${importedCount === 1 ? "" : "s"} imported.`,
          {
            label: "Undo",
            durationMs: 60_000,
            onClick: () => {
              if (undone || Date.now() > expiresAt || !dialogOpenRef.current) return
              undone = true
              void undoImportBatch(importBatchId)
            },
          }
        )
      } else if (importedCount > 0) {
        toast.success(`${importedCount} transaction${importedCount === 1 ? "" : "s"} imported.`)
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "demo_data_replace_required") {
        setReplaceDemoData(true)
      }
      if (
        err instanceof ApiError
        && (err.code === "import_atomic_precheck_failed" || err.code === "import_atomic_apply_failed")
      ) {
        setCommitDiagnostics({
          code: err.code,
          message: err.message,
          rowResults: Array.isArray(err.meta?.row_results)
            ? (err.meta.row_results as ImportCommitRowResult[])
            : [],
          summary:
            err.meta?.summary && typeof err.meta.summary === "object"
              ? (err.meta.summary as Record<string, unknown>)
              : undefined,
        })
      }
      const msg = "Import failed: " + (err instanceof Error ? err.message : String(err))
      setError(msg)
      toast.error(msg)
    } finally {
      setImporting(false)
    }
  }

  const handleNameChange = (rowIdx: number, value: string) => {
    updateRow(rowIdx, (row) => ({ ...row, name: value }))
    const query = value.trim()
    if (query.length >= 2) {
      fetchSuggestions(query)
    }
  }

  const handleNameBlur = (rowIdx: number) => {
    setRows((prev) =>
      prev.map((row, rIdx) => {
        if (rIdx !== rowIdx) return row
        const suggestion = lookup(row.name.trim())
        if (!suggestion) return row
        return {
          ...row,
          category: row.category.trim() ? row.category : (suggestion.category?.name ?? row.category),
          merchant: row.merchant.trim() ? row.merchant : (suggestion.merchant?.name ?? row.merchant),
        }
      })
    )
  }

  const jumpToCommitRow = (targetRowIndex: number) => {
    const arrayIdx = rows.findIndex((r) => r.row_index === targetRowIndex)
    if (arrayIdx === -1) return
    if (showIssuesOnly && !visibleRowIndexes.includes(arrayIdx)) {
      setShowIssuesOnly(false)
    }
    setTimeout(() => {
      rowElementRefs.current[arrayIdx]?.scrollIntoView({ block: "center", behavior: "smooth" })
    }, 50)
  }

  const toggleRowIssueDetails = (rowKey: number) => {
    setExpandedRowIssueKeys((prev) => ({
      ...prev,
      [rowKey]: !prev[rowKey],
    }))
  }

  const jumpToIssue = (direction: -1 | 1) => {
    if (issueIndexes.length === 0) return
    const nextPos = (currentIssuePos + direction + issueIndexes.length) % issueIndexes.length
    const targetVisibleIndex = issueIndexes[nextPos]
    const targetRowIndex = visibleRowIndexes[targetVisibleIndex]
    rowElementRefs.current[targetRowIndex]?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    })
    setCurrentIssuePos(nextPos)
  }

  const renderPreviewCard = (rowIdx: number) => {
    const row = rows[rowIdx]
    const validation = rowValidation[rowIdx]
    const valid = row.excluded || validation.issues.length === 0
    const rowTotal = validation.total
    const issueAccentClass =
      row.excluded
        ? "border-l-border/70 bg-muted/15"
        : !valid
          ? "border-l-destructive/40 bg-destructive/5"
          : row.likely_dup
            ? "border-l-warning/35"
            : row.split_group_id
              ? "border-l-primary/35"
              : "border-l-transparent"

    if (splittingRowKey === row._key) {
      return (
        <article
          key={row._key}
          ref={(node) => { rowElementRefs.current[rowIdx] = node }}
          className="inner-card border border-primary/20 border-l-2 border-l-primary/35 bg-primary/[0.02]"
        >
          <SplitRowEditor
            originalRow={row}
            catListId={previewCatListId}
            nameListId={previewNameListId}
            onConfirm={(splits) => commitSplit(rowIdx, splits)}
            onCancel={() => setSplittingRowKey(null)}
          />
        </article>
      )
    }

    return (
      <article
        key={row._key}
        ref={(node) => {
          rowElementRefs.current[rowIdx] = node
        }}
        className={cn(
          "inner-card space-y-4 border border-border/60 border-l-2 bg-[linear-gradient(180deg,hsl(var(--surface))_0%,hsl(var(--surface-2)/0.42)_100%)] transition-[background-color,border-color,box-shadow] hover:shadow-[var(--shadow-level-2)] focus-within:border-primary/28 focus-within:bg-primary/[0.04] focus-within:shadow-[var(--shadow-level-2)]",
          issueAccentClass
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Transaction {rowIdx + 1}
            </p>
            <div className="mt-2">
              <PreviewRowIssueRail
                expanded={Boolean(expandedRowIssueKeys[row._key])}
                onToggle={() => toggleRowIssueDetails(row._key)}
                row={row}
                validation={validation}
              />
              {row.split_group_id && (
                <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary/70">
                  <Scissors className="h-2.5 w-2.5" />
                  Split
                </span>
              )}
            </div>
            <div className="mt-2 grid gap-1.5">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={row.date}
                max={today()}
                onChange={(e) =>
                  updateRow(rowIdx, (r) => ({
                    ...r,
                    date: e.target.value,
                  }))
                }
                className="h-9 border-border/45 bg-background/70 text-sm shadow-none hover:border-border/70 focus:bg-background"
              />
            </div>
          </div>
          <div className="space-y-2 text-right">
            <div className="text-base font-semibold tabular-nums">KD {fmt3(rowTotal)}</div>
            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={!row.excluded}
                onChange={(event) => toggleRowExcluded(rowIdx, !event.target.checked)}
                aria-label={`Include row ${rowIdx + 1} in import`}
              />
              Include
            </label>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs">Merchant</Label>
          <Input
            value={row.merchant}
            onChange={(e) => {
              updateRow(rowIdx, (r) => ({
                ...r,
                merchant: e.target.value,
              }))
            }}
            list={previewMerchantListId}
            placeholder="Optional"
            className="h-9 border-border/45 bg-background/70 text-sm shadow-none hover:border-border/70 focus:bg-background"
          />
        </div>

        <div className="space-y-3">
          <div className="rounded-[var(--radius-inner)] border border-border/40 bg-background/45 p-3">
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Name</Label>
                <Input
                  value={row.name}
                  onChange={(e) => handleNameChange(rowIdx, e.target.value)}
                  onBlur={() => handleNameBlur(rowIdx)}
                  placeholder="Item name"
                  list={previewNameListId}
                  className="h-9 border-border/35 bg-background/70 text-sm shadow-none hover:border-border/60 focus:bg-background"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Category</Label>
                  <Input
                    value={row.category}
                    onChange={(e) => updateRow(rowIdx, (r) => ({ ...r, category: e.target.value }))}
                    placeholder="Category"
                    list={previewCatListId}
                    className="h-9 border-border/35 bg-background/70 text-sm shadow-none hover:border-border/60 focus:bg-background"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Amount (KD)</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.000"
                    value={row.amount_kd}
                    onChange={(e) => updateRow(rowIdx, (r) => ({ ...r, amount_kd: e.target.value }))}
                    className="h-9 border-border/35 bg-background/70 text-right text-sm tabular-nums shadow-none hover:border-border/60 focus:bg-background"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border/50 pt-3">
          {!row.excluded && splittingRowKey === null ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-full px-3 text-xs text-muted-foreground hover:bg-primary/8 hover:text-primary"
              onClick={() => setSplittingRowKey(row._key)}
            >
              <Scissors className="mr-1 h-3 w-3" />
              Split
            </Button>
          ) : (
            <span />
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-full px-3 text-xs text-muted-foreground hover:bg-destructive/8 hover:text-destructive"
            onClick={() => deleteRow(rowIdx)}
          >
            Delete row
          </Button>
        </div>
      </article>
    )
  }

  const renderDesktopRow = (rowIdx: number) => {
    const row = rows[rowIdx]
    const validation = rowValidation[rowIdx]
    const valid = row.excluded || validation.issues.length === 0
    const rowTotal = validation.total
    const issueAccentClass =
      row.excluded
        ? "border-l-2 border-l-border/70 bg-muted/15"
        : !valid
          ? "border-l-2 border-l-destructive/40 bg-destructive/5"
          : row.likely_dup
            ? "border-l-2 border-l-warning/35"
            : row.split_group_id
              ? "border-l-2 border-l-primary/35"
              : ""

    if (splittingRowKey === row._key) {
      return (
        <tr
          ref={(node) => { rowElementRefs.current[rowIdx] = node }}
          key={row._key}
          className="border-b border-border/35 bg-primary/[0.02]"
        >
          <td colSpan={5} className="p-3">
            <SplitRowEditor
              originalRow={row}
              catListId={previewCatListId}
              nameListId={previewNameListId}
              onConfirm={(splits) => commitSplit(rowIdx, splits)}
              onCancel={() => setSplittingRowKey(null)}
            />
          </td>
        </tr>
      )
    }

    return (
      <tr
        ref={(node) => {
          rowElementRefs.current[rowIdx] = node
        }}
        key={row._key}
        className={cn(
          "border-b border-border/35 transition-[background-color,box-shadow] odd:bg-background/45 even:bg-muted/[0.08] hover:bg-primary/[0.025] focus-within:bg-primary/[0.045] focus-within:shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.18)]",
          issueAccentClass
        )}
      >
        <td className="p-3 align-top">
          <div className="mb-2">
            <PreviewRowIssueRail
              expanded={Boolean(expandedRowIssueKeys[row._key])}
              onToggle={() => toggleRowIssueDetails(row._key)}
              row={row}
              validation={validation}
            />
          </div>
          {row.split_group_id && (
            <span className="mb-2 inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary/70">
              <Scissors className="h-2.5 w-2.5" />
              Split
            </span>
          )}
          <Input
            type="date"
            value={row.date}
            max={today()}
            onChange={(e) =>
              updateRow(rowIdx, (r) => ({
                ...r,
                date: e.target.value,
              }))
            }
            className="h-9 border-border/45 bg-background/70 text-sm shadow-none hover:border-border/70 focus:bg-background"
          />
        </td>
        <td className="p-3 align-top">
          <Input
            value={row.merchant}
            onChange={(e) => {
              updateRow(rowIdx, (r) => ({
                ...r,
                merchant: e.target.value,
              }))
            }}
            list={previewMerchantListId}
            placeholder="Optional"
            className="h-9 border-border/45 bg-background/70 text-sm shadow-none hover:border-border/70 focus:bg-background"
          />
        </td>
        <td className="px-2 py-1 align-top">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(80px,140px)_96px] items-center gap-2 px-2 py-2">
            <Input
              value={row.name}
              onChange={(e) => handleNameChange(rowIdx, e.target.value)}
              onBlur={() => handleNameBlur(rowIdx)}
              placeholder="Name"
              list={previewNameListId}
              className="h-8 border-border/20 bg-background/30 text-sm shadow-none hover:border-border/55 hover:bg-background/60 focus:border-ring focus:bg-background"
            />
            <Input
              value={row.category}
              onChange={(e) =>
                updateRow(rowIdx, (r) => ({ ...r, category: e.target.value }))
              }
              placeholder="Category"
              list={previewCatListId}
              className="h-8 border-border/20 bg-background/30 text-sm shadow-none hover:border-border/55 hover:bg-background/60 focus:border-ring focus:bg-background"
            />
            <Input
              type="text"
              inputMode="decimal"
              placeholder="0.000"
              value={row.amount_kd}
              onChange={(e) =>
                updateRow(rowIdx, (r) => ({ ...r, amount_kd: e.target.value }))
              }
              className="h-8 border-border/20 bg-background/30 text-right text-sm tabular-nums shadow-none hover:border-border/55 hover:bg-background/60 focus:border-ring focus:bg-background"
            />
          </div>
        </td>
        <td className="p-3 text-right align-top">
          <div className="font-semibold tabular-nums">{fmt3(rowTotal)}</div>
        </td>
        <td className="p-3 text-right align-top">
          <div className="flex flex-col items-end gap-2">
            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={!row.excluded}
                onChange={(event) => toggleRowExcluded(rowIdx, !event.target.checked)}
                aria-label={`Include row ${rowIdx + 1} in import`}
              />
              Include
            </label>
            {!row.excluded && splittingRowKey === null && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-full px-3 text-xs text-muted-foreground hover:bg-primary/8 hover:text-primary"
                onClick={() => setSplittingRowKey(row._key)}
              >
                <Scissors className="mr-1 h-3 w-3" />
                Split
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-full px-3 text-xs text-muted-foreground hover:bg-destructive/8 hover:text-destructive"
              onClick={() => deleteRow(rowIdx)}
            >
              Delete
            </Button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* overflow-hidden is required: border-radius alone does not clip children in CSS */}
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-1rem)] max-w-5xl flex-col overflow-hidden sm:w-full">
        <DialogHeader className="pb-1">
          <DialogTitle>{importSummary ? "Import Complete" : "Preview Import"}</DialogTitle>
          <DialogDescription>
            {importSummary
              ? "Here's a breakdown of what changed."
              : "Review and edit transactions before importing."}
          </DialogDescription>
        </DialogHeader>

        {importSummary ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 py-10 text-center">
            <div className="icon-shell h-16 w-16 border-success/30 bg-success/10 text-success">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <div className="grid w-full max-w-2xl grid-cols-2 gap-3 text-left md:grid-cols-3">
              <div className="status-card status-card-success">
                <p className="text-2xl font-bold text-success">{importSummary.created}</p>
                <p className="mt-0.5 text-xs text-success/80">created</p>
              </div>
              <div className="status-card status-card-primary">
                <p className="text-2xl font-bold text-primary">{importSummary.updated}</p>
                <p className="mt-0.5 text-xs text-primary/80">updated</p>
              </div>
              {importSummary.unchanged > 0 && (
                <div className="status-card status-card-neutral">
                  <p className="text-2xl font-bold text-foreground">{importSummary.unchanged}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">already up to date</p>
                </div>
              )}
              {importSummary.skippedDup > 0 && (
                <div className="status-card status-card-warning">
                  <p className="text-2xl font-bold text-warning">{importSummary.skippedDup}</p>
                  <p className="mt-0.5 text-xs text-warning/80">duplicates skipped</p>
                </div>
              )}
              {importSummary.skippedIdempotent > 0 && (
                <div className="status-card status-card-primary">
                  <p className="text-2xl font-bold text-primary">{importSummary.skippedIdempotent}</p>
                  <p className="mt-0.5 text-xs text-primary/80">already imported</p>
                </div>
              )}
              {importSummary.skipped > 0 && (
                <div className="status-card status-card-danger">
                  <p className="text-2xl font-bold text-destructive">{importSummary.skipped}</p>
                  <p className="mt-0.5 text-xs text-destructive/80">invalid rows skipped</p>
                </div>
              )}
            </div>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        ) : (
          <>
        {/* ── Notice section ── flex-shrink-0: banners collapse naturally; diagnostics are
            collapsed by default so this section stays compact in the common case. */}
        <div className="flex-shrink-0 space-y-3 pt-1 pb-4">
        {demoWorkspace?.active ? (
          <div className="status-card status-card-warning">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Replace demo workspace before import</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Removes {demoWorkspace.transactions} demo transactions, {demoWorkspace.budgets} budgets,{" "}
                  {demoWorkspace.debt_accounts} debt account, and {demoWorkspace.savings_goals} savings goal
                  so your first real import starts from a clean account.
                </p>
              </div>
              <label className="flex shrink-0 items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={replaceDemoData}
                  onChange={(event) => setReplaceDemoData(event.target.checked)}
                />
                Replace demo data
              </label>
            </div>
          </div>
        ) : null}
        {capped && totalCount != null && (
          <div className="status-card status-card-warning text-xs">
            Preview shows the first {IMPORT_PREVIEW_ROW_CAP.toLocaleString()} of {totalCount.toLocaleString()} rows.
            {" "}Split your source file into batches of {IMPORT_UPLOAD_MAX_ROWS.toLocaleString()} or fewer to import everything.
          </div>
        )}
        {likelyReimport && (
          <div className="status-card status-card-warning flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div>
              <p className="text-sm font-semibold text-foreground">This file looks like it was already imported.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {likelyDuplicateCount} of {rows.length} rows match existing transactions. Review carefully before importing.
              </p>
            </div>
          </div>
        )}
        <SourceIssueNote
          flaggedCount={flaggedCount ?? 0}
          flaggedRows={flaggedRows ?? []}
          skippedRows={skippedRows ?? []}
        />
        <ImportCommitDiagnosticsBar
          diagnostics={commitDiagnostics}
          onViewDetails={() => setShowCommitDetails(true)}
        />
        </div>
        {/* ── End notice section ── */}

        <datalist id={previewNameListId}>
          {suggestions.map((s) => (
            <option
              key={`${s.name}-${s.category || ""}-${s.merchant || ""}`}
              value={s.name}
            />
          ))}
        </datalist>
        <datalist id={previewCatListId}>
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <datalist id={previewMerchantListId}>
          {merchants.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>

        {/* min-h-0 is required on flex-1 children: without it min-height:auto prevents shrinking */}
        <div className="flex flex-1 flex-col min-h-0">
          {/* Not sticky — this bar is always visible as a flex-none element above the scroll container.
              Using sticky here would resolve to viewport-relative and conflict with the table thead's own sticky. */}
          <div className="mb-5 flex flex-shrink-0 flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border/65 bg-[linear-gradient(180deg,hsl(var(--surface))_0%,hsl(var(--surface-2)/0.72)_100%)] px-3.5 py-3 shadow-[var(--shadow-level-1)]">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Review state
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success shadow-sm">
                  {readyCount} ready
                </span>
                {invalidRowCount > 0 && (
                  <span className="inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive shadow-sm">
                    {invalidRowCount} {invalidRowCount === 1 ? "issue" : "issues"}
                  </span>
                )}
                {warningCount > 0 && (
                  <span className="inline-flex items-center rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning shadow-sm">
                    {warningCount} {warningCount === 1 ? "duplicate" : "duplicates"}
                  </span>
                )}
                {excludedRowCount > 0 && (
                  <span className="inline-flex items-center rounded-full bg-background/75 px-2.5 py-0.5 text-xs font-medium text-muted-foreground shadow-sm">
                    {excludedRowCount} excluded
                  </span>
                )}
                {showIssuesOnly && (
                  <span className="text-xs text-muted-foreground">
                    Reviewing {visibleRows.length} of {rows.length} rows
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canToggleIssuesOnly && (
                <Button
                  type="button"
                  variant="pill"
                  size="sm"
                  onClick={() => setShowIssuesOnly((value) => !value)}
                  className={cn("h-8 gap-1.5 px-3 text-xs", showIssuesOnly && "border-primary/20 bg-primary/8 text-primary")}
                >
                  <Filter className="h-3 w-3" />
                  {showIssuesOnly ? "All rows" : "Issues only"}
                </Button>
              )}
              {issueIndexes.length > 0 && (
                <div className="flex items-center gap-0.5 rounded-full border border-border/55 bg-background/75 p-0.5 shadow-sm">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => jumpToIssue(-1)}
                    className="h-7 w-7 rounded-full p-0"
                    aria-label="Previous issue"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="min-w-[2.75rem] text-center text-xs tabular-nums text-muted-foreground">
                    {currentIssuePos + 1}/{issueIndexes.length}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => jumpToIssue(1)}
                    className="h-7 w-7 rounded-full p-0"
                    aria-label="Next issue"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Desktop: compact table — handles 2000+ rows without any virtualization.
              Mobile: native-scroll card stack — absolute positioning was removed because
              the virtualizer's 80px estimateSize was ~5× smaller than actual card height
              (~380–480px), causing all cards to paint at translateY(0) and overlap.
              Normal document flow (space-y-3) is structurally incapable of overlap. */}
          {isDesktop ? (
            <div
              ref={rowContainerRef}
              className="surface-scroll-card flex-1 min-h-0 overflow-auto border-border/70 bg-[linear-gradient(180deg,hsl(var(--surface))_0%,hsl(var(--surface-2)/0.5)_100%)] shadow-[var(--shadow-level-2)]"
            >
              <table className="w-full table-fixed text-sm">
                <thead className="table-head bg-background/96 shadow-[inset_0_-1px_0_hsl(var(--border)/0.75)]">
                  <tr>
                    <th className="th-standard" style={{ width: 130 }}>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/68">Date</span>
                    </th>
                    <th className="th-standard" style={{ width: 170 }}>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/68">Merchant</span>
                    </th>
                    <th className="th-standard" style={{ minWidth: 340 }}>
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/68">Details</div>
                        <div className="grid grid-cols-[minmax(0,1fr)_minmax(80px,140px)_96px_32px] gap-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/85">
                          <span>Name</span>
                          <span>Category</span>
                          <span className="text-right">Amount</span>
                          <span className="sr-only">Item actions</span>
                        </div>
                      </div>
                    </th>
                    <th className="th-standard-r" style={{ width: 110 }}>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/68">Total (KD)</span>
                    </th>
                    <th className="th-standard-r" style={{ width: 90 }}>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/68">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>{visibleRowIndexes.map((rowIdx) => renderDesktopRow(rowIdx))}</tbody>
              </table>
            </div>
          ) : (
            <div
              ref={rowContainerRef}
              className="flex-1 min-h-0 space-y-3 overflow-auto pr-1"
            >
              {visibleRowIndexes.map((rowIdx) => renderPreviewCard(rowIdx))}
            </div>
          )}

          {error && (
            <div className="status-card status-card-danger mt-3">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="mt-4 flex-shrink-0 border-t border-border/55 pt-4">
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground/80">
                {readyCount} row{readyCount === 1 ? "" : "s"} ready to import
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {removedStack.length > 0 ? (
                  <span>
                    {removedStack.length} row{removedStack.length === 1 ? "" : "s"} removed
                  </span>
                ) : null}
                {!allValid && invalidRowCount > 0 ? (
                  <span>
                    Fix {invalidRowCount} issue{invalidRowCount === 1 ? "" : "s"} before importing
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="rounded-full border border-border/60 bg-muted/35 p-1 shadow-sm">
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={undoDelete}
                    disabled={removedStack.length === 0}
                    className="rounded-full"
                  >
                    <Undo2 className="mr-1 h-3 w-3" />
                    Undo
                  </Button>
                  <Button variant="ghost" size="sm" onClick={resetRows} className="rounded-full">
                    <RotateCcw className="mr-1 h-3 w-3" />
                    Reset
                  </Button>
                  <Button variant="ghost" size="sm" onClick={downloadCSV} className="rounded-full">
                    <Download className="mr-1 h-3 w-3" />
                    Download CSV
                  </Button>
                </div>
              </div>
              <Button
                variant="gradient-primary"
                size="pill"
                onClick={handleImport}
                loading={importing}
                disabled={importing || !allValid}
                className="min-w-[13rem]"
              >
                {importing
                  ? "Importing..."
                  : replaceDemoData
                    ? `Replace Demo & Import ${readyCount}`
                    : `Approve & Import ${readyCount}`}
              </Button>
            </div>
          </div>
        </DialogFooter>
          </>
        )}
      </DialogContent>
      <ImportCommitDiagnosticsDialog
        diagnostics={commitDiagnostics}
        open={showCommitDetails}
        onClose={() => setShowCommitDetails(false)}
        onJumpToRow={jumpToCommitRow}
      />
    </Dialog>
  )
}
