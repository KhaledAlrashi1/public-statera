import { CalendarDays, TrendingDown, TrendingUp, Wallet } from "lucide-react"

import { formatDisplayDate, formatKD } from "@/lib/utils"
import type { WeeklyDigestResponse } from "@/types/api"

function deltaTone(deltaPct: number): string {
  if (deltaPct < 0) return "text-success"
  if (deltaPct > 0) return "text-destructive"
  return "text-muted-foreground"
}

function deltaIcon(deltaPct: number) {
  return deltaPct <= 0 ? TrendingDown : TrendingUp
}

function weeklyHeadline(digest: WeeklyDigestResponse): string {
  const deltaAbs = Math.abs(digest.delta_pct).toFixed(1)
  const leadCategory = digest.top_categories[0]?.name
  const leadClause = leadCategory ? ` ${leadCategory} is leading your spend so far.` : ""

  if (digest.delta_pct < 0) {
    return `You're tracking ${deltaAbs}% below last week.${leadClause}`
  }

  if (digest.delta_pct > 0) {
    return `You're tracking ${deltaAbs}% above last week.${leadClause}`
  }

  return `You're tracking in line with last week.${leadClause}`
}

export function WeeklyDigestSection({
  digest,
  loading,
  error,
}: {
  digest: WeeklyDigestResponse | undefined
  loading: boolean
  error?: string | null
}) {
  const DeltaIcon = deltaIcon(digest?.delta_pct ?? 0)

  return (
    <section className="section-panel">
      <div className="section-header justify-start gap-2">
        <CalendarDays className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-semibold">This Week</h2>
      </div>

      <div className="section-body">
        {loading ? (
          <div className="space-y-3">
            <div className="skeleton h-16" />
            <div className="grid gap-3 md:grid-cols-3">
              <div className="skeleton h-24" />
              <div className="skeleton h-24" />
              <div className="skeleton h-24" />
            </div>
          </div>
        ) : error ? (
          <div className="status-card status-card-danger">
            {error}
          </div>
        ) : !digest ? (
          <div className="surface-dashed-card p-4 text-center text-sm text-muted-foreground">
            No data yet. Add transactions to see your weekly digest.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="inner-card featured-card">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Weekly insight
              </p>
              <p className="mt-2 text-base font-semibold text-foreground">
                {weeklyHeadline(digest)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDisplayDate(digest.week_start)} to {formatDisplayDate(digest.week_end)}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <article className="inner-card space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Weekly pace
                </p>
                <div>
                  <p className="financial-number text-lg font-semibold">{formatKD(digest.this_week_expense_kd)}</p>
                  <p className="text-[11px] text-muted-foreground">This week</p>
                </div>
                <div className="flex items-baseline gap-2 border-t border-border/40 pt-2">
                  <p className="financial-number text-sm font-semibold text-muted-foreground">{formatKD(digest.last_week_expense_kd)}</p>
                  <p className="text-[11px] text-muted-foreground">last week</p>
                </div>
              </article>

              <article className="inner-card space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Spending delta
                </p>
                <p className={`inline-flex items-center gap-1 text-lg font-semibold tabular-nums ${deltaTone(digest.delta_pct)}`}>
                  <DeltaIcon className="h-4 w-4" />
                  {digest.delta_pct > 0 ? "+" : ""}{digest.delta_pct.toFixed(1)}%
                </p>
                <p className="text-sm text-muted-foreground">
                  {digest.delta_pct < 0 ? "You spent less than last week." : digest.delta_pct > 0 ? "You spent more than last week." : "Your weekly pace is unchanged."}
                </p>
              </article>

              <article className="inner-card space-y-2">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  <Wallet className="h-4 w-4" />
                  Safe-to-spend today
                </div>
                <p className="financial-number text-lg font-semibold">{formatKD(digest.safe_to_spend_today_kd)}</p>
                <p className="text-sm text-muted-foreground">
                  Days until payday: {digest.days_until_payday === null ? "N/A" : digest.days_until_payday}
                </p>
              </article>
            </div>
          </div>
        )}

        {!loading && digest && digest.top_categories.length > 0 ? (
          <div className="surface-subtle-card mt-3 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Top categories this week</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {digest.top_categories.map((row) => (
                <div key={row.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-foreground">{row.name}</span>
                  <span className="tabular-nums text-sm font-semibold text-muted-foreground">{formatKD(row.amount_kd)}</span>
                </div>
              ))}
            </div>
            {typeof digest.days_observed === "number" && digest.days_observed < 7 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Based on {digest.days_observed} day{digest.days_observed === 1 ? "" : "s"} of current-week data.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
