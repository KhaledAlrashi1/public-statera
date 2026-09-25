import { CalendarDays, TrendingDown, TrendingUp } from "lucide-react"

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
  // MOB-1 Group 2 — see the Spending delta article below. Both week sums are formatKd of real
  // sums over strictly-positive amounts, so > 0 on either week means that week has rows.
  const hasWeekExpenses =
    Number(digest?.this_week_expense_kd ?? 0) > 0 || Number(digest?.last_week_expense_kd ?? 0) > 0

  return (
    <section className="section-panel">
      <div className="section-header flex-row items-center justify-start gap-2">
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
                  <p className="financial-number whitespace-nowrap text-lg font-semibold">{formatKD(digest.this_week_expense_kd)}</p>
                  <p className="text-[11px] text-muted-foreground">This week</p>
                </div>
                <div className="flex items-baseline gap-2 border-t border-border/40 pt-2">
                  <p className="financial-number whitespace-nowrap text-sm font-semibold text-muted-foreground">{formatKD(digest.last_week_expense_kd)}</p>
                  <p className="text-[11px] text-muted-foreground">last week</p>
                </div>
              </article>

              {/* MOB-1 Group 2 — with no expenses in EITHER week both sums are "0.000" and the
                  delta is 0, which fell through to "Your weekly pace is unchanged." — a comparison
                  between two empty weeks. Expenses are strictly positive at the database
                  (chk_transactions_amount_positive, migration 0000), so a zero sum means NO ROWS
                  rather than a week that happened to cost nothing. The article is KEPT rather than
                  removed so the three-column grid does not lose a cell; the percentage falls back
                  to "N/A", which is this file's existing null marker (see days_until_payday
                  below), and the direction icon and sentence are suppressed because both assert a
                  direction that does not exist. */}
              <article className="inner-card space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Spending delta
                </p>
                {hasWeekExpenses ? (
                  <>
                    <p className={`inline-flex items-center gap-1 text-lg font-semibold tabular-nums ${deltaTone(digest.delta_pct)}`}>
                      <DeltaIcon className="h-4 w-4" />
                      {digest.delta_pct > 0 ? "+" : ""}{digest.delta_pct.toFixed(1)}%
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {digest.delta_pct < 0 ? "You spent less than last week." : digest.delta_pct > 0 ? "You spent more than last week." : "Your weekly pace is unchanged."}
                    </p>
                  </>
                ) : (
                  <p className="text-lg font-semibold tabular-nums text-muted-foreground">N/A</p>
                )}
              </article>

              {/* MOB-R27 — the payday counter RESTORED under its own ruled heading, the named
                  loss from MOB-R25 now discharged. Same field (days_until_payday), same figure,
                  same null marker as before its removal; no new data source, query or
                  computation — the value was already on the digest this panel receives.
                  The safe-to-spend label and figure that shared its old tile do NOT return.
                  This also refills the third cell, so the md:grid-cols-3 reflow named last
                  cycle resolves on its own rather than by restyling. */}
              <article className="inner-card space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Days until payday
                </p>
                <p className="text-lg font-semibold tabular-nums">
                  {digest.days_until_payday === null ? "N/A" : digest.days_until_payday}
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
                  <span className="whitespace-nowrap tabular-nums text-sm font-semibold text-muted-foreground">{formatKD(row.amount_kd)}</span>
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
