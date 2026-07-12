import { useEffect, useMemo, useRef, useState } from "react"
import {
  Wallet,
  LineChart as LineChartIcon,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Landmark,
  TrendingDown,
  ArrowRightLeft,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Sparkles,
  X,
  CreditCard,
  ShieldAlert,
  BarChart3,
  PiggyBank,
  Target,
} from "lucide-react"
import {
  LineChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  Legend,
  BarChart,
  Bar,
} from "@/lib/recharts"

import { chartTooltipStyle, cn, fmt3, formatCompactKD, formatKD, getBudgetUtilizationTone } from "@/lib/utils"
import { CHART_STROKES, getChartColors } from "@/lib/chart-tokens"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type {
  AccountOverviewConnectedAccount,
  BudgetAlertNotification,
  DebtAccountSummary,
  SafeToSpendResponse,
  SnapshotResponse,
} from "@/types/api"

function useAnimatedNumber(target: number, duration = 600): number {
  const [display, setDisplay] = useState(target)
  const rafRef = useRef<number>(0)
  const displayRef = useRef(target)

  useEffect(() => {
    const start = displayRef.current
    if (Math.abs(target - start) < 0.0005) {
      displayRef.current = target
      setDisplay(target)
      return
    }
    const startTime = performance.now()

    const tick = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const nextValue = start + (target - start) * eased
      displayRef.current = nextValue
      setDisplay(nextValue)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        displayRef.current = target
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return display
}

function AnimatedKD({ value }: { value: number }) {
  const animated = useAnimatedNumber(value)
  return <>{formatKD(animated)}</>
}

function AnimatedKDNumber({ value }: { value: number }) {
  const animated = useAnimatedNumber(value)
  return <>{fmt3(animated)}</>
}

function AnimatedPercent({ value }: { value: number }) {
  const animated = useAnimatedNumber(value)
  return <>{animated.toFixed(1)}%</>
}

function HeroDelta({
  value,
  inverted = false,
  unit = "percent",
}: {
  value: number
  inverted?: boolean
  unit?: "percent" | "points"
}) {
  const positive = inverted ? value <= 0 : value >= 0
  const DeltaIcon = value >= 0 ? TrendingUp : TrendingDown
  const deltaText = `${Math.abs(value).toFixed(1)}${unit === "points" ? " pts" : "%"} vs last month`
  return (
    <div
      className={`mt-2 inline-flex flex-wrap items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
        positive
          ? "border-success/25 bg-success/10 text-success"
          : "border-warning/25 bg-warning/10 text-warning"
      }`}
    >
      <DeltaIcon className="h-4 w-4" />
      <span>{deltaText}</span>
    </div>
  )
}

function dashboardMomentumState(monthRemaining: number, savingsRate: number) {
  if (monthRemaining <= 0 || savingsRate <= 0) return null

  if (savingsRate >= 15) {
    return {
      label: "You're doing well this month",
      detail: `You've kept ${formatCompactKD(monthRemaining)} in reserve so far. Keep this pace and you'll finish with room to spare.`,
    }
  }

  return {
    label: "You're under budget this month",
    detail: `You still have ${formatCompactKD(monthRemaining)} protected. A steady pace keeps the month comfortably on track.`,
  }
}

const SAFE_TO_SPEND_WARNING_COPY: Record<string, string> = {
  income_not_set: "Add income transactions (categorized as Income) to calculate this number.",
  budgets_not_set: "Add this month's budgets in Plan for a more detailed breakdown.",
  debts_not_set_optional: "No debt payments are included right now. Add them in Plan if you have any.",
  savings_goals_unscheduled_optional: "Some savings goals are missing a target date or recent deposit history, so they are not included yet.",
  commitments_over_40pct_cap: "Your savings goals and debt payments exceed 40% of your income. Consider adjusting your targets.",
}

function safeToSpendCommitmentNote({
  debtMinimum,
  savingsGoalReserve,
}: {
  debtMinimum: number
  savingsGoalReserve: number
}) {
  if (debtMinimum > 0 && savingsGoalReserve > 0) {
    return "This number already sets aside room for both debt payments and savings goals."
  }
  if (debtMinimum > 0) {
    return "This number already accounts for your debt payments."
  }
  if (savingsGoalReserve > 0) {
    return "This number already sets aside money for your savings goals."
  }
  return "Based on your detected income and spending so far this month."
}

function safeToSpendTone(dailyRate: number) {
  if (dailyRate <= 0) {
    return {
      label: "Tight runway",
      cardClassName: "border-destructive/25 bg-destructive/6",
      badgeClassName: "border-destructive/20 bg-destructive/10 text-destructive",
      valueClassName: "text-destructive",
      message: "You're out of discretionary runway. Revisit your plan before adding new spending.",
    }
  }

  if (dailyRate < 10) {
    return {
      label: "Watch pace",
      cardClassName: "border-warning/20 bg-warning/6",
      badgeClassName: "border-warning/20 bg-warning/10 text-warning",
      valueClassName: "text-primary",
      message: "You're still inside plan, but this month needs a careful daily pace.",
    }
  }

  if (dailyRate < 20) {
    return {
      label: "Steady runway",
      cardClassName: "border-accent/25 bg-accent/8",
      badgeClassName: "border-accent/25 bg-accent/12 text-primary",
      valueClassName: "text-primary",
      message: "You're on pace. Small daily choices will keep the month comfortably on track.",
    }
  }

  return {
    label: "Ahead of pace",
    cardClassName: "border-success/25 bg-success/6",
    badgeClassName: "border-success/20 bg-success/10 text-success",
    valueClassName: "text-primary",
    message: "You've got healthy room for flexible spending after honoring your plan.",
  }
}

export function SafeToSpendHero({
  isLoading,
  safeToSpend,
  onOpenPlan,
  onOpenIncome,
  onOpenProfile,
}: {
  isLoading: boolean
  safeToSpend: SafeToSpendResponse | undefined
  onOpenPlan: () => void
  onOpenIncome?: () => void
  onOpenProfile?: () => void
}) {
  const warnings = safeToSpend?.warnings || []
  const dailyRate = Number(safeToSpend?.daily_rate_kd || 0)
  const debtMinimum = Number(safeToSpend?.debt_minimum_total_kd || 0)
  const savingsGoalCount = safeToSpend?.savings_goal_count || 0
  const savingsGoalReserve = Number(safeToSpend?.savings_goal_reserve_kd || 0)
  const savingsGoalBudgetCovered = Number(safeToSpend?.savings_goal_budget_covered_kd || 0)
  const monthlyIncome = Number(safeToSpend?.monthly_income_kd || 0)
  const [incomeNudgeDismissed, setIncomeNudgeDismissed] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem("income_nudge_dismissed") === "1"
  )
  const dailyRateTone = safeToSpendTone(dailyRate)
  const primaryAction = { label: "Open Plan", onClick: onOpenPlan }
  const incomeNeedsSetup = Boolean(
    safeToSpend && !safeToSpend.data_complete && (warnings.includes("income_not_set") || monthlyIncome <= 0)
  )
  const incomeSetupAction = {
    label: "Add income",
    onClick: onOpenIncome ?? onOpenPlan,
  }
  const showIncomeNudge = Boolean(
    safeToSpend && safeToSpend.income_source === 'not_set' && !incomeNudgeDismissed
  )
  const hasInfoNotes = Boolean(
    (monthlyIncome > 0 &&
      (safeToSpend?.income_source === 'detected_from_transactions' ||
        safeToSpend?.income_source === 'declared_in_profile')) ||
      savingsGoalBudgetCovered > 0 ||
      warnings.includes("debts_not_set_optional") ||
      warnings.includes("savings_goals_unscheduled_optional")
  )

  return (
    <section className="section-panel panel-featured float-in stagger-1" aria-label="Safe to spend card">
      <div className="section-header">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Wallet className="h-4 w-4 text-primary" />
          Safe to Spend Today
        </div>
        <div className="text-xs text-muted-foreground">Actionable runway for the rest of this month</div>
      </div>
      <div className="section-body">
        {showIncomeNudge ? (
          <div className="mb-3 inner-card flex items-start gap-3 border-warning/20 bg-warning/6">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="min-w-0 flex-1 text-sm">
              <span className="text-foreground">
                Set your monthly income to see your full spending picture.
              </span>{" "}
              <button
                type="button"
                onClick={onOpenProfile ?? onOpenPlan}
                className="font-medium text-primary underline underline-offset-2"
              >
                Go to Profile
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.localStorage.setItem("income_nudge_dismissed", "1")
                }
                setIncomeNudgeDismissed(true)
              }}
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Dismiss income reminder"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        {isLoading ? (
          <div className="skeleton h-28 w-full" role="status" aria-label="Loading safe-to-spend" />
        ) : !safeToSpend ? (
          <div className="inner-card space-y-3">
            <p className="text-sm text-muted-foreground">
              We can&apos;t calculate your safe-to-spend amount right now.
            </p>
            <Button type="button" variant="outline" onClick={onOpenPlan}>
              Open Plan
            </Button>
          </div>
        ) : safeToSpend.data_complete ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={onOpenPlan}
              className={cn(
                "inner-card featured-card w-full text-center transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                dailyRateTone.cardClassName
              )}
              aria-label="Open plan from safe to spend daily rate"
            >
              <span className={cn("inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide", dailyRateTone.badgeClassName)}>
                {dailyRateTone.label}
              </span>
              <div className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Daily safe-to-spend
              </div>
              <div
                className={cn("mt-3 leading-none tracking-tight tabular-nums", dailyRateTone.valueClassName)}
              >
                <span className="sr-only">{formatKD(safeToSpend.daily_rate_kd)} / day</span>
                <span aria-hidden className="inline-flex items-baseline gap-2">
                  <span className="text-[clamp(1rem,1.8vw,1.35rem)] font-semibold opacity-60">KD</span>
                  <span className="text-[clamp(3rem,6vw,4.5rem)] font-semibold">
                    <AnimatedKDNumber value={Number(safeToSpend.daily_rate_kd)} />
                  </span>
                  <span className="text-[clamp(0.85rem,1.4vw,1.05rem)] font-medium text-muted-foreground">/ day</span>
                </span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {dailyRateTone.message}
              </p>
              <div className="mt-4 flex items-center justify-center gap-5 text-xs text-muted-foreground">
                <span>
                  {safeToSpend.days_remaining} day{safeToSpend.days_remaining === 1 ? "" : "s"} remaining
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-primary">
                  Review plan
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </button>
            <div className="flex flex-wrap gap-3">
              <div className="inner-card flex-1 min-w-[120px]">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Monthly runway</p>
                <p className="mt-1 text-xl font-semibold leading-tight tabular-nums">{formatKD(safeToSpend.remaining_budget_kd)}</p>
              </div>
              {debtMinimum > 0 ? (
                <div className="inner-card flex-1 min-w-[120px]">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Debt minimums</p>
                  <p className="mt-1 text-xl font-semibold leading-tight tabular-nums">{formatKD(safeToSpend.debt_minimum_total_kd)}</p>
                </div>
              ) : null}
              {savingsGoalCount > 0 ? (
                <div className="inner-card flex-1 min-w-[120px]">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Goal reserve</p>
                  <div className="mt-1 flex items-center gap-2">
                    <PiggyBank className="h-4 w-4 text-primary" />
                    <p className="text-xl font-semibold leading-tight tabular-nums">{formatKD(safeToSpend.savings_goal_reserve_kd)}</p>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="space-y-2 px-1">
              {/* One-line explanation — always visible */}
              <p className="text-xs text-muted-foreground">
                {safeToSpendCommitmentNote({ debtMinimum, savingsGoalReserve })}
              </p>
              {/* Actionable warning — kept as one visible line */}
              {warnings.includes("commitments_over_40pct_cap") && (
                <p className="flex items-start gap-2 text-xs font-medium text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{SAFE_TO_SPEND_WARNING_COPY.commitments_over_40pct_cap}</span>
                </p>
              )}
              {/* Informational notes — collapsed into a keyboard-reachable disclosure */}
              {hasInfoNotes && (
                <details className="group">
                  <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                    Details
                    <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="mt-2 space-y-1">
                    {safeToSpend.monthly_income_kd && safeToSpend.income_source === 'detected_from_transactions' && (
                      <p className="text-xs text-muted-foreground">
                        Income of {formatKD(safeToSpend.monthly_income_kd)} is automatically detected from your income transactions.
                      </p>
                    )}
                    {safeToSpend.monthly_income_kd && safeToSpend.income_source === 'declared_in_profile' && (
                      <p className="text-xs text-muted-foreground">
                        Income of {formatKD(safeToSpend.monthly_income_kd)} is from your profile setting. Add income transactions to use auto-detection.
                      </p>
                    )}
                    {savingsGoalBudgetCovered > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {formatKD(safeToSpend.savings_goal_budget_covered_kd)} of goal funding is already covered by this month&apos;s budgets.
                      </p>
                    )}
                    {warnings.includes("debts_not_set_optional") && (
                      <p className="text-xs text-muted-foreground">{SAFE_TO_SPEND_WARNING_COPY.debts_not_set_optional}</p>
                    )}
                    {warnings.includes("savings_goals_unscheduled_optional") && (
                      <p className="text-xs text-muted-foreground">{SAFE_TO_SPEND_WARNING_COPY.savings_goals_unscheduled_optional}</p>
                    )}
                  </div>
                </details>
              )}
            </div>
          </div>
        ) : incomeNeedsSetup ? (
          <div className="inner-card space-y-3">
            <p className="text-sm font-semibold">Set your income</p>
            <p className="text-sm text-muted-foreground">
              Categorize a paycheck or other inflow as Income so Safe to Spend can use real cash-in for this month.
            </p>
            <Button type="button" variant="outline" onClick={incomeSetupAction.onClick}>
              {incomeSetupAction.label}
            </Button>
          </div>
        ) : (
          <div className="inner-card space-y-3">
            <p className="text-sm font-semibold">No income detected yet.</p>
            <p className="text-sm text-muted-foreground">
              Categorize your income transactions so the app can calculate how much you have to spend each day.
            </p>
            <Button type="button" variant="outline" onClick={primaryAction.onClick}>
              {primaryAction.label}
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}

export function PlanSummaryPanel({
  isLoading,
  summary,
  onOpenDebt,
  onOpenGoals,
}: {
  isLoading: boolean
  summary: DebtAccountSummary | undefined
  onOpenDebt: () => void
  onOpenGoals: () => void
}) {
  const hasDebt = Boolean(summary && summary.account_count > 0)
  return (
    <section className="section-panel float-in stagger-1" aria-label="Plan summary">
      <div className="section-header">
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Target className="h-4 w-4 text-primary" />
            Plan
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Debt tracking and savings goals live in Plan → Goals &amp; Debt.
          </div>
        </div>
      </div>
      <div className="section-body space-y-4">
        {/* Debt Summary group */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CreditCard className="h-4 w-4 text-primary" />
            Debt Summary
          </div>
          {isLoading ? (
            <div className="skeleton h-20 w-full" role="status" aria-label="Loading debt summary" />
          ) : !hasDebt ? (
            <div className="inner-card space-y-3">
              <p className="text-sm text-muted-foreground">
                You haven&apos;t added any debts yet. Add credit cards or loans to include minimum payments in your plan.
              </p>
              <Button type="button" variant="outline" onClick={onOpenDebt}>
                Track your debts
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="inner-card">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Total Balance
                </p>
                <p className="mt-1 text-2xl font-semibold leading-tight tabular-nums">{formatKD(summary!.total_balance_kd)}</p>
              </div>
              <div className="inner-card">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Minimums / Month
                </p>
                <p className="mt-1 text-2xl font-semibold leading-tight tabular-nums">{formatKD(summary!.total_minimum_kd)}</p>
              </div>
              <div className="inner-card">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Active Debts
                </p>
                <p className="mt-1 text-2xl font-semibold leading-tight tabular-nums">{summary!.account_count}</p>
              </div>
            </div>
          )}
        </div>

        {/* Plan shortcuts */}
        <div className="grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={onOpenDebt}
            className="inner-card flex w-full flex-col items-start gap-3 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CreditCard className="h-4 w-4 text-primary" />
              Debt Tracker
            </div>
            <p className="text-sm text-muted-foreground">
              Add credit cards and loans so minimum payments feed your monthly plan automatically.
            </p>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
              Open debt tracker
              <ArrowRight className="h-4 w-4" />
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenGoals}
            className="inner-card flex w-full flex-col items-start gap-3 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <PiggyBank className="h-4 w-4 text-primary" />
              Savings Goals
            </div>
            <p className="text-sm text-muted-foreground">
              Create targets for your emergency fund and future goals so the dashboard protects that money.
            </p>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
              Open savings goals
              <ArrowRight className="h-4 w-4" />
            </span>
          </button>
        </div>
      </div>
    </section>
  )
}

export function SetupProgressPanel({
  isLoading,
  steps,
  onDismiss,
  demoAction,
  primaryAction,
}: {
  isLoading: boolean
  steps: Array<{
    key: string
    title: string
    description: string
    done: boolean
    actionLabel: string
    onAction: () => void
  }>
  onDismiss: () => void
  demoAction?: {
    label: string
    description: string
    loading?: boolean
    onAction: () => void
  } | null
  primaryAction?: {
    label: string
    description: string
    onAction: () => void
  } | null
}) {
  const completedCount = steps.filter((step) => step.done).length
  const totalCount = steps.length
  const nextStepKey = steps.find((step) => !step.done)?.key ?? null

  return (
    <section className="section-panel panel-featured float-in stagger-1" aria-label="Setup progress">
      <div className="section-header items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="text-lg font-semibold">Finish setup</div>
              <div className="text-xs text-muted-foreground">
                {completedCount} of {totalCount} completed
              </div>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onDismiss}
          className="h-8 w-8 rounded-full"
          aria-label="Dismiss setup progress"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="section-body">
        {primaryAction ? (
          <div className="mb-4 inner-card featured-card flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold">Want a guided path instead?</p>
              <p className="mt-1 text-xs text-muted-foreground">{primaryAction.description}</p>
            </div>
            <Button
              type="button"
              className="shrink-0"
              onClick={primaryAction.onAction}
            >
              {primaryAction.label}
            </Button>
          </div>
        ) : null}
        {demoAction ? (
          <div className="mb-4 inner-card featured-card flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold">Want to explore before importing your own data?</p>
              <p className="mt-1 text-xs text-muted-foreground">{demoAction.description}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 border-primary/20 bg-background/70"
              loading={Boolean(demoAction.loading)}
              disabled={Boolean(demoAction.loading)}
              onClick={demoAction.onAction}
            >
              {demoAction.loading ? "Loading demo..." : demoAction.label}
            </Button>
          </div>
        ) : null}
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="skeleton h-24 rounded-[var(--radius-inner)]" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {steps.map((step) => (
              <div
                key={step.key}
                className={`inner-card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ${
                  step.done ? "border-success/30 bg-success/5" : "border-border/60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      step.done ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step.done ? (
                      <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <CircleDashed className="h-5 w-5" aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{step.title}</p>
                      {step.done ? (
                        <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
                          Done
                        </span>
                      ) : step.key === nextStepKey ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          Next
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
                  </div>
                </div>
                <div className="sm:ml-4 sm:min-w-[196px]">
                  {step.done ? (
                    <div className="rounded-[var(--radius-inner)] border border-success/20 bg-background/70 px-3 py-2 text-xs font-medium text-success">
                      Completed
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-between border-border/70 bg-background/70"
                      onClick={step.onAction}
                    >
                      {step.actionLabel}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function setupGuideHelper(stepKey: string): string {
  switch (stepKey) {
    case "income":
      return "Set your monthly income and payday first so the rest of the product has a planning baseline."
    case "transactions":
      return "You can import a CSV or add transactions manually. Either path gives the dashboard real activity to work with."
    case "budget":
      return "Start with one category now. You can flesh out the rest of the month from Plan whenever you're ready."
    default:
      return "Complete this step to make the dashboard more useful."
  }
}

export function SetupGuideDialog({
  open,
  onOpenChange,
  steps,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  steps: Array<{
    key: string
    title: string
    description: string
    done: boolean
    actionLabel: string
    onAction: () => void
  }>
}) {
  const completedCount = steps.filter((step) => step.done).length
  const totalCount = steps.length
  const currentStep = steps.find((step) => !step.done) ?? null
  const currentStepIndex = currentStep ? steps.findIndex((step) => step.key === currentStep.key) : -1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl space-y-5 sm:w-full">
        <DialogHeader>
          <DialogTitle>Guided setup</DialogTitle>
          <DialogDescription>
            Complete the three setup steps that make the dashboard meaningful: set your income, add or import transactions, and create a starter budget.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {steps.map((step, index) => {
            const isCurrent = currentStep?.key === step.key
            return (
              <div
                key={step.key}
                className={cn(
                  "rounded-[var(--radius-inner)] border px-4 py-3",
                  step.done && "border-success/30 bg-success/5",
                  !step.done && isCurrent && "border-primary/30 bg-primary/5",
                  !step.done && !isCurrent && "border-border/60 bg-background/70"
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                      step.done
                        ? "bg-success/10 text-success"
                        : isCurrent
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                    )}
                  >
                    {step.done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{step.title}</p>
                      {step.done ? (
                        <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
                          Done
                        </span>
                      ) : isCurrent ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          Step {index + 1} of {totalCount}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="rounded-[var(--radius-inner)] border border-border/60 bg-muted/30 px-4 py-3">
          {currentStep ? (
            <>
              <p className="text-sm font-semibold">Next up: {currentStep.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{setupGuideHelper(currentStep.key)}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-success">Setup complete</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your dashboard now has the minimum context it needs. From here, keep adding transactions and refining your plan.
              </p>
            </>
          )}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 pt-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            {currentStep ? "Maybe later" : "Close"}
          </Button>
          {currentStep ? (
            <Button
              type="button"
              onClick={() => {
                onOpenChange(false)
                currentStep.onAction()
              }}
              className="w-full sm:w-auto"
            >
              {currentStep.actionLabel}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto"
            >
              Open dashboard
            </Button>
          )}
        </DialogFooter>

        <div className="text-xs text-muted-foreground">
          {completedCount} of {totalCount} setup steps completed.
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function DashboardHero({
  isLoading,
  monthLabel,
  monthIncome,
  monthExpenses,
  monthRemaining,
  savingsRate,
  dailyPace,
  deltas,
  analyticsUpdatedAt,
}: {
  isLoading: boolean
  monthLabel: string
  monthIncome: number
  monthExpenses: number
  monthRemaining: number
  savingsRate: number
  dailyPace: { avgDaily: number; projected: number; daysElapsed: number; daysInMonth: number } | null
  deltas: { incomeDelta: number; expensesDelta: number; remainingDelta: number; savingsRateDelta: number } | null
  analyticsUpdatedAt?: string | null
}) {
  const freshness = useMemo(() => {
    if (!analyticsUpdatedAt) return null
    const updatedAt = new Date(analyticsUpdatedAt)
    if (Number.isNaN(updatedAt.getTime())) return null

    const diffMinutes = Math.max(0, Math.floor((Date.now() - updatedAt.getTime()) / 60_000))
    const stale = diffMinutes > 30

    if (diffMinutes < 1) {
      return { label: "Updated just now", stale }
    }
    if (diffMinutes < 60) {
      return {
        label: `Updated ${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`,
        stale,
      }
    }

    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) {
      return {
        label: `Updated ${diffHours} hour${diffHours === 1 ? "" : "s"} ago`,
        stale,
      }
    }

    const diffDays = Math.floor(diffHours / 24)
    return {
      label: `Updated ${diffDays} day${diffDays === 1 ? "" : "s"} ago`,
      stale,
    }
  }, [analyticsUpdatedAt])
  const momentum = dashboardMomentumState(monthRemaining, savingsRate)

  return (
    <section className="float-in stagger-1 space-y-4" aria-label="Monthly overview">
      {isLoading ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="skeleton h-6 w-80 max-w-full rounded" />
            <div className="skeleton h-4 w-40 rounded" />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="skeleton h-16 rounded" />
            <div className="skeleton h-16 rounded" />
            <div className="skeleton h-16 rounded" />
            <div className="skeleton h-16 rounded" />
          </div>
        </div>
      ) : (
        <>
          {/* Narration voice + status chip; freshness pinned top-right */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg leading-snug text-foreground">
                {momentum
                  ? momentum.detail
                  : "Income, expenses, and remaining balance for the selected month."}
              </p>
              {momentum ? <Badge variant="success">{momentum.label}</Badge> : null}
            </div>
            {freshness ? (
              <div className="shrink-0 text-xs sm:text-right">
                {freshness.stale ? (
                  <div className="inline-flex items-start gap-2 rounded-full border border-warning/25 bg-warning/10 px-3 py-1 text-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    <div>
                      <div className="font-semibold">Data may be out of date</div>
                      <div className="text-[11px] text-warning/80">{freshness.label}</div>
                    </div>
                  </div>
                ) : (
                  <span className="text-muted-foreground">{freshness.label}</span>
                )}
              </div>
            ) : null}
          </div>

          {/* KPI row — plain stat blocks, logical border-s hairlines on sm+, 2×2 on mobile */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Income</div>
              <div className="mt-1 font-mono text-xl font-semibold tabular-nums"><AnimatedKD value={monthIncome} /></div>
              {deltas && <HeroDelta value={deltas.incomeDelta} />}
            </div>
            <div className="min-w-0 sm:border-s sm:border-border/60 sm:ps-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Expenses</div>
              <div className="mt-1 font-mono text-xl font-semibold tabular-nums"><AnimatedKD value={monthExpenses} /></div>
              {deltas && <HeroDelta value={deltas.expensesDelta} inverted />}
            </div>
            <div className="min-w-0 sm:border-s sm:border-border/60 sm:ps-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Remaining</div>
              <div className="mt-1 font-mono text-xl font-semibold tabular-nums"><AnimatedKD value={monthRemaining} /></div>
              {deltas && <HeroDelta value={deltas.remainingDelta} />}
            </div>
            <div className="min-w-0 sm:border-s sm:border-border/60 sm:ps-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Savings rate</div>
              <div className="mt-1 font-mono text-xl font-semibold tabular-nums"><AnimatedPercent value={savingsRate} /></div>
              {deltas && <HeroDelta value={deltas.savingsRateDelta} unit="points" />}
            </div>
          </div>

          {dailyPace && monthExpenses > 0 ? (
            <p className="text-xs text-muted-foreground">
              On pace to spend {formatCompactKD(dailyPace.projected)} this month at {formatKD(dailyPace.avgDaily)}/day ({dailyPace.daysElapsed}/{dailyPace.daysInMonth} days)
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}

export function ConnectedAccountsPanel({
  isLoading,
  accounts,
  activeConnectionsCount,
  onOpenBanking,
}: {
  isLoading: boolean
  accounts: AccountOverviewConnectedAccount[]
  activeConnectionsCount: number
  onOpenBanking: () => void
}) {
  return (
    <section className="section-panel float-in stagger-2" aria-label="Connected accounts">
      <div className="section-header">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Landmark className="h-4 w-4 text-primary" />
          Connected Accounts
        </div>
        <div className="text-xs text-muted-foreground">
          {activeConnectionsCount} active connection{activeConnectionsCount === 1 ? "" : "s"}
        </div>
      </div>
      <div className="section-body">
        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="skeleton h-24" />
            <div className="skeleton h-24" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="inner-card space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect your first bank to see balances and spending across all of your accounts in one place.
            </p>
            <Button type="button" variant="outline" onClick={onOpenBanking}>
              Add your first bank
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              {accounts.map((account) => (
                <div key={account.connection_id} className="inner-card">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{account.institution_name}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        account.status === "active"
                          ? "bg-success/15 text-success"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {account.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xl font-semibold tabular-nums">{formatKD(account.spend_mtd)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {account.transactions_mtd} transaction{account.transactions_mtd === 1 ? "" : "s"} this month
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Last synced: {account.last_synced_at ? new Date(account.last_synced_at).toLocaleString() : "Never"}
                  </p>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={onOpenBanking}>
              Manage Bank Connections
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}

export function HomeAttentionCenter({
  isLoading,
  monthLabel,
  overBudgetCount,
  overBudgetAmount,
  risingCategory,
  budgetAlerts,
  alertsLoading,
  dismissingAlertId,
  budgetPressureItems,
  onDismissBudgetAlert,
  onOpenPlan,
  onOpenActivity,
}: {
  isLoading: boolean
  monthLabel: string
  overBudgetCount: number
  overBudgetAmount: number
  risingCategory: { name: string; deltaAmount: number; deltaPct: number } | null
  budgetAlerts: BudgetAlertNotification[]
  alertsLoading: boolean
  dismissingAlertId: string | null
  budgetPressureItems: Array<{ category: string; allocated: number; spent: number; usedPct: number; over: number }>
  onDismissBudgetAlert: (alertKey: string) => void
  onOpenPlan: () => void
  onOpenActivity: () => void
}) {
  const attentionRows =
    budgetAlerts.length > 0
      ? budgetAlerts.slice(0, 3).map((alert) => ({
          category: alert.category,
          allocated: Number(alert.budget_kd || 0),
          spent: Number(alert.spent_kd || 0),
          usedPct: alert.ratio || 0,
          over: Math.max(0, Number(alert.spent_kd || 0) - Number(alert.budget_kd || 0)),
        }))
      : budgetPressureItems.filter((item) => item.usedPct >= 0.75).slice(0, 3)
  const totalPressureCount =
    budgetAlerts.length > 0
      ? budgetAlerts.length
      : budgetPressureItems.filter((item) => item.usedPct >= 0.75).length

  return (
    <section className="section-panel float-in stagger-2" aria-label="Needs attention">
      <div className="section-header">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <ShieldAlert className="h-4 w-4 text-primary" />
          Needs attention
        </div>
        <div className="text-xs text-muted-foreground">{monthLabel || "Selected month"}</div>
      </div>
      <div className="section-body space-y-4">
        {isLoading || alertsLoading ? (
          <div className="skeleton h-28" />
        ) : attentionRows.length > 0 ? (
          <div className="space-y-4">
            {attentionRows.map((item) => {
              const pctDisplay = Math.round(item.usedPct * 100)
              const tone = getBudgetUtilizationTone(pctDisplay)
              const isRising = Boolean(risingCategory && risingCategory.name === item.category)
              const story =
                isRising && risingCategory
                  ? `${item.category} is climbing faster than last month — +${formatKD(risingCategory.deltaAmount)} over the prior month.`
                  : item.over > 0
                    ? `${item.category} is over budget by ${formatKD(item.over)}.`
                    : `${item.category} is at ${pctDisplay}% of its budget — worth watching.`
              return (
                <div key={item.category} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-semibold">{item.category}</span>
                    <span className={cn("text-xs font-semibold", tone.textClassName)}>{pctDisplay}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted/70">
                    <div
                      className={cn("h-full rounded-full transition-[width] duration-300", tone.barClassName)}
                      style={{ width: `${Math.min(100, pctDisplay)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{story}</p>
                </div>
              )
            })}
            {totalPressureCount > attentionRows.length && (
              <p className="text-xs text-muted-foreground">
                {totalPressureCount} categories over budget this month.
              </p>
            )}
          </div>
        ) : risingCategory ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {risingCategory.name} is climbing faster than last month.
            </p>
            <div className="flex flex-wrap items-baseline gap-x-2 text-warning">
              <span className="inline-flex items-baseline gap-1.5">
                <span className="text-sm font-semibold opacity-70">+KD</span>
                <span className="text-2xl font-semibold leading-tight tabular-nums">{fmt3(risingCategory.deltaAmount)}</span>
              </span>
              <span className="text-lg font-semibold tabular-nums">({Math.abs(risingCategory.deltaPct).toFixed(1)}%)</span>
            </div>
            <p className="text-xs text-muted-foreground">Worth a quick review before it grows.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">You&apos;re on track. No categories are over budget right now.</p>
            <p className="text-2xl font-semibold leading-tight text-success">On track</p>
            <p className="text-xs text-muted-foreground">Your current spending pace is staying inside plan.</p>
          </div>
        )}
        <Button type="button" variant="outline" className="w-full" onClick={onOpenPlan}>
          Open Plan
        </Button>
      </div>
    </section>
  )
}

