// MOB-R81 C6 — a row's amount: KD through formatKD, income as "+KD x" in the success colour. Display only.
// MOB-R116 D5 — moved here from TransactionsTable so the dashboard's category list reuses it. A refund (a negative row
// that is not income) is money back: "+KD x" of its magnitude, in the success colour. The magnitude comes from the
// existing formatAmount (no second normaliser, RM-27).
import { formatAmount, formatKD } from "@/lib/utils"

type AmountRow = { amount_kd: string; category_counts_as_income?: boolean }

export function isRefundRow(row: AmountRow): boolean {
  return !row.category_counts_as_income && row.amount_kd.trim().startsWith("-")
}

export function rowAmount(row: AmountRow): { text: string; className: string } {
  if (row.category_counts_as_income) return { text: `+${formatKD(row.amount_kd)}`, className: "text-success" }
  if (isRefundRow(row)) return { text: `+${formatKD(formatAmount(row.amount_kd).text)}`, className: "text-success" }
  return { text: formatKD(row.amount_kd), className: "text-foreground" }
}
