import { LayoutDashboard } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { prevMonth as prevMonthUtil, labelForYM } from "@/lib/utils"
import { authApi, notificationsApi } from "@/lib/api"
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
  CategoryBreakdownChart,
  DashboardHero,
  HomeAttentionCenter,
  IncomeExpensesChart,
  PlanSetupPrompts,
  SetupGuideDialog,
  SetupProgressPanel,
  TopExpensesPanel,
} from "./dashboard/sections"
import { useDashboardPageQueries } from "./dashboard/hooks"
import { BudgetDialog } from "./budget/sections"
import { IncomeQuickDialog } from "./profile/IncomeQuickDialog"
import { findDuplicateCategory, saveBudgets } from "./budget/hooks"
import { toFils } from "@/lib/log-amount"

const DASHBOARD_CATEGORY_PAGE_SIZE = 100

// MOB-R59 KS13 — Remaining, Over by and the Remaining chip are computed in exact fils
// (lib/log-amount toFils). This is the one conversion back to a number, for display only (the
// hero animates numbers): SWEEP-R3's display-only boundary, never fed back into arithmetic.
const filsToDisplayKd = (fils: bigint): number => Number(fils) / 1000
const filsOf = (kd: string | null | undefined): bigint => toFils(kd && kd.trim() ? kd.trim() : "0")
const SETUP_GUIDE_AUTO_LAUNCH_KEY = "setup-guide-autolaunch-v1"
const ONBOARDING_DISMISSED_KEY = "onboarding-dismissed"

