import { Wallet } from "lucide-react"

import { formatKD } from "@/lib/utils"

function segmentWidth(value: number, total: number): string {
  if (total <= 0) return "0%"
  return `${Math.max(0, (value / total) * 100)}%`
}

export function SpendForecastWidget({
  committed_kd,
  remaining_kd,
  spent_kd,
  loading,
  error,
}: {
  committed_kd: number
  remaining_kd: number
  spent_kd: number
  loading: boolean
  error?: string | null
}) {
  const total = Math.max(0, committed_kd) + Math.max(0, remaining_kd) + Math.max(0, spent_kd)
  // MOB-1 Group 1 — every arm of this chain is a claim about COMMITMENTS against a budget, so
  // none of them means anything when there are no commitments. `committed_kd` is budget
  // allocations only (R9, post SC-1/2) and budgets are strictly positive at the database
  // (chk_budgets_amount_positive, migration 0000), so 0 means NO BUDGETS rather than a plan
  // totalling nothing. Without this the first arm fired on `remaining_kd <= 0` and asserted that
  // committed spending was overtaking a budget that does not exist.
  //
  // This predicate is deliberately WIDER than a zero-total check, which was the first attempt: a
  // month with real spend but no budgets has a non-zero total and still has nothing to say here.
  // committed_kd > 0 implies total > 0, so this subsumes the no-data case as well.
  const guidance =
    committed_kd <= 0
      ? null
      : remaining_kd <= 0
        ? "Committed spending is now overtaking the rest of this month's budget."
        : remaining_kd >= committed_kd
          ? "You're ahead of pace with healthy discretionary room still available."
          : "You're still within plan, but discretionary room is tightening."

  return (
    <article className="section-panel">
      <div className="section-header flex-row items-center justify-start gap-2">
        <Wallet className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-semibold">Month Snapshot</h2>
      </div>
      <div className="section-body">
        {loading ? (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="skeleton h-14" />
              <div className="skeleton h-14" />
              <div className="skeleton h-14" />
            </div>
            <div className="skeleton h-4" />
          </div>
        ) : error ? (
          <div className="status-card status-card-danger">
            {error}
          </div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="inner-card">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Already spent</p>
                <p className="financial-number whitespace-nowrap text-lg font-semibold">{formatKD(spent_kd)}</p>
              </div>
              <div className="inner-card">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Committed</p>
                <p className="financial-number whitespace-nowrap text-lg font-semibold">{formatKD(committed_kd)}</p>
              </div>
              <div className="inner-card">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Free to spend</p>
                {/* Free-to-spend is decision (i)'s brass slot. --accent-strong (brass TEXT
                    token); enlarged to 1.25rem (20px) semibold so it clears the WCAG
                    large-text threshold (>=18.66px bold-equiv) at accent-strong's 3.39
                    contrast on the inner-card surface (R6). */}
                <p className="financial-number whitespace-nowrap text-[1.25rem] font-semibold text-accent-strong">{formatKD(remaining_kd)}</p>
              </div>
            </div>

            {/* decision (iii): the red/amber/green traffic light is retired.
                Spent = ink, Committed = neutral, Free to spend = brass (i). */}
            <div className="mt-3 overflow-hidden rounded-full bg-muted/40">
              <div className="flex h-4">
                <div
                  className="bg-primary/85"
                  style={{ width: segmentWidth(Math.max(0, spent_kd), total) }}
                  title="Spent"
                />
                <div
                  className="bg-muted-foreground/45"
                  style={{ width: segmentWidth(Math.max(0, committed_kd), total) }}
                  title="Committed"
                />
                <div
                  className="bg-accent"
                  style={{ width: segmentWidth(Math.max(0, remaining_kd), total) }}
                  title="Free to spend"
                />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-primary/85" />
                Spent
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/45" />
                Committed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-accent" />
                Free to spend
              </span>
            </div>
            {guidance ? (
              <p className="mt-3 text-sm text-muted-foreground">{guidance}</p>
            ) : null}
          </>
        )}
      </div>
    </article>
  )
}
