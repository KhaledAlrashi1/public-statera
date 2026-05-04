import { useCallback, useEffect, useRef, useState } from "react"
import { transactionsApi } from "@/lib/api"
import type { Transaction, TransactionTemplateSuggestion } from "@/types/api"

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

export function useTemplateSuggestions(enabled: boolean) {
  const cache = useRef(new Map<string, TransactionTemplateSuggestion[]>())
  const [templates, setTemplates] = useState<TransactionTemplateSuggestion[]>([])

  const sameTemplate = useCallback(
    (a: TransactionTemplateSuggestion, b: TransactionTemplateSuggestion) => {
      if (a.feedback_key && b.feedback_key) return a.feedback_key === b.feedback_key
      return a.transaction_id === b.transaction_id
    },
    []
  )

  const sendFeedback = useCallback(async (
    template: TransactionTemplateSuggestion,
    params: {
      outcome: "accepted" | "rejected"
      query?: string
      source?: string
    }
  ) => {
    const feedbackKey = (template.feedback_key || "").trim()
    if (!feedbackKey) return
    try {
      await transactionsApi.templateSuggestionFeedback({
        feedback_key: feedbackKey,
        outcome: params.outcome,
        query: (params.query || "").trim().slice(0, 255),
        source: (params.source || "").trim().slice(0, 64),
      })
    } catch {
      // Swallow feedback transport errors; user workflow should not fail.
    }
  }, [])

  const fetch = useCallback(async (q: string) => {
    const query = q.trim()
    if (!enabled || query.length < 2) {
      setTemplates([])
      return
    }
    const key = query.toLowerCase()
    if (cache.current.has(key)) {
      setTemplates(cache.current.get(key) || [])
      return
    }
    try {
      const data = await transactionsApi.templateSuggestions(query, 3)
      const items = (data.items || []).slice(0, 3)
      cache.current.set(key, items)
      setTemplates(items)
    } catch {
      setTemplates([])
    }
  }, [enabled])

  const recordTemplateAccepted = useCallback((
    template: TransactionTemplateSuggestion,
    params?: { query?: string; source?: string }
  ) => {
    void sendFeedback(template, {
      outcome: "accepted",
      query: params?.query,
      source: params?.source || "manual_apply",
    })
  }, [sendFeedback])

  const recordTemplateRejected = useCallback((
    template: TransactionTemplateSuggestion,
    params?: { query?: string; source?: string }
  ) => {
    setTemplates((prev) => prev.filter((row) => !sameTemplate(row, template)))

    const queryKey = (params?.query || "").trim().toLowerCase()
    if (queryKey) {
      const cached = cache.current.get(queryKey)
      if (cached) {
        cache.current.set(
          queryKey,
          cached.filter((row) => !sameTemplate(row, template))
        )
      }
    }

    void sendFeedback(template, {
      outcome: "rejected",
      query: params?.query,
      source: params?.source || "manual_reject",
    })
  }, [sameTemplate, sendFeedback])

  const clear = useCallback(() => setTemplates([]), [])

  return {
    templates,
    fetchTemplateSuggestions: fetch,
    clearTemplateSuggestions: clear,
    recordTemplateAccepted,
    recordTemplateRejected,
  }
}

export function applyTemplateToExpenseForm(
  form: { date: string; merchant: string; category: string; name: string; amount_kd: string },
  tpl: TransactionTemplateSuggestion
) {
  const firstItem = tpl.items?.[0]
  return {
    ...form,
    merchant: form.merchant.trim() ? form.merchant : (tpl.merchant || ""),
    category: form.category.trim() ? form.category : (firstItem?.category || ""),
    name: form.name.trim() ? form.name : (firstItem?.name || tpl.name || ""),
    amount_kd: form.amount_kd.trim() ? form.amount_kd : (firstItem?.amount_kd || tpl.amount_kd || ""),
  }
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
