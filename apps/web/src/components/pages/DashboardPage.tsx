import { LayoutDashboard } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { prevMonth as prevMonthUtil, labelForYM } from "@/lib/utils"
import { authApi, notificationsApi } from "@/lib/api"
import { useQuickAdd } from "@/contexts/QuickAddContext"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { CategoryDetailModal } from "@/components/ui/category-detail-modal"
import { DemoWorkspaceBanner } from "@/components/ui/demo-workspace-banner"
import { EmptyState } from "@/components/ui/empty-state"
import PageHeader from "@/components/layout/PageHeader"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/toaster"
import type { Transaction } from "@/types/api"
import {
  BudgetPanel,
  CategoryBreakdownChart,
  DebtSummaryPanel,
  DashboardHero,
  HomeAttentionCenter,
  IncomeExpensesChart,
  PlanningShortcutsPanel,
  SafeToSpendHero,
  SetupGuideDialog,
  SetupProgressPanel,
  TopExpensesPanel,
} from "./dashboard/sections"
import { useDashboardPageQueries } from "./dashboard/hooks"
import { BudgetDialog } from "./budget/sections"
import { findDuplicateCategory, saveBudgets } from "./budget/hooks"

const DASHBOARD_CATEGORY_PAGE_SIZE = 100
const SETUP_GUIDE_AUTO_LAUNCH_KEY = "setup-guide-autolaunch-v1"
const ONBOARDING_DISMISSED_KEY = "onboarding-dismissed"

