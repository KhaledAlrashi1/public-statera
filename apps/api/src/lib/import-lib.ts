// CSV/XLSX import — parse, preview, validate, plan, and persist.
//
// Flask port of personal-finance/backend/routes/upload.py + lib/importer.py (HEAD 202a1548).
// Routes stay thin (routes/upload.ts); this lib does the work.
//
// Deliberate deviations from personal-finance source:
//  1. XLSX/CSV libraries (deviation-by-necessity): Flask used pandas + openpyxl/xlrd, which
//     have no Node port. Operator-approved option (b): CSV via papaparse, XLSX via exceljs.
//     `.xls` (legacy BIFF/OLE) is DROPPED from ALLOWED_EXTS + magic-byte checks — exceljs does
//     not read `.xls` and Node ecosystem support for legacy BIFF is poor. Legacy `.xls` returns
//     to scope, if ever, via the Module-11 statement-parsing initiative. ImportDialogs' file
//     picker `accept` is aligned to `.csv,.xlsx` in the same commit.
//  2. Upload size limit enforced in-handler (12 MB → 400 FILE_TOO_LARGE), not framework-level
//     (Flask uses app.config MAX_CONTENT_LENGTH → 413).
//  3. Atomicity: Flask begin_nested() per-row savepoint + outer rollback maps onto Drizzle
//     nested tx.transaction() (mysql2 driver issues SAVEPOINT/RELEASE/ROLLBACK TO SAVEPOINT —
//     drizzle-orm@0.39.3 mysql2/session.js:213-227). Per-row nested txns are caught so one
//     row's savepoint rollback does not abort the batch; atomic blocking throws out of the
//     outer db.transaction() to roll the whole batch back.
//  4. Category/merchant FK vs Flask name-strings (inherited, project-wide) via learnTransaction.
//  5. Response shapes stay top-level (ok + fields, not under `data`) to match the already-wired
//     uploadApi in apps/web.
//  6. No message/iMessage import plumbing (personal_statera-only; deferred statement-parsing).
//  7. The commit request's `atomic` field is accepted-but-ignored (Flask :184 hardcodes
//     atomic=True); the Zod schema tolerates unknown fields for Flask parity.

import Decimal from "decimal.js"
import { and, eq, inArray, sql } from "drizzle-orm"
import ExcelJS from "exceljs"
import Papa from "papaparse"
import { createHash } from "node:crypto"
import { transactions } from "../db/schema/transactions"
import {
  buildNameKey,
  formatKd,
  getOrCreateCategory,
  getOrCreateMerchant,
  learnTransaction,
} from "./transaction-lib"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

// ── Constants (Flask constants.py + importer.py) ──────────────────────────────
export const UNCAT_NAME = "Uncategorized"
export const MAX_UPLOAD_ROWS = 10000
export const MAX_UPLOAD_SIZE_BYTES = 12 * 1024 * 1024 // MAX_UPLOAD_SIZE_MB=12
export const ALLOWED_EXTS = new Set([".csv", ".xlsx"]) // .xls dropped (deviation 1)

// REQUIRED_NAMES / OPTIONAL_NAMES (importer.py:188-210)
const REQUIRED_NAMES: Record<string, string[]> = {
  date: ["date", "transaction date", "trans date", "trans. date", "posting date", "value date"],
  name: [
    "transaction title", "transaction name", "item name", "title", "transaction description",
    "description", "name", "narration", "details", "particulars",
  ],
  amount: ["amount (kwd)", "amount", "amount kd", "amount_kd"],
}
const OPTIONAL_NAMES: Record<string, string[]> = {
  category: ["category", "type", "transaction type", "trans type"],
  merchant: ["merchant", "payee", "vendor", "merchant name"],
  memo: ["memo", "note", "notes", "comment", "details memo"],
  transaction_id: ["transaction_id", "transaction id", "id"],
}

// _ARABIC_DIGITS (importer.py:16) — U+0660..U+0669 → 0..9
function normalizeDigits(value: string): string {
  return (value ?? "").replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
}

// _AMOUNT_RE / currency stripper (importer.py:29-30)
const AMOUNT_RE = /^[+-]?\d+(?:\.\d+)?$/
const AMOUNT_CURRENCY_RE = /\b(?:kd|kwd)\b|د\.?\s*ك/gi

// _norm — header normalization (importer.py:86-88)
function normHeader(value: string): string {
  return (value ?? "").trim().toLowerCase().replace(/_/g, " ").split(/\s+/).filter(Boolean).join(" ")
}

// ── Typed errors ──────────────────────────────────────────────────────────────
export class ImportValidationError extends Error {
  code: string
  context: Record<string, unknown>
  constructor(message: string, code: string, context: Record<string, unknown> = {}) {
    super(message)
    this.name = "ImportValidationError"
    this.code = code
    this.context = context
  }
}

// File-level parse errors carry an HTTP code + meta for the preview handler.
export class FilePreviewError extends Error {
  code: string
  meta: Record<string, unknown>
  constructor(message: string, code: string, meta: Record<string, unknown> = {}) {
    super(message)
    this.name = "FilePreviewError"
    this.code = code
    this.meta = meta
  }
}

export class ColumnMappingRequiredError extends Error {
  allColumns: string[]
  suggestedMapping: Record<string, string>
  rawRows: Array<Record<string, string>>
  missingRequired: string[]
  constructor(opts: {
    allColumns: string[]
    suggestedMapping: Record<string, string>
    rawRows: Array<Record<string, string>>
    missingRequired: string[]
  }) {
    super("Column mapping required")
    this.name = "ColumnMappingRequiredError"
    this.allColumns = opts.allColumns
    this.suggestedMapping = opts.suggestedMapping
    this.rawRows = opts.rawRows
    this.missingRequired = opts.missingRequired
  }
}

// ── Amount / date parsing (importer.py:91-124) ────────────────────────────────
function hasTooManyDecimalPlaces(value: string): boolean {
  if (!value.includes(".")) return false
  const parts = value.split(".")
  return parts[parts.length - 1].length > 3
}

