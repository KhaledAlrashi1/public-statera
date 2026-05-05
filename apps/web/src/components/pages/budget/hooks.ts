import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { analyticsApi, budgetsApi, categoriesApi } from "@/lib/api"
import { prevMonth as prevMonthUtil, today, toYearMonth } from "@/lib/utils"
import type { BudgetProfileContext, BudgetRange } from "./sections"

export type BudgetItem = { category: string; amount_kd: string }
export type BudgetData = {
  items: BudgetItem[]
  profileContext: BudgetProfileContext | null
}

const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`

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
  return useMemo(() => {
    const months: string[] = []
    const d = new Date()
    for (let i = 0; i < count; i++) {
      months.push(monthKey(d))
      d.setMonth(d.getMonth() - 1)
    }
    return months
  }, [count])
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

  const monthOptions = useMemo(() => {
    const currStr = toYearMonth(today())
    const [cy, cm] = currStr.split("-").map(Number)
    const nm = cm === 12 ? 1 : cm + 1
    const ny = cm === 12 ? cy + 1 : cy
    const nextStr = `${ny}-${String(nm).padStart(2, "0")}`

    const set = new Set<string>(activeMonths)
    set.add(currStr)
    set.add(nextStr)

    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [activeMonths])

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
