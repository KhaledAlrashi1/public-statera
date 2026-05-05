import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CalendarRange,
  Lightbulb,
  Minus,
  RefreshCw,
  Repeat2,
  TrendingUp,
} from "lucide-react"

import { analyticsApi } from "@/lib/api"
import { CHART_FILLS } from "@/lib/chart-tokens"
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "@/lib/recharts"
import { chartTooltipStyle, formatKD, labelForYM } from "@/lib/utils"
import PageHeader from "@/components/layout/PageHeader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type {
  SpendingIntelligenceBenchmark,
  SpendingIntelligenceDelta,
  SpendingIntelligenceMerchant,
} from "@/types/api"

const MONTHS = Array.from({ length: 12 }, (_, index) => {
  const date = new Date()
  date.setDate(1)
  date.setMonth(date.getMonth() - index)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
})

function deltaTone(delta_kd: number, delta_pct: number): string {
  if (delta_kd > 0 && delta_pct > 20) return "text-warning"
  if (delta_kd > 0) return "text-destructive"
  if (delta_kd < 0) return "text-success"
  return "text-muted-foreground"
}

function DeltaIcon({ delta_kd }: { delta_kd: number }) {
  if (delta_kd > 0) return <ArrowUpRight className="h-4 w-4" />
  if (delta_kd < 0) return <ArrowDownRight className="h-4 w-4" />
  return <Minus className="h-4 w-4" />
}

function confidenceBadge(confidence: string): string {
  if (confidence === "high") return "bg-success/15 text-success"
  if (confidence === "medium") return "bg-warning/15 text-warning"
  return "bg-muted text-muted-foreground"
}

function frequencyLabel(frequency: string): string {
  const map: Record<string, string> = {
    monthly: "Monthly",
    bi_weekly: "Bi-weekly",
    weekly: "Weekly",
    irregular: "Irregular",
  }
  return map[frequency] ?? frequency
}

function averageTicket(merchant: SpendingIntelligenceMerchant): number {
  if (!merchant.transaction_count) return 0
  return Number(merchant.total_kd || 0) / merchant.transaction_count
}

function formatCompactKD(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1000) return `KD ${(value / 1000).toFixed(0)}K`
  return `KD ${value.toFixed(0)}`
}

function SummaryCardSkeleton() {
  return (
    <div className="mt-3 space-y-2">
      <div className="skeleton h-6 w-28 rounded-md" />
      <div className="skeleton h-4 w-40 rounded-md" />
    </div>
  )
}