// _parse_amount (importer.py:97-110) — throws Error on invalid.
export function parseAmount(value: string | null | undefined): Decimal {
  const raw = (value ?? "").trim()
  if (!raw) return new Decimal(0)
  let cleaned = normalizeDigits(raw).replace(AMOUNT_CURRENCY_RE, "")
  cleaned = cleaned.replace(/,/g, "").replace(/ /g, "")
  if (!cleaned || !AMOUNT_RE.test(cleaned)) {
    throw new Error(`Invalid amount: ${value}`)
  }
  if (hasTooManyDecimalPlaces(cleaned)) {
    throw new Error("Amount cannot have more than 3 decimal places.")
  }
  return new Decimal(cleaned)
}

// parse_positive_amount (validation.py:93) = _parse_amount + >0 + <=max.
function parsePositiveAmount(value: string | null | undefined): Decimal {
  let amount: Decimal
  try {
    amount = parseAmount(value)
  } catch (exc) {
    const msg = exc instanceof Error ? exc.message : String(exc)
    if (msg.toLowerCase().includes("more than 3 decimal places")) throw new Error(msg)
    throw new Error(`Invalid amount: ${msg}`)
  }
  if (amount.lte(0)) throw new Error("Amount must be greater than zero")
  if (amount.gt(new Decimal("999999.999"))) throw new Error("Amount too large (max 999999.999)")
  return amount
}

// _parse_import_amount (upload.py:197) — allows non-positive, caps at max.
function parseImportAmount(value: string | null | undefined): Decimal {
  let amount: Decimal
  try {
    amount = parseAmount(value)
  } catch (exc) {
    const msg = exc instanceof Error ? exc.message : String(exc)
    if (msg.toLowerCase().includes("more than 3 decimal places")) throw new Error(msg)
    throw new Error(`Invalid amount: ${msg}`)
  }
  if (amount.gt(new Decimal("999999.999"))) throw new Error("Amount too large (max 999999.999)")
  return amount
}

const MONTHS_ABBR: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}
const MONTHS_FULL: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
}

// _parse_date (importer.py:113-124) — supports the _SUPPORTED_DATE_FORMATS list.
// Returns a "YYYY-MM-DD" string (Hono transaction date is a string).
export function parseDateStr(value: string | null | undefined): string {
  const raw = (value ?? "").trim()
  if (!raw) throw new Error("date is required")
  const s = normalizeDigits(raw)

  // %Y-%m-%d
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m) return validYmd(+m[1], +m[2], +m[3], raw)

  // %d/%m/%Y and %d-%m-%Y
  m = /^(\d{1,2})[/-](\d{1,2})-?(\d{4})$/.exec(s)
  // handle both separators explicitly
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s) || /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s)
  if (m) return validYmd(+m[3], +m[2], +m[1], raw)

  // %d-%b-%Y / %d %b %Y / %d-%B-%Y / %d %B %Y
  m = /^(\d{1,2})[ -]([A-Za-z]+)[ -](\d{4})$/.exec(s)
  if (m) {
    const mon = MONTHS_ABBR[m[2].toLowerCase()] ?? MONTHS_FULL[m[2].toLowerCase()]
    if (mon) return validYmd(+m[3], mon, +m[1], raw)
  }
  throw new Error(`Cannot parse date: '${raw}'`)
}

function validYmd(y: number, mo: number, d: number, raw: string): string {
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    throw new Error(`Cannot parse date: '${raw}'`)
  }
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

// parse_date shared (validation.py:24) — wraps _parse_date with the "Date is required" message.
function parseDateForCommit(value: string | null | undefined): string {
  try {
    return parseDateStr(value)
  } catch (exc) {
    const msg = exc instanceof Error ? exc.message : String(exc)
    if (msg.toLowerCase().includes("date is required")) throw new Error("Date is required")
    throw new Error(`Invalid date format: ${msg}`)
  }
}

export function computeFileHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

// compute_import_row_hash (importer.py:132-142)
export function computeImportRowHash(
  userId: number, dateStr: string, nameKey: string, amountKd: string, fileHash: string, rowIndex: number,
): string {
  const raw = `${userId}:${dateStr}:${nameKey}:${amountKd}:${fileHash}:${rowIndex}`
  return createHash("sha256").update(raw, "utf-8").digest("hex")
}

// ── File reading + column detection (importer.py:213-316) ─────────────────────

type ParsedTable = { columns: string[]; records: Array<Record<string, unknown>> }
export type MappedTable = { rows: Array<Record<string, unknown>>; colmap: Record<string, string> }

function extOf(filename: string): string {
  const i = (filename ?? "").lastIndexOf(".")
  return i >= 0 ? filename.slice(i).toLowerCase() : ""
}

function looksLikeBinary(sample: Uint8Array): boolean {
  // importer.py:177 — NUL byte in the header ⇒ binary.
  for (let i = 0; i < sample.length; i++) if (sample[i] === 0) return true
  return false
}

// validate_uploaded_file (importer.py:499-534) — magic-byte sniffing; .xls dropped.
function validateFileType(filename: string, headerBytes: Uint8Array): void {
  const ext = extOf(filename)
  if (!ALLOWED_EXTS.has(ext)) {
    throw new FilePreviewError(
      "File type not supported. Please upload a valid CSV or Excel file.",
      "invalid_file_type",
    )
  }
  if (headerBytes.length === 0) throw new Error("File is empty")
  if (ext === ".csv") {
    if (looksLikeBinary(headerBytes)) {
      throw new FilePreviewError(
        "File type not supported. Please upload a valid CSV or Excel file.",
        "invalid_file_type",
      )
    }
    // utf-8-sig decode probe
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(stripBom(headerBytes))
    } catch {
      throw new FilePreviewError("CSV files must be UTF-8 encoded.", "NON_UTF8_FILE")
    }
    return
  }
  // .xlsx → PK\x03\x04
  const sig = [0x50, 0x4b, 0x03, 0x04]
  const matched = sig.every((b, i) => headerBytes[i] === b)
  if (!matched) {
    throw new FilePreviewError(
      "File type not supported. Please upload a valid CSV or Excel file.",
      "invalid_file_type",
    )
  }
}

function stripBom(bytes: Uint8Array): Uint8Array {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return bytes.subarray(3)
  }
  return bytes
}

