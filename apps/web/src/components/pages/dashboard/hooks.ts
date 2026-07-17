import { useQuery } from "@tanstack/react-query"
import { analyticsApi, authApi, budgetsApi, transactionsApi } from "@/lib/api"

const DASHBOARD_CATEGORY_PAGE_SIZE = 100

export function useDashboardPageQueries(
  selectedMonth: string,
  activeCategory: string | null,
  categoryOffset: number
) {
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const setupMonth = selectedMonth || currentMonth

  // Fetch bounded aggregated metrics (avoid loading full transaction history in browser).
  const {
    data: dashboardMetrics,
    isLoading: analyticsPending,
    isFetching: analyticsFetching,
    error: analyticsError,
    refetch: refetchAnalytics,
  } = useQuery({
    queryKey: ["dashboard-metrics", 24],
    queryFn: () => analyticsApi.dashboardMetrics({ months: 24 }),
  })

  const {
    data: profileResp,
    isLoading: profileLoading,
    error: profileError,
    refetch: refetchProfile,
  } = useQuery({
    queryKey: ["auth-profile", "dashboard"],
    queryFn: () => authApi.profile(),
    staleTime: 5 * 60 * 1000,
  })

  const {
    data: dashboardBundle,
    isLoading: monthBundlePending,
    isFetching: monthBundleFetching,
    error: monthBundleError,
    refetch: refetchMonthBundle,
  } = useQuery({
    queryKey: ["dashboard-bundle", selectedMonth],
    enabled: Boolean(selectedMonth),
    queryFn: () => analyticsApi.dashboardBundle(selectedMonth),
    staleTime: 60 * 1000,
  })

  const {
    data: categoryRowsPage,
    isFetching: categoryRowsPageLoading,
    error: categoryRowsError,
    refetch: refetchCategoryRows,
  } = useQuery({
    queryKey: [
      "transactions",
      "dashboard",
      "category",
      activeCategory,
      selectedMonth,
      categoryOffset,
    ],
    enabled: Boolean(activeCategory && selectedMonth),
    queryFn: () =>
      transactionsApi.byCategory({
        category: activeCategory || "",
        month: selectedMonth,
        limit: DASHBOARD_CATEGORY_PAGE_SIZE,
        offset: categoryOffset,
      }),
  })

  const {
    data: setupBudgetResp,
    isLoading: setupBudgetLoading,
    error: setupBudgetError,
    refetch: refetchSetupBudget,
  } = useQuery({
    queryKey: ["budgets", "setup-progress", setupMonth],
    queryFn: () => budgetsApi.get(setupMonth),
    staleTime: 5 * 60 * 1000,
  })

  return {
    dashboardMetrics,
    analyticsLoading: analyticsPending || analyticsFetching,
    analyticsFetching,
    analyticsError,
    refetchAnalytics,
    analyticsUpdatedAt: dashboardBundle?.snapshot_computed_at ?? dashboardMetrics?.updated_at ?? null,
    analyticsCacheWarning: dashboardMetrics?.cache_warning ?? null,
    profile: profileResp?.profile,
    demoWorkspace: profileResp?.demo_workspace,
    profileLoading,
    profileError,
    refetchProfile,
    safeToSpend: dashboardBundle?.safe_to_spend,
    safeToSpendLoading: monthBundlePending || monthBundleFetching,
    categoryRowsPage,
    categoryRowsPageLoading,
    categoryRowsError,
    refetchCategoryRows,
    budgetResp: dashboardBundle?.budget,
    budgetLoading: monthBundlePending || monthBundleFetching,
    setupBudgetResp,
    setupBudgetLoading,
    setupBudgetError,
    refetchSetupBudget,
    budgetAlerts: dashboardBundle?.budget_alerts?.items || [],
    budgetAlertsLoading: monthBundlePending || monthBundleFetching,
    accountOverview: dashboardBundle?.account_overview,
    accountOverviewLoading: monthBundlePending || monthBundleFetching,
    monthBundleFetching,
    monthBundleError,
    refetchMonthBundle,
  }
}
