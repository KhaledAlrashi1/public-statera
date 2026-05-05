import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Plus,
  Trash2,
  LineChart as LineChartIcon,
  TrendingUp,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "@/lib/recharts"
import { analyticsApi, transactionsApi } from "@/lib/api"
import { chartTooltipStyle, cn, formatAmount, formatCompactKD, formatKD, today, toYearMonth, prevMonth as prevMonthUtil, labelForYM } from "@/lib/utils"
import { validatePositiveAmount, validateRequiredDate } from "@/lib/validation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { FieldFeedback, validationInputClass } from "@/components/ui/field-feedback"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { CategoryBadge } from "@/components/ui/category-badge"
import { EmptyState } from "@/components/ui/empty-state"
import { FilterBar } from "@/components/ui/filter-bar"
import { useToast } from "@/components/ui/toaster"
import PageHeader from "@/components/layout/PageHeader"

function DuplicateWarningDialog({
  open,
  onOpenChange,
  meta,
  onAddAnyway,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  meta: { date: string; name: string; amount: string }
  onAddAnyway: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-md space-y-5 sm:w-full">
        <DialogHeader>
          <DialogTitle>Possible Duplicate</DialogTitle>
          <DialogDescription>
            This entry looks similar to an existing income record.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Date</span>
            <span className="font-semibold">{meta.date}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Name</span>
            <span className="font-semibold">{meta.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-semibold">KD {meta.amount}</span>
          </div>
        </div>
        <DialogFooter className="flex-col-reverse gap-2 pt-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={onAddAnyway}
            className="w-full sm:w-auto"
          >
            Add Anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function IncomeHero({
  label,
  total,
  deltaLabel,
  isLoading,
}: {
  label: string
  total: number
  deltaLabel: string
  isLoading: boolean
}) {
  return (
    <section className="page-hero hero-sheen brand-gradient float-in gradient-flow">
      <div className="absolute -right-24 -top-20 h-72 w-72 rounded-full bg-primary-foreground/10 blur-2xl" />
      <div className="absolute -left-24 -bottom-24 h-64 w-64 rounded-full bg-primary-foreground/10 blur-3xl" />
      <div className="relative z-10 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-sm font-semibold uppercase tracking-wide text-primary-foreground/80">
            Total Income — {label}
          </div>
          <div className="financial-number mt-2.5 text-3xl font-semibold">
            {isLoading ? "KD 0" : formatCompactKD(total)}
          </div>
          <div className="mt-2.5 inline-flex items-center gap-2 rounded-full border border-primary-foreground/25 bg-primary-foreground/10 px-3 py-1 text-xs font-semibold">
            {isLoading ? "—" : deltaLabel}
          </div>
        </div>
        <div className="hero-icon-shell h-10 w-10 text-lg sm:h-12 sm:w-12">
          <TrendingUp className="h-6 w-6" aria-hidden="true" />
        </div>
      </div>
    </section>
  )
}

function IncomeChart({
  isLoading,
  data,
}: {
  isLoading: boolean
  data: Array<{ month: string; total: number }>
}) {
  const latestPoint = data[data.length - 1]
  const previousPoint = data[data.length - 2]
  const insightCaption = latestPoint && previousPoint && previousPoint.total > 0
    ? `${latestPoint.month} income is ${Math.abs(((latestPoint.total - previousPoint.total) / previousPoint.total) * 100).toFixed(0)}% ${latestPoint.total >= previousPoint.total ? "above" : "below"} ${previousPoint.month}.`
    : latestPoint
      ? `${latestPoint.month} brought in ${formatCompactKD(latestPoint.total)} in visible income.`
      : "Track whether monthly cash inflow is strengthening or slowing over time."

  return (
    <section className="section-panel panel-featured float-in stagger-2">
      <div className="section-header">
        <div>
          <div className="flex items-center gap-2">
            <LineChartIcon className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold">Income Overview</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{insightCaption}</p>
        </div>
        <div className="text-xs text-muted-foreground">Last 6 months</div>
      </div>
      <div className="section-body">
        {isLoading ? (
          <div className="skeleton h-[220px] w-full sm:h-[280px]" />
        ) : data.length === 0 ? (
          <div className="flex h-[220px] items-center justify-center rounded-xl border border-border bg-muted/40 text-sm text-muted-foreground sm:h-[280px]">
            Add income entries to see your month-to-month trend here.
          </div>
        ) : (
          <div className="h-[220px] sm:h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-income)" stopOpacity={0.85} />
                    <stop offset="100%" stopColor="var(--color-chart-income)" stopOpacity={0.2} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.4} />
                <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => formatCompactKD(Number(v))}
                />
                <RechartsTooltip
                  formatter={(value: number) => [`KD ${value.toFixed(3)}`, "Income"]}
                  contentStyle={chartTooltipStyle}
                />
                <Bar dataKey="total" radius={[8, 8, 0, 0]} fill="url(#incomeGradient)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  )
}

function RecentIncome({
  rows,
  searchQuery,
  setSearchQuery,
  range,
  setRange,
  onDelete,
  onAdd,
}: {
  rows: Array<{ id: number; date: string; name: string; amount_kd: string }>
  searchQuery: string
  setSearchQuery: (v: string) => void
  range: string
  setRange: (v: string) => void
  onDelete: (id: number) => void
  onAdd: () => void
}) {
  const isAllHistoryView = !searchQuery.trim() && range === "all"
  const isDefaultRecentView = !searchQuery.trim() && range === "30"
  const emptyTitle = isAllHistoryView
    ? "Add your first income entry"
    : isDefaultRecentView
      ? "No income in the last 30 days"
      : "No income matches this view"
  const emptyDescription = isAllHistoryView
    ? "Record a paycheck, transfer, or other income so cash inflow shows up in your plan."
    : isDefaultRecentView
      ? "Add a new income entry or widen the range to bring recent cash inflow into view."
      : "Try widening the range or clearing your search to bring income back into view."

  return (
    <section className="section-panel float-in stagger-3">
      <div className="section-header section-header-divider">
        <h2 className="text-lg font-semibold">Recent Income</h2>
        <div className="flex items-center gap-2">
          <div className="text-xs text-muted-foreground">Last 50 entries</div>
          <Button
            type="button"
            variant="default"
            onClick={onAdd}
            className="h-8 gap-1 px-3 text-xs"
            aria-label="Add new income"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>
      </div>
      <FilterBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search name…"
        mobileCollapsible
        filters={[
          {
            value: range,
            onChange: setRange,
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
        {rows.length === 0 ? (
          <EmptyState
            icon={<TrendingUp className="h-8 w-8" />}
            title={emptyTitle}
            description={emptyDescription}
            action={(
              <Button
                type="button"
                variant="default"
                size="sm"
                className="h-8 gap-1 px-3 text-xs"
                onClick={onAdd}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Income
              </Button>
            )}
            compact
          />
        ) : (
          rows.map((t) => {
            const amountMeta = formatAmount(t.amount_kd, "income")
            return (
              <article key={t.id} className="inner-card space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold" title={t.name}>
                      {t.name}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{t.date}</span>
                      <span className="inline-block h-1 w-1 rounded-full bg-border" />
                      <span>Income</span>
                    </div>
                  </div>
                  <div className={cn("text-base font-semibold tabular-nums", amountMeta.className)}>
                    {amountMeta.text}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <CategoryBadge category="Income" />
                </div>
                <div className="flex items-center justify-end border-t border-border/50 pt-3">
                  <Button
                    type="button"
                    variant="pill"
                    size="sm"
                    onClick={() => onDelete(t.id)}
                    className="h-8 gap-1 rounded-full text-xs"
                    aria-label={`Delete income entry ${t.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
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
              <th className="th-standard">Name</th>
              <th className="th-standard">Category</th>
              <th className="th-standard-r">Amount (KD)</th>
              <th className="th-standard-r">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    icon={<TrendingUp className="h-5 w-5" />}
                    title={emptyTitle}
                    description={emptyDescription}
                    action={(
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="h-8 gap-1 px-3 text-xs"
                        onClick={onAdd}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Income
                      </Button>
                    )}
                  />
                </td>
              </tr>
            ) : (
              rows.map((t) => {
                const amountMeta = formatAmount(t.amount_kd, "income")
                return (
                  <tr key={t.id} className="border-b border-border/60 table-row-hover">
                    <td className="px-4 py-3">{t.date}</td>
                    <td className="px-4 py-3 truncate" title={t.name}>
                      {t.name}
                    </td>
                    <td className="px-4 py-3">
                      <CategoryBadge category="Income" />
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${amountMeta.className}`}>
                      {amountMeta.text}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        variant="pill"
                        size="sm"
                        onClick={() => onDelete(t.id)}
                        className="h-8 gap-1 rounded-full text-xs"
                        aria-label={`Delete income entry ${t.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
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

function AddIncomeDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSuccess: () => void
}) {
  const [date, setDate] = useState(today())
  const [incomeName, setIncomeName] = useState("")
  const [amount, setAmount] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [touched, setTouched] = useState({ date: false, amount: false })
  const [dupMeta, setDupMeta] = useState<{
    date: string
    name: string
    amount: string
  } | null>(null)

  const reset = () => {
    setDate(today())
    setIncomeName("")
    setAmount("")
    setError(null)
    setSaving(false)
    setTouched({ date: false, amount: false })
    setDupMeta(null)
  }

  useEffect(() => {
    if (open) reset()
  }, [open])

  const handleSubmit = async (force = false) => {
    setError(null)

    if (!date) {
      setError("Date is required.")
      return
    }
    if (!incomeName.trim()) {
      setError("Name is required.")
      return
    }
    const amountVal = parseFloat(amount)
    if (Number.isNaN(amountVal) || amountVal <= 0) {
      setError("Amount must be greater than zero.")
      return
    }

    const amountFixed = amountVal.toFixed(3)

    setSaving(true)

    try {
      if (!force) {
        try {
          const dup = await transactionsApi.dupCheck(
            date,
            incomeName.trim(),
            amountFixed
          )
          if (dup.count > 0) {
            setDupMeta({ date, name: incomeName.trim(), amount: amountFixed })
            setSaving(false)
            return
          }
        } catch {
          /* proceed on dup-check failure */
        }
      }

      await transactionsApi.create({
        date,
        category: "Income",
        name: incomeName.trim(),
        amount_kd: amountFixed,
        force: force ? "1" : undefined,
      })

      onOpenChange(false)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't add that income entry right now.")
    } finally {
      setSaving(false)
    }
  }

  const dateValidation = touched.date || Boolean(error) ? validateRequiredDate(date) : null
  const amountValidation = touched.amount || Boolean(error) ? validatePositiveAmount(amount) : null

  return (
    <>
      <Dialog open={open && !dupMeta} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-lg space-y-5 sm:w-full" onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            handleSubmit()
          }
        }}>
          <DialogHeader>
            <DialogTitle>Add Income</DialogTitle>
            <DialogDescription>
              Capture a new income entry with date, name, and amount.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 pt-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="income-date">Date</Label>
                <Input
                  id="income-date"
                  type="date"
                  value={date}
                  max={today()}
                  onChange={(e) => setDate(e.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, date: true }))}
                  aria-invalid={dateValidation?.tone === "error"}
                  className={validationInputClass(dateValidation?.tone)}
                />
                <FieldFeedback tone={dateValidation?.tone} message={dateValidation?.message} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="income-category">Category</Label>
                <Input id="income-category" value="Income" readOnly />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="income-amount">Amount (KD)</Label>
              <Input
                id="income-amount"
                type="number"
                step="0.001"
                min="0"
                placeholder="0.000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onBlur={() => setTouched((prev) => ({ ...prev, amount: true }))}
                aria-invalid={amountValidation?.tone === "error"}
                className={cn("money-input h-11", validationInputClass(amountValidation?.tone))}
              />
              <FieldFeedback tone={amountValidation?.tone} message={amountValidation?.message} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="income-name">Name</Label>
              <Input
                id="income-name"
                placeholder="e.g., Salary, freelance payment"
                value={incomeName}
                onChange={(e) => setIncomeName(e.target.value)}
              />
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>

          <DialogFooter className="flex-col-reverse gap-2 pt-3 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={() => handleSubmit(false)}
              loading={saving}
              disabled={saving}
              className="w-full sm:w-auto"
            >
              {saving ? "Adding..." : "Add Income"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {dupMeta && (
        <DuplicateWarningDialog
          open={!!dupMeta}
          onOpenChange={(v) => {
            if (!v) setDupMeta(null)
          }}
          meta={dupMeta}
          onAddAnyway={() => {
            setDupMeta(null)
            handleSubmit(true)
          }}
        />
      )}
    </>
  )
}

export default function IncomePage() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const {
    data: dashboardMetrics,
    isLoading: loadingMetrics,
    isFetching: metricsFetching,
    error: metricsError,
    refetch: refetchMetrics,
  } = useQuery({
    queryKey: ["dashboard-metrics", 24],
    queryFn: () => analyticsApi.dashboardMetrics({ months: 24 }),
  })
  const monthlyIncomeRows = useMemo(
    () => (dashboardMetrics?.monthly || []).filter((row) => Number(row.income_kd || 0) > 0),
    [dashboardMetrics?.monthly]
  )
  const monthIncomeMap = useMemo(() => {
    const map = new Map<string, number>()
    monthlyIncomeRows.forEach((row) => map.set(row.month, Number(row.income_kd || 0)))
    return map
  }, [monthlyIncomeRows])

  const hasData = monthlyIncomeRows.length > 0

  const monthOptions = useMemo(() => {
    return monthlyIncomeRows.map((row) => row.month).sort().reverse()
  }, [monthlyIncomeRows])

  const [selectedMonth, setSelectedMonth] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [range, setRange] = useState("30")
  const [addOpen, setAddOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null)
  const [animDone, setAnimDone] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchQuery), 200)
    return () => clearTimeout(id)
  }, [searchQuery])

  useEffect(() => {
    if (!monthOptions.length) {
      setSelectedMonth("")
      return
    }
    setSelectedMonth((prev) => {
      if (prev && monthOptions.includes(prev)) return prev
      const current = toYearMonth(today())
      if (monthOptions.includes(current)) return current
      return monthOptions[0]
    })
  }, [monthOptions])

  useEffect(() => {
    const timer = setTimeout(() => setAnimDone(true), 800)
    return () => clearTimeout(timer)
  }, [])

  const rangeFrom = useMemo(() => {
    if (range === "all") return undefined
    const d = new Date()
    d.setDate(d.getDate() - Number(range))
    return d.toISOString().slice(0, 10)
  }, [range])

  const {
    data: recentIncomeResp,
    error: recentIncomeError,
    isFetching: recentIncomeFetching,
    refetch: refetchRecentIncome,
  } = useQuery({
    queryKey: ["transactions", "income", "recent", debouncedSearch, rangeFrom],
    queryFn: () =>
      transactionsApi.search({
        q: debouncedSearch || undefined,
        date_from: rangeFrom,
        income_only: true,
        limit: 50,
        offset: 0,
        include_total: false,
      }),
  })

  const monthTotals = useMemo(() => {
    const keys = Array.from(monthIncomeMap.keys()).sort()
    return {
      keys,
      values: keys.map((k) => monthIncomeMap.get(k) || 0),
    }
  }, [monthIncomeMap])

  const selectedTotal = useMemo(() => {
    if (!selectedMonth) return 0
    return monthIncomeMap.get(selectedMonth) || 0
  }, [monthIncomeMap, selectedMonth])

  const deltaLabel = useMemo(() => {
    if (!selectedMonth) return "—"
    const prev = prevMonthUtil(selectedMonth)
    const prevTotal = monthIncomeMap.get(prev) || 0
    if (prevTotal === 0 && selectedTotal > 0) {
      return "↑ New since previous month"
    }
    if (prevTotal === 0) return "—"
    const pct = ((selectedTotal - prevTotal) / prevTotal) * 100
    const arrow = pct >= 0 ? "↑" : "↓"
    return `${arrow} ${Math.abs(pct).toFixed(1)}% from previous month`
  }, [monthIncomeMap, selectedMonth, selectedTotal])

  const chartData = useMemo(() => {
    const n = monthTotals.keys.length
    const labels = monthTotals.keys.slice(Math.max(0, n - 6))
    const values = monthTotals.values.slice(Math.max(0, n - 6))
    return labels.map((month, idx) => ({ month, total: values[idx] || 0 }))
  }, [monthTotals])

  const filteredRows = useMemo(() => {
    return (recentIncomeResp?.items || [])
      .slice(0, 50)
      .map((t) => ({
        id: t.id,
        date: t.date,
        name: t.name,
        amount_kd: t.amount_kd,
      }))
  }, [recentIncomeResp?.items])

  const handleDelete = (id: number) => {
    const target = filteredRows.find((t) => t.id === id)
    if (!target) return
    setDeleteTarget({ id, name: target.name })
    setDeleteOpen(true)
  }

  const confirmDelete = () => {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleteOpen(false)
    setDeleteTarget(null)

    let undone = false
    const timer = setTimeout(async () => {
      if (undone) return
      try {
        await transactionsApi.delete(target.id)
        queryClient.invalidateQueries({ queryKey: ["transactions", "income", "recent"] })
        queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] })
        queryClient.invalidateQueries({ queryKey: ["dashboard-bundle"] })
        queryClient.invalidateQueries({ queryKey: ["safe-to-spend"] })
      } catch {
        toast.error("We couldn't delete that income entry right now.")
        queryClient.invalidateQueries({ queryKey: ["transactions", "income", "recent"] })
      }
    }, 6000)

    toast.success("Income entry deleted.", {
      label: "Undo",
      onClick: () => {
        undone = true
        clearTimeout(timer)
      },
    })
  }

  const metricsErrorMessage = metricsError instanceof Error
    ? metricsError.message
    : metricsError
      ? "We couldn't load your income analytics."
      : null
  const recentIncomeErrorMessage = recentIncomeError instanceof Error
    ? recentIncomeError.message
    : recentIncomeError
      ? "We couldn't load recent income entries."
      : null

  return (
    <div className={cn("theme-income space-y-8", animDone && "animations-complete")}>
      <PageHeader
        badge="Income"
        badgeDotClassName="bg-primary"
        badgeSuffix={labelForYM(selectedMonth)}
        title="Track and manage your income sources"
        actions={(
          <>
            <Select
              value={selectedMonth}
              onValueChange={setSelectedMonth}
              disabled={loadingMetrics || monthOptions.length === 0}
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
            <Button
              type="button"
              variant="default"
              onClick={() => setAddOpen(true)}
              className="h-10 px-4 text-sm"
              aria-label="Add new income"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Income
            </Button>
          </>
        )}
      />

      {metricsErrorMessage ? (
        <Alert variant="warning">
          <AlertTitle>Income analytics unavailable</AlertTitle>
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

      {recentIncomeErrorMessage ? (
        <Alert variant="warning">
          <AlertTitle>Recent income unavailable</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>{recentIncomeErrorMessage}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void refetchRecentIncome()
              }}
              loading={recentIncomeFetching}
              disabled={recentIncomeFetching}
            >
              {recentIncomeFetching ? "Retrying..." : "Retry"}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {!metricsErrorMessage && !loadingMetrics && !hasData && (
        <section className="section-panel float-in">
          <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl brand-gradient shadow-lg">
              <TrendingUp className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Add your first income source</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Start tracking money coming in so you can see monthly trends and totals.
              </p>
            </div>
            <Button
              variant="default"
              onClick={() => setAddOpen(true)}
            >
              Add Income
            </Button>
          </div>
        </section>
      )}

      <IncomeHero
        label={labelForYM(selectedMonth)}
        total={selectedTotal}
        deltaLabel={deltaLabel}
        isLoading={loadingMetrics}
      />

      <IncomeChart isLoading={loadingMetrics} data={chartData} />

      <RecentIncome
        rows={filteredRows}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        range={range}
        setRange={setRange}
        onDelete={handleDelete}
        onAdd={() => setAddOpen(true)}
      />

      <AddIncomeDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["transactions", "income", "recent"] })
          queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] })
          queryClient.invalidateQueries({ queryKey: ["dashboard-bundle"] })
          queryClient.invalidateQueries({ queryKey: ["safe-to-spend"] })
          toast.success("Income entry added.")
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete income entry?"
        message={
          deleteTarget
            ? `Delete income entry \"${deleteTarget.name}\"? This cannot be undone.`
            : "Delete this income entry?"
        }
        onConfirm={confirmDelete}
      />
    </div>
  )
}
