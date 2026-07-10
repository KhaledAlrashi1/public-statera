import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const chartTooltipStyle: React.CSSProperties = {
  borderRadius: "var(--radius-card)",
  border: "1px solid var(--color-border)",
  fontSize: "13px",
  backgroundColor: "var(--color-card)",
  color: "var(--color-card-foreground)",
}

/**
 * Format a number as KD currency
 */
export function formatKD(amount: number | string | null | undefined): string {
  // Null-tolerant: isNaN(null) === false lets null slip a bare isNaN guard, then
  // null.toLocaleString throws. Money fields arrive as strings (Drizzle/Decimal),
  // and a nullable one is a real runtime shape — guard it. (2026-07-10 hardening.)
  if (amount === null || amount === undefined) return "KD 0.000"
  const n = typeof amount === "string" ? parseFloat(amount) : amount
  if (isNaN(n)) return "KD 0.000"
  return `KD ${n.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`
}

export function formatCompactKD(amount: number | string): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount
  if (isNaN(n)) return "KD 0"
  const abs = Math.abs(n)
  const sign = n < 0 ? "-" : ""
  if (abs >= 1000) {
    const compact = abs >= 10000 ? (abs / 1000).toFixed(0) : (abs / 1000).toFixed(1)
    return `${sign}KD ${compact}K`
  }
  return `${sign}KD ${abs.toFixed(0)}`
}

/**
 * Format a number with 3 decimal places
 */
export function fmt3(n: number | string | null | undefined): string {
  // Null-tolerant for the same reason as formatKD (isNaN(null) === false).
  if (n === null || n === undefined) return "0.000"
  const val = typeof n === "string" ? parseFloat(n) : n
  return (isNaN(val) ? 0 : val).toFixed(3)
}

const DISPLAY_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const

/**
 * Format an ISO date (YYYY-MM-DD, or an ISO timestamp) as a day-first display
 * string: "28 Jul 2026". Deterministic — no locale, no Date parsing. Returns the
 * input unchanged when it is not a YYYY-MM-DD-prefixed string.
 */
export function formatDisplayDate(isoDate: string): string {
  if (!isoDate) return ""
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate)
  if (!m) return isoDate
  const monthIdx = parseInt(m[2], 10) - 1
  if (monthIdx < 0 || monthIdx > 11) return isoDate
  return `${parseInt(m[3], 10)} ${DISPLAY_MONTHS[monthIdx]} ${m[1]}`
}

export function formatAmount(
  amount: string | number,
  type: "income" | "expense" | "neutral" = "neutral"
): { text: string; className: string } {
  const n = typeof amount === "string" ? parseFloat(amount) : amount
  const abs = Math.abs(isNaN(n) ? 0 : n).toFixed(3)
  return {
    text: type === "income" ? `+${abs}` : type === "expense" ? `-${abs}` : abs,
    className: type === "income"
      ? "text-success tabular-nums"
      : type === "expense"
        ? "text-destructive tabular-nums"
        : "tabular-nums",
  }
}

export function getBudgetUtilizationTone(percent: number): {
  barClassName: string
  textClassName: string
  summaryClassName: string
  label: string
} {
  const safePercent = Number.isFinite(percent) ? percent : 0

  if (safePercent >= 100) {
    return {
      barClassName: "bg-destructive",
      textClassName: "text-destructive",
      summaryClassName: "border-destructive/25 bg-destructive/8 text-destructive",
      label: "Over",
    }
  }

  if (safePercent >= 70) {
    return {
      barClassName: "bg-warning",
      textClassName: "text-warning",
      summaryClassName: "border-warning/25 bg-warning/8 text-warning",
      label: "Watch",
    }
  }

  return {
    barClassName: "bg-success",
    textClassName: "text-success",
    summaryClassName: "border-success/25 bg-success/8 text-success",
    label: "Healthy",
  }
}

export function getBudgetUtilizationFill(percent: number): string {
  const safePercent = Number.isFinite(percent) ? percent : 0

  if (safePercent >= 100) return "var(--color-destructive)"
  if (safePercent >= 70) return "var(--color-warning)"
  return "var(--color-success)"
}

/**
 * Get YYYY-MM from a date string
 */
export function toYearMonth(dateStr: string): string {
  return dateStr?.slice(0, 7) || ""
}

/**
 * Get today's date as YYYY-MM-DD
 */
export function today(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mm}-${dd}`
}

/**
 * Check if a category name represents income
 */
export const isIncome = (cat: string) =>
  /^income(?::|\s|$)/i.test(cat?.trim() || "")

/**
 * Get the previous month as YYYY-MM from a YYYY-MM string
 */
export function prevMonth(ym: string): string {
  if (!ym || ym.length < 7) return ""
  let y = parseInt(ym.slice(0, 4), 10)
  let m = parseInt(ym.slice(5, 7), 10) - 1
  if (m < 1) { m = 12; y -= 1 }
  return `${y}-${String(m).padStart(2, "0")}`
}

export function formatDeltaLabel(
  current: number,
  previous: number,
  options?: {
    timeframeLabel?: string
    unit?: "percent" | "points"
    missingBaselineLabel?: string
    noChangeLabel?: string
  }
): string {
  const timeframeLabel = options?.timeframeLabel ?? "last month"
  const unit = options?.unit ?? "percent"
  const missingBaselineLabel = options?.missingBaselineLabel ?? `No ${timeframeLabel} baseline`
  const noChangeLabel = options?.noChangeLabel ?? `No change vs ${timeframeLabel}`

  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return missingBaselineLabel
  }

  if (unit === "percent" && previous === 0) {
    return current === 0 ? noChangeLabel : missingBaselineLabel
  }

  const delta = unit === "points"
    ? current - previous
    : ((current - previous) / Math.abs(previous)) * 100

  if (Math.abs(delta) < 0.05) {
    return noChangeLabel
  }

  return `${delta >= 0 ? "↑" : "↓"} ${Math.abs(delta).toFixed(1)}${unit === "points" ? " pts" : "%"} vs ${timeframeLabel}`
}

/**
 * Returns true if the given YYYY-MM month is the current or next calendar month.
 * Budgets for past months are read-only.
 */
export function isEditableMonth(month: string): boolean {
  const now = new Date()
  const curr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const nd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const next = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, "0")}`
  return month === curr || month === next
}

/**
 * Format a YYYY-MM string as a display label ("This Month" or the raw value)
 */
export function labelForYM(ym: string): string {
  return ym && ym === toYearMonth(today()) ? "This Month" : ym || "\u2014"
}

/**
 * Insight type → emoji icon mapping
 */
export const INSIGHT_ICONS: Record<string, string> = {
  unusual_spending: "\u{1F4C8}",
  budget_pace: "\u26A1",
  large_transaction: "\u{1F4B0}",
  trend_rising: "\u{1F4CA}",
  trend_falling: "\u{1F4C9}",
  spending_velocity: "\u{1F3C3}",
  income_utilization: "\u{1F4B5}",
  payday_runway: "\u{1F4C5}",
}
