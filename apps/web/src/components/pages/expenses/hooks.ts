import { useEffect, useState } from "react"
import type { Transaction } from "@/types/api"

export function monthWindow(endMonth: string, count: number) {
  const [baseYear, baseMonth] = endMonth.split("-").map(Number)
  if (!baseYear || !baseMonth || count <= 0) return []
  const out: string[] = []
  const d = new Date(baseYear, baseMonth - 1, 1)
  for (let i = 0; i < count; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
    d.setMonth(d.getMonth() - 1)
  }
  return out.reverse()
}

function dedupeTransactions(rows: Transaction[]) {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const rowKey = `${row.id}:${row.transaction_id ?? row.id}`
    if (seen.has(rowKey)) return false
    seen.add(rowKey)
    return true
  })
}

type TransactionPage = {
  items?: Transaction[]
  has_more?: boolean
  total?: number
}

export function usePagedTransactionRows(params: {
  page?: TransactionPage
  offset: number
  resetKey: string
}) {
  const { page, offset, resetKey } = params
  const [rowsSource, setRowsSource] = useState<Transaction[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [rowsTotal, setRowsTotal] = useState(0)

  useEffect(() => {
    setRowsSource([])
    setHasMore(false)
    setRowsTotal(0)
  }, [resetKey])

  useEffect(() => {
    if (!page) return
    const pageItems = page.items || []
    const hasMoreValue = Boolean(page.has_more)
    const totalValue = typeof page.total === "number" ? page.total : -1

    setRowsSource((prev) => {
      const next = offset === 0 ? pageItems : [...prev, ...pageItems]
      return dedupeTransactions(next)
    })
    setHasMore(hasMoreValue)
    setRowsTotal(
      totalValue >= 0
        ? totalValue
        : offset + pageItems.length + (hasMoreValue ? 1 : 0)
    )
  }, [page, offset])

  return { rowsSource, hasMore, rowsTotal }
}