export default function DashboardPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
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
  // MOB-R47 Part A — the income asks open the income pop-up instead of sending the user to Profile.
  const [incomeDialogOpen, setIncomeDialogOpen] = useState(false)
  const [setupGuideOpen, setSetupGuideOpen] = useState(false)

  const {
    dashboardMetrics,
    categoryList,
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
        // MOB-R55 P2 — savings left expense_kd, so a month holding only savings still has rows.
        return income > 0 || expense > 0 || filsOf(row.savings_kd) > 0n
      }),
    [monthlyMetrics]
  )

  // MOB-R55 P4 — savings-kind category names, from the server's kind (no frontend copy of the rule).
  const savingsCategoryNames = useMemo(
    () => new Set((categoryList ?? []).filter((c) => c.kind === "savings").map((c) => c.name)),
    [categoryList]
  )
  // R3's per-month strings, for the exact-fils figures below.
  const monthlyKdMap = useMemo(() => {
    const map = new Map<string, { expense_kd: string; savings_kd: string }>()
    monthlyMetrics.forEach((row) => map.set(row.month, { expense_kd: row.expense_kd, savings_kd: row.savings_kd }))
    return map
  }, [monthlyMetrics])
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

  // The LOGGED income sum (R4 when present, else R3). MOB-R36: it no longer feeds any displayed
  // figure; it is kept only for the empty-row guards, where 0/0 still means "no rows".
  const loggedMonthIncome = accountOverview
    ? Number(accountOverview.total_income_mtd || 0)
    : monthIncomeRaw
  const monthExpenses = accountOverview
    ? Number(accountOverview.total_spend_mtd || 0)
    : monthExpensesRaw

  // MOB-R36 — the TYPED monthly income. Mirrors lib/income-lib.ts resolveIncomeForPeriod's
  // declared_in_profile arm: income is set only when the profile value is present AND greater than
  // zero (MOB-R33, R2 correction — the sibling signal wins over the write-path argument). Under
  // RM-17 flat the same figure applies to every month.
  const typedIncome = useMemo(() => {
    const raw = profile?.monthly_income_kd
    if (raw === null || raw === undefined || String(raw).trim() === "") return null
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : null
  }, [profile?.monthly_income_kd])

  const monthIncome = typedIncome
  // MOB-R55 P3 / MOB-R58 D1 — the month's savings total comes from the server: R4 when present,
  // else R3 for the same month. Exact fils throughout (KS13).
  const incomeFils = typedIncome === null ? null : filsOf(String(profile?.monthly_income_kd ?? ""))
  const monthExpensesFils = accountOverview
    ? filsOf(accountOverview.total_spend_mtd)
    : filsOf(selectedMonth ? monthlyKdMap.get(selectedMonth)?.expense_kd : null)
  const monthSavingsFils = accountOverview
    ? filsOf(accountOverview.total_savings_mtd)
    : filsOf(selectedMonth ? monthlyKdMap.get(selectedMonth)?.savings_kd : null)
  const monthSavings = filsToDisplayKd(monthSavingsFils)
  // Remaining = income - expenses - savings, clamped at 0 (P3). "Over by" = expenses + savings -
  // income when above 0 (KS10), so a Remaining clamped to 0 is always explained. Not set wins.
  const outflowFils = monthExpensesFils + monthSavingsFils
  const remainingFils = incomeFils === null || outflowFils >= incomeFils ? 0n : incomeFils - outflowFils
  const monthRemaining = filsToDisplayKd(remainingFils)
  const monthOverBy = incomeFils !== null && outflowFils > incomeFils ? filsToDisplayKd(outflowFils - incomeFils) : null

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
        description: "Add your monthly income. You can change it later in Profile.",
        done: hasIncome,
        actionLabel: "Set income",
        onAction: () => setIncomeDialogOpen(true),
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
        actionLabel: "Set budget",
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
    const prevKd = monthlyKdMap.get(prevMonthVal)
    // The empty-period guard stays on the LOGGED sums: 0/0/0 means the month has no rows. Savings
    // is the third sum since MOB-R55 P2 split it from expenses.
    const loggedIncome = prev?.income || 0
    const expenses = prev?.expenses || 0
    const prevExpensesFils = filsOf(prevKd?.expense_kd)
    const prevSavingsFils = filsOf(prevKd?.savings_kd)
    if (loggedIncome === 0 && expenses === 0 && prevSavingsFils === 0n) return null
    if (incomeFils === null) return null
    // RM-17 flat: the previous month is measured against the same typed income. MOB-R59 KS9: like
    // with like — both months' Remaining subtract savings (the previous month's from R3).
    const prevOutflow = prevExpensesFils + prevSavingsFils
    const remaining = filsToDisplayKd(prevOutflow >= incomeFils ? 0n : incomeFils - prevOutflow)
    return { expenses, remaining, overspent: prevOutflow > incomeFils }
  }, [monthlyKpiMap, monthlyKdMap, prevMonthVal, incomeFils])

  const heroDeltas = useMemo(() => {
    // Income not set: Remaining has no value, so nothing is compared.
    if (typedIncome === null) return null
    if (!prevMonthKpis) return null
    // Symmetric with prevMonthKpis' own empty-period guard above: a month with no
    // rows produces logged income = expenses = 0, which yields a -100% delta that the
    // inverted Expenses tile renders as a green success pill. Both category
    // filters are exhaustive and every amount is > 0 (DB CHECK
    // chk_transactions_amount_positive), so 0/0 means no rows, never a real zero.
    // MOB-R36 re-key: this must read the LOGGED income, not the typed figure — the typed income
    // is never 0 once set, so keying on it would silently disable the guard.
    if (loggedMonthIncome === 0 && monthExpenses === 0 && monthSavingsFils === 0n) return null
    // MOB-R52 F6 — against a base of 0 there is no percent change; the chip is hidden (null).
    const delta = (curr: number, prev: number): number | null => {
      if (prev === 0) return null
      return ((curr - prev) / prev) * 100
    }
    // The Income chip is removed (MOB-R36 operator selection). Remaining's chip is suppressed when
    // either month is overspent: a clamped Remaining is not a comparable quantity (a channel ruling
    // by analogy, MOB-R36 — not an operator ruling).
    const eitherOverspent = monthOverBy !== null || prevMonthKpis.overspent
    return {
      expensesDelta: delta(monthExpenses, prevMonthKpis.expenses),
      remainingDelta: eitherOverspent ? null : delta(monthRemaining, prevMonthKpis.remaining),
    }
  }, [typedIncome, loggedMonthIncome, monthExpenses, monthSavingsFils, monthRemaining, monthOverBy, prevMonthKpis])

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
    // R3 expense_by_category values are formatKd strings — coerce for display/sort
    // (SWEEP-R3 display-only boundary; not ledger arithmetic).
    // MOB-R59 KS12 — an expenses chart: savings-kind categories are not slices, so its sentence
    // names the largest EXPENSE category and its share over expenses.
    return Object.entries(selectedMonthExpenseMap)
      .filter(([name]) => !savingsCategoryNames.has(name))
      .map(([name, value]) => ({ name, value: Number(value || 0) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }, [selectedMonthExpenseMap, savingsCategoryNames])

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
    // Coerce formatKd string values for display/sort (SWEEP-R3 display-only boundary).
    return Object.entries(selectedMonthExpenseMap)
      .map(([name, value]) => [name, Number(value || 0)] as [string, number])
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
        const total = Number(expenseByCategoryByMonth[month]?.[name] || 0)
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
          ? monthsWithData.reduce((s, m) => s + Number(expenseByCategoryByMonth[m]?.[name] || 0), 0) /
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
        const spent = Number(selectedMonthExpenseMap[b.category] || 0)
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
    let best: { name: string; deltaAmount: number; deltaPct: number | null } | null = null
    for (const [name, amountRaw] of Object.entries(selectedMonthExpenseMap)) {
      const amount = Number(amountRaw || 0)
      const prev = Number(prevMonthExpenseMap[name] || 0)
      const deltaAmount = amount - prev
      if (deltaAmount <= 0) continue
      // MOB-R52 F6 — a category new this month has no percent change (was a fabricated 100).
      const deltaPct = prev > 0 ? (deltaAmount / prev) * 100 : null
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
      queryClient.invalidateQueries({ queryKey: ["insights"] }),
      queryClient.invalidateQueries({ queryKey: ["budgets"] }),
      queryClient.invalidateQueries({ queryKey: ["auth-profile"] }),
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
        // Alerts are served inside the dashboard bundle (R8 -> listActiveBudgetAlerts),
        // which filters out keys with a budget_alert_dismissed event. Invalidating the
        // bundle is what makes the dismissed alert disappear; there is no ["budget-alerts"]
        // query to invalidate.
        await queryClient.invalidateQueries({ queryKey: ["dashboard-bundle"] })
      } finally {
        setDismissingAlertId(null)
      }
    },
    [dismissingAlertId, queryClient]
  )

  const categoryTotal = useMemo(() => {
    if (!activeCategory || !selectedMonth) return 0
    return Number(selectedMonthExpenseMap[activeCategory] || 0)
  }, [selectedMonthExpenseMap, activeCategory, selectedMonth])

  const categoryPrevTotal = useMemo(() => {
    if (!activeCategory || !prevMonthVal) return 0
    return Number(prevMonthExpenseMap[activeCategory] || 0)
  }, [prevMonthExpenseMap, activeCategory, prevMonthVal])

  // MOB-R56 KS1 — shares are over expenses only; a savings-kind category shows no share.
  const categoryShare =
    activeCategory && savingsCategoryNames.has(activeCategory)
      ? null
      : monthExpenses > 0 ? (categoryTotal / monthExpenses) * 100 : 0
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
    && !accountOverviewLoading
    && !monthBundleFetching
    && !analyticsErrorMessage
    && !monthBundleErrorMessage
    && !hasRecordedTransactions
    && !setupBudgetResp?.items?.length
  const showDashboardEmptyState = noDashboardData && !showSetupProgress
  // MOB-R36 re-key (MOB-R33 correction (iii)) — mirror the backend's hasFinancialData
  // (apps/api/src/lib/demo-data-lib.ts:312): the demo is refused (409) once the profile holds an
  // income or a payday, or rows exist. Keying on the logged income being 0 offered a demo the
  // backend then refused, and a typed income makes that common.
  const canLoadDemoData = !loadingDemoData
    && !hasRecordedTransactions
    && profile?.monthly_income_kd == null
    && profile?.payday_day == null
    && !setupBudgetResp?.items?.length

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

  // MOB-R50 F1 — budgetResp belongs to Home's selectedMonth, so the save goes to that month only.
  const saveStarterBudget = useCallback(async ({
    category,
    amount_kd,
  }: {
    month: string
    category: string
    amount_kd: string
  }) => {
    const month = selectedMonth
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
      queryClient.invalidateQueries({ queryKey: ["insights"] }),
    ])
    setBudgetDialogOpen(false)
    toast.success("Budget added.")
  }, [budgetResp?.items, queryClient, selectedMonth, toast])

  return (
    <div className={`space-y-8 ${isMounted ? "animations-complete" : ""}`}>
      <h1 className="sr-only">Home</h1>
      <PageHeader
        badge="Home"
        badgeDotClassName="bg-primary"
        badgeSuffix={monthLabel}
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
        monthSavings={monthSavings}
        monthRemaining={monthRemaining}
        overBy={monthOverBy}
        dailyPace={dailyPace}
        deltas={heroDeltas}
        analyticsUpdatedAt={analyticsUpdatedAt}
      />

      {showDashboardEmptyState ? (
        <section className="section-panel panel-featured float-in">
          <EmptyState
            icon={<LayoutDashboard className="h-8 w-8" />}
            title="Import activity to unlock Home"
            description="Home shows this month's spending, income and what's left."
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
          {/* MOB-R27 — SafeToSpendHero is UNMOUNTED here. Stage 1 hides rather than deletes, so
              the component and its tests remain in dashboard/sections.tsx; its three non
              safe-to-spend affordances now render from PlanSetupPrompts, mounted unconditionally
              below. This is the last safe-to-spend render path on Home. */}
          <TopExpensesPanel
            isLoading={isLoading}
            topExpenses={topExpensesWithSparklines}
            selectedMonth={selectedMonth}
            categoryDeltas={categoryTrendDeltas}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <IncomeExpensesChart isLoading={isLoading} trendData={trendData} typedIncome={typedIncome} />
            <CategoryBreakdownChart
              isLoading={isLoading}
              categoryData={categoryData}
              onSliceClick={(name) => setActiveCategory(name)}
            />
          </div>

          {/* MOB-R29 Part 2 — "Needs attention" moved BELOW both spending cards by operator
              ruling. This is a SIBLING REORDER inside the page's existing space-y-8 stack:
              the element is byte-identical to the one that stood above TopExpensesPanel, only
              its position in the list changed. No restyle, no wrapper, no gate change — the
              two spending cards keep their own relative order inside their grid, and the outer
              stack carries no order- or reverse utilities, so this order holds at every width. */}
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

      {/* MOB-R27 — the three affordances RM-6 blocked, mounted in the SAME commit that unmounts
          the hero (condition 5), so neither prompt is ever on the page twice.
          MOB-R40 F1 — ONE owner for the setup asks: while the checklist (SetupProgressPanel)
          shows, it owns the income and budget asks, so these are not mounted; once it is
          dismissed or complete, they carry them. The income nudge that stood above was removed
          in the same commit. */}
      {!showSetupProgress && (
        <PlanSetupPrompts
          isLoading={safeToSpendLoading}
          safeToSpend={safeToSpend}
          onOpenPlan={() => navigate("/plan")}
          onOpenIncome={() => setIncomeDialogOpen(true)}
        />
      )}

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

      <IncomeQuickDialog
        open={incomeDialogOpen}
        onOpenChange={setIncomeDialogOpen}
        initialValue={profile?.monthly_income_kd ?? null}
      />

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