export default function SpendingIntelligencePage() {
  const navigate = useNavigate()
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[0])

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["spending-intelligence", selectedMonth],
    queryFn: () => analyticsApi.spendingIntelligence(selectedMonth),
    staleTime: 2 * 60 * 1000,
  })

  const month = data?.month ?? selectedMonth
  const prevMonth = data?.prev_month ?? ""
  const monthLabel = labelForYM(month)
  const prevMonthLabel = labelForYM(prevMonth)
  const topMerchants = data?.top_merchants ?? []
  const categoryBenchmarks = data?.category_benchmarks ?? []
  const categoryDeltas = data?.category_deltas ?? []
  const recurringBills = data?.recurring_bills ?? []
  const hasData = Boolean(data)
  const fatalError = Boolean(error) && !hasData
  const showingStaleData = Boolean(error) && hasData
  const initialLoad = isLoading && !hasData
  const loadErrorMessage = error instanceof Error && error.message.trim()
    ? error.message
    : "Try again in a moment."

  const leadMerchant = topMerchants[0] ?? null
  const biggestMover = categoryDeltas[0] ?? null

  const benchmarkChartRows = useMemo(
    () =>
      categoryBenchmarks.map((row: SpendingIntelligenceBenchmark) => ({
        category: row.category,
        current_kd: row.current_kd,
        average_kd: row.average_kd,
      })),
    [categoryBenchmarks]
  )
  const benchmarkLeader = benchmarkChartRows.reduce<{
    category: string
    current_kd: number
    average_kd: number
    delta: number
  } | null>((current, row) => {
    const delta = row.current_kd - row.average_kd
    if (!current || Math.abs(delta) > Math.abs(current.delta)) {
      return { ...row, delta }
    }
    return current
  }, null)
  const benchmarkInsight = benchmarkLeader
    ? benchmarkLeader.delta > 0
      ? `${benchmarkLeader.category} is running ${formatCompactKD(benchmarkLeader.delta)} above its 3-month average.`
      : benchmarkLeader.delta < 0
        ? `${benchmarkLeader.category} is ${formatCompactKD(Math.abs(benchmarkLeader.delta))} below its 3-month average.`
        : `${benchmarkLeader.category} is matching its recent average almost exactly.`
    : "Compare the current month with your trailing three full months to spot categories that are heating up."
  const hasInsightSignals =
    benchmarkChartRows.length > 0 ||
    topMerchants.length > 0 ||
    categoryDeltas.length > 0 ||
    recurringBills.length > 0
  const showPageEmptyState = !initialLoad && !fatalError && !hasInsightSignals

  return (
    <div className="space-y-8">
      <PageHeader
        badge="Spending Intelligence"
        badgeDotClassName="bg-primary"
        badgeSuffix={monthLabel}
        title="See which categories are running hot"
        actions={
          <div className="flex items-center gap-2">
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="h-10 rounded-full border border-border bg-card px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Select reference month"
            >
              {MONTHS.map((monthKey) => (
                <option key={monthKey} value={monthKey}>
                  {monthKey}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label="Refresh spending intelligence"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        }
      />

      {fatalError ? (
        <Alert variant="destructive">
          <AlertTitle className="text-destructive">Insights unavailable</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>We couldn't load your spending insights right now. {loadErrorMessage}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                Retry insights
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : showingStaleData ? (
        <Alert variant="warning">
          <AlertTitle>Showing last available insights</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              Fresh data could not be loaded for {monthLabel}. The page is showing the most recent cached
              results instead. {loadErrorMessage}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                Retry insights
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {showPageEmptyState ? (
        <section className="section-panel">
          <div className="section-body">
            <EmptyState
              icon={<Lightbulb className="h-8 w-8" />}
              title="No spending patterns yet"
              description="Add or import a few categorized transactions and Statera will surface merchant concentration, month-over-month shifts, and recurring bills here."
              action={(
                <div className="flex flex-wrap justify-center gap-2">
                  <Button type="button" onClick={() => navigate("/activity?type=all")}>
                    Review transactions
                  </Button>
                  <Button type="button" variant="outline" onClick={() => navigate("/plan")}>
                    Open plan
                  </Button>
                </div>
              )}
            />
          </div>
        </section>
      ) : !fatalError ? (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="inner-card">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Building2 className="h-4 w-4 text-primary" />
                Lead merchant
              </div>
              {initialLoad ? (
                <SummaryCardSkeleton />
              ) : (
                <>
                  <div className="mt-3 text-lg font-semibold">
                    {leadMerchant ? leadMerchant.merchant : "No merchant data"}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {leadMerchant
                      ? `${formatKD(leadMerchant.total_kd)} across ${leadMerchant.transaction_count} transactions`
                      : "Add more categorized spend to see merchant concentration."}
                  </p>
                </>
              )}
            </div>
            <div className="inner-card">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <TrendingUp className="h-4 w-4 text-primary" />
                Biggest mover
              </div>
              {initialLoad ? (
                <SummaryCardSkeleton />
              ) : (
                <>
                  <div className="mt-3 text-lg font-semibold">
                    {biggestMover ? biggestMover.category : "No month-over-month movement"}
                  </div>
                  <p className={`mt-1 flex items-center gap-1 text-sm ${biggestMover ? deltaTone(biggestMover.delta_kd, biggestMover.delta_pct) : "text-muted-foreground"}`}>
                    {biggestMover ? (
                      <>
                        <DeltaIcon delta_kd={biggestMover.delta_kd} />
                        <span>
                          {formatKD(Math.abs(biggestMover.delta_kd))} ({Math.abs(biggestMover.delta_pct).toFixed(1)}%)
                        </span>
                      </>
                    ) : (
                      "Not enough historical data yet."
                    )}
                  </p>
                </>
              )}
            </div>
            <div className="inner-card">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Repeat2 className="h-4 w-4 text-primary" />
                Recurring patterns
              </div>
              {initialLoad ? (
                <SummaryCardSkeleton />
              ) : (
                <>
                  <div className="mt-3 text-lg font-semibold">{recurringBills.length}</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Medium- and high-confidence recurring expenses detected in the last 90 days.
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <section className="section-panel panel-featured">
          <div className="section-header">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <h2 className="text-lg font-semibold">Category spend vs. 3-month average</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{benchmarkInsight}</p>
            </div>
            <span className="text-xs text-muted-foreground">{monthLabel}</span>
          </div>
          <div className="section-body">
            {isLoading ? (
              <div className="space-y-2">
                <div className="skeleton h-[260px] rounded-[var(--radius-inner)] sm:h-[320px]" />
              </div>
            ) : benchmarkChartRows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Add more monthly spending history to compare categories against your recent average.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="h-[260px] w-full sm:h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={benchmarkChartRows} layout="vertical" margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.4} />
                      <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(value) => formatCompactKD(Number(value))} />
                      <YAxis type="category" dataKey="category" width={120} tick={{ fontSize: 12 }} />
                      <RechartsTooltip
                        formatter={(value: number, key: string) => [
                          formatKD(value),
                          key === "current_kd" ? monthLabel : "3-mo avg",
                        ]}
                        contentStyle={chartTooltipStyle}
                      />
                      <Legend verticalAlign="top" height={30} />
                      <Bar dataKey="average_kd" name="3-mo avg" fill="var(--color-chart-accent-1)" radius={[0, 6, 6, 0]} />
                      <Bar dataKey="current_kd" name={monthLabel} fill={CHART_FILLS.spent} radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-muted-foreground">
                  Compare this month against the trailing three full months to spot categories that are accelerating.
                </p>
              </div>
            )}
          </div>
        </section>

            <section className="section-panel">
              <div className="section-header">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <h2 className="text-lg font-semibold">Merchant frequency</h2>
                </div>
                <span className="text-xs text-muted-foreground">Last 90 days</span>
              </div>
              <div className="section-body">
                {isLoading ? (
                  <div className="space-y-2">
                    {[0, 1, 2, 3, 4].map((index) => (
                      <div key={index} className="skeleton h-12 rounded-[var(--radius-inner)]" />
                    ))}
                  </div>
                ) : topMerchants.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Add more categorized spending to see which merchants take the biggest share.
                  </p>
                ) : (
                  <>
                    <div className="space-y-3 md:hidden">
                      {topMerchants.map((merchant: SpendingIntelligenceMerchant) => (
                        <article key={merchant.merchant} className="inner-card space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">{merchant.merchant}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {merchant.transaction_count} transaction{merchant.transaction_count === 1 ? "" : "s"}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-base font-semibold tabular-nums">{formatKD(merchant.total_kd)}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Avg {formatKD(averageTicket(merchant))}
                              </p>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                    <div className="hidden md:block">
                      <Table>
                        <TableHeader>
                          <tr>
                            <TableHead>Merchant</TableHead>
                            <TableHead className="text-right">Txns</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="text-right">Avg ticket</TableHead>
                          </tr>
                        </TableHeader>
                        <TableBody>
                          {topMerchants.map((merchant: SpendingIntelligenceMerchant) => (
                            <TableRow key={merchant.merchant}>
                              <TableCell className="font-medium">{merchant.merchant}</TableCell>
                              <TableCell className="text-right tabular-nums">{merchant.transaction_count}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatKD(merchant.total_kd)}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatKD(averageTicket(merchant))}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>

          <section className="section-panel">
        <div className="section-header">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold">Month-over-month category deltas</h2>
          </div>
          <span className="text-xs text-muted-foreground">
            {prevMonthLabel} → {monthLabel}
          </span>
        </div>
        <div className="section-body">
          {isLoading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="skeleton h-24 rounded-[var(--radius-inner)]" />
              ))}
            </div>
          ) : categoryDeltas.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Add spending in at least two months to compare category movement over time.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {categoryDeltas.map((delta: SpendingIntelligenceDelta) => (
                <div key={delta.category} className="inner-card flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">{delta.category}</p>
                    <div className={`flex items-center gap-1 text-sm font-semibold ${deltaTone(delta.delta_kd, delta.delta_pct)}`}>
                      <DeltaIcon delta_kd={delta.delta_kd} />
                      <span>{Math.abs(delta.delta_pct).toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span>{monthLabel}</span>
                      <span className="tabular-nums text-foreground">{formatKD(delta.current_kd)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>{prevMonthLabel}</span>
                      <span className="tabular-nums text-foreground">{formatKD(delta.previous_kd)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-border/50 pt-2">
                      <span>Change</span>
                      <span className={`tabular-nums ${deltaTone(delta.delta_kd, delta.delta_pct)}`}>
                        {delta.delta_kd >= 0 ? "+" : "-"}
                        {formatKD(Math.abs(delta.delta_kd)).replace("KD ", "KD ")}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

          <section className="section-panel">
        <div className="section-header">
          <div className="flex items-center gap-2">
            <Repeat2 className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold">Recurring bills detected</h2>
          </div>
          <span className="text-xs text-muted-foreground">Last 90 days - medium+ confidence</span>
        </div>
        <div className="section-body">
          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((index) => (
                <div key={index} className="skeleton h-20 rounded-[var(--radius-inner)]" />
              ))}
            </div>
          ) : recurringBills.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Add more transactions over time to surface recurring bills automatically.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recurringBills.map((bill) => (
                <div key={bill.name} className="inner-card flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-sm font-medium leading-tight">{bill.name}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${confidenceBadge(bill.confidence)}`}>
                      {bill.confidence}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">
                      {frequencyLabel(bill.frequency)} · {bill.occurrences}×
                    </span>
                    <span className="text-sm font-semibold tabular-nums">{bill.avg_amount_kd} KD</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

          <div className="flex justify-center">
            <Button type="button" variant="outline" onClick={() => navigate("/insights")}>
              View full Insights
            </Button>
          </div>
        </>
      ) : null}
    </div>
  )
}