export function IncomeExpensesChart({
  isLoading,
  trendData,
}: {
  isLoading: boolean
  trendData: Array<{ month: string; income: number; expenses: number }>
}) {
  const monthsAhead = trendData.filter((row) => row.income >= row.expenses).length
  const expenseAverage = trendData.length > 0
    ? trendData.reduce((sum, row) => sum + row.expenses, 0) / trendData.length
    : 0
  const peakExpenseMonth = trendData.reduce<{ month: string; expenses: number } | null>(
    (peak, row) => {
      if (!peak || row.expenses > peak.expenses) {
        return { month: row.month, expenses: row.expenses }
      }
      return peak
    },
    null
  )
  const insightCaption = trendData.length > 0
    ? `${monthsAhead} of ${trendData.length} visible months finished with income ahead of expenses.`
    : "Compare how income and expenses move together across recent months."

  return (
    <section className="section-panel float-in stagger-2" aria-label="Income vs Expenses chart">
      <div className="section-header">
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold">
            <LineChartIcon className="h-4 w-4 text-primary" />
            Income vs Expenses
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{insightCaption}</p>
        </div>
        <div className="text-xs text-muted-foreground">Last 12 months</div>
      </div>
      <div className="section-body">
        {isLoading ? (
          <div className="skeleton h-[240px] w-full sm:h-[320px]" />
        ) : trendData.length === 0 ? (
          <div className="flex h-[240px] items-center justify-center rounded-xl border border-border bg-muted/40 text-sm text-muted-foreground sm:h-[320px]">
            Add a few income and expense transactions to start seeing your monthly trend.
          </div>
        ) : (
          <>
            <div className="h-[240px] sm:h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.4} />
                  <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatCompactKD(v)} />
                  <ReferenceLine
                    y={expenseAverage}
                    stroke="var(--color-muted-foreground)"
                    strokeDasharray="4 4"
                    strokeOpacity={0.5}
                    ifOverflow="extendDomain"
                  />
                  <RechartsTooltip
                    formatter={(value: number, name: string) => [
                      `KD ${value.toFixed(3)}`,
                      name === "income" ? "Income" : "Expenses",
                    ]}
                    contentStyle={chartTooltipStyle}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={24}
                    wrapperStyle={{ fontSize: 12, color: CHART_STROKES.legendText }}
                  />
                  <Line
                    type="monotone"
                    dataKey="income"
                    stroke={CHART_STROKES.income}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="expenses"
                    stroke={CHART_STROKES.expense}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {peakExpenseMonth ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Highest expense month in view: <span className="font-semibold text-foreground">{peakExpenseMonth.month}</span>{" "}
                at <span className="tabular-nums text-foreground">{formatCompactKD(peakExpenseMonth.expenses)}</span>. The dashed line shows your average monthly expense pace.
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}

export function CategoryBreakdownChart({
  isLoading,
  categoryData,
  onSliceClick,
}: {
  isLoading: boolean
  categoryData: Array<{ name: string; value: number }>
  onSliceClick: (name: string) => void
}) {
  const chartColors = getChartColors()
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
    ? `${topCategory.name} is the largest category at ${((topCategory.value / totalSpend) * 100).toFixed(0)}% of this month's spending.`
    : "Use this chart to spot which categories are driving the month."

  return (
    <section className="section-panel float-in stagger-3" aria-label="Expenses by category">
      <div className="section-header">
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold">
            <BarChart3 className="h-4 w-4 text-primary" />
            Expenses by Category
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{insightCaption}</p>
        </div>
        <div className="text-xs text-muted-foreground">Selected month</div>
      </div>
      <div className="section-body">
        {isLoading ? (
          <div className="skeleton h-[260px] w-full sm:h-[320px]" role="status" aria-label="Loading chart data" />
        ) : categoryData.length === 0 ? (
          <div className="flex h-[260px] items-center justify-center rounded-xl border border-border bg-muted/40 text-sm text-muted-foreground sm:h-[320px]">
            Add expenses this month to see where your money is going.
          </div>
        ) : (
          <div
            role="img"
            aria-label={`Horizontal bar chart showing spending across ${chartData.length} category groups.`}
            className="outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-lg"
          >
            <div className="h-[280px] sm:h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 8, right: 12, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.35} horizontal vertical={false} />
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
                    width={108}
                  />
                  <Bar
                    dataKey="value"
                    radius={[0, 8, 8, 0]}
                    onClick={(data: { name?: string } | undefined) => {
                      if (data?.name && data.name !== "Other") onSliceClick(data.name)
                    }}
                  >
                    {chartData.map((_, index) => (
                      <Cell key={`bar-cell-${index}`} fill={chartColors[index % chartColors.length]} />
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

export function TopExpensesPanel({
  isLoading,
  topExpenses,
  selectedMonth,
  categoryDeltas,
}: {
  isLoading: boolean
  topExpenses: Array<{ name: string; value: number; sparklineData: Array<{ month: string; value: number }> }>
  selectedMonth: string
  categoryDeltas: Map<string, number>
}) {
  const chartColors = getChartColors()

  return (
    <section className="section-panel float-in stagger-5" aria-label="Top expense categories">
      <div className="section-header">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <BarChart3 className="h-4 w-4 text-primary" />
          Top Spending
        </div>
        <div className="text-xs text-muted-foreground">
          Top four categories for {selectedMonth || "-"}
        </div>
      </div>
      <div className="section-body">
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="skeleton h-24" />
            <div className="skeleton h-24" />
            <div className="skeleton h-24" />
            <div className="skeleton h-24" />
          </div>
        ) : topExpenses.length === 0 ? (
          <div className="flex h-[180px] items-center justify-center rounded-xl border border-border bg-muted/40 text-sm text-muted-foreground">
            Add expenses to see which categories are taking the biggest share.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {topExpenses.map(({ name, value, sparklineData }, idx) => {
              const baseline = categoryDeltas.get(name) ?? 0
              const deltaPct = baseline > 0 ? ((value - baseline) / baseline) * 100 : (value > 0 ? 100 : 0)
              const showDelta = baseline > 0 || value > 0
              const trendUp = value >= baseline
              const DeltaIcon = trendUp ? TrendingUp : TrendingDown
              return (
                <div key={name} className="inner-card space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: chartColors[idx % chartColors.length] }}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold" title={name}>
                          {name}
                        </div>
                      </div>
                    </div>
                    <div className="h-10 w-20 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={sparklineData}>
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke={chartColors[idx % chartColors.length]}
                            strokeWidth={1.5}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-sm font-semibold text-muted-foreground">KD</span>
                      <span className="text-2xl font-semibold leading-tight tabular-nums">{fmt3(value)}</span>
                    </div>
                    {showDelta && (
                      baseline > 0 ? (
                        <div
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            trendUp ? "bg-warning/10 text-warning" : "bg-success/10 text-success"
                          }`}
                        >
                          <DeltaIcon className="h-3 w-3" />
                          <span>{Math.abs(deltaPct).toFixed(0)}%</span>
                        </div>
                      ) : (
                        <Badge variant="neutral">New</Badge>
                      )
                    )}
                  </div>
                  {baseline > 0 && (
                    <p className="text-xs text-muted-foreground">
                      3-mo avg: {formatKD(baseline)}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Financial Snapshot Hero
// ---------------------------------------------------------------------------

type CashFlowWindow = "30d" | "60d" | "90d"

export function FinancialSnapshotHero({
  isLoading,
  snapshot,
  onOpenBanking,
  onOpenSpending,
}: {
  isLoading: boolean
  snapshot: SnapshotResponse | undefined
  onOpenBanking: () => void
  onOpenSpending: () => void
}) {
  const [window, setWindow] = useState<CashFlowWindow>("30d")

  const np = snapshot?.net_position
  const cf = snapshot?.cash_flow?.[window]
  const accounts = snapshot?.accounts || []
  const expiringAccounts = accounts.filter((a) => a.consent?.expiry_warning)

  return (
    <section className="section-panel">
      <div className="section-header">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">Financial Snapshot</h2>
        </div>
      </div>
      <div className="section-body space-y-4">
        {isLoading || !snapshot ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-20 rounded-[var(--radius-inner)]" />
            ))}
          </div>
        ) : (
          <>
            {/* Net position KPIs */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="inner-card flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Net Position</span>
                <span className={`text-lg font-bold tabular-nums ${(np?.net_kd ?? 0) >= 0 ? "text-primary" : "text-destructive"}`}>
                  {formatKD(np?.net_kd ?? 0)}
                </span>
                <span className="text-[11px] text-muted-foreground">All-time tracked</span>
              </div>
              <div className="inner-card flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Total Debt</span>
                <span className="text-lg font-bold tabular-nums text-destructive/90">
                  {formatKD(np?.total_debt_kd ?? 0)}
                </span>
                <span className="text-[11px] text-muted-foreground">Active balances</span>
              </div>
              <div className="inner-card flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Savings Progress</span>
                <span className="text-lg font-bold tabular-nums text-primary">
                  {formatKD(np?.total_savings_kd ?? 0)}
                </span>
                <span className="text-[11px] text-muted-foreground">Across all goals</span>
              </div>
            </div>

            {/* Cash flow windows */}
            <div>
              <div className="mb-2 flex items-center gap-1">
                {(["30d", "60d", "90d"] as CashFlowWindow[]).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setWindow(w)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      window === w
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {w}
                  </button>
                ))}
                <span className="ml-1 text-xs text-muted-foreground">cash flow</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="inner-card flex flex-col gap-1">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <TrendingUp className="h-3 w-3" /> Income
                  </span>
                  <span className="text-base font-semibold tabular-nums text-primary">
                    {formatKD(cf?.income_kd ?? 0)}
                  </span>
                </div>
                <div className="inner-card flex flex-col gap-1">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <TrendingDown className="h-3 w-3" /> Expenses
                  </span>
                  <span className="text-base font-semibold tabular-nums text-destructive/90">
                    {formatKD(cf?.expense_kd ?? 0)}
                  </span>
                </div>
                <div className="inner-card flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Net</span>
                  <span className={`text-base font-semibold tabular-nums ${(cf?.net_kd ?? 0) >= 0 ? "text-primary" : "text-destructive"}`}>
                    {formatKD(cf?.net_kd ?? 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Consent expiry warnings */}
            {expiringAccounts.length > 0 && (
              <Alert variant="warning" className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <div className="space-y-1 text-xs">
                  <AlertTitle className="text-warning">Consent expiring soon</AlertTitle>
                  <AlertDescription className="space-y-1 text-xs">
                    {expiringAccounts.map((a) => (
                      <p key={a.id}>
                        {a.institution_name} — {a.consent?.expires_in_days ?? 0}d remaining
                      </p>
                    ))}
                  </AlertDescription>
                  <button
                    type="button"
                    className="font-medium text-warning underline-offset-2 hover:underline"
                    onClick={onOpenBanking}
                  >
                    Manage connections →
                  </button>
                </div>
              </Alert>
            )}

            {/* Connected accounts */}
            {accounts.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {accounts.length} connected account{accounts.length !== 1 ? "s" : ""}
                </p>
                {accounts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-[var(--radius-inner)] border border-border/50 bg-muted/30 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <Landmark className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{a.institution_name}</p>
                        {a.account_number_masked && (
                          <p className="text-[11px] text-muted-foreground">···{a.account_number_masked}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {a.consent?.expiry_warning && (
                        <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          a.status === "active"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {a.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button type="button" variant="outline" className="w-full text-xs" onClick={onOpenSpending}>
              View full Spending Intelligence →
            </Button>
          </>
        )}
      </div>
    </section>
  )
}