export default function DashboardPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { openQuickAdd } = useQuickAdd()
  const toast = useToast()
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const setupGuideSyncInFlight = useRef(false)

  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [onboardingDismissed, setOnboardingDismissed] = useState(
    () => localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "true"
  )
  const [setupGuideSeenLocal, setSetupGuideSeenLocal] = useState(
    () => localStorage.getItem(SETUP_GUIDE_AUTO_LAUNCH_KEY) === "true"
  )
  const [categoryOffset, setCategoryOffset] = useState(0)
  const [categoryRowsSource, setCategoryRowsSource] = useState<Transaction[]>([])
  const [categoryHasMore, setCategoryHasMore] = useState(false)
  const [categoryRowsTotal, setCategoryRowsTotal] = useState(0)
  const [dismissingAlertId, setDismissingAlertId] = useState<string | null>(null)
  const [loadingDemoData, setLoadingDemoData] = useState(false)
  const [clearingDemoData, setClearingDemoData] = useState(false)
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false)
  const [setupGuideOpen, setSetupGuideOpen] = useState(false)

  const {
    dashboardMetrics,
    analyticsLoading,
    analyticsFetching,
    analyticsError,
    refetchAnalytics,
    analyticsUpdatedAt,
    profile,
    demoWorkspace,
    profileLoading,
    profileError,
    refetchProfile,
    safeToSpend,
    safeToSpendLoading,
    debtSummary,
    debtSummaryLoading,
    categoryRowsPage,
    categoryRowsPageLoading,
    categoryRowsError,
    refetchCategoryRows,
    budgetResp,
    budgetLoading,
    setupBudgetResp,
    setupBudgetLoading,
    setupBudgetError,
    refetchSetupBudget,
    budgetAlerts,
    budgetAlertsLoading,
    accountOverview,
    accountOverviewLoading,
    monthBundleFetching,
    monthBundleError,
    refetchMonthBundle,
  } = useDashboardPageQueries(selectedMonth, activeCategory, categoryOffset)

  const monthlyMetrics = dashboardMetrics?.monthly || []
  const expenseByCategoryByMonth = dashboardMetrics?.expense_by_category || {}

  const monthOptions = useMemo(() => {
    const months = dashboardMetrics?.months || []
    return [...months].sort().reverse()
  }, [dashboardMetrics?.months])

  const monthlyKpiMap = useMemo(() => {
    const map = new Map<string, { income: number; expenses: number }>()
    monthlyMetrics.forEach((row) => {
      map.set(row.month, {
        income: Number(row.income_kd || 0),
        expenses: Number(row.expense_kd || 0),
      })
    })
    return map
  }, [monthlyMetrics])

  const hasRecordedTransactions = useMemo(
    () =>
      monthlyMetrics.some((row) => {
        const income = Number(row.income_kd || 0)
        const expense = Number(row.expense_kd || 0)
        return income > 0 || expense > 0
      }),
    [monthlyMetrics]
  )
  const hasRecordedExpenses = useMemo(
    () => monthlyMetrics.some((row) => Number(row.expense_kd || 0) > 0),
    [monthlyMetrics]
  )

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (!selectedMonth) return
    setIsTransitioning(true)
    const timer = setTimeout(() => setIsTransitioning(false), 150)
    return () => clearTimeout(timer)
  }, [selectedMonth])

  useEffect(() => {
    if (!monthOptions.length) return
    setSelectedMonth((prev) => {
      if (prev && monthOptions.includes(prev)) return prev
      if (monthOptions.includes(currentMonth)) return currentMonth
      return monthOptions[0]
    })
  }, [monthOptions, currentMonth])

  const monthIncomeRaw = selectedMonth ? (monthlyKpiMap.get(selectedMonth)?.income || 0) : 0
  const monthExpensesRaw = selectedMonth ? (monthlyKpiMap.get(selectedMonth)?.expenses || 0) : 0

  const monthIncome = accountOverview
    ? Number(accountOverview.total_income_mtd || 0)
    : monthIncomeRaw
  const monthExpenses = accountOverview
    ? Number(accountOverview.total_spend_mtd || 0)
    : monthExpensesRaw

  const monthRemaining = Math.max(0, monthIncome - monthExpenses)

  const savingsRate = monthIncome > 0 ? ((monthIncome - monthExpenses) / monthIncome) * 100 : 0

  const monthLabel = labelForYM(selectedMonth)
  const monthBundleErrorMessage = monthBundleError instanceof Error
    ? monthBundleError.message
    : monthBundleError
      ? "We couldn't load this month's dashboard details."
      : null
  const analyticsErrorMessage = analyticsError instanceof Error
    ? analyticsError.message
    : analyticsError
      ? "We couldn't load your dashboard analytics."
      : null
  const profileErrorMessage = profileError instanceof Error
    ? profileError.message
    : profileError
      ? "We couldn't load your dashboard profile context."
      : null
  const setupBudgetErrorMessage = setupBudgetError instanceof Error
    ? setupBudgetError.message
    : setupBudgetError
      ? "We couldn't load your setup progress."
      : null
  const categoryRowsErrorMessage = categoryRowsError instanceof Error
    ? categoryRowsError.message
    : categoryRowsError
      ? "We couldn't load category transactions for this month."
      : null
  const setupSteps = useMemo(() => {
    const hasIncome = Number(profile?.monthly_income_kd || safeToSpend?.monthly_income_kd || 0) > 0
    const hasTransactions = hasRecordedTransactions
    const hasBudget = Boolean(setupBudgetResp?.items?.length)

    return [
      {
        key: "income",
        title: "Set your income",
        description: "Add your monthly income and payday in Profile so planning starts with a real baseline.",
        done: hasIncome,
        actionLabel: "Set Income",
        onAction: () => navigate("/profile"),
      },
      {
        key: "transactions",
        title: "Import or add transactions",
        description: "Bring in a CSV or add transactions manually so the dashboard can read real activity.",
        done: hasTransactions,
        actionLabel: "Add Activity",
        onAction: () => navigate("/activity"),
      },
      {
        key: "budget",
        title: "Set your first budget",
        description: "Add at least one budget category so the dashboard can compare plan versus actual spending.",
        done: hasBudget,
        actionLabel: "Set Budget",
        onAction: () => setBudgetDialogOpen(true),
      },
    ]
  }, [
    hasRecordedTransactions,
    navigate,
    profile?.monthly_income_kd,
    safeToSpend?.monthly_income_kd,
    setupBudgetResp?.items?.length,
  ])

  const prevMonthVal = useMemo(() => prevMonthUtil(selectedMonth), [selectedMonth])

  const dailyPace = useMemo(() => {
    if (!selectedMonth) return null
    const [year, month] = selectedMonth.split("-").map(Number)
    const daysInMonth = new Date(year, month, 0).getDate()
    const isCurrentMo = selectedMonth === currentMonth
    const daysElapsed = isCurrentMo ? now.getDate() : daysInMonth
    const avgDaily = daysElapsed > 0 ? monthExpenses / daysElapsed : 0
    const projected = avgDaily * daysInMonth
    return { avgDaily, projected, daysElapsed, daysInMonth }
  }, [selectedMonth, currentMonth, monthExpenses])

  const prevMonthKpis = useMemo(() => {
    if (!prevMonthVal) return null
    const prev = monthlyKpiMap.get(prevMonthVal)
    const income = prev?.income || 0
    const expenses = prev?.expenses || 0
    const remaining = Math.max(0, income - expenses)
    const sr = income > 0 ? ((income - expenses) / income) * 100 : 0
    if (income === 0 && expenses === 0) return null
    return { income, expenses, remaining, savingsRate: sr }
  }, [monthlyKpiMap, prevMonthVal])

  const heroDeltas = useMemo(() => {
    if (!prevMonthKpis) return null
    const delta = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0
      return ((curr - prev) / prev) * 100
    }
    return {
      incomeDelta: delta(monthIncome, prevMonthKpis.income),
      expensesDelta: delta(monthExpenses, prevMonthKpis.expenses),
      remainingDelta: delta(monthRemaining, prevMonthKpis.remaining),
      savingsRateDelta: savingsRate - prevMonthKpis.savingsRate,
    }
  }, [monthIncome, monthExpenses, monthRemaining, savingsRate, prevMonthKpis])

  const trendData = useMemo(() => {
    return monthlyMetrics.slice(Math.max(0, monthlyMetrics.length - 12)).map((row) => ({
      month: row.month,
      income: Number(row.income_kd || 0),
      expenses: Number(row.expense_kd || 0),
    }))
  }, [monthlyMetrics])

  const selectedMonthExpenseMap = useMemo(
    () => (selectedMonth ? (expenseByCategoryByMonth[selectedMonth] || {}) : {}),
    [expenseByCategoryByMonth, selectedMonth]
  )
  const prevMonthExpenseMap = useMemo(
    () => (prevMonthVal ? (expenseByCategoryByMonth[prevMonthVal] || {}) : {}),
    [expenseByCategoryByMonth, prevMonthVal]
  )

  const categoryData = useMemo(() => {
    return Object.entries(selectedMonthExpenseMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }, [selectedMonthExpenseMap])

  useEffect(() => {
    setCategoryOffset(0)
    setCategoryRowsSource([])
    setCategoryHasMore(false)
    setCategoryRowsTotal(0)
  }, [activeCategory, selectedMonth])

  useEffect(() => {
    if (!categoryRowsPage) return
    const pageItems = categoryRowsPage.items || []
    setCategoryRowsSource((prev) => {
      const next = categoryOffset === 0 ? pageItems : [...prev, ...pageItems]
      const seen = new Set<string>()
      return next.filter((row) => {
        const rowKey = `${row.id}:${row.transaction_id ?? row.id}`
        if (seen.has(rowKey)) return false
        seen.add(rowKey)
        return true
      })
    })
    setCategoryHasMore(Boolean(categoryRowsPage.has_more))
    setCategoryRowsTotal(
      categoryRowsPage.total >= 0
        ? categoryRowsPage.total
        : categoryOffset + pageItems.length + (categoryRowsPage.has_more ? 1 : 0)
    )
  }, [categoryRowsPage, categoryOffset])

  const categoryRows = useMemo(
    () =>
      [...categoryRowsSource].sort(
        (a, b) =>
          (b.date || "").localeCompare(a.date || "") || (Number(b.id) || 0) - (Number(a.id) || 0)
      ),
    [categoryRowsSource]
  )

  const topExpenses = useMemo(() => {
    return Object.entries(selectedMonthExpenseMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
  }, [selectedMonthExpenseMap])

  const topExpensesWithSparklines = useMemo(() => {
    if (!selectedMonth || topExpenses.length === 0) return []

    const months: string[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(selectedMonth + "-01")
      d.setMonth(d.getMonth() - i)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
    }

    return topExpenses.map(([name, value]) => {
      const sparklineData = months.map((month) => {
        const total = expenseByCategoryByMonth[month]?.[name] || 0
        return { month, value: total }
      })
      return { name, value, sparklineData }
    })
  }, [topExpenses, expenseByCategoryByMonth, selectedMonth])

  const categoryTrendDeltas = useMemo(() => {
    if (!selectedMonth || topExpenses.length === 0) return new Map<string, number>()
    // Build 3-month rolling average from the 3 months BEFORE the selected month
    const rollingMonths: string[] = []
    for (let i = 1; i <= 3; i++) {
      const d = new Date(selectedMonth + "-01")
      d.setMonth(d.getMonth() - i)
      rollingMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
    }
    const map = new Map<string, number>()
    for (const [name] of topExpenses) {
      const monthsWithData = rollingMonths.filter(
        (m) => expenseByCategoryByMonth[m]?.[name] != null
      )
      const avg =
        monthsWithData.length > 0
          ? monthsWithData.reduce((s, m) => s + (expenseByCategoryByMonth[m]?.[name] || 0), 0) /
            monthsWithData.length
          : 0
      map.set(name, avg)
    }
    return map
  }, [topExpenses, selectedMonth, expenseByCategoryByMonth])

  const budgetTop = useMemo(() => {
    const items = budgetResp?.items || []
    if (!items.length) return []

    return items
      .map((b) => {
        const allocated = Number(b.amount_kd || 0)
        const spent = selectedMonthExpenseMap[b.category] || 0
        const usedPct = allocated > 0 ? spent / allocated : 0
        return {
          category: b.category,
          allocated,
          spent,
          usedPct,
          over: Math.max(0, spent - allocated),
        }
      })
      .sort(
        (a, b) =>
          b.usedPct - a.usedPct || b.spent - a.spent || a.category.localeCompare(b.category)
      )
      .slice(0, 4)
  }, [budgetResp, selectedMonthExpenseMap])

  const overBudgetCount = useMemo(
    () => budgetTop.filter((item) => item.over > 0).length,
    [budgetTop]
  )

  const overBudgetAmount = useMemo(
    () => budgetTop.reduce((sum, item) => sum + item.over, 0),
    [budgetTop]
  )

  const risingCategory = useMemo(() => {
    let best: { name: string; deltaAmount: number; deltaPct: number } | null = null
    for (const [name, amountRaw] of Object.entries(selectedMonthExpenseMap)) {
      const amount = Number(amountRaw || 0)
      const prev = Number(prevMonthExpenseMap[name] || 0)
      const deltaAmount = amount - prev
      if (deltaAmount <= 0) continue
      const deltaPct = prev > 0 ? (deltaAmount / prev) * 100 : 100
      if (!best || deltaAmount > best.deltaAmount) {
        best = { name, deltaAmount, deltaPct }
      }
    }
    return best
  }, [selectedMonthExpenseMap, prevMonthExpenseMap])

  const openImportFlow = useCallback(() => {
    navigate("/activity?import=1")
  }, [navigate])

  const invalidateFinancialQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-bundle"] }),
      queryClient.invalidateQueries({ queryKey: ["safe-to-spend"] }),
      queryClient.invalidateQueries({ queryKey: ["debt-accounts-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["budgets"] }),
      queryClient.invalidateQueries({ queryKey: ["analytics-account-overview"] }),
      queryClient.invalidateQueries({ queryKey: ["snapshot"] }),
      queryClient.invalidateQueries({ queryKey: ["auth-profile"] }),
      queryClient.invalidateQueries({ queryKey: ["savings-goals"] }),
      queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      queryClient.invalidateQueries({ queryKey: ["categories"] }),
      queryClient.invalidateQueries({ queryKey: ["merchants"] }),
    ])
  }, [queryClient])

  const dismissBudgetAlert = useCallback(
    async (alertKey: string) => {
      if (!alertKey || dismissingAlertId === alertKey) return
      setDismissingAlertId(alertKey)
      try {
        await notificationsApi.dismissBudgetAlert(alertKey)
        await queryClient.invalidateQueries({ queryKey: ["budget-alerts"] })
      } finally {
        setDismissingAlertId(null)
      }
    },
    [dismissingAlertId, queryClient]
  )

  const categoryTotal = useMemo(() => {
    if (!activeCategory || !selectedMonth) return 0
    return selectedMonthExpenseMap[activeCategory] || 0
  }, [selectedMonthExpenseMap, activeCategory, selectedMonth])

  const categoryPrevTotal = useMemo(() => {
    if (!activeCategory || !prevMonthVal) return 0
    return prevMonthExpenseMap[activeCategory] || 0
  }, [prevMonthExpenseMap, activeCategory, prevMonthVal])

  const categoryShare = monthExpenses > 0 ? (categoryTotal / monthExpenses) * 100 : 0
  const categoryDelta = categoryTotal - categoryPrevTotal
  const categoryDeltaPct = categoryPrevTotal > 0 ? (categoryDelta / categoryPrevTotal) * 100 : 0

  useEffect(() => {
    if (!activeCategory) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveCategory(null)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [activeCategory])

  const isLoading = analyticsLoading
  const heroLoading = analyticsLoading || accountOverviewLoading || !selectedMonth
  const effectiveSetupGuideSeen = Boolean(profile?.setup_guide_seen) || setupGuideSeenLocal
  const effectiveOnboardingDismissed = Boolean(profile?.setup_guide_dismissed) || onboardingDismissed
  const setupCompleteCount = setupSteps.filter((step) => step.done).length
  const showSetupProgress = !effectiveOnboardingDismissed && setupCompleteCount < setupSteps.length
  const setupLoading = profileLoading || setupBudgetLoading
  const activeDemoWorkspace = demoWorkspace?.active ? demoWorkspace : null
  const noDashboardData = !activeDemoWorkspace
    && !analyticsLoading
    && !profileLoading
    && !safeToSpendLoading
    && !setupBudgetLoading
    && !debtSummaryLoading
    && !accountOverviewLoading
    && !monthBundleFetching
    && !analyticsErrorMessage
    && !monthBundleErrorMessage
    && !hasRecordedTransactions
    && !setupBudgetResp?.items?.length
    && ((debtSummary?.account_count ?? 0) === 0)
  const showDashboardEmptyState = noDashboardData && !showSetupProgress
  const canLoadDemoData = !loadingDemoData
    && !hasRecordedTransactions
    && monthIncome === 0
    && !setupBudgetResp?.items?.length
    && ((debtSummary?.account_count ?? 0) === 0)

  const loadDemoData = useCallback(async () => {
    setLoadingDemoData(true)
    try {
      const summary = await authApi.loadDemoData()
      await invalidateFinancialQueries()
      toast.success(
        `Loaded ${summary.transactions_created} demo transactions across ${summary.months_seeded} months.`
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : "We couldn't load demo data right now."
      toast.error(message)
    } finally {
      setLoadingDemoData(false)
    }
  }, [
    debtSummary?.account_count,
    hasRecordedTransactions,
    monthIncome,
    invalidateFinancialQueries,
    setupBudgetResp?.items?.length,
    toast,
  ])

  useEffect(() => {
    if (showSetupProgress) return
    setSetupGuideOpen(false)
  }, [showSetupProgress])

  useEffect(() => {
    if (!profile?.setup_guide_seen) return
    setSetupGuideSeenLocal(true)
    try {
      window.localStorage.setItem(SETUP_GUIDE_AUTO_LAUNCH_KEY, "true")
    } catch {
      // ignore storage issues
    }
  }, [profile?.setup_guide_seen])

  useEffect(() => {
    if (!profile?.setup_guide_dismissed) return
    setOnboardingDismissed(true)
    try {
      window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, "true")
    } catch {
      // ignore storage issues
    }
  }, [profile?.setup_guide_dismissed])

  const syncSetupGuideProfile = useCallback(async (
    values: {
      setup_guide_seen?: boolean
      setup_guide_dismissed?: boolean
    }
  ) => {
    if (setupGuideSyncInFlight.current) return
    setupGuideSyncInFlight.current = true
    try {
      await authApi.updateProfile(values)
      await queryClient.invalidateQueries({ queryKey: ["auth-profile"] })
    } catch {
      // Keep the local fallback so the UI still behaves consistently offline.
    } finally {
      setupGuideSyncInFlight.current = false
    }
  }, [queryClient])

  useEffect(() => {
    if (profileLoading) return
    const patch: { setup_guide_seen?: boolean; setup_guide_dismissed?: boolean } = {}
    if (setupGuideSeenLocal && !profile?.setup_guide_seen) {
      patch.setup_guide_seen = true
    }
    if (onboardingDismissed && !profile?.setup_guide_dismissed) {
      patch.setup_guide_seen = true
      patch.setup_guide_dismissed = true
    }
    if (!("setup_guide_seen" in patch) && !("setup_guide_dismissed" in patch)) return
    void syncSetupGuideProfile(patch)
  }, [
    onboardingDismissed,
    profile?.setup_guide_dismissed,
    profile?.setup_guide_seen,
    profileLoading,
    setupGuideSeenLocal,
    syncSetupGuideProfile,
  ])

  useEffect(() => {
    if (!showSetupProgress || setupLoading || activeDemoWorkspace) return
    if (typeof window === "undefined") return
    if (effectiveSetupGuideSeen) return
    setSetupGuideSeenLocal(true)
    try {
      window.localStorage.setItem(SETUP_GUIDE_AUTO_LAUNCH_KEY, "true")
    } catch {
      // ignore storage issues and still show the guided flow once this session
    }
    void syncSetupGuideProfile({ setup_guide_seen: true })
    setSetupGuideOpen(true)
  }, [activeDemoWorkspace, effectiveSetupGuideSeen, setupLoading, showSetupProgress, syncSetupGuideProfile])

  const clearDemoWorkspace = useCallback(async () => {
    setClearingDemoData(true)
    try {
      const summary = await authApi.clearDemoData()
      await invalidateFinancialQueries()
      toast.success(
        `Cleared ${summary.transactions_cleared} demo transactions and ${summary.budgets_cleared} demo budgets.`
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : "We couldn't clear the demo workspace right now."
      toast.error(message)
    } finally {
      setClearingDemoData(false)
    }
  }, [invalidateFinancialQueries, toast])

  const saveStarterBudget = useCallback(async ({
    month,
    category,
    amount_kd,
  }: {
    month: string
    category: string
    amount_kd: string
  }) => {
    const existingItems = budgetResp?.items || []
    const nextItems = [...existingItems, { category, amount_kd }]
    const duplicateCategory = findDuplicateCategory(nextItems)
    if (duplicateCategory) {
      throw new Error(`Duplicate category: "${duplicateCategory}". Each category can appear only once per month.`)
    }

    const saved = await saveBudgets(month, nextItems)
    queryClient.setQueryData(["budget-items", month], saved)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["budget-items", month] }),
      queryClient.invalidateQueries({ queryKey: ["budget-metrics"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-bundle"] }),
      queryClient.invalidateQueries({ queryKey: ["safe-to-spend"] }),
    ])
    setSelectedMonth(month)
    setBudgetDialogOpen(false)
    toast.success("Budget added.")
  }, [budgetResp?.items, queryClient, toast])

  return (
    <div className={`space-y-8 ${isMounted ? "animations-complete" : ""}`}>
      <PageHeader
        badge="Home"
        badgeDotClassName="bg-primary"
        badgeSuffix={monthLabel}
        title="Your monthly health and priorities"
        actions={(
          <Select
            value={selectedMonth}
            onValueChange={setSelectedMonth}
            disabled={isLoading || monthOptions.length === 0}
          >
            <SelectTrigger
              className="h-10 w-[160px] rounded-full px-4 text-sm shadow-sm sm:w-[180px]"
              aria-label="Select month to view"
            >
              <SelectValue placeholder="No months" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />

      {activeDemoWorkspace ? (
        <DemoWorkspaceBanner
          demoWorkspace={activeDemoWorkspace!}
          onOpenImport={openImportFlow}
          onClearDemoWorkspace={() => {
            void clearDemoWorkspace()
          }}
          clearing={clearingDemoData}
        />
      ) : null}

      {monthBundleErrorMessage ? (
        <Alert variant="warning">
          <AlertTitle>Month details unavailable</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Safe to spend, budgets, alerts, and account overview for {monthLabel} may be incomplete. {monthBundleErrorMessage}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void refetchMonthBundle()
              }}
              loading={monthBundleFetching}
              disabled={monthBundleFetching}
              aria-label="Retry month details"
            >
              {monthBundleFetching ? "Retrying..." : "Retry"}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {analyticsErrorMessage ? (
        <Alert variant="warning">
          <AlertTitle>Historical analytics unavailable</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Trend charts and category comparisons may be incomplete right now. {analyticsErrorMessage}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void refetchAnalytics()
              }}
              loading={analyticsFetching}
              disabled={analyticsFetching}
              aria-label="Retry analytics"
            >
              {analyticsFetching ? "Retrying..." : "Retry"}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {profileErrorMessage || setupBudgetErrorMessage ? (
        <Alert variant="warning">
          <AlertTitle>Dashboard setup data unavailable</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Onboarding status or demo workspace context may be incomplete. {profileErrorMessage || setupBudgetErrorMessage}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void Promise.all([
                  refetchProfile(),
                  refetchSetupBudget(),
                ])
              }}
              disabled={profileLoading || setupBudgetLoading}
            >
              {profileLoading || setupBudgetLoading ? "Retrying..." : "Retry setup data"}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <DashboardHero
        isLoading={heroLoading}
        monthLabel={monthLabel}
        monthIncome={monthIncome}
        monthExpenses={monthExpenses}
        monthRemaining={monthRemaining}
        savingsRate={savingsRate}
        dailyPace={dailyPace}
        deltas={heroDeltas}
        analyticsUpdatedAt={analyticsUpdatedAt}
      />

      {showDashboardEmptyState ? (
        <section className="section-panel panel-featured float-in">
          <EmptyState
            icon={<LayoutDashboard className="h-8 w-8" />}
            title="Import activity to unlock Home"
            description="Bring in transactions or reopen guided setup so Home can show safe-to-spend, budget pressure, and category trends instead of placeholders."
            action={(
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button type="button" onClick={openImportFlow}>
                  Import activity
                </Button>
                <Button type="button" variant="outline" onClick={() => setSetupGuideOpen(true)}>
                  Open guided setup
                </Button>
              </div>
            )}
          />
        </section>
      ) : null}

      {!noDashboardData ? (
        <div
          className={`space-y-8 transition-opacity duration-150 ${
            isTransitioning ? "opacity-0" : "opacity-100"
          }`}
          style={{ minHeight: "400px" }}
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <IncomeExpensesChart isLoading={isLoading} trendData={trendData} />
            <CategoryBreakdownChart
              isLoading={isLoading}
              categoryData={categoryData}
              onSliceClick={(name) => setActiveCategory(name)}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <TopExpensesPanel
              isLoading={isLoading}
              topExpenses={topExpensesWithSparklines}
              selectedMonth={selectedMonth}
              categoryDeltas={categoryTrendDeltas}
            />

            <BudgetPanel
              isLoading={budgetLoading}
              budgetTop={budgetTop}
              selectedMonth={selectedMonth}
              onOpenBudget={() => navigate("/plan")}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <SafeToSpendHero
              isLoading={safeToSpendLoading}
              safeToSpend={safeToSpend}
              onOpenPlan={() => navigate("/plan")}
              onOpenIncome={() => openQuickAdd("income")}
              onOpenProfile={() => navigate("/profile")}
            />

            <HomeAttentionCenter
              isLoading={isLoading}
              monthLabel={monthLabel}
              overBudgetCount={overBudgetCount}
              overBudgetAmount={overBudgetAmount}
              risingCategory={risingCategory}
              budgetAlerts={budgetAlerts}
              alertsLoading={budgetAlertsLoading}
              dismissingAlertId={dismissingAlertId}
              budgetPressureItems={budgetTop}
              onDismissBudgetAlert={dismissBudgetAlert}
              onOpenPlan={() => navigate("/plan")}
              onOpenActivity={() => navigate("/activity?type=all")}
            />
          </div>

          <CategoryDetailModal
            open={Boolean(activeCategory)}
            onClose={() => setActiveCategory(null)}
            activeCategory={activeCategory}
            selectedMonth={selectedMonth}
            categoryRows={categoryRows}
            categoryRowsTotal={categoryRowsTotal}
            categoryHasMore={categoryHasMore}
            categoryLoadingMore={categoryRowsPageLoading}
            categoryError={categoryRowsErrorMessage}
            onLoadMore={() =>
              setCategoryOffset((prev) => prev + DASHBOARD_CATEGORY_PAGE_SIZE)
            }
            onRetryCategoryLoad={() => {
              void refetchCategoryRows()
            }}
            categoryTotal={categoryTotal}
            categoryShare={categoryShare}
            categoryDelta={categoryDelta}
            categoryDeltaPct={categoryDeltaPct}
            categoryPrevTotal={categoryPrevTotal}
            prevMonth={prevMonthVal}
          />
        </div>
      ) : null}

      {showSetupProgress && (
        <SetupProgressPanel
          isLoading={setupLoading}
          steps={setupSteps}
          primaryAction={{
            label: setupCompleteCount === 0 ? "Start guided setup" : "Continue guided setup",
            description: "Follow one focused next step at a time without hunting through the app.",
            onAction: () => setSetupGuideOpen(true),
          }}
          demoAction={canLoadDemoData ? {
            label: "Load demo workspace",
            description: "Populate a realistic six-month sample so you can evaluate the dashboard, planning, and insights immediately.",
            loading: loadingDemoData,
            onAction: () => {
              void loadDemoData()
            },
          } : null}
          onDismiss={() => {
            setOnboardingDismissed(true)
            setSetupGuideSeenLocal(true)
            localStorage.setItem(ONBOARDING_DISMISSED_KEY, "true")
            localStorage.setItem(SETUP_GUIDE_AUTO_LAUNCH_KEY, "true")
            setSetupGuideOpen(false)
            void syncSetupGuideProfile({ setup_guide_seen: true, setup_guide_dismissed: true })
          }}
        />
      )}

      {!noDashboardData && (debtSummaryLoading || (debtSummary?.account_count ?? 0) > 0) && (
        <DebtSummaryPanel
          isLoading={debtSummaryLoading}
          summary={debtSummary}
          onOpenProfile={() => navigate("/plan?tab=goals")}
        />
      )}

      {!noDashboardData && (
        <PlanningShortcutsPanel
          onOpenDebt={() => navigate("/plan?tab=goals#debt-tracker")}
          onOpenGoals={() => navigate("/plan?tab=goals#savings-goals")}
        />
      )}

      <BudgetDialog
        open={budgetDialogOpen}
        onOpenChange={setBudgetDialogOpen}
        initialMonth={selectedMonth}
        mode="create"
        onSave={saveStarterBudget}
      />

      <SetupGuideDialog
        open={setupGuideOpen}
        onOpenChange={setSetupGuideOpen}
        steps={setupSteps}
      />
    </div>
  )
}
