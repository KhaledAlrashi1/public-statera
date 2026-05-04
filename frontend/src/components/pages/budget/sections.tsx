import { useEffect, useState } from "react"
import { ClipboardCopy, Download, Plus, Target, Pencil, Trash2, Wallet, BarChart3 } from "lucide-react"
import {
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Legend,
} from "@/lib/recharts"
import { CHART_FILLS } from "@/lib/chart-tokens"

import {
  chartTooltipStyle,
  cn,
  fmt3,
  formatCompactKD,
  getBudgetUtilizationFill,
  getBudgetUtilizationTone,
  today,
  toYearMonth,
} from "@/lib/utils"
import { validateNonNegativeAmount } from "@/lib/validation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { FieldFeedback, validationInputClass } from "@/components/ui/field-feedback"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { FilterBar } from "@/components/ui/filter-bar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export type BudgetRange = "month" | "30" | "90" | "365" | "all"
export type BudgetProfileContext = {
  budget_total_kd: number
  monthly_income_kd: number | null
  budget_to_income_pct: number | null
  payday_day: number | null
}
const BUDGET_RANGES: BudgetRange[] = ["month", "30", "90", "365", "all"]
const BUDGET_RANGE_HELPER_COPY: Record<BudgetRange, string> = {
  month: "Spent column shows spending for the selected month.",
  "30": "Spent column shows spending from the last 30 days.",
  "90": "Spent column shows spending from the last 90 days.",
  "365": "Spent column shows spending from the last 12 months.",
  all: "Spent column shows all recorded spending to date.",
}

export type BudgetRow = {
  idx: number
  cat: string
  allocated: number
  spent: number
  avg: number
  remaining: number
  pct: number
}

