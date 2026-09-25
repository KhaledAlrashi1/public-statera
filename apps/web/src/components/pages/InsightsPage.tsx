import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Info, Sparkles } from "lucide-react"

import { analyticsApi } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import { formatKD, labelForYM, prevMonth as prevMonthUtil, toYearMonth, today } from "@/lib/utils"
import PageHeader from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  RecurringCommitmentsCard,
  type RecurringCommitmentRow,
} from "@/components/pages/insights/RecurringCommitmentsCard"
import { MonthDeltaCard, type MonthDeltaRow } from "@/components/pages/insights/MonthDeltaCard"

function clampDate(year: number, monthIndex: number, dayOfMonth: number): Date {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const safeDay = Math.max(1, Math.min(daysInMonth, dayOfMonth))
  return new Date(year, monthIndex, safeDay)
}

function queryErrorMessage(error: unknown): string | null {
  if (!error) return null
  if (error instanceof Error) return error.message
  return "We couldn't load that data right now."
}

const RECURRING_DISMISSALS_TTL_MS = 30 * 24 * 60 * 60 * 1000

function normalizeRecurringName(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function recurringDismissalsStorageKey(userId: number | string | null | undefined) {
  return `insights-recurring-dismissals:${userId ?? "anon"}`
}

function readDismissedRecurringNames(userId: number | string | null | undefined): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = window.localStorage.getItem(recurringDismissalsStorageKey(userId))
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as Record<string, number>
    const now = Date.now()
    const nextEntries = Object.entries(parsed || {}).filter(([name, ts]) => {
      if (!name.trim() || !Number.isFinite(ts)) return false
      return now - Number(ts) < RECURRING_DISMISSALS_TTL_MS
    })
    const normalized = new Set(nextEntries.map(([name]) => normalizeRecurringName(name)))
    const shouldRewrite = nextEntries.length !== Object.keys(parsed || {}).length
    if (shouldRewrite) {
      const compact = Object.fromEntries(nextEntries)
      window.localStorage.setItem(recurringDismissalsStorageKey(userId), JSON.stringify(compact))
    }
    return normalized
  } catch {
    return new Set()
  }
}

function persistDismissedRecurringNames(
  userId: number | string | null | undefined,
  dismissedNames: Set<string>
) {
  if (typeof window === "undefined") return
  try {
    const timestamp = Date.now()
    const payload = Object.fromEntries(
      [...dismissedNames].map((name) => [normalizeRecurringName(name), timestamp])
    )
    window.localStorage.setItem(recurringDismissalsStorageKey(userId), JSON.stringify(payload))
  } catch {
    // ignore storage failures
  }
}

