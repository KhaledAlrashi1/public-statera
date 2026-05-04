import { Target } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useSearchParams } from "react-router-dom"
import { analyticsApi } from "@/lib/api"
import { cn, fmt3, formatDeltaLabel, today, toYearMonth, isIncome, isEditableMonth, labelForYM, prevMonth as prevMonthUtil } from "@/lib/utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toaster"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SegmentedControl } from "@/components/ui/segmented-control"
import PageHeader from "@/components/layout/PageHeader"
import {
  BudgetChart,
  BudgetDialog,
  BudgetHero,
  BudgetTable,
  IncomePlanningCard,
  type BudgetRange,
} from "./budget/sections"
import { GoalsTab } from "./budget/GoalsTab"
import {
  type BudgetItem,
  findDuplicateCategory,
  findMostRecentBudgetsBefore,
  getBudgets,
  saveBudgets,
  useBudgetActiveMonths,
  useBudgetPageQueries,
} from "./budget/hooks"

type PlanTab = "budget" | "goals"
const PLAN_TAB_STORAGE_KEY = "plan-page-tab-v1"

function normalizePlanTab(value: string | null): PlanTab | null {
  if (value === "budget" || value === "goals") return value
  return null
}

export default function BudgetPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedMonth, setSelectedMonth] = useState(toYearMonth(today()))
  const [activeTab, setActiveTab] = useState<PlanTab>(() => {
    const tabFromUrl = normalizePlanTab(searchParams.get("tab"))
    if (tabFromUrl) return tabFromUrl
    if (typeof window === "undefined") return "budget"
    try {
      const saved = window.localStorage.getItem(PLAN_TAB_STORAGE_KEY)
      return saved === "goals" ? "goals" : "budget"
    } catch {
      return "budget"
    }
  })
  const [addOpen, setAddOpen] = useState(false)
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [range, setRange] = useState<BudgetRange>("month")
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)
  const [copying, setCopying] = useState(false)
  const [copyPreviewLoading, setCopyPreviewLoading] = useState(false)
  const [copyPreview, setCopyPreview] = useState<{ month: string; items: BudgetItem[] } | null>(null)
  const [animDone, setAnimDone] = useState(false)

  const isEditable = isEditableMonth(selectedMonth)

  const {
    categories,
    budgetMetrics,
    budgets,
    profileContext,
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
  } = useBudgetPageQueries(selectedMonth, range)

  useEffect(() => {
    const timer = setTimeout(() => setAnimDone(true), 800)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(PLAN_TAB_STORAGE_KEY, activeTab)
    } catch {
      // ignore localStorage write issues
    }
  }, [activeTab])

  useEffect(() => {
    const tabFromUrl = normalizePlanTab(searchParams.get("tab"))
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const {
    monthOptions,
    activeMonthsError,
    refetchActiveMonths,
    activeMonthsFetching,
  } = useBudgetActiveMonths()
  const comparisonMonth = useMemo(() => prevMonthUtil(selectedMonth), [selectedMonth])

  const spentMap = budgetMetrics?.spent_by_category || {}
  const rangeSpentMap = (range === "month"
    ? budgetMetrics?.spent_by_category
    : budgetMetrics?.range_spent_by_category) || {}
  const avg12 = budgetMetrics?.avg12_by_category || {}

  const {
    data: comparisonBudgetData,
    error: comparisonBudgetDataError,
    refetch: refetchComparisonBudgetData,
  } = useQuery({
    queryKey: ["budget-items", comparisonMonth],
    queryFn: () => getBudgets(comparisonMonth),
    enabled: Boolean(comparisonMonth),
  })

  const {
    data: comparisonBudgetMetrics,
    error: comparisonBudgetMetricsError,
    refetch: refetchComparisonBudgetMetrics,
  } = useQuery({
    queryKey: ["budget-metrics", comparisonMonth, "month"],
    queryFn: () => analyticsApi.budgetMetrics(comparisonMonth, "month"),
    enabled: Boolean(comparisonMonth),
  })

  const totalBudget = budgets.reduce(
    (sum, b) => sum + (parseFloat(b.amount_kd) || 0),
    0
  )
  const totalSpent = Object.values(spentMap).reduce(
    (sum, v) => sum + (v || 0),
    0
  )
  const remaining = totalBudget - totalSpent
  const percentUsed = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0
  const previousBudgetItems = comparisonBudgetData?.items || []
  const previousSpentMap = comparisonBudgetMetrics?.spent_by_category || {}
  const previousTotalBudget = previousBudgetItems.reduce(
    (sum, b) => sum + (parseFloat(b.amount_kd) || 0),
    0
  )
  const previousTotalSpent = Object.values(previousSpentMap).reduce(
    (sum, value) => sum + (value || 0),
    0
  )
  const previousRemaining = previousTotalBudget - previousTotalSpent

  const totalBudgetTrendLabel = budgets.length > 0
    ? formatDeltaLabel(totalBudget, previousTotalBudget, {
        timeframeLabel: "last month",
        missingBaselineLabel: "First budgeted month",
      })
    : "Set a budget to start comparing"
  const totalSpentTrendLabel = totalSpent > 0 || previousTotalSpent > 0
    ? formatDeltaLabel(totalSpent, previousTotalSpent, {
        timeframeLabel: "last month",
        missingBaselineLabel: "First month with spending",
      })
    : "No spending logged yet"
  const remainingTrendLabel = budgets.length > 0 || previousTotalBudget > 0
    ? formatDeltaLabel(remaining, previousRemaining, {
        timeframeLabel: "last month",
        missingBaselineLabel: "First reserve comparison",
      })
    : "No budget reserve yet"

  const rows = useMemo(() => {
    const map = range === "month" ? spentMap : rangeSpentMap
    const filtered = budgets
      .map((b, idx) => {
        const cat = b.category || "Uncategorized"
        const allocated = parseFloat(b.amount_kd) || 0
        const spent = map[cat] || 0
        const avg = avg12[cat] || 0
        const remainingVal = allocated - spent
        const pct = allocated > 0 ? Math.min(120, (spent / allocated) * 100) : 0
        return {
          idx,
          cat,
          allocated,
          spent,
          avg,
          remaining: remainingVal,
          pct,
        }
      })
      .filter((b) => !searchQuery.trim() || b.cat.toLowerCase().includes(searchQuery.trim().toLowerCase()))

    if (!filtered.length) return []

    return filtered.sort((a, b) => {
      if (a.remaining !== b.remaining) return a.remaining - b.remaining
      if (b.pct !== a.pct) return b.pct - a.pct
      return a.cat.localeCompare(b.cat)
    })
  }, [budgets, spentMap, rangeSpentMap, avg12, range, searchQuery])

  const chartData = useMemo(() => {
    const categoriesSet = new Set<string>()
    const budgetMap: Record<string, number> = {}
    budgets.forEach((b) => {
      const cat = b.category || "Uncategorized"
      categoriesSet.add(cat)
      budgetMap[cat] = parseFloat(b.amount_kd) || 0
    })
    Object.keys(spentMap).forEach((k) => categoriesSet.add(k))

    const rows = Array.from(categoriesSet).map((cat) => ({
      category: cat,
      budget: budgetMap[cat] || 0,
      spent: spentMap[cat] || 0,
      pct: budgetMap[cat] > 0 ? ((spentMap[cat] || 0) / budgetMap[cat]) * 100 : 0,
    }))

    const anySpend = rows.some((r) => r.spent > 0)
    rows.sort((a, b) => (anySpend ? b.spent - a.spent : b.budget - a.budget) || a.category.localeCompare(b.category))
    return rows.slice(0, 7)
  }, [budgets, spentMap])

  const budgetCategories = useMemo(
    () => categories.map((c) => c.name).filter((n) => !isIncome(n)),
    [categories]
  )

  const handleSave = async ({ month, category, amount_kd }: { month: string; category: string; amount_kd: string }) => {
    const next = [...budgets]
    if (editIndex !== null && editIndex >= 0 && editIndex < next.length) {
      next[editIndex] = { category, amount_kd }
    } else {
      next.push({ category, amount_kd })
    }

    const dup = findDuplicateCategory(next)
    if (dup) {
      throw new Error(`Duplicate category: "${dup}". Each category can appear only once per month.`)
    }

    const saved = await saveBudgets(month, next)
    queryClient.setQueryData(["budget-items", month], saved)
    queryClient.invalidateQueries({ queryKey: ["budgets", month] })
    queryClient.invalidateQueries({ queryKey: ["budget-metrics"] })
    queryClient.invalidateQueries({ queryKey: ["dashboard-bundle"] })
    queryClient.invalidateQueries({ queryKey: ["safe-to-spend"] })
    setEditIndex(null)
    setSelectedMonth(month)
    toast.success(editIndex !== null ? "Budget updated." : "Budget added.")
  }

  const handleDelete = (idx: number) => {
    setDeleteIndex(idx)
    setDeleteOpen(true)
  }

  const confirmDelete = async () => {
    if (deleteIndex === null) return
    setDeleting(true)
    try {
      const catName = budgets[deleteIndex]?.category || "Category"
      const deletedBudget = { category: budgets[deleteIndex].category, amount_kd: budgets[deleteIndex].amount_kd }
      const next = budgets.filter((_, i) => i !== deleteIndex)
      const saved = await saveBudgets(selectedMonth, next)
      queryClient.setQueryData(["budget-items", selectedMonth], saved)
      queryClient.invalidateQueries({ queryKey: ["budgets", selectedMonth] })
      queryClient.invalidateQueries({ queryKey: ["budget-metrics"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard-bundle"] })
      queryClient.invalidateQueries({ queryKey: ["safe-to-spend"] })
      setDeleteOpen(false)
      setDeleteIndex(null)
      toast.success(`Budget for "${catName}" deleted.`, {
        label: "Undo",
        onClick: async () => {
          try {
            const restored = await saveBudgets(selectedMonth, [...saved.items, deletedBudget])
            queryClient.setQueryData(["budget-items", selectedMonth], restored)
            queryClient.invalidateQueries({ queryKey: ["budgets", selectedMonth] })
            queryClient.invalidateQueries({ queryKey: ["budget-metrics"] })
            queryClient.invalidateQueries({ queryKey: ["dashboard-bundle"] })
            queryClient.invalidateQueries({ queryKey: ["safe-to-spend"] })
            toast.success(`Budget for "${catName}" restored.`)
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "We couldn't restore that budget right now.")
          }
        },
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We couldn't delete that budget right now.")
    } finally {
      setDeleting(false)
    }
  }

  const confirmCopyPreviousBudgets = async () => {
    if (!copyPreview) return
    setCopying(true)
    try {
      const cloned = copyPreview.items.map((b) => ({
        category: b.category,
        amount_kd: b.amount_kd,
      }))
      const dup = findDuplicateCategory(cloned)
      if (dup) {
        toast.error(`We couldn't copy those budgets because "${dup}" appears more than once.`)
        return
      }

      const saved = await saveBudgets(selectedMonth, cloned)
      queryClient.setQueryData(["budget-items", selectedMonth], saved)
      queryClient.invalidateQueries({ queryKey: ["budgets", selectedMonth] })
      queryClient.invalidateQueries({ queryKey: ["budget-metrics"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard-bundle"] })
      queryClient.invalidateQueries({ queryKey: ["safe-to-spend"] })
      setCopyOpen(false)
      setCopyPreview(null)
      toast.success(
        `Copied ${cloned.length} budget ${cloned.length === 1 ? "category" : "categories"} from ${copyPreview.month}.`
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We couldn't copy the previous month's budgets right now.")
    } finally {
      setCopying(false)
    }
  }

  const openCopyPreview = async () => {
    setCopyPreviewLoading(true)
    try {
      const fallback = await findMostRecentBudgetsBefore(selectedMonth, 12)
      if (!fallback.items.length || !fallback.month) {
        toast.error("We couldn't find any previous budgets to copy.")
        return
      }
      setCopyPreview({ month: fallback.month, items: fallback.items })
      setCopyOpen(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We couldn't load the previous budget preview right now.")
    } finally {
      setCopyPreviewLoading(false)
    }
  }

  const handleExport = () => {
    const header = ["month", "category", "allocated_kd", "spent_kd", "remaining_kd"]
    const lines = [header.join(",")]
    budgets.forEach((b) => {
      const cat = b.category || "Uncategorized"
      const alloc = parseFloat(b.amount_kd) || 0
      const spent = spentMap[cat] || 0
      const rem = alloc - spent
      const row = [
        selectedMonth,
        cat,
        fmt3(alloc),
        fmt3(spent),
        fmt3(rem),
      ]
        .map((s) => {
          const value = String(s ?? "")
          if (value.includes("\"") || value.includes(",") || value.includes("\n")) {
            return `"${value.replace(/\"/g, "\"\"")}"`
          }
          return value
        })
        .join(",")
      lines.push(row)
    })

    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `budgets-${selectedMonth}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const handleTabChange = (nextTab: string) => {
    const normalized = normalizePlanTab(nextTab)
    if (!normalized) return
    setActiveTab(normalized)
    const next = new URLSearchParams(searchParams)
    if (normalized === "budget") next.delete("tab")
    else next.set("tab", normalized)
    setSearchParams(next, { replace: true })
  }

  const budgetPageErrorMessage = useMemo(() => {
    const errors = [
      budgetsError,
      metricsError,
      categoriesError,
      activeMonthsError,
      comparisonBudgetDataError,
      comparisonBudgetMetricsError,
    ].filter(Boolean)
    if (errors.length === 0) return null
    const first = errors[0]
    return first instanceof Error ? first.message : "We couldn't load the full planning view."
  }, [budgetsError, metricsError, categoriesError, activeMonthsError, comparisonBudgetDataError, comparisonBudgetMetricsError])
  const showBudgetEmptyState = activeTab === "budget"
    && !budgetPageErrorMessage
    && !loadingBudgets
    && !loadingMetrics
    && budgets.length === 0

  return (
    <div className={cn("theme-budget space-y-8", animDone && "animations-complete")}>
      <PageHeader
        badge="Plan"
        badgeDotClassName="bg-primary"
        badgeSuffix={activeTab === "budget" ? labelForYM(selectedMonth) : "Goals & Debt"}
        title="Plan budgets, debts, and savings goals"
        actions={(
          <>
            <SegmentedControl
              tabs={[
                { id: "budget", label: "Budget" },
                { id: "goals", label: "Goals & Debt" },
              ]}
              value={activeTab}
              onChange={handleTabChange}
              ariaLabel="Plan page tabs"
            />
            <div className={cn(activeTab !== "budget" && "invisible pointer-events-none")}>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger
                  className="h-10 w-[160px] rounded-full px-4 text-sm shadow-sm sm:w-[180px]"
                  aria-label="Select month to view"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      />

      {activeTab === "budget" && budgetPageErrorMessage ? (
        <Alert variant="warning">
          <AlertTitle>Planning data unavailable</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Budgets, comparisons, or planning context may be incomplete for {labelForYM(selectedMonth)}. {budgetPageErrorMessage}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void Promise.all([
                  refetchBudgets(),
                  refetchMetrics(),
                  refetchCategories(),
                  refetchActiveMonths(),
                  refetchComparisonBudgetData(),
                  refetchComparisonBudgetMetrics(),
                ])
              }}
              loading={budgetsFetching || metricsFetching || activeMonthsFetching}
              disabled={budgetsFetching || metricsFetching || activeMonthsFetching}
            >
              {budgetsFetching || metricsFetching || activeMonthsFetching ? "Retrying..." : "Retry"}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {activeTab === "budget" ? (
        <>
          <BudgetHero
            monthLabel={labelForYM(selectedMonth)}
            totalBudget={totalBudget}
            totalBudgetTrendLabel={totalBudgetTrendLabel}
            totalSpent={totalSpent}
            totalSpentTrendLabel={totalSpentTrendLabel}
            remaining={remaining}
            remainingTrendLabel={remainingTrendLabel}
            percentUsed={percentUsed}
            isOver={remaining < 0}
            hasBudget={budgets.length > 0}
          />

          <IncomePlanningCard
            monthLabel={labelForYM(selectedMonth)}
            profileContext={profileContext}
            onOpenIncome={() => navigate("/activity?type=income")}
          />

          {showBudgetEmptyState ? (
            <section className="section-panel float-in">
              <EmptyState
                icon={<Target className="h-8 w-8" />}
                title="Set your first budget plan"
                description="Add a monthly category limit so Plan can compare what you intended to spend with what actually happened."
                action={(
                  <Button
                    type="button"
                    variant="default"
                    onClick={() => {
                      setEditIndex(null)
                      setAddOpen(true)
                    }}
                  >
                    Add your first budget
                  </Button>
                )}
              />
            </section>
          ) : (
            <>
              <BudgetChart data={chartData} isLoading={loadingMetrics || loadingBudgets} />

              <BudgetTable
                rows={rows}
                hasBudgets={budgets.length > 0}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                range={range}
                setRange={setRange}
                isEditable={isEditable}
                onAdd={() => {
                  setEditIndex(null)
                  setAddOpen(true)
                }}
                onEdit={(idx) => {
                  setEditIndex(idx)
                  setAddOpen(true)
                }}
                onDelete={handleDelete}
                onCopy={() => {
                  void openCopyPreview()
                }}
                copyLoading={copyPreviewLoading}
                onExport={handleExport}
              />
            </>
          )}

          <BudgetDialog
            open={addOpen}
            onOpenChange={(v) => {
              setAddOpen(v)
              if (!v) {
                setEditIndex(null)
              }
            }}
            initialMonth={selectedMonth}
            mode={editIndex !== null ? "edit" : "create"}
            initialValues={editIndex !== null ? budgets[editIndex] : undefined}
            onSave={handleSave}
          />

          <ConfirmDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title="Delete budget?"
            message={
              deleteIndex !== null
                ? `Delete budget for "${budgets[deleteIndex]?.category || "Category"}"? This cannot be undone.`
                : "Delete this budget?"
            }
            onConfirm={confirmDelete}
            loading={deleting}
          />

          <Dialog
            open={copyOpen}
            onOpenChange={(open) => {
              setCopyOpen(open)
              if (!open) setCopyPreview(null)
            }}
          >
            <DialogContent className="w-[calc(100vw-1rem)] max-w-lg space-y-5 sm:w-full">
              <DialogHeader>
                <DialogTitle>Copy previous budgets</DialogTitle>
                <DialogDescription>
                  {copyPreview
                    ? `We found ${copyPreview.items.length} budget ${copyPreview.items.length === 1 ? "item" : "items"} from ${labelForYM(copyPreview.month)}.`
                    : "Preview the budgets that will be copied into this month."}
                </DialogDescription>
              </DialogHeader>

              {copyPreview ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                    {budgets.length > 0
                      ? `Copying will replace the current ${labelForYM(selectedMonth)} budget list with the items below.`
                      : `These budget items will be added to ${labelForYM(selectedMonth)}.`}
                  </div>
                  <div className="surface-scroll-card max-h-72 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="table-head">
                        <tr>
                          <th className="th-standard">Category</th>
                          <th className="th-standard-r">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {copyPreview.items.map((item) => (
                          <tr key={item.category} className="border-b border-border/50 last:border-0">
                            <td className="px-4 py-3">{item.category}</td>
                            <td className="px-4 py-3 text-right tabular-nums">KD {fmt3(item.amount_kd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              <DialogFooter className="flex-col-reverse gap-2 pt-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCopyOpen(false)
                    setCopyPreview(null)
                  }}
                  disabled={copying}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    void confirmCopyPreviousBudgets()
                  }}
                  loading={copying}
                  disabled={copying || !copyPreview}
                  className="w-full sm:w-auto"
                >
                  {copying ? "Copying..." : "Copy budgets"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <datalist id="budget-cats">
            {budgetCategories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </>
      ) : (
        <GoalsTab />
      )}
    </div>
  )
}
