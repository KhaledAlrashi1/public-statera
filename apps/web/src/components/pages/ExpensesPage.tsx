import { useCallback, useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "react-router-dom"
import { ClipboardList, Plus, BarChart3, LineChart as LineChartIcon } from "lucide-react"
import {
  Cell,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  BarChart,
  Bar,
} from "@/lib/recharts"
import { analyticsApi, categoriesApi, transactionsApi } from "@/lib/api"
import { CHART_STROKES, getExpenseColors } from "@/lib/chart-tokens"
import { chartTooltipStyle, formatAmount, formatCompactKD, formatDisplayDate, formatKD, formatDeltaLabel, prevMonth as prevMonthUtil, labelForYM } from "@/lib/utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { CategoryDetailModal } from "@/components/ui/category-detail-modal"
import { CategoryBadge } from "@/components/ui/category-badge"
import { EmptyState } from "@/components/ui/empty-state"
import { FilterBar } from "@/components/ui/filter-bar"
import { SegmentedControl } from "@/components/ui/segmented-control"
import PageHeader from "@/components/layout/PageHeader"
import { useToast } from "@/components/ui/toaster"
import { SplitTransactionDialog } from "./expenses/dialogs"
import {
  usePagedTransactionRows,
} from "./expenses/hooks"
import { useQuickAdd } from "@/contexts/QuickAddContext"

const RECENT_ROWS_LIMIT = 50
const CATEGORY_DETAIL_PAGE_SIZE = 100


function ExpenseHero({
  monthLabel,
  monthTotal,
  deltaLabel,
}: {
  monthLabel: string
  monthTotal: number
  deltaLabel: string
}) {
  return (
    <section className="float-in space-y-3" aria-label="Expense overview">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Total Expenses — {monthLabel}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <div className="font-mono text-3xl font-semibold tabular-nums text-foreground">
          {formatCompactKD(monthTotal)}
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
          {deltaLabel}
        </div>
      </div>
    </section>
  )
}

function TopCategories({
  monthLabel,
  isLoading,
  topCategories,
}: {
  monthLabel: string
  isLoading: boolean
  topCategories: Array<{ name: string; value: number; sparklineData: Array<{ month: string; value: number }> }>
}) {
  const expenseColors = getExpenseColors()

  return (
    <section className="section-panel panel-featured float-in stagger-2">
      <div className="section-header">
        <h2 className="text-lg font-semibold">Top Spending Categories</h2>
        <div className="text-xs text-muted-foreground">
          Top four categories for {monthLabel.toLowerCase()}.
        </div>
      </div>
      <div className="section-body grid gap-3 sm:grid-cols-2">
        {isLoading ? (
          <>
            <div className="skeleton h-24" />
            <div className="skeleton h-24" />
            <div className="skeleton h-24" />
            <div className="skeleton h-24" />
          </>
        ) : topCategories.length === 0 ? (
          <div className="col-span-full rounded-lg border border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
            Add expenses this month to see which categories are taking the biggest share.
          </div>
        ) : (
          topCategories.map(({ name, value, sparklineData }, idx) => (
            <div key={name} className="inner-card">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span
                    className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                    style={{
                      background: expenseColors[idx % expenseColors.length],
                    }}
                  />
                  <div className="text-sm font-semibold truncate" title={name}>
                    {name}
                  </div>
                </div>
                <div className="h-8 w-16 flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sparklineData}>
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={expenseColors[idx % expenseColors.length]}
                        strokeWidth={1.5}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="financial-number mt-2 text-xl font-semibold">{formatCompactKD(value)}</div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function CategoryBreakdownChart({
  isLoading,
  categoryData,
  onSliceClick,
}: {
  isLoading: boolean
  categoryData: Array<{ name: string; value: number }>
  onSliceClick: (name: string) => void
}) {
  const expenseColors = getExpenseColors()
  const totalSpend = categoryData.reduce((sum, row) => sum + row.value, 0)
  const topCategory = categoryData.reduce<{ name: string; value: number } | null>((current, row) => {
    if (!current || row.value > current.value) return row
    return current
  }, null)
  const chartData = useMemo(() => {
    const primary = categoryData.slice(0, 6)
    const otherValue = categoryData.slice(6).reduce((sum, item) => sum + item.value, 0)
    return otherValue > 0 ? [...primary, { name: "Other", value: otherValue }] : primary
  }, [categoryData])
  const insightCaption = topCategory && totalSpend > 0
    ? `${topCategory.name} is leading at ${((topCategory.value / totalSpend) * 100).toFixed(0)}% of this month's visible spending.`
    : "Your largest categories rise to the top here so overspending stands out quickly."

  return (
    <section className="section-panel float-in stagger-3" aria-label="Category spending breakdown">
      <div className="section-header">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-semibold">Category Breakdown</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{insightCaption}</p>
        </div>
        <div className="text-xs text-muted-foreground">Selected month</div>
      </div>
      <div className="section-body">
        {isLoading ? (
          <div className="skeleton h-[240px] w-full sm:h-[280px]" role="status" aria-label="Loading chart data" />
        ) : categoryData.length === 0 ? (
          <div className="flex h-[240px] items-center justify-center rounded-xl border border-border bg-muted/40 text-sm text-muted-foreground sm:h-[280px]">
            Add expenses this month to see how your spending is split.
          </div>
        ) : (
          <div
            role="img"
            aria-label={`Horizontal bar chart showing spending across ${chartData.length} category groups.`}
            className="outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-lg"
          >
            <div className="h-[260px] sm:h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 8, right: 12, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.4} horizontal vertical={false} />
                  <XAxis
                    type="number"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value: number) => formatCompactKD(value)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    width={104}
                  />
                  <Bar
                    dataKey="value"
                    radius={[0, 8, 8, 0]}
                    onClick={(data: { name?: string } | undefined) => {
                      if (data?.name && data.name !== "Other") onSliceClick(data.name)
                    }}
                  >
                    {chartData.map((_, index) => (
                      <Cell key={`bar-cell-${index}`} fill={expenseColors[index % expenseColors.length]} />
                    ))}
                  </Bar>
                  <RechartsTooltip
                    formatter={(value: number) => [`KD ${value.toFixed(3)}`, "Amount"]}
                    contentStyle={chartTooltipStyle}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {categoryData.length > chartData.length ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Showing the top six categories. Smaller categories are grouped into Other.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  )
}

function SpendingTrendChart({
  isLoading,
  trendData,
}: {
  isLoading: boolean
  trendData: Array<{ month: string; total: number }>
}) {
  const tickFmt = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(0))
  const latestPoint = trendData[trendData.length - 1]
  const previousPoint = trendData[trendData.length - 2]
  const insightCaption = latestPoint && previousPoint && previousPoint.total > 0
    ? `${latestPoint.month} closed at ${formatCompactKD(latestPoint.total)}, ${Math.abs(((latestPoint.total - previousPoint.total) / previousPoint.total) * 100).toFixed(0)}% ${latestPoint.total >= previousPoint.total ? "above" : "below"} ${previousPoint.month}.`
    : latestPoint
      ? `${latestPoint.month} is the latest visible month at ${formatCompactKD(latestPoint.total)} in spending.`
      : "Use this trend to spot whether monthly spending is accelerating or settling down."
  return (
    <section className="section-panel float-in stagger-4">
      <div className="section-header">
        <div>
          <div className="flex items-center gap-2">
            <LineChartIcon className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold">Spending Trend</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{insightCaption}</p>
        </div>
        <div className="text-xs text-muted-foreground">Last 12 months</div>
      </div>
      <div className="section-body">
        {isLoading ? (
          <div className="skeleton h-[220px] w-full sm:h-[280px]" />
        ) : trendData.length === 0 ? (
          <div className="flex h-[220px] items-center justify-center rounded-xl border border-border bg-muted/40 text-sm text-muted-foreground sm:h-[280px]">
            Add more expense history to see your spending trend over time.
          </div>
        ) : (
          <div className="h-[220px] sm:h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.4} />
                <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={tickFmt}
                />
                <RechartsTooltip
                  formatter={(value: number) => [`KD ${value.toFixed(3)}`, "Total"]}
                  contentStyle={chartTooltipStyle}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke={CHART_STROKES.spendingTrend}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  )
}

function RecentExpenses({
  recentRows,
  searchQuery,
  setSearchQuery,
  filterCategory,
  setFilterCategory,
  filterRange,
  setFilterRange,
  categories,
  onAdd,
  onSplit,
}: {
  recentRows: Array<{ id: number; transaction_id?: number; date: string; merchant: string | null; category: string; name: string; amount_kd: string }>
  searchQuery: string
  setSearchQuery: (v: string) => void
  filterCategory: string
  setFilterCategory: (v: string) => void
  filterRange: string
  setFilterRange: (v: string) => void
  categories: string[]
  onAdd: () => void
  onSplit: (txnId: number) => void
}) {
  const preparedRows = useMemo(() => {
    return recentRows.map((row) => {
      const txnId = row.transaction_id ?? row.id

      return {
        ...row,
        txnId,
        amountMeta: formatAmount(row.amount_kd, "expense"),
      }
    })
  }, [recentRows])

  const isAllHistoryView = !searchQuery.trim() && filterCategory === "all" && filterRange === "all"
  const isDefaultRecentView = !searchQuery.trim() && filterCategory === "all" && filterRange === "30"
  const emptyTitle = isAllHistoryView
    ? "Log your first expense"
    : isDefaultRecentView
      ? "No expenses in the last 30 days"
      : "No expenses match this view"
  const emptyDescription = isAllHistoryView
    ? "Add an expense to start tracking where your money is going."
    : isDefaultRecentView
      ? "Add a new expense or widen the range to bring recent spending into view."
      : "Try widening the range or clearing filters to bring your spending back into view."

  return (
    <section className="section-panel float-in stagger-8">
      <div className="section-header section-header-divider">
        <h2 className="text-lg font-semibold">Recent Expenses</h2>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="default"
            onClick={onAdd}
            className="h-9 px-3 text-xs"
            aria-label="Add new expense"
          >
            + Add
          </Button>
        </div>
      </div>
      <FilterBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search expenses…"
        mobileCollapsible
        filters={[
          {
            value: filterCategory,
            onChange: setFilterCategory,
            options: [
              { value: "all", label: "All categories" },
              ...categories.map((c) => ({ value: c, label: c })),
            ],
            placeholder: "All categories",
          },
          {
            value: filterRange,
            onChange: setFilterRange,
            options: [
              { value: "30", label: "Last 30 days" },
              { value: "90", label: "Last 90 days" },
              { value: "365", label: "Last 12 months" },
              { value: "all", label: "All time" },
            ],
          },
        ]}
      />
      <div className="space-y-3 p-4 md:hidden">
        {preparedRows.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-8 w-8" />}
            title={emptyTitle}
            description={emptyDescription}
            action={(
              <Button
                type="button"
                variant="default"
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={onAdd}
              >
                + Add Expense
              </Button>
            )}
            compact
          />
        ) : (
          preparedRows.map((t) => {
            const primaryLabel = t.merchant || t.name || "—"
            const secondaryLabel =
              t.merchant && t.name && t.name !== t.merchant ? t.name : null

            return (
              <article key={t.id} className="inner-card space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold" title={primaryLabel}>
                      {primaryLabel}
                    </div>
                    {secondaryLabel ? (
                      <p
                        className="mt-1 truncate text-xs text-muted-foreground"
                        title={secondaryLabel}
                      >
                        {secondaryLabel}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDisplayDate(t.date)}</span>
                      <span className="inline-block h-1 w-1 rounded-full bg-border" />
                      <span>{t.category}</span>
                    </div>
                  </div>
                  <div className={`text-base font-semibold tabular-nums ${t.amountMeta.className}`}>
                    {t.amountMeta.text}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <CategoryBadge category={t.category} />
                </div>
                <div className="flex items-center justify-end border-t border-border/50 pt-3">
                  <Button
                    type="button"
                    variant="pill"
                    size="sm"
                    onClick={() => onSplit(t.txnId)}
                    className="h-8 px-3 text-xs"
                  >
                    Edit
                  </Button>
                </div>
              </article>
            )
          })
        )}
      </div>
      <div className="hidden max-h-[480px] overflow-auto rounded-b-2xl md:block">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="th-standard">Date</th>
              <th className="th-standard">Merchant</th>
              <th className="th-standard">Category</th>
              <th className="th-standard">Item</th>
              <th className="th-standard-r">Amount (KD)</th>
              <th className="th-standard-r">Actions</th>
            </tr>
          </thead>
          <tbody>
            {recentRows.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    icon={<ClipboardList className="h-5 w-5" />}
                    title={emptyTitle}
                    description={emptyDescription}
                    action={(
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="h-8 px-3 text-xs"
                        onClick={onAdd}
                      >
                        + Add Expense
                      </Button>
                    )}
                  />
                </td>
              </tr>
            ) : (
              preparedRows.map((t) => {
                return (
                  <tr key={t.id} className="border-b border-border/60 table-row-hover">
                    <td className="px-4 py-3">{formatDisplayDate(t.date)}</td>
                    <td className="px-4 py-3">{t.merchant || "—"}</td>
                    <td className="px-4 py-3">
                      <CategoryBadge category={t.category} />
                    </td>
                    <td className="px-4 py-3">{t.name || "—"}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${t.amountMeta.className}`}>
                      {t.amountMeta.text}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        variant="pill"
                        size="sm"
                        onClick={() => onSplit(t.txnId)}
                        className="h-8 px-3 text-xs"
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}


export default function ExpensesPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`

  const [selectedMonth, setSelectedMonth] = useState("")
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const { openQuickAdd } = useQuickAdd()
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [categoryOffset, setCategoryOffset] = useState(0)
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitTxnId, setSplitTxnId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [filterCategory, setFilterCategory] = useState("all")
  const [filterRange, setFilterRange] = useState("30")
  const [activeTab, setActiveTab] = useState<"overview" | "recent">("overview")

  const {
    data: dashboardMetrics,
    isLoading: metricsLoading,
    isFetching: metricsFetching,
    error: metricsError,
    refetch: refetchMetrics,
  } = useQuery({
    queryKey: ["dashboard-metrics", 60],
    queryFn: () => analyticsApi.dashboardMetrics({ months: 60 }),
  })

  const monthlyExpenseRows = useMemo(
    () => (dashboardMetrics?.monthly || []).filter((row) => Number(row.expense_kd || 0) > 0),
    [dashboardMetrics?.monthly]
  )

  const monthlyExpenseMap = useMemo(() => {
    const map = new Map<string, number>()
    monthlyExpenseRows.forEach((row) => map.set(row.month, Number(row.expense_kd || 0)))
    return map
  }, [monthlyExpenseRows])

  const expenseByCategoryByMonth = dashboardMetrics?.expense_by_category || {}

  const hasData = monthlyExpenseRows.length > 0

  const monthOptions = useMemo(
    () => monthlyExpenseRows.map((row) => row.month).sort().reverse(),
    [monthlyExpenseRows]
  )

  const {
    data: allCategories = [],
    error: categoriesError,
    isFetching: categoriesFetching,
    refetch: refetchCategories,
  } = useQuery({
    queryKey: ["categories"],
    queryFn: categoriesApi.list,
  })

  useEffect(() => {
    const fromQuery = (searchParams.get("category") || "").trim()
    if (!fromQuery || fromQuery.toLowerCase() === "all") return
    const match = allCategories.find((c) => c.name.toLowerCase() === fromQuery.toLowerCase())
    if (match) {
      setFilterCategory(match.name)
      setActiveTab("recent")
    }
  }, [searchParams, allCategories])

  const selectedMonthExpenseMap = useMemo(
    () => (selectedMonth ? (expenseByCategoryByMonth[selectedMonth] || {}) : {}),
    [expenseByCategoryByMonth, selectedMonth]
  )

  const prevMonth = useMemo(() => prevMonthUtil(selectedMonth), [selectedMonth])
  const prevMonthExpenseMap = useMemo(
    () => (prevMonth ? (expenseByCategoryByMonth[prevMonth] || {}) : {}),
    [expenseByCategoryByMonth, prevMonth]
  )

  const rangeFrom = useMemo(() => {
    if (filterRange === "all") return undefined
    const d = new Date()
    d.setDate(d.getDate() - Number(filterRange))
    return d.toISOString().slice(0, 10)
  }, [filterRange])

  const {
    data: recentRowsResp,
    error: recentRowsError,
    isFetching: recentRowsFetching,
    refetch: refetchRecentRows,
  } = useQuery({
    queryKey: [
      "transactions",
      "expenses",
      "recent",
      debouncedSearch,
      filterCategory,
      rangeFrom,
    ],
    enabled: activeTab === "recent",
    queryFn: () =>
      transactionsApi.search({
        q: debouncedSearch || undefined,
        category: filterCategory !== "all" ? filterCategory : undefined,
        date_from: rangeFrom,
        exclude_income: true,
        limit: RECENT_ROWS_LIMIT,
        offset: 0,
        include_total: false,
      }),
  })

  const recentRowsSource = recentRowsResp?.items || []

  const {
    data: categoryRowsPage,
    isFetching: categoryRowsPageLoading,
    error: categoryRowsError,
    refetch: refetchCategoryRows,
  } = useQuery({
    queryKey: [
      "transactions",
      "expenses",
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
        limit: CATEGORY_DETAIL_PAGE_SIZE,
        offset: categoryOffset,
      }),
  })

  useEffect(() => {
    setCategoryOffset(0)
  }, [activeCategory, selectedMonth])

  const {
    rowsSource: categoryRowsSource,
    hasMore: categoryHasMore,
    rowsTotal: categoryRowsTotal,
  } = usePagedTransactionRows({
    page: categoryRowsPage,
    offset: categoryOffset,
    resetKey: `${activeCategory ?? ""}:${selectedMonth}`,
  })

  const openSplit = (txnId: number) => {
    setSplitTxnId(txnId)
    setSplitOpen(true)
  }

  useEffect(() => {
    if (!monthOptions.length) {
      setSelectedMonth("")
      return
    }
    setSelectedMonth((prev) => {
      if (prev && monthOptions.includes(prev)) return prev
      if (monthOptions.includes(currentMonth)) return currentMonth
      return monthOptions[0]
    })
  }, [monthOptions, currentMonth])

  // Only animate on initial mount
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Smooth transition when month changes
  useEffect(() => {
    if (!selectedMonth) return
    setIsTransitioning(true)
    const timer = setTimeout(() => setIsTransitioning(false), 150)
    return () => clearTimeout(timer)
  }, [selectedMonth])

  const monthLabel = labelForYM(selectedMonth)

  const monthTotal = useMemo(
    () => (selectedMonth ? (monthlyExpenseMap.get(selectedMonth) || 0) : 0),
    [monthlyExpenseMap, selectedMonth]
  )
  const prevMonthTotal = useMemo(
    () => (prevMonth ? (monthlyExpenseMap.get(prevMonth) || 0) : 0),
    [monthlyExpenseMap, prevMonth]
  )

  const deltaLabel = formatDeltaLabel(monthTotal, prevMonthTotal, {
    timeframeLabel: "last month",
    missingBaselineLabel: "Comparison starts next month",
  })

  const topCategories = useMemo(() => {
    return Object.entries(selectedMonthExpenseMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
  }, [selectedMonthExpenseMap])

  const topCategoriesWithSparklines = useMemo(() => {
    if (!selectedMonth || topCategories.length === 0) return []

    // Get last 6 months including current
    const months: string[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(selectedMonth + "-01")
      d.setMonth(d.getMonth() - i)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
    }

    return topCategories.map(([name, value]) => {
      const sparklineData = months.map((month) => {
        const total = expenseByCategoryByMonth[month]?.[name] || 0
        return { month, value: total }
      })
      return { name, value, sparklineData }
    })
  }, [topCategories, expenseByCategoryByMonth, selectedMonth])

  const categoryData = useMemo(() => {
    return Object.entries(selectedMonthExpenseMap)
      .map(([name, value]) => ({ name, value: Number(value || 0) }))
      .sort((a, b) => b.value - a.value)
  }, [selectedMonthExpenseMap])

  const categoryRows = useMemo(() => {
    return [...categoryRowsSource].sort(
      (a, b) =>
        (b.date || "").localeCompare(a.date || "") ||
        (Number(b.id) || 0) - (Number(a.id) || 0)
    )
  }, [categoryRowsSource])

  const categoryTotal = useMemo(() => {
    if (!activeCategory || !selectedMonth) return 0
    return Number(selectedMonthExpenseMap[activeCategory] || 0)
  }, [selectedMonthExpenseMap, activeCategory, selectedMonth])

  const categoryPrevTotal = useMemo(() => {
    if (!activeCategory || !prevMonth) return 0
    return Number(prevMonthExpenseMap[activeCategory] || 0)
  }, [prevMonthExpenseMap, activeCategory, prevMonth])

  const categoryShare = monthTotal > 0 ? (categoryTotal / monthTotal) * 100 : 0
  const categoryDelta = categoryTotal - categoryPrevTotal
  const categoryDeltaPct =
    categoryPrevTotal > 0 ? (categoryDelta / categoryPrevTotal) * 100 : 0

  useEffect(() => {
    if (!activeCategory) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveCategory(null)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [activeCategory])

  const trendData = useMemo(() => {
    const months = Array.from(monthlyExpenseMap.keys()).sort()
    return months.slice(Math.max(0, months.length - 12)).map((m) => ({
      month: m,
      total: monthlyExpenseMap.get(m) || 0,
    }))
  }, [monthlyExpenseMap])

  const categories = useMemo(() => {
    const set = new Set<string>()
    allCategories.forEach((c) => {
      const name = (c.name || "").trim()
      if (!name || /^income/i.test(name)) return
      set.add(name)
    })
    Object.values(expenseByCategoryByMonth).forEach((byCategory) => {
      Object.keys(byCategory || {}).forEach((name) => set.add(name))
    })
    return Array.from(set).sort()
  }, [allCategories, expenseByCategoryByMonth])

  const refreshExpenseData = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-bundle"] }),
      queryClient.invalidateQueries({ queryKey: ["safe-to-spend"] }),
      queryClient.invalidateQueries({ queryKey: ["transactions", "expenses"] }),
      queryClient.invalidateQueries({ queryKey: ["categories"] }),
    ])
  }, [queryClient])

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchQuery), 200)
    return () => clearTimeout(id)
  }, [searchQuery])

  const recentRows = useMemo(() => {
    return [...recentRowsSource].sort(
      (a, b) =>
        (b.date || "").localeCompare(a.date || "") ||
        (Number(b.id) || 0) - (Number(a.id) || 0)
    )
  }, [recentRowsSource])

  const isLoading = metricsLoading
  const metricsErrorMessage = metricsError instanceof Error
    ? metricsError.message
    : metricsError
      ? "We couldn't load expense analytics."
      : null
  const categoriesErrorMessage = categoriesError instanceof Error
    ? categoriesError.message
    : categoriesError
      ? "We couldn't load expense categories."
      : null
  const recentRowsErrorMessage = recentRowsError instanceof Error
    ? recentRowsError.message
    : recentRowsError
      ? "We couldn't load recent expenses."
      : null
  const categoryRowsErrorMessage = categoryRowsError instanceof Error
    ? categoryRowsError.message
    : categoryRowsError
      ? "We couldn't load category transactions for this month."
      : null

  return (
    <div className={`space-y-8 ${isMounted ? 'animations-complete' : ''}`}>
      <PageHeader
        badge="Expenses"
        badgeDotClassName="bg-primary"
        badgeSuffix={monthLabel}
        title="Monitor and manage your spending"
        actions={(
          <>
            <SegmentedControl
              tabs={[
                { id: "overview", label: "Overview" },
                { id: "recent", label: "Recent" },
              ]}
              value={activeTab}
              onChange={setActiveTab}
              activeClassName="bg-card text-primary shadow-sm ring-1 ring-primary/15"
              ariaLabel="Expense view tabs"
            />
            <Select
              value={selectedMonth}
              onValueChange={setSelectedMonth}
              disabled={isLoading || monthOptions.length === 0}
            >
              <SelectTrigger
                className="h-10 w-[160px] rounded-full px-4 text-sm shadow-sm sm:w-[180px]"
                aria-label="Select month to view"
              >
                <SelectValue placeholder="Choose month" />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="default"
              onClick={() => openQuickAdd("expense")}
              className="h-10 px-4 text-sm"
              aria-label="Add new expense transaction"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Expense
            </Button>
          </>
        )}
      />

      {metricsErrorMessage ? (
        <Alert variant="warning">
          <AlertTitle>Expense analytics unavailable</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>{metricsErrorMessage}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void refetchMetrics()
              }}
              loading={metricsFetching}
              disabled={metricsFetching}
            >
              {metricsFetching ? "Retrying..." : "Retry"}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {categoriesErrorMessage ? (
        <Alert variant="warning">
          <AlertTitle>Expense categories unavailable</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>{categoriesErrorMessage}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void refetchCategories()
              }}
              loading={categoriesFetching}
              disabled={categoriesFetching}
            >
              {categoriesFetching ? "Retrying..." : "Retry"}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {activeTab === "recent" && recentRowsErrorMessage ? (
        <Alert variant="warning">
          <AlertTitle>Recent expenses unavailable</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>{recentRowsErrorMessage}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void refetchRecentRows()
              }}
              loading={recentRowsFetching}
              disabled={recentRowsFetching}
            >
              {recentRowsFetching ? "Retrying..." : "Retry"}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Global empty state */}
      {!metricsErrorMessage && !isLoading && !hasData && (
        <section className="section-panel float-in">
          <EmptyState
            icon={<ClipboardList className="h-8 w-8" />}
            title="Add your first expense"
            description="Start tracking your spending to see trends and keep your budget on track."
            action={(
              <Button
                type="button"
                variant="default"
                onClick={() => openQuickAdd("expense")}
              >
                Add Expense
              </Button>
            )}
          />
        </section>
      )}

      <div
        className={`space-y-8 transition-opacity duration-150 ${
          isTransitioning ? "opacity-0" : "opacity-100"
        }`}
        style={{ minHeight: hasData ? "400px" : "0" }}
        role="tabpanel"
        id={`${activeTab}-panel`}
        aria-labelledby={`${activeTab}-tab`}
      >
        {/* KPI Hero */}
        {activeTab === "overview" && hasData && (
          <ExpenseHero monthLabel={monthLabel} monthTotal={monthTotal} deltaLabel={deltaLabel} />
        )}

      {/* Top Categories */}
      {activeTab === "overview" && hasData && (
        <TopCategories monthLabel={monthLabel} isLoading={isLoading} topCategories={topCategoriesWithSparklines} />
      )}

      {/* Charts */}
      {activeTab === "overview" && hasData && (
      <div className="grid gap-6 lg:grid-cols-2">
        <CategoryBreakdownChart
          isLoading={isLoading}
          categoryData={categoryData}
          onSliceClick={(name) => setActiveCategory(name)}
        />
        <SpendingTrendChart isLoading={isLoading} trendData={trendData} />
      </div>
      )}
      {/* Recent Expenses */}
      {activeTab === "recent" && (
        <RecentExpenses
          recentRows={recentRows}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          filterCategory={filterCategory}
          setFilterCategory={setFilterCategory}
          filterRange={filterRange}
          setFilterRange={setFilterRange}
          categories={categories}
          onAdd={() => openQuickAdd("expense")}
          onSplit={openSplit}
        />
      )}
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
          setCategoryOffset((prev) => prev + CATEGORY_DETAIL_PAGE_SIZE)
        }
        onRetryCategoryLoad={() => {
          void refetchCategoryRows()
        }}
        categoryTotal={categoryTotal}
        categoryShare={categoryShare}
        categoryDelta={categoryDelta}
        categoryDeltaPct={categoryDeltaPct}
        categoryPrevTotal={categoryPrevTotal}
        prevMonth={prevMonth}
      />
      <SplitTransactionDialog
        open={splitOpen}
        onOpenChange={setSplitOpen}
        txnId={splitTxnId}
        categories={categories}
        onSaved={() => {
          void refreshExpenseData()
        }}
      />
    </div>
  )
}
