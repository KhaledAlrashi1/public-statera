import { useCallback, useEffect, useRef, useState } from "react"

import { transactionsApi } from "@/lib/api"
import type { TransactionSuggestion } from "@/types/api"

export interface PreviewRow {
  transaction_id?: number
  row_index?: number
  date: string
  merchant: string
  memo?: string
  name: string
  category: string
  amount_kd: string
  likely_dup?: boolean
  duplicate_reason?: string | null
  duplicate_message?: string | null
  excluded?: boolean
  split_group_id?: string
  _key: number
}

let nextTempId = -1
export function tempId() {
  return nextTempId--
}

export function normalizeDateForInput(raw: unknown, fallbackUts?: unknown): string {
  const s = String(raw ?? "").trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  const parsed = s ? new Date(s) : null
  if (parsed && !Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }

  if (fallbackUts !== undefined && fallbackUts !== null) {
    const n = Number(fallbackUts)
    if (Number.isFinite(n) && n > 0) {
      const d = new Date(n * 1000)
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    }
  }

  return ""
}

export function normalizeAmountForInput(raw: unknown): string {
  const s = String(raw ?? "").trim()
  if (!s) return ""
  const cleaned = s.replace(/,/g, "")
  const n = Number(cleaned)
  if (Number.isFinite(n)) return n.toFixed(3)
  return cleaned
}

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

/**
 * Apply a picked memorized-transaction suggestion to individual form fields.
 * Category fills only when the current form category is empty — a user-selected
 * category is never overwritten by a suggestion.
 * Merchant falls back to the existing value if the suggestion has none.
 */
export function applyTransactionSuggestion(
  suggestion: TransactionSuggestion,
  setName: (v: string) => void,
  setCategory: (v: string) => void,
  setMerchant: (v: string) => void,
  currentMerchant: string,
  currentCategory: string,
): void {
  setName(suggestion.name)
  if (!currentCategory.trim()) {
    setCategory(suggestion.category?.name ?? "")
  }
  setMerchant(suggestion.merchant?.name || currentMerchant)
}

export function useSuggestions() {
  const cache = useRef(new Map<string, TransactionSuggestion[]>())
  const [suggestions, setSuggestions] = useState<TransactionSuggestion[]>([])

  const fetch = useCallback(async (q: string) => {
    if (q.length < 2) return
    const key = q.toLowerCase()
    if (cache.current.has(key)) {
      setSuggestions(cache.current.get(key)!)
      return
    }
    try {
      const data = await transactionsApi.suggestions(q, 12)
      const items = data.items || []
      cache.current.set(key, items)
      setSuggestions(items)
    } catch (err) {
      console.error("Failed to fetch transaction suggestions:", err)
      if (import.meta.env.DEV) {
        throw err
      }
    }
  }, [])

  const lookup = useCallback(
    (name: string): TransactionSuggestion | undefined =>
      suggestions.find((s) => s.name.toLowerCase() === name.toLowerCase()),
    [suggestions]
  )

  return { suggestions, fetchSuggestions: fetch, lookup }
}