export function BudgetHero({
  monthLabel,
  totalBudget,
  totalBudgetTrendLabel,
  totalSpent,
  totalSpentTrendLabel,
  remaining,
  remainingTrendLabel,
  percentUsed,
  isOver,
  hasBudget,
}: {
  monthLabel: string
  totalBudget: number
  totalBudgetTrendLabel: string
  totalSpent: number
  totalSpentTrendLabel: string
  remaining: number
  remainingTrendLabel: string
  percentUsed: number
  isOver: boolean
  hasBudget: boolean
}) {
  const status = !hasBudget
    ? null
    : isOver
      ? {
          label: "Over budget",
          className: "border-amber-200/25 bg-amber-200/12 text-amber-100",
          detail: `You have spent ${formatCompactKD(Math.abs(remaining))} more than planned so far.`,
        }
      : percentUsed >= 85
        ? {
            label: "Close to limit",
            className: "border-amber-200/25 bg-amber-200/12 text-amber-100",
            detail: `You still have ${formatCompactKD(remaining)} left this month.`,
          }
        : {
            label: "On track",
            className: "border-emerald-200/20 bg-emerald-300/10 text-emerald-100",
            detail: `You are spending below plan with ${formatCompactKD(remaining)} left this month.`,
          }

  const pctUsedTrendLabel = isOver
    ? "Over budget this month"
    : percentUsed >= 85
      ? "Approaching limit"
      : "Spending within plan"

  return (
    <section className="page-hero hero-sheen hero-gradient-warm float-in gradient-flow">
      <div className="absolute -right-24 -top-20 h-72 w-72 rounded-full bg-warning/22 blur-2xl hero-orb-1" />
      <div className="absolute -left-24 -bottom-24 h-64 w-64 rounded-full bg-primary/15 blur-3xl hero-orb-2" />

      {/* Header row */}
      <div className="relative z-10 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-amber-200/25 bg-amber-200/12 px-3 py-1 text-sm font-semibold uppercase tracking-wide text-amber-50/95">
              Total Budget — {monthLabel}
            </div>
            {status && (
              <span className={cn("inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold", status.className)}>
                {status.label}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-primary-foreground/80">
            {status
              ? status.detail
              : "Add a monthly budget to start tracking how your spending compares with plan."}
          </p>
        </div>
        <div className="hero-icon-shell h-10 w-10 text-amber-100 sm:h-12 sm:w-12">
          <Target className="h-6 w-6" />
        </div>
      </div>

      {/* Uniform 4-card KPI grid */}
      <div className="relative z-10 mt-4 hero-kpi-grid">
        <div className="hero-kpi-card hero-kpi-card-featured">
          <div className="hero-kpi-label">Planned total</div>
          <div className="hero-kpi-value">{formatCompactKD(totalBudget)}</div>
          <div className="hero-kpi-trend">{totalBudgetTrendLabel}</div>
        </div>
        <div className="hero-kpi-card hero-kpi-card-warm">
          <div className="hero-kpi-label">Spent so far</div>
          <div className="hero-kpi-value">{formatCompactKD(totalSpent)}</div>
          <div className="hero-kpi-trend">{totalSpentTrendLabel}</div>
        </div>
        <div className="hero-kpi-card hero-kpi-card-warm">
          <div className="hero-kpi-label">Remaining</div>
          <div className="hero-kpi-value">
            {isOver ? `−${formatCompactKD(Math.abs(remaining))}` : formatCompactKD(remaining)}
          </div>
          <div className="hero-kpi-trend">{remainingTrendLabel}</div>
        </div>
        <div className="hero-kpi-card hero-kpi-card-warm">
          <div className="hero-kpi-label">% Used</div>
          <div className="hero-kpi-value">{percentUsed.toFixed(1)}%</div>
          <div className="hero-kpi-trend">{pctUsedTrendLabel}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative z-10 mt-3">
        <div className="h-2.5 w-full rounded-full bg-primary-foreground/20">
          <div
            className={cn(
              "h-2.5 rounded-full transition-all duration-500",
              isOver
                ? "bg-destructive/70"
                : "bg-gradient-to-r from-amber-300 via-amber-400 to-amber-200"
            )}
            style={{ width: `${Math.min(100, percentUsed)}%` }}
          />
        </div>
      </div>
    </section>
  )
}

export function IncomePlanningCard({
  monthLabel,
  profileContext,
  onOpenIncome,
}: {
  monthLabel: string
  profileContext: BudgetProfileContext | null
  onOpenIncome?: () => void
}) {
  const monthlyIncome = profileContext?.monthly_income_kd ?? null
  const budgetTotal = profileContext?.budget_total_kd ?? 0
  const budgetPct = profileContext?.budget_to_income_pct ?? null

  if (monthlyIncome === null) {
    return (
      <section className="section-panel">
        <div className="section-header section-header-divider">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Wallet className="h-4 w-4 text-primary" />
            Income Context
          </div>
          {onOpenIncome ? (
            <Button type="button" variant="outline" size="sm" onClick={onOpenIncome}>
              Open income activity
            </Button>
          ) : null}
        </div>
        <div className="section-body">
          <div className="text-sm text-muted-foreground">
            Add income transactions in Activity to compare your {monthLabel} budgets against actual inflows.
          </div>
        </div>
      </section>
    )
  }

  let toneClass = "text-success"
  let status = "within income"
  if ((budgetPct || 0) > 100) {
    toneClass = "text-destructive"
    status = "above income"
  } else if ((budgetPct || 0) > 85) {
    toneClass = "text-warning"
    status = "close to income"
  }

  return (
    <section className="section-panel">
      <div className="section-header">
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Wallet className="h-4 w-4 text-primary" />
            Income Context
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Budget vs detected income for {monthLabel}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn("text-sm font-semibold uppercase tracking-wide", toneClass)}>
            {status}
          </div>
          {onOpenIncome ? (
            <Button type="button" variant="outline" size="sm" onClick={onOpenIncome}>
              View income activity
            </Button>
          ) : null}
        </div>
      </div>
      <div className="section-body">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="inner-card">
            <div className="text-xs text-muted-foreground">Planned Budget</div>
            <div className="financial-number mt-1 text-sm font-semibold">{formatCompactKD(budgetTotal)}</div>
          </div>
          <div className="inner-card">
            <div className="text-xs text-muted-foreground">Detected Income</div>
            <div className="financial-number mt-1 text-sm font-semibold">{formatCompactKD(monthlyIncome)}</div>
          </div>
          <div className="inner-card">
            <div className="text-xs text-muted-foreground">Budget / Income</div>
            <div className="mt-1 text-sm font-semibold">
              {budgetPct !== null ? `${budgetPct.toFixed(1)}%` : "N/A"}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function BudgetChart({
  data,
  isLoading,
}: {
  data: Array<{ category: string; budget: number; spent: number; pct: number }>
  isLoading: boolean
}) {
  const widestGap = data.reduce<{ category: string; delta: number } | null>((current, row) => {
    const delta = row.spent - row.budget
    if (!current || Math.abs(delta) > Math.abs(current.delta)) {
      return { category: row.category, delta }
    }
    return current
  }, null)
  const insightCaption = widestGap
    ? widestGap.delta > 0
      ? `${widestGap.category} is ${formatCompactKD(widestGap.delta)} over plan, the largest gap in view.`
      : widestGap.delta < 0
        ? `${widestGap.category} is ${formatCompactKD(Math.abs(widestGap.delta))} under plan, leaving the most headroom.`
        : `${widestGap.category} is tracking right on plan in the current view.`
    : "Compare planned and actual spending across the categories taking the biggest share this month."

  return (
    <section className="section-panel float-in stagger-2">
      <div className="section-header">
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold">
            <BarChart3 className="h-4 w-4 text-primary" />
            Budget vs Spending
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{insightCaption}</p>
        </div>
        <div className="text-xs text-muted-foreground">Top categories by spend</div>
      </div>
      <div className="section-body">
        {isLoading ? (
          <div className="skeleton h-[240px] w-full sm:h-[280px]" />
        ) : data.length === 0 ? (
          <div className="flex h-[240px] items-center justify-center rounded-xl border border-border bg-muted/40 text-sm text-muted-foreground sm:h-[280px]">
            Add a monthly budget to compare your plan with your spending.
          </div>
        ) : (
          <div className="h-[240px] sm:h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.4} />
                <XAxis dataKey="category" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => formatCompactKD(Number(v))}
                />
                <RechartsTooltip
                  formatter={(value: number, name: string) => [`KD ${value.toFixed(3)}`, name]}
                  contentStyle={chartTooltipStyle}
                />
                <Legend verticalAlign="bottom" height={36} />
                <Bar
                  dataKey="budget"
                  name="Budget"
                  fill={CHART_FILLS.budget}
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="spent"
                  name="Spent"
                  radius={[6, 6, 0, 0]}
                >
                  {data.map((row) => (
                    <Cell
                      key={`spent-${row.category}`}
                      fill={getBudgetUtilizationFill(row.pct)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  )
}

export function BudgetTable({
  rows,
  hasBudgets,
  searchQuery,
  setSearchQuery,
  range,
  setRange,
  onAdd,
  onEdit,
  onDelete,
  onCopy,
  copyLoading = false,
  onExport,
  isEditable = true,
}: {
  rows: BudgetRow[]
  hasBudgets: boolean
  searchQuery: string
  setSearchQuery: (v: string) => void
  range: BudgetRange
  setRange: (v: BudgetRange) => void
  onAdd: () => void
  onEdit: (idx: number) => void
  onDelete: (idx: number) => void
  onCopy?: () => void
  copyLoading?: boolean
  onExport?: () => void
  isEditable?: boolean
}) {
  return (
    <section className="section-panel panel-featured float-in stagger-3">
      <div className="section-header section-header-divider">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Target className="h-4 w-4 text-primary" />
          Budget Categories
        </div>
        <div className="flex items-center gap-2">
          {!isEditable ? (
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              Read only — past month
            </span>
          ) : (
            <>
              {onCopy ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onCopy}
                  loading={copyLoading}
                  disabled={copyLoading}
                  className="gap-1.5"
                  title="Copy last month's budgets into this month"
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                  {copyLoading ? "Checking..." : "Copy last month"}
                </Button>
              ) : null}
              {onExport ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onExport}
                  className="gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export
                </Button>
              ) : null}
              <Button
                type="button"
                variant="default"
                onClick={onAdd}
                className="h-8 gap-1 px-3 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </>
          )}
        </div>
      </div>
      <FilterBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search budget…"
        mobileCollapsible
        filters={[
          {
            value: range,
            onChange: (next) => {
              const value = next as BudgetRange
              setRange(BUDGET_RANGES.includes(value) ? value : "month")
            },
            options: [
              { value: "month", label: "This month" },
              { value: "30", label: "Last 30 days" },
              { value: "90", label: "Last 90 days" },
              { value: "365", label: "Last 12 months" },
              { value: "all", label: "All time" },
            ],
          },
        ]}
      />
      <p className="px-4 pb-1 text-xs text-muted-foreground">
        {BUDGET_RANGE_HELPER_COPY[range]}
      </p>
      <div className="space-y-3 p-4 md:hidden">
        {!hasBudgets ? (
          <EmptyState
            icon={<Target className="h-8 w-8" />}
            title="Set your first budget"
            description="Add monthly category limits so you can compare your plan with what you actually spend."
            action={(
              <Button type="button" variant="default" size="sm" onClick={onAdd}>
                Add your first budget
              </Button>
            )}
            compact
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Target className="h-8 w-8" />}
            title="No budget categories match this view"
            description="Try a broader search or a different date range to compare more of your plan."
            compact
          />
        ) : (
          rows.map((r) => {
            const isOver = r.remaining < 0
            const progressWidth = Math.max(0, Math.min(100, r.pct))
            const tone = getBudgetUtilizationTone(r.pct)

            return (
              <article key={`${r.cat}-${r.idx}`} className="inner-card space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold" title={r.cat}>
                      {r.cat}
                    </h3>
                    <p className={cn("mt-1 text-xs", tone.textClassName)}>
                      {Math.round(r.pct)}% used · {tone.label}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-semibold tabular-nums">KD {fmt3(r.spent)}</div>
                    <div className="text-xs text-muted-foreground">
                      of KD {fmt3(r.allocated)}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="h-2.5 w-full rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-2.5 rounded-full transition-all",
                        tone.barClassName
                      )}
                      style={{ width: `${progressWidth}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="tabular-nums">12-mo avg: KD {fmt3(r.avg)}</span>
                    <span className={cn("tabular-nums", isOver && "font-semibold text-destructive")}>
                      {isOver ? "-" : ""}KD {fmt3(Math.abs(r.remaining))} remaining
                    </span>
                  </div>
                </div>

                {isEditable ? (
                  <div className="flex items-center justify-end gap-2 border-t border-border/50 pt-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(r.idx)}
                      className="h-8 rounded-full px-3 text-xs text-muted-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onDelete(r.idx)}
                      className="h-8 rounded-full border-destructive/35 px-3 text-xs text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                ) : null}
              </article>
            )
          })
        )}
      </div>
      <div className="hidden max-h-[460px] overflow-auto rounded-b-2xl md:block">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="th-standard">Category</th>
              <th className="th-standard-r">Allocated</th>
              <th className="th-standard-r">Spent</th>
              <th className="th-standard-r">12-mo Avg</th>
              <th className="th-standard-r">Remaining</th>
              <th className="th-standard-r">Progress</th>
              <th className="th-standard-r">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!hasBudgets ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    icon={<Target className="h-5 w-5" />}
                    title="Set your first budget"
                    description="Add monthly category limits so you can compare your plan with what you actually spend."
                    action={(
                      <Button type="button" variant="default" size="sm" onClick={onAdd}>
                        Add your first budget
                      </Button>
                    )}
                  />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    icon={<Target className="h-5 w-5" />}
                    title="No budget categories match this view"
                    description="Try a broader search or a different date range to compare more of your plan."
                  />
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const isOver = r.remaining < 0
                const tone = getBudgetUtilizationTone(r.pct)
                return (
                  <tr key={`${r.cat}-${r.idx}`} className="border-b border-border/60 table-row-hover">
                    <td className="px-4 py-3">{r.cat}</td>
                    <td className="px-4 py-3 text-right tabular-nums">KD {fmt3(r.allocated)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">KD {fmt3(r.spent)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">KD {fmt3(r.avg)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn("tabular-nums", isOver && "text-destructive font-semibold")}>
                        {isOver ? "-" : ""}KD {fmt3(Math.abs(r.remaining))}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-2 w-20 rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-2 rounded-full",
                              tone.barClassName
                            )}
                            style={{ width: `${Math.min(100, r.pct)}%` }}
                          />
                        </div>
                        <span className={cn("text-xs font-semibold", tone.textClassName)}>
                          {Math.round(r.pct)}% · {tone.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isEditable && (
                        <div className="inline-flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => onEdit(r.idx)}
                                className="h-8 w-8 rounded-full text-muted-foreground"
                                aria-label={`Edit budget ${r.cat}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit budget</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => onDelete(r.idx)}
                                className="h-8 w-8 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                                aria-label={`Delete budget ${r.cat}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete budget</TooltipContent>
                          </Tooltip>
                        </div>
                      )}
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

function getBudgetMonthOptions(): { value: string; label: string }[] {
  const currStr = toYearMonth(today())
  const [cy, cm] = currStr.split("-").map(Number)
  const nm = cm === 12 ? 1 : cm + 1
  const ny = cm === 12 ? cy + 1 : cy
  const nextStr = `${ny}-${String(nm).padStart(2, "0")}`
  return [
    { value: currStr, label: `This month — ${currStr}` },
    { value: nextStr, label: `Next month — ${nextStr}` },
  ]
}

export function BudgetDialog({
  open,
  onOpenChange,
  initialMonth,
  mode,
  initialValues,
  onSave,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initialMonth: string
  mode: "create" | "edit"
  initialValues?: { category: string; amount_kd: string }
  onSave: (data: { month: string; category: string; amount_kd: string }) => Promise<void>
}) {
  const monthOptions = getBudgetMonthOptions()
  // Clamp initialMonth to one of the two allowed values
  const defaultMonth = monthOptions.some((o) => o.value === initialMonth)
    ? initialMonth
    : monthOptions[0].value
  const [month, setMonth] = useState(defaultMonth)
  const [category, setCategory] = useState(initialValues?.category || "")
  const [amount, setAmount] = useState(initialValues?.amount_kd || "")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [touched, setTouched] = useState({ amount: false })

  useEffect(() => {
    if (open) {
      const opts = getBudgetMonthOptions()
      const clamped = opts.some((o) => o.value === initialMonth) ? initialMonth : opts[0].value
      setMonth(clamped)
      setCategory(initialValues?.category || "")
      setAmount(initialValues?.amount_kd || "")
      setError(null)
      setSaving(false)
      setTouched({ amount: false })
    }
  }, [open, initialMonth, initialValues])

  const handleSubmit = async () => {
    setError(null)
    if (!month || !category.trim()) {
      setError("Please fill all fields with valid values.")
      return
    }
    const amountCheck = validateNonNegativeAmount(amount, "Budget amount", {
      required: true,
      max: 999_999.999,
    })
    if (amountCheck?.tone === "error") {
      setError(amountCheck.message)
      return
    }
    const amountVal = parseFloat(amount)

    setSaving(true)
    try {
      await onSave({ month, category: category.trim(), amount_kd: amountVal.toFixed(3) })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't save that budget right now.")
    } finally {
      setSaving(false)
    }
  }

  const amountValidation =
    touched.amount || Boolean(error)
      ? validateNonNegativeAmount(amount, "Budget amount", {
        required: true,
        max: 999_999.999,
      })
      : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-lg space-y-5 sm:w-full" onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault()
          handleSubmit()
        }
      }}>
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit Budget" : "Add Budget"}</DialogTitle>
          <DialogDescription>
            Set a budget amount for a category and month.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 pt-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="budget-month">Month</Label>
              <Select value={month} onValueChange={setMonth} disabled={mode === "edit"}>
                <SelectTrigger id="budget-month">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mode === "edit" && (
                <p className="text-xs text-muted-foreground">Month cannot be changed when editing.</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="budget-category">Category</Label>
              <Input
                id="budget-category"
                list="budget-cats"
                placeholder="e.g., Groceries"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="budget-amount">Amount (KD)</Label>
            <Input
              id="budget-amount"
              type="number"
              step="0.001"
              min="0"
              placeholder="0.000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, amount: true }))}
              aria-invalid={amountValidation?.tone === "error"}
              className={validationInputClass(amountValidation?.tone)}
            />
            <FieldFeedback tone={amountValidation?.tone ?? undefined} message={amountValidation?.message} />
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
            onClick={handleSubmit}
            loading={saving}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Budget"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