async function parseCsv(bytes: Uint8Array): Promise<ParsedTable> {
  let text: string
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(stripBom(bytes))
  } catch {
    throw new FilePreviewError("CSV files must be UTF-8 encoded.", "NON_UTF8_FILE")
  }
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
  })
  const columns = result.meta.fields ?? []
  return { columns, records: result.data }
}

async function parseXlsx(bytes: Uint8Array): Promise<ParsedTable> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(bytes))
  const ws = wb.worksheets[0]
  if (!ws) return { columns: [], records: [] }
  const columns: string[] = []
  const headerRow = ws.getRow(1)
  headerRow.eachCell({ includeEmpty: false }, (cell) => {
    columns.push(cellText(cell.value))
  })
  const records: Array<Record<string, unknown>> = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const rec: Record<string, unknown> = {}
    let anyValue = false
    for (let c = 0; c < columns.length; c++) {
      const cell = row.getCell(c + 1)
      const v = normalizeCellValue(cell.value)
      rec[columns[c]] = v
      if (v !== null && v !== undefined && String(v).trim() !== "") anyValue = true
    }
    if (anyValue) records.push(rec)
  }
  return { columns, records }
}

function cellText(v: ExcelJS.CellValue): string {
  return String(normalizeCellValue(v) ?? "").trim()
}

function normalizeCellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null
  if (v instanceof Date) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`
  }
  if (typeof v === "object") {
    const rec = v as unknown as Record<string, unknown>
    if ("richText" in rec && Array.isArray(rec.richText)) {
      return (rec.richText as Array<{ text?: string }>).map((p) => p.text ?? "").join("")
    }
    if ("text" in rec) return rec.text
    if ("result" in rec) return rec.result
    if ("hyperlink" in rec) return rec.text ?? rec.hyperlink
  }
  return v as unknown
}

// _read_tabular_file_to_df (importer.py:213-316) — parse + column detection/mapping.
export async function readTabularFile(
  bytes: Uint8Array,
  filename: string,
  userMapping?: Record<string, string> | null,
): Promise<MappedTable> {
  const ext = extOf(filename)
  const parsed = ext === ".csv" ? await parseCsv(bytes) : await parseXlsx(bytes)

  if (userMapping && Object.keys(userMapping).length > 0) {
    const selected = Object.values(userMapping).map((c) => String(c ?? "")).filter((c) => c.trim())
    const dupes = selected.filter((c, i) => selected.indexOf(c) !== i)
    if (dupes.length > 0) throw new Error("Each mapped field must use a different source column.")

    const rename: Record<string, string> = {}
    const colmapReturn: Record<string, string> = {}
    for (const [stdKey, csvCol] of Object.entries(userMapping)) {
      if (csvCol && parsed.columns.includes(csvCol)) {
        rename[csvCol] = stdKey
        colmapReturn[stdKey] = csvCol
      }
    }
    const missing = ["date", "name", "amount_kd"].filter((k) => !(k in colmapReturn))
    if (missing.length > 0) {
      throw new ColumnMappingRequiredError({
        allColumns: parsed.columns,
        suggestedMapping: colmapReturn,
        rawRows: rawHead(parsed),
        missingRequired: missing,
      })
    }
    return { rows: applyRename(parsed.records, rename, true), colmap: colmapReturn }
  }

  // Auto-detection
  const colmap: Record<string, string> = {}
  for (const col of parsed.columns) {
    const normalized = normHeader(String(col))
    for (const [key, aliases] of Object.entries(REQUIRED_NAMES)) {
      if (aliases.includes(normalized) && !(key in colmap)) colmap[key] = col
    }
    for (const [key, aliases] of Object.entries(OPTIONAL_NAMES)) {
      if (aliases.includes(normalized) && !(key in colmap)) colmap[key] = col
    }
  }
  const missingRequired = Object.keys(REQUIRED_NAMES).filter((k) => !(k in colmap))
  if (missingRequired.length > 0) {
    const suggested: Record<string, string> = {}
    for (const key of ["transaction_id", "date", "name", "amount", "category", "merchant", "memo"]) {
      if (key in colmap) suggested[key === "amount" ? "amount_kd" : key] = colmap[key]
    }
    throw new ColumnMappingRequiredError({
      allColumns: parsed.columns,
      suggestedMapping: suggested,
      rawRows: rawHead(parsed),
      missingRequired,
    })
  }

  const rename: Record<string, string> = {
    [colmap.date]: "date",
    [colmap.name]: "name",
    [colmap.amount]: "amount_kd",
  }
  if ("category" in colmap) rename[colmap.category] = "category"
  if ("merchant" in colmap) rename[colmap.merchant] = "merchant"
  if ("memo" in colmap) rename[colmap.memo] = "memo"
  if ("transaction_id" in colmap) rename[colmap.transaction_id] = "transaction_id"

  return {
    rows: applyRename(parsed.records, rename, true),
    colmap: {
      transaction_id: colmap.transaction_id ?? "",
      date: colmap.date,
      category: colmap.category ?? "",
      name: colmap.name,
      amount_kd: colmap.amount,
      merchant: colmap.merchant ?? "",
      memo: colmap.memo ?? "",
    },
  }
}

function rawHead(parsed: ParsedTable): Array<Record<string, string>> {
  return parsed.records.slice(0, 5).map((rec) => {
    const out: Record<string, string> = {}
    for (const col of parsed.columns) out[col] = rec[col] == null ? "" : String(rec[col])
    return out
  })
}

function applyRename(
  records: Array<Record<string, unknown>>,
  rename: Record<string, string>,
  addCategoryDefault: boolean,
): Array<Record<string, unknown>> {
  return records.map((rec) => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(rec)) out[rename[k] ?? k] = v
    if (addCategoryDefault && !("category" in out)) out.category = UNCAT_NAME
    return out
  })
}

// ── Preview row shaping (_df_to_preview_rows, importer.py:319-496) ────────────
export type PreviewRow = {
  row_index: number
  transaction_id: number | null
  date: string
  merchant: string
  category: string
  name: string
  amount_kd: string
  memo: string
}
type SkippedRow = {
  row_number: number
  reason: string
  name: string
  raw_date: string
  raw_amount: string
  raw_transaction_id: string
}
type FlaggedRow = { row_number: number; raw_amount: string; name: string; reason: string }

function isMissing(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === "number" && Number.isNaN(v)) return true
  if (typeof v === "string" && v.trim() === "") return true
  return false
}
function previewText(v: unknown): string {
  if (isMissing(v)) return ""
  return String(v).trim()
}

export function dfToPreviewRows(records: Array<Record<string, unknown>>): {
  rows: PreviewRow[]; skipped: number; flaggedRows: FlaggedRow[]; skippedRows: SkippedRow[]
} {
  const rows: PreviewRow[] = []
  let skipped = 0
  const flaggedRows: FlaggedRow[] = []
  const skippedRows: SkippedRow[] = []
  let rowNumber = 0

  const skippedPayload = (rowNum: number, reason: string, rec: Record<string, unknown>): SkippedRow => ({
    row_number: rowNum,
    reason,
    name: previewText(rec.name).slice(0, 120),
    raw_date: previewText(rec.date).slice(0, 64),
    raw_amount: previewText(rec.amount_kd).slice(0, 64),
    raw_transaction_id: ("transaction_id" in rec ? previewText(rec.transaction_id) : "").slice(0, 64),
  })

  for (const rec of records) {
    rowNumber += 1
    try {
      if (isMissing(rec.name) || isMissing(rec.amount_kd)) {
        const missing: string[] = []
        if (isMissing(rec.name)) missing.push("name")
        if (isMissing(rec.amount_kd)) missing.push("amount_kd")
        skipped += 1
        skippedRows.push(skippedPayload(rowNumber, `Missing required field(s): ${missing.join(", ")}.`, rec))
        continue
      }
      const previewDate = parsePreviewDate(rec.date)
      let category = ""
      if ("category" in rec && !isMissing(rec.category)) category = String(rec.category ?? "").trim()
      if (!category) category = UNCAT_NAME
      const name = String(rec.name).trim()
      const amountRaw = String(rec.amount_kd).trim()
      if (!name || !amountRaw) {
        skipped += 1
        skippedRows.push(skippedPayload(rowNumber, "Both name and amount_kd are required.", rec))
        continue
      }
      const amount = parseAmount(amountRaw)
      if (amount.lte(0)) {
        flaggedRows.push({
          row_number: rowNumber,
          raw_amount: amountRaw,
          name,
          reason: amount.eq(0)
            ? "Zero amounts are not supported."
            : "Negative amounts are not supported. If this is an expense, enter the absolute value. Check whether your file uses negative values for debits.",
        })
        continue
      }
      let transactionId: number | null = null
      if ("transaction_id" in rec) transactionId = parsePreviewTransactionId(rec.transaction_id)
      rows.push({
        row_index: rowNumber - 1,
        transaction_id: transactionId,
        date: previewDate,
        merchant: isMissing(rec.merchant) ? "" : String(rec.merchant).trim(),
        category,
        name,
        amount_kd: formatKd(amount),
        memo: isMissing(rec.memo) ? "" : String(rec.memo).trim(),
      })
    } catch (exc) {
      skipped += 1
      const reason = (exc instanceof Error ? exc.message : "").trim() || "Failed to parse row."
      skippedRows.push(skippedPayload(rowNumber, reason, rec))
    }
  }
  return { rows, skipped, flaggedRows, skippedRows }
}

function parsePreviewDate(v: unknown): string {
  if (isMissing(v)) return ""
  const raw = String(v).trim()
  if (!raw) return ""
  if (/[٠-٩]/.test(raw)) throw new Error("date contains unsupported numerals")
  return parseDateStr(raw)
}
function parsePreviewTransactionId(v: unknown): number | null {
  if (isMissing(v)) return null
  let raw = String(v).trim()
  if (!raw) return null
  if (raw.endsWith(".0")) raw = raw.slice(0, -2)
  const n = Number(raw)
  if (!Number.isInteger(n)) throw new Error("transaction_id must be an integer")
  return n
}

// ── Validated / planned row models (upload.py:54-73) ──────────────────────────
export type ValidatedImportRow = {
  rowIndex: number
  importRowIndex: number | null
  transactionId: number | null
  txDate: string
  name: string
  category: string
  amount: Decimal
  baseNameKey: string
  merchant: string | null
  memo: string | null
  tripletKey: string // `${txDate}|${baseNameKey}|${amountStr}`
}
type PlannedImportRow = {
  row: ValidatedImportRow
  existingTransactionId: number | null
  importRowHash: string | null
}
export type RowResult = {
  row_index: number
  status: string
  error_code?: string
  message?: string
  transaction_id?: number
  idempotency_key?: string
}

function tripletKey(txDate: string, nameKey: string, amount: Decimal): string {
  return `${txDate}|${nameKey}|${formatKd(amount)}`
}

// _validate_import_row (upload.py:212-305)
function validateImportRow(raw: unknown, rowIndex: number, allowNonPositive: boolean): ValidatedImportRow {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ImportValidationError("Each row must be an object.", "import_row_invalid", { row_index: rowIndex })
  }
  const rec = raw as Record<string, unknown>
  const dStr = String(rec.date ?? "").trim()
  const name = String(rec.name ?? "").trim()
  const category = String(rec.category ?? "").trim() || UNCAT_NAME
  const amountStr = String(rec.amount_kd ?? "").trim()
  const merchant = String(rec.merchant ?? "").trim() || null
  const memo = String(rec.memo ?? "").trim() || null

  let transactionId: number | null = null
  if (rec.transaction_id != null && String(rec.transaction_id).trim()) {
    const n = Number(String(rec.transaction_id).trim())
    if (!Number.isInteger(n)) {
      throw new ImportValidationError("transaction_id must be an integer.", "import_row_invalid_value", { row_index: rowIndex })
    }
    transactionId = n
  }
  let importRowIndex: number | null = null
  if (rec.row_index != null && String(rec.row_index).trim()) {
    const n = Number(String(rec.row_index).trim())
    if (!Number.isInteger(n)) {
      throw new ImportValidationError("row_index must be an integer.", "import_row_invalid_value", { row_index: rowIndex })
    }
    if (n < 0) {
      throw new ImportValidationError("row_index must be greater than or equal to zero.", "import_row_invalid_value", { row_index: rowIndex })
    }
    importRowIndex = n
  }

  if (!name || !amountStr) {
    throw new ImportValidationError("Missing required fields", "import_row_missing_fields", { row_index: rowIndex })
  }

  let txDate: string
  try {
    txDate = parseDateForCommit(dStr)
  } catch (exc) {
    const msg = exc instanceof Error ? exc.message : String(exc)
    const code = msg.toLowerCase().includes("date is required") ? "import_row_missing_date" : "import_row_invalid_value"
    throw new ImportValidationError(msg, code, { row_index: rowIndex })
  }
  let amount: Decimal
  try {
    amount = allowNonPositive ? parseImportAmount(amountStr) : parsePositiveAmount(amountStr)
  } catch (exc) {
    const msg = exc instanceof Error ? exc.message : String(exc)
    const code = msg.includes("greater than zero") ? "import_row_amount_non_positive" : "import_row_invalid_value"
    throw new ImportValidationError(msg, code, { row_index: rowIndex })
  }

  const baseNameKey = buildNameKey(name)
  return {
    rowIndex, importRowIndex, transactionId, txDate, name, category, amount, baseNameKey, merchant, memo,
    tripletKey: tripletKey(txDate, baseNameKey, amount),
  }
}

// ── Row-result helpers (upload.py:94-173) ─────────────────────────────────────
function rowResult(p: {
  rowIndex: number; status: string; errorCode?: string; message?: string; transactionId?: number; idempotencyKey?: string
}): RowResult {
  const out: RowResult = { row_index: p.rowIndex, status: p.status }
  if (p.errorCode) out.error_code = p.errorCode
  if (p.message) out.message = p.message
  if (p.transactionId != null) out.transaction_id = p.transactionId
  if (p.idempotencyKey) out.idempotency_key = p.idempotencyKey
  return out
}
function countStatus(rows: RowResult[], ...statuses: string[]): number {
  const wanted = new Set(statuses)
  return rows.reduce((n, r) => (wanted.has(r.status) ? n + 1 : n), 0)
}
export function orderedRowResults(total: number, byIndex: Map<number, RowResult>): RowResult[] {
  const out: RowResult[] = []
  for (let i = 0; i < total; i++) {
    out.push(byIndex.get(i) ?? rowResult({ rowIndex: i, status: "failed_internal", errorCode: "import_row_unclassified", message: "Row outcome missing." }))
  }
  return out
}
export function summarizeImportResults(p: { totalRows: number; validRows: number; plannedRows: number; rowResults: RowResult[] }) {
  const created = countStatus(p.rowResults, "created")
  const updated = countStatus(p.rowResults, "updated")
  const unchanged = countStatus(p.rowResults, "unchanged")
  const imported = created + updated
  const autoExcluded = countStatus(p.rowResults, "auto_excluded")
  const skippedDuplicate = countStatus(p.rowResults, "skipped_duplicate")
  const skippedIdempotent = countStatus(p.rowResults, "skipped_idempotent")
  const skippedInvalid = countStatus(p.rowResults, "skipped_invalid")
  const failedInternal = countStatus(p.rowResults, "failed_internal")
  return {
    total_rows: p.totalRows, valid_rows: p.validRows, planned_rows: p.plannedRows,
    imported, created, updated, unchanged, auto_excluded: autoExcluded,
    skipped: skippedInvalid + failedInternal, skipped_invalid: skippedInvalid,
    skipped_duplicate: skippedDuplicate, skipped_idempotent: skippedIdempotent, failed_internal: failedInternal,
  }
}
export function hasBlockingRowResults(rows: RowResult[]): boolean {
  return countStatus(rows, "skipped_duplicate", "skipped_invalid", "failed_internal") > 0
}

// ── Commit-path validation (upload.py:308-420) ────────────────────────────────
export type CommitValidation = {
  validRows: ValidatedImportRow[]
  rowResults: Map<number, RowResult>
  autoExcludedRows: Array<Record<string, unknown>>
}
export function validateRowsForCommit(rows: unknown[]): CommitValidation {
  const validRows: ValidatedImportRow[] = []
  const rowResults = new Map<number, RowResult>()
  const autoExcludedRows: Array<Record<string, unknown>> = []
  rows.forEach((raw, idx) => {
    try {
      const v = validateImportRow(raw, idx, true)
      if (v.amount.lte(0)) {
        const reason = v.amount.eq(0)
          ? "Zero amounts are not supported."
          : "Negative amounts are not supported. If this is an expense, enter the absolute value. Check whether your file uses negative values for debits."
        autoExcludedRows.push({ row_index: v.rowIndex, row_number: v.rowIndex + 1, date: v.txDate, name: v.name, raw_amount: String((raw as Record<string, unknown>)?.amount_kd ?? "").trim(), reason })
        rowResults.set(idx, rowResult({ rowIndex: idx, status: "auto_excluded", errorCode: "import_row_auto_excluded_non_positive", message: reason }))
        return
      }
      validRows.push(v)
    } catch (err) {
      if (err instanceof ImportValidationError) {
        rowResults.set(idx, rowResult({ rowIndex: idx, status: "skipped_invalid", errorCode: err.code, message: err.message }))
      } else {
        throw err
      }
    }
  })
  return { validRows, rowResults, autoExcludedRows }
}

// validateRows (upload.py:308) — preview-hint variant (positive-amount only).
function validateRowsForHints(rows: unknown[]): ValidatedImportRow[] {
  const valid: ValidatedImportRow[] = []
  rows.forEach((raw, idx) => {
    try {
      valid.push(validateImportRow(raw, idx, false))
    } catch { /* skip invalid for hints */ }
  })
  return valid
}

// ── DB read helpers (upload.py:423-505) ───────────────────────────────────────
async function loadExistingByIds(db: Db, userId: number, ids: number[]): Promise<Map<number, { id: number }>> {
  if (ids.length === 0) return new Map()
  const rows = await db.select({ id: transactions.id }).from(transactions)
    .where(and(eq(transactions.userId, userId), inArray(transactions.id, ids)))
  return new Map(rows.map((r: { id: number }) => [r.id, r]))
}
async function loadExistingImportHashes(db: Db, userId: number, hashes: string[]): Promise<Set<string>> {
  if (hashes.length === 0) return new Set()
  const rows = await db.select({ h: transactions.importRowHash }).from(transactions)
    .where(and(eq(transactions.userId, userId), inArray(transactions.importRowHash, hashes)))
  return new Set(rows.map((r: { h: string | null }) => r.h).filter((h: string | null): h is string => !!h))
}
async function loadExistingTriplets(db: Db, userId: number, keys: Array<{ txDate: string; nameKey: string; amount: Decimal }>): Promise<Set<string>> {
  if (keys.length === 0) return new Set()
  const found = new Set<string>()
  const chunk = 500
  for (let i = 0; i < keys.length; i += chunk) {
    const slice = keys.slice(i, i + chunk)
    const conds = slice.map((k) => and(sql`${transactions.date} = ${k.txDate}`, eq(transactions.nameKey, k.nameKey), eq(transactions.amountKd, formatKd(k.amount))))
    const rows = await db.select({ date: transactions.date, nameKey: transactions.nameKey, amountKd: transactions.amountKd })
      .from(transactions).where(and(eq(transactions.userId, userId), sql.join(conds, sql` OR `)))
    for (const r of rows as Array<{ date: Date; nameKey: string; amountKd: string }>) {
      const ds = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10)
      found.add(`${ds}|${r.nameKey}|${formatKd(r.amountKd)}`)
    }
  }
  return found
}

// _row_import_hashes (upload.py:483-504)
function rowImportHashes(userId: number, validRows: ValidatedImportRow[], fileHash: string | null): Map<number, string> {
  const out = new Map<number, string>()
  if (!fileHash) return out
  for (const row of validRows) {
    if (row.importRowIndex === null) continue
    out.set(row.rowIndex, computeImportRowHash(userId, row.txDate, row.baseNameKey, formatKd(row.amount), fileHash, row.importRowIndex))
  }
  return out
}

// ── Planning (_plan_rows, upload.py:507-580) ──────────────────────────────────
export async function planRows(db: Db, validRows: ValidatedImportRow[], opts: {
  userId: number; fileHash: string | null; allowDups: boolean; existingById: Map<number, { id: number }>
}): Promise<{ plans: PlannedImportRow[]; rowResults: Map<number, RowResult> }> {
  const { userId, fileHash, allowDups, existingById } = opts
  const plans: PlannedImportRow[] = []
  const rowResults = new Map<number, RowResult>()
  const seenTransactionIds = new Set<number>()
  const hashes = rowImportHashes(userId, validRows, fileHash)
  const existingHashes = await loadExistingImportHashes(db, userId, [...hashes.values()])
  const seenHashes = new Set<string>()

  const checkTripletDups = !allowDups && !fileHash
  const seenTriplets = new Set<string>()

  for (const row of validRows) {
    if (row.transactionId !== null) {
      if (seenTransactionIds.has(row.transactionId)) {
        rowResults.set(row.rowIndex, rowResult({ rowIndex: row.rowIndex, status: "skipped_invalid", errorCode: "import_row_duplicate_batch", message: "Duplicate transaction_id within this import batch." }))
        continue
      }
      const existing = existingById.get(row.transactionId)
      seenTransactionIds.add(row.transactionId)
      if (existing) {
        plans.push({ row, existingTransactionId: row.transactionId, importRowHash: hashes.get(row.rowIndex) ?? null })
        continue
      }
    }
    if (checkTripletDups && row.transactionId === null) {
      if (seenTriplets.has(row.tripletKey)) {
        rowResults.set(row.rowIndex, rowResult({ rowIndex: row.rowIndex, status: "skipped_duplicate", errorCode: "import_row_duplicate_batch", message: "Duplicate row within this import batch." }))
        continue
      }
      seenTriplets.add(row.tripletKey)
    }
    const importRowHash = hashes.get(row.rowIndex) ?? null
    if (importRowHash) {
      if (existingHashes.has(importRowHash) || seenHashes.has(importRowHash)) {
        rowResults.set(row.rowIndex, rowResult({ rowIndex: row.rowIndex, status: "skipped_idempotent", errorCode: "import_row_idempotent", message: "Row already imported previously.", idempotencyKey: importRowHash }))
        continue
      }
      seenHashes.add(importRowHash)
    }
    plans.push({ row, existingTransactionId: null, importRowHash })
  }
  return { plans, rowResults }
}

// ── Persist (_persist_planned_row + savepoint, upload.py:801-991) ─────────────
function transactionMatchesAtomicRow(
  txn: { date: unknown; categoryId: number | null; merchantId: number | null; name: string | null; memo: string | null; amountKd: string },
  row: ValidatedImportRow, categoryId: number, merchantId: number | null,
): boolean {
  const ds = txn.date instanceof Date ? txn.date.toISOString().slice(0, 10) : String(txn.date).slice(0, 10)
  if (ds !== row.txDate) return false
  if (Number(txn.categoryId ?? 0) !== Number(categoryId)) return false
  if (Number(txn.merchantId ?? 0) !== Number(merchantId ?? 0)) return false
  if ((txn.name ?? "") !== row.name) return false
  if ((txn.memo ?? null) !== (row.memo ?? null)) return false
  if (!new Decimal(txn.amountKd).eq(row.amount)) return false
  return true
}

async function persistPlannedRow(
  tx: Db, plan: PlannedImportRow, userId: number, categoryCache: Map<string, { id: number; name: string }>, batchId: string | null,
): Promise<{ txnId: number; outcome: string }> {
  const row = plan.row
  const catKey = (row.category || UNCAT_NAME).trim().toLowerCase()
  let category = categoryCache.get(catKey)
  if (!category) {
    const c = await getOrCreateCategory(row.category, userId, tx)
    if (!c) throw new ImportValidationError("Category is required.", "import_row_invalid_value", { row_index: row.rowIndex })
    category = c
    categoryCache.set(catKey, category)
  }
  const merchant = row.merchant ? await getOrCreateMerchant(row.merchant, userId, tx) : null
  const merchantId = merchant?.id ?? null
  const amountStr = formatKd(row.amount)

  if (plan.existingTransactionId !== null) {
    const [txn] = await tx.select({
      id: transactions.id, date: transactions.date, categoryId: transactions.categoryId,
      merchantId: transactions.merchantId, name: transactions.name, memo: transactions.memo, amountKd: transactions.amountKd,
    }).from(transactions).where(and(eq(transactions.id, plan.existingTransactionId), eq(transactions.userId, userId))).limit(1)
    if (!txn) throw new ImportValidationError("transaction_id does not match a transaction you own.", "import_row_transaction_not_found", { row_index: row.rowIndex })

    if (transactionMatchesAtomicRow(txn, row, category.id, merchantId)) return { txnId: txn.id, outcome: "unchanged" }

    await tx.update(transactions).set({
      date: new Date(`${row.txDate}T00:00:00Z`), categoryId: category.id, merchantId, name: row.name, memo: row.memo,
      nameKey: row.baseNameKey, amountKd: amountStr, importBatchId: batchId, importRowHash: plan.importRowHash,
    }).where(eq(transactions.id, txn.id))
    await learnTransaction(tx, row.name, userId, { categoryId: category.id, merchantId })
    return { txnId: txn.id, outcome: "updated" }
  }

  const [{ id }] = await tx.insert(transactions).values({
    userId, date: new Date(`${row.txDate}T00:00:00Z`), categoryId: category.id, merchantId, name: row.name, memo: row.memo,
    nameKey: row.baseNameKey, amountKd: amountStr, source: "csv_import", importBatchId: batchId, importRowHash: plan.importRowHash,
  }).$returningId()
  await learnTransaction(tx, row.name, userId, { categoryId: category.id, merchantId })
  return { txnId: id, outcome: "created" }
}

// _apply_plan_with_retry (upload.py:950-991) — per-row nested savepoint (deviation 3).
// A MySQL error inside the nested tx marks the connection; the caught nested-tx rollback
// (ROLLBACK TO SAVEPOINT) isolates it so the batch continues.
export async function applyPlanWithRetry(
  tx: Db, plan: PlannedImportRow, userId: number, categoryCache: Map<string, { id: number; name: string }>, batchId: string | null,
): Promise<RowResult> {
  const row = plan.row
  try {
    const { txnId, outcome } = await tx.transaction(async (sp: Db) =>
      persistPlannedRow(sp, plan, userId, categoryCache, batchId))
    return rowResult({ rowIndex: row.rowIndex, status: outcome, transactionId: txnId })
  } catch (err) {
    if (err instanceof ImportValidationError) {
      return rowResult({ rowIndex: row.rowIndex, status: "skipped_invalid", errorCode: err.code, message: err.message })
    }
    // Duplicate import_row_hash → unique-index violation → idempotent (matches Flask IntegrityError branch).
    const msg = err instanceof Error ? err.message : String(err)
    if (plan.importRowHash && /duplicate entry|ER_DUP_ENTRY/i.test(msg)) {
      return rowResult({ rowIndex: row.rowIndex, status: "skipped_idempotent", errorCode: "import_row_idempotent", message: "Row already imported previously.", idempotencyKey: plan.importRowHash })
    }
    return rowResult({ rowIndex: row.rowIndex, status: "failed_internal", errorCode: "import_row_db_error", message: "Database error while importing row." })
  }
}

// ── Preview duplicate hints (upload.py:583-789) ───────────────────────────────
// difflib.SequenceMatcher.ratio() faithful port (autojunk off — transaction names are short).
function findLongestMatch(a: string, b: string, alo: number, ahi: number, blo: number, bhi: number, b2j: Map<string, number[]>): [number, number, number] {
  let besti = alo, bestj = blo, bestsize = 0
  let j2len = new Map<number, number>()
  for (let i = alo; i < ahi; i++) {
    const newj2len = new Map<number, number>()
    const indices = b2j.get(a[i])
    if (indices) {
      for (const j of indices) {
        if (j < blo) continue
        if (j >= bhi) break
        const k = (j2len.get(j - 1) ?? 0) + 1
        newj2len.set(j, k)
        if (k > bestsize) { besti = i - k + 1; bestj = j - k + 1; bestsize = k }
      }
    }
    j2len = newj2len
  }
  return [besti, bestj, bestsize]
}
function matchingBlocksSize(a: string, b: string): number {
  const b2j = new Map<string, number[]>()
  for (let j = 0; j < b.length; j++) {
    const arr = b2j.get(b[j]); if (arr) arr.push(j); else b2j.set(b[j], [j])
  }
  let total = 0
  const queue: Array<[number, number, number, number]> = [[0, a.length, 0, b.length]]
  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop()!
    const [i, j, k] = findLongestMatch(a, b, alo, ahi, blo, bhi, b2j)
    if (k > 0) {
      total += k
      if (alo < i && blo < j) queue.push([alo, i, blo, j])
      if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi])
    }
  }
  return total
}
function sequenceRatio(a: string, b: string): number {
  const t = a.length + b.length
  if (t === 0) return 1
  return (2 * matchingBlocksSize(a, b)) / t
}
function normalizedFuzzyName(name: string | null): string {
  let n = buildNameKey(name ?? "")
  n = n.replace(/[^a-z0-9]+/g, " ")
  return n.split(/\s+/).filter(Boolean).join(" ")
}
function isSimilarDuplicateName(left: string | null, right: string | null): boolean {
  const l = normalizedFuzzyName(left), r = normalizedFuzzyName(right)
  if (!l || !r) return false
  if (l === r) return true
  const [shorter, longer] = l.length <= r.length ? [l, r] : [r, l]
  if (shorter.length >= 6 && longer.includes(shorter)) return true
  const ratio = sequenceRatio(l, r)
  if (ratio >= 0.82) return true
  const lt = new Set(l.split(" ")), rt = new Set(r.split(" "))
  if (lt.size === 0 || rt.size === 0) return false
  let inter = 0; for (const t of lt) if (rt.has(t)) inter++
  const overlap = inter / Math.max(1, Math.min(lt.size, rt.size))
  return overlap >= 0.6 && ratio >= 0.65
}
function withinDupDateWindow(a: string, b: string): boolean {
  const da = Date.parse(`${a}T00:00:00Z`), db2 = Date.parse(`${b}T00:00:00Z`)
  return Math.abs((da - db2) / 86400000) <= 1
}
type Hint = { likely_dup: true; duplicate_reason: string; duplicate_message: string }
function previewDupHint(reason: string, candidateName: string, candidateDate: string, inBatch: boolean): Hint {
  const scope = inBatch ? "another row in this file" : "an existing transaction"
  const title = (candidateName || "Untitled transaction").trim().slice(0, 80)
  return { likely_dup: true, duplicate_reason: reason, duplicate_message: `Potential match with ${scope}: "${title}" on ${candidateDate} has the same amount and a near-matching date.` }
}

async function loadFuzzyCandidates(db: Db, userId: number, validRows: ValidatedImportRow[]): Promise<Map<string, Array<{ date: string; name: string }>>> {
  const out = new Map<string, Array<{ date: string; name: string }>>()
  if (validRows.length === 0) return out
  const dates = validRows.map((r) => Date.parse(`${r.txDate}T00:00:00Z`))
  const minDate = new Date(Math.min(...dates) - 86400000).toISOString().slice(0, 10)
  const maxDate = new Date(Math.max(...dates) + 86400000).toISOString().slice(0, 10)
  const amounts = [...new Set(validRows.map((r) => formatKd(r.amount)))]
  const rows = await db.select({ date: transactions.date, name: transactions.name, amountKd: transactions.amountKd })
    .from(transactions).where(and(eq(transactions.userId, userId), sql`${transactions.date} >= ${minDate}`, sql`${transactions.date} <= ${maxDate}`, inArray(transactions.amountKd, amounts)))
  for (const r of rows as Array<{ date: Date; name: string | null; amountKd: string }>) {
    const key = formatKd(r.amountKd)
    const ds = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10)
    const arr = out.get(key); const entry = { date: ds, name: r.name ?? "" }
    if (arr) arr.push(entry); else out.set(key, [entry])
  }
  return out
}

async function buildFuzzyHints(db: Db, userId: number, validRows: ValidatedImportRow[]): Promise<Map<number, Hint>> {
  const hints = new Map<number, Hint>()
  if (validRows.length === 0) return hints
  const existing = await loadFuzzyCandidates(db, userId, validRows)
  for (const row of validRows) {
    for (const cand of existing.get(formatKd(row.amount)) ?? []) {
      if (!withinDupDateWindow(row.txDate, cand.date)) continue
      if (!isSimilarDuplicateName(row.name, cand.name)) continue
      hints.set(row.rowIndex, previewDupHint("import_row_duplicate_fuzzy_existing", cand.name, cand.date, false))
      break
    }
  }
  const byAmount = new Map<string, ValidatedImportRow[]>()
  for (const row of validRows) {
    const k = formatKd(row.amount); const arr = byAmount.get(k); if (arr) arr.push(row); else byAmount.set(k, [row])
  }
  for (const siblings of byAmount.values()) {
    if (siblings.length < 2) continue
    const ordered = [...siblings].sort((x, y) => x.txDate < y.txDate ? -1 : x.txDate > y.txDate ? 1 : x.rowIndex - y.rowIndex)
    for (let idx = 0; idx < ordered.length; idx++) {
      const row = ordered[idx]
      if (hints.has(row.rowIndex)) continue
      for (let k = idx + 1; k < ordered.length; k++) {
        const other = ordered[k]
        if (!withinDupDateWindow(row.txDate, other.txDate)) {
          if (Date.parse(`${other.txDate}T00:00:00Z`) > Date.parse(`${row.txDate}T00:00:00Z`) + 86400000) break
          continue
        }
        if (!isSimilarDuplicateName(row.name, other.name)) continue
        hints.set(row.rowIndex, previewDupHint("import_row_duplicate_fuzzy_batch", other.name, other.txDate, true))
        if (!hints.has(other.rowIndex)) hints.set(other.rowIndex, previewDupHint("import_row_duplicate_fuzzy_batch", row.name, row.txDate, true))
        break
      }
    }
  }
  return hints
}

// _build_preview_duplicate_hints (upload.py:583-644)
export async function buildPreviewDuplicateHints(db: Db, previewRows: PreviewRow[], userId: number): Promise<Map<number, Hint>> {
  const validRows = validateRowsForHints(previewRows as unknown[])
  const hints = new Map<number, Hint>()
  if (validRows.length === 0) return hints

  const tripletList = validRows.map((r) => ({ txDate: r.txDate, nameKey: r.baseNameKey, amount: r.amount }))
  const existingTriplets = await loadExistingTriplets(db, userId, tripletList)
  const existingById = await loadExistingByIds(db, userId, validRows.filter((r) => r.transactionId !== null).map((r) => r.transactionId as number))

  const seenTriplets = new Set<string>()
  const seenIds = new Set<number>()
  for (const row of validRows) {
    if (row.transactionId !== null) {
      if (seenIds.has(row.transactionId)) {
        hints.set(row.rowIndex, { likely_dup: true, duplicate_reason: "import_row_duplicate_batch", duplicate_message: "Duplicate transaction_id within this import batch." })
        continue
      }
      seenIds.add(row.transactionId)
      if (existingById.get(row.transactionId)) continue
    }
    if (seenTriplets.has(row.tripletKey)) {
      hints.set(row.rowIndex, { likely_dup: true, duplicate_reason: "import_row_duplicate_batch", duplicate_message: "Duplicate row within this import batch." })
      continue
    }
    if (existingTriplets.has(row.tripletKey)) {
      hints.set(row.rowIndex, { likely_dup: true, duplicate_reason: "import_row_duplicate_existing", duplicate_message: "Duplicate row already exists." })
      continue
    }
    seenTriplets.add(row.tripletKey)
  }

  const fuzzyInput = validRows.filter((r) => !hints.has(r.rowIndex) && r.transactionId === null)
  const fuzzy = await buildFuzzyHints(db, userId, fuzzyInput)
  for (const [idx, hint] of fuzzy) if (!hints.has(idx)) hints.set(idx, hint)
  return hints
}

export { loadExistingByIds }
