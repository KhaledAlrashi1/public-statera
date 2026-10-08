import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { analyticsApi, budgetsApi, categoriesApi } from "@/lib/api"
import { currentMonthKeyNow, prevMonth as prevMonthUtil } from "@/lib/utils"
import { shiftKey, usePayday } from "@/lib/payday-months"
import type { BudgetProfileContext, BudgetRange } from "./sections"

export type BudgetItem = { category: string; amount_kd: string }
export type BudgetData = {
  items: BudgetItem[]
  profileContext: BudgetProfileContext | null
}

export async function getBudgets(month: string) {
  const data = await budgetsApi.get(month)
  return {
    items: data.items || [],
    profileContext: data.profile_context || null,
  } satisfies BudgetData
}

export async function saveBudgets(month: string, items: BudgetItem[]) {
  const data = await budgetsApi.save(month, items)
  return {
    items: data.items || [],
    profileContext: data.profile_context || null,
  } satisfies BudgetData
}

export async function findMostRecentBudgetsBefore(month: string, maxLookback = 12) {
  let probe = prevMonthUtil(month)
  let lastError: unknown = null
  for (let i = 0; i < maxLookback; i++) {
    try {
      const data = await getBudgets(probe)
      if (data.items.length) return { month: probe, items: data.items }
    } catch (error) {
      lastError = error
    }
    probe = prevMonthUtil(probe)
  }
  if (lastError) throw lastError
  return { month: null, items: [] as BudgetItem[] }
}

export function findDuplicateCategory(items: BudgetItem[]) {
  const seen = new Set<string>()
  for (const b of items) {
    const c = String(b.category || "").trim().toLowerCase()
    if (!c) continue
    if (seen.has(c)) return c
    seen.add(c)
  }
  return null
}

export function useBudgetMonthOptions(count = 24) {
  // MOB-R91 C3 — from today's month by her payday, back one key at a time.
  const payday = usePayday()
  return useMemo(() => {
    const current = currentMonthKeyNow()
    return Array.from({ length: count }, (_, i) => shiftKey(current, -i))
  }, [count, payday]) // eslint-disable-line react-hooks/exhaustive-deps
}

export function useBudgetActiveMonths() {
  const {
    data: activeMonths = [],
    error: activeMonthsError,
    refetch: refetchActiveMonths,
    isFetching: activeMonthsFetching,
  } = useQuery({
    queryKey: ["budget-active-months"],
    queryFn: () => budgetsApi.getMonths(),
    staleTime: 30_000,
  })

  const payday = usePayday()
  const monthOptions = useMemo(() => {
    // MOB-R91 C3 — this month and the next by her payday.
    const currStr = currentMonthKeyNow()
    const nextStr = shiftKey(currStr, 1)

    const set = new Set<string>(activeMonths)
    set.add(currStr)
    set.add(nextStr)

    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [activeMonths, payday]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    monthOptions,
    activeMonthsError,
    refetchActiveMonths,
    activeMonthsFetching,
  }
}

export function useBudgetPageQueries(selectedMonth: string, range: BudgetRange) {
  const {
    data: categories = [],
    error: categoriesError,
    refetch: refetchCategories,
  } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoriesApi.list(),
  })

  const {
    data: budgetData,
    isLoading: loadingBudgets,
    isFetching: budgetsFetching,
    error: budgetsError,
    refetch: refetchBudgets,
  } = useQuery<BudgetData>({
    queryKey: ["budget-items", selectedMonth],
    queryFn: () => getBudgets(selectedMonth),
  })

  const {
    data: budgetMetrics,
    isLoading: loadingMetrics,
    isFetching: metricsFetching,
    error: metricsError,
    refetch: refetchMetrics,
  } = useQuery({
    queryKey: ["budget-metrics", selectedMonth, range],
    queryFn: () => analyticsApi.budgetMetrics(selectedMonth, range),
  })

  return {
    categories,
    budgetMetrics,
    budgets: budgetData?.items || [],
    profileContext: budgetData?.profileContext || null,
    loadingBudgets,
    loadingMetrics,
    budgetsFetching,
    metricsFetching,
    budgetsError,
    metricsError,
    categoriesError,
    refetchBudgets,
    refetchMetrics,
    refetchCategories,
  }
}
