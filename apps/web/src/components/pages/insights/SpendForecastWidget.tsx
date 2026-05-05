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
  const guidance =
    remaining_kd <= 0
      ? "Committed spending is now overtaking the rest of this month's budget."
      : remaining_kd >= committed_kd
        ? "You're ahead of pace with healthy discretionary room still available."
        : "You're still within plan, but discretionary room is tightening."

  return (
    <article className="section-panel">
      <div className="section-header justify-start gap-2">
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
                <p className="financial-number text-lg font-semibold">{formatKD(spent_kd)}</p>
              </div>
              <div className="inner-card">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Committed</p>
                <p className="financial-number text-lg font-semibold">{formatKD(committed_kd)}</p>
              </div>
              <div className="inner-card">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Free to spend</p>
                <p className="financial-number text-lg font-semibold">{formatKD(remaining_kd)}</p>
              </div>
            </div>

            <div className="mt-3 overflow-hidden rounded-full bg-muted/40">
              <div className="flex h-4">
                <div
                  className="bg-destructive/80"
                  style={{ width: segmentWidth(Math.max(0, spent_kd), total) }}
                  title="Spent"
                />
                <div
                  className="bg-warning/80"
                  style={{ width: segmentWidth(Math.max(0, committed_kd), total) }}
                  title="Committed"
                />
                <div
                  className="bg-success/80"
                  style={{ width: segmentWidth(Math.max(0, remaining_kd), total) }}
                  title="Free to spend"
                />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-destructive/60" />
                Spent
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-warning/60" />
                Committed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-success/60" />
                Free to spend
              </span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{guidance}</p>
          </>
        )}
      </div>
    </article>
  )
}