export default function InsightsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const currentMonth = toYearMonth(today())
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const monthLabel = labelForYM(selectedMonth)
  const prevMonth = prevMonthUtil(selectedMonth)
  const [dismissedRecurringNames, setDismissedRecurringNames] = useState<Set<string>>(new Set())

  useEffect(() => {
    setDismissedRecurringNames(readDismissedRecurringNames(user?.id))
  }, [user?.id])

  const monthOptionsQuery = useQuery({
    queryKey: ["insights", "month-options", currentMonth],
    queryFn: () => analyticsApi.dashboardMetrics({ months: 24, until: currentMonth }),
  })

  const monthOptions = useMemo(() => {
    const months = monthOptionsQuery.data?.months || []
    return Array.from(new Set([currentMonth, ...months])).sort().reverse()
  }, [currentMonth, monthOptionsQuery.data?.months])

  useEffect(() => {
    if (monthOptions.length === 0) return
    setSelectedMonth((prev) => (monthOptions.includes(prev) ? prev : monthOptions[0]))
  }, [monthOptions])

  const selectedMonthReferenceDate = useMemo(() => {
    if (selectedMonth === currentMonth) return new Date()
    const [year, month] = selectedMonth.split("-").map(Number)
    if (!Number.isFinite(year) || !Number.isFinite(month)) return new Date()
    return new Date(year, month, 0)
  }, [currentMonth, selectedMonth])

  const recurringPatternsQuery = useQuery({
    queryKey: ["insights", "recurring-patterns", 120],
    queryFn: () => analyticsApi.recurringPatterns({ days: 120 }),
  })

  const monthDeltaQuery = useQuery({
    queryKey: ["insights", "month-delta", selectedMonth],
    queryFn: () => analyticsApi.dashboardMetrics({ months: 2, until: selectedMonth }),
  })

  const readinessQuery = useQuery({
    queryKey: ["insights", "readiness", selectedMonth],
    queryFn: () => analyticsApi.dashboardMetrics({ months: 3, until: selectedMonth }),
  })

  const safeToSpendQuery = useQuery({
    queryKey: ["insights", "safe-to-spend", selectedMonth],
    queryFn: () => analyticsApi.safeToSpend(selectedMonth),
  })

  const weeklyDigestQuery = useQuery({
    queryKey: ["insights", "weekly-digest"],
    queryFn: () => analyticsApi.weeklyDigest(),
  })

  const recurringRows = useMemo<RecurringCommitmentRow[]>(() => {
    const patterns = recurringPatternsQuery.data?.patterns || []
    if (patterns.length === 0) return []
    const viewDate = selectedMonthReferenceDate
    const [viewYear, viewMonth] = selectedMonth.split("-").map(Number)
    const monthStart = selectedMonth

    return patterns
      .filter((row) => !dismissedRecurringNames.has(normalizeRecurringName(row.name)))
      .slice(0, 20)
      .map((row) => {
        const avg = Number(row.avg_amount_kd || 0)
        const lastSeen = row.last_seen || ""
        const lastSeenDate = lastSeen ? new Date(lastSeen) : new Date()
        const expectedDay = Number.isFinite(lastSeenDate.getDate()) ? lastSeenDate.getDate() : 1
        const paidThisMonth = typeof lastSeen === "string" && lastSeen.startsWith(monthStart)
        const expectedThisMonth = clampDate(viewYear, Math.max(0, viewMonth - 1), expectedDay)
        const dueDateLabel = paidThisMonth
          ? lastSeenDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
          : expectedThisMonth.toLocaleDateString("en-GB", { day: "numeric", month: "short" })

        let status: RecurringCommitmentRow["status"] = "Upcoming"
        if (paidThisMonth) {
          status = "Paid"
        } else if (viewDate.getDate() > expectedDay + 3) {
          status = "Overdue"
        } else if (viewDate.getDate() >= expectedDay - 5) {
          status = "Due soon"
        }

        return {
          name: row.name,
          avg_amount_kd: avg,
          expected_day: expectedDay,
          next_expected_date: dueDateLabel,
          status,
          group: row.group || "Other",
        }
      })
      .sort((a, b) => {
        const statusRank = (status: RecurringCommitmentRow["status"]) => {
          if (status === "Overdue") return 0
          if (status === "Due soon") return 1
          if (status === "Upcoming") return 2
          return 3
        }
        return statusRank(a.status) - statusRank(b.status) || b.avg_amount_kd - a.avg_amount_kd
      })
  }, [dismissedRecurringNames, recurringPatternsQuery.data?.patterns, selectedMonth, selectedMonthReferenceDate])

  const monthDeltaRows = useMemo<MonthDeltaRow[]>(() => {
    const byMonth = monthDeltaQuery.data?.expense_by_category || {}
    const currentMap = byMonth[selectedMonth] || {}
    const prevMap = byMonth[prevMonth] || {}
    const categories = new Set<string>([
      ...Object.keys(currentMap),
      ...Object.keys(prevMap),
    ])
    const rows: MonthDeltaRow[] = []
    for (const category of categories) {
      const thisMonth = Number(currentMap[category] || 0)
      const lastMonth = Number(prevMap[category] || 0)
      if (thisMonth <= 0 && lastMonth <= 0) continue
      const delta = thisMonth - lastMonth
      const deltaPct = lastMonth > 0 ? (delta / lastMonth) * 100 : thisMonth > 0 ? 100 : 0
      rows.push({
        category,
        this_month_kd: thisMonth,
        last_month_kd: lastMonth,
        delta_kd: delta,
        delta_pct: deltaPct,
      })
    }
    rows.sort((a, b) => Math.abs(b.delta_kd) - Math.abs(a.delta_kd) || a.category.localeCompare(b.category))
    return rows
  }, [monthDeltaQuery.data?.expense_by_category, prevMonth, selectedMonth])

  const activeMonthsInReadinessWindow = useMemo(() => {
    const monthly = readinessQuery.data?.monthly || []
    return monthly.filter((row) => Number(row.expense_kd || 0) > 0 || Number(row.income_kd || 0) > 0).length
  }, [readinessQuery.data?.monthly])
  const committedThisMonth = Number(safeToSpendQuery.data?.committed_kd ?? 0)
  const remainingBudget = Number(safeToSpendQuery.data?.remaining_budget_kd || 0)
  const actualSpend = Number(safeToSpendQuery.data?.actual_spend_kd || 0)

  const hasInsightsErrors = Boolean(
    monthOptionsQuery.error
      || recurringPatternsQuery.error
      || monthDeltaQuery.error
      || readinessQuery.error
      || safeToSpendQuery.error
      || weeklyDigestQuery.error
  )
  const hasAnyInsightsData = activeMonthsInReadinessWindow > 0
    || recurringRows.length > 0
    || monthDeltaRows.length > 0
    || Boolean(weeklyDigestQuery.data)
    || committedThisMonth > 0
    || actualSpend > 0
    || remainingBudget > 0
  const showInsightsEmptyState = !hasInsightsErrors
    && !monthOptionsQuery.isLoading
    && !recurringPatternsQuery.isLoading
    && !monthDeltaQuery.isLoading
    && !readinessQuery.isLoading
    && !safeToSpendQuery.isLoading
    && !weeklyDigestQuery.isLoading
    && !hasAnyInsightsData
  const limitedData = !readinessQuery.isLoading && activeMonthsInReadinessWindow < 3

  const storyOfMonth = useMemo(() => {
    if (monthDeltaRows.length > 0) {
      const lead = monthDeltaRows[0]
      const sameAsLastMonth = Math.abs(lead.delta_pct) < 0.5 || Math.abs(lead.delta_kd) < 0.001
      const direction = lead.delta_kd >= 0 ? "higher" : "lower"
      // MOB-1 Group 1 — `committedThisMonth` is budget allocations only (R9, post SC-1/2), and
      // budgets are strictly positive at the database, so 0 means NO BUDGETS rather than a plan
      // that happens to total nothing. Without that guard `remainingBudget` was also 0, the
      // else-arm fired, and the sentence asserted that commitments were overtaking a budget the
      // user had never set. Suppressed rather than relabelled — naming the state needs new copy.
      // MOB-R27 I-a — the free-to-spend sentence is DROPPED ENTIRELY, not reworded: it was the
      // last render path on Insights for the figure the operator asked to stop seeing. The
      // remaining arm is unchanged. Grammar is safe by construction rather than by inspection —
      // the join below filters empty clauses, so dropping this one leaves lead1 standing alone,
      // and lead1 is a complete sentence in both of its forms.
      const paceNote =
        committedThisMonth <= 0 || remainingBudget > 0
          ? ""
          : "Committed spending is now overtaking the rest of this month's budget."
      const lead1 = sameAsLastMonth
        ? `${lead.category} is tracking about the same as last month.`
        : `${lead.category} is ${Math.abs(lead.delta_pct).toFixed(0)}% ${direction} than last month, a shift of ${formatKD(Math.abs(lead.delta_kd))}.`
      // Joined rather than interpolated so an empty paceNote leaves no trailing space.
      return [lead1, paceNote].filter(Boolean).join(" ")
    }

    if (recurringRows.length > 0) {
      // MOB-R27 I-b — phrase substitution inside an otherwise unchanged sentence: the clause
      // "before free-to-spend money is calculated" becomes "before what's left for everything
      // else", so the sentence no longer names the removed feature.
      return `${recurringRows[0].name} is your next recurring commitment, and your monthly plan already protects ${formatKD(committedThisMonth)} before what's left for everything else.`
    }

    return null
  }, [committedThisMonth, monthDeltaRows, recurringRows, remainingBudget])

  return (
    <div className="space-y-8">
      <PageHeader
        badge="Insights"
        badgeDotClassName="bg-primary"
        badgeSuffix={monthLabel}
        title="Alerts & Trends"
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={selectedMonth}
              onValueChange={setSelectedMonth}
              disabled={monthOptionsQuery.isLoading || monthOptions.length === 0}
            >
              <SelectTrigger
                className="h-10 w-[160px] rounded-full px-4 text-sm shadow-sm sm:w-[180px]"
                aria-label="Select insights month"
              >
                <SelectValue placeholder="No months" />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((month) => (
                  <SelectItem key={month} value={month}>
                    {labelForYM(month)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      />

      {showInsightsEmptyState ? (
        <section className="section-panel panel-featured float-in">
          <EmptyState
            icon={<Sparkles className="h-8 w-8" />}
            title="No insights yet"
            description="Import or add transactions so we can surface recurring bills, merchant patterns, and month-over-month changes."
            action={(
              <Button
                type="button"
                variant="default"
                onClick={() => navigate("/activity?import=1")}
              >
                Import activity
              </Button>
            )}
          />
        </section>
      ) : limitedData ? (
        <div className="status-card status-card-neutral flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Add more transactions to unlock the full picture — most insights need 3+ months of data.</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate("/activity?type=all")}
          >
            Open activity
          </Button>
        </div>
      ) : null}

      {storyOfMonth ? (
        <section className="section-panel panel-featured">
          <div className="section-header flex-row items-center justify-start gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold">Story of the month</h2>
          </div>
          <div className="section-body">
            <p className="max-w-3xl text-base text-foreground">{storyOfMonth}</p>
          </div>
        </section>
      ) : null}

      {/* MOB-R29 Part 3 — the This Week panel (WeeklyDigestSection) is removed FROM VIEW by
          operator ruling, SUPERSEDING the 2026-09-19 ruling that explicitly retained it. The
          whole panel goes: weekly insight, weekly pace, spending delta, and the "Days until
          payday" counter that was restored INTO it one cycle earlier. The counter is NOT
          re-homed — where it should live instead is a placement decision nobody has made.
          Stage 1 hides: the component, its own tests, analyticsApi.weeklyDigest and the types
          all stay; Stage 2 deletion remains unauthorised.

          weeklyDigestQuery is NOT dropped. The conditional is "drop iff the panel is its sole
          consumer", and it evaluates FALSE: the query still feeds hasInsightsErrors,
          hasAnyInsightsData and showInsightsEmptyState. Same shape as safeToSpendQuery last
          cycle, and the same answer.

          The grid wrapper that held this panel IS removed with it. After MOB-R25 took Month
          Snapshot out, this panel was its only remaining child, so the wrapper now has no
          children at any width — dead markup rather than a restyle, which the ruling authorises
          as part of the same hide. */}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <MonthDeltaCard
          rows={monthDeltaRows}
          loading={monthDeltaQuery.isLoading}
          error={queryErrorMessage(monthDeltaQuery.error)}
        />
        <RecurringCommitmentsCard
          rows={recurringRows}
          loading={recurringPatternsQuery.isLoading}
          error={queryErrorMessage(recurringPatternsQuery.error)}
          onDismiss={(name) =>
            setDismissedRecurringNames((prev) => {
              const next = new Set(prev)
              next.add(normalizeRecurringName(name))
              persistDismissedRecurringNames(user?.id, next)
              return next
            })
          }
          onOpenActivity={() => navigate("/activity?type=all")}
        />
      </div>

    </div>
  )
}
