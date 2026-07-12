import { ArrowDownRight, ArrowUpRight, Minus, TrendingUp } from "lucide-react"

import { formatKD } from "@/lib/utils"

export type MonthDeltaRow = {
  category: string
  this_month_kd: number
  last_month_kd: number
  delta_kd: number
  delta_pct: number
}

function deltaTone(row: MonthDeltaRow): string {
  if (row.delta_kd > 0 && row.delta_pct > 20) return "text-destructive"
  if (row.delta_kd > 0) return "text-warning"
  if (row.delta_kd < 0) return "text-success"
  return "text-muted-foreground"
}

function DeltaIcon({ row }: { row: MonthDeltaRow }) {
  if (row.delta_kd > 0) return <ArrowUpRight className="h-4 w-4" />
  if (row.delta_kd < 0) return <ArrowDownRight className="h-4 w-4" />
  return <Minus className="h-4 w-4" />
}

function TrendSparkline({ row }: { row: MonthDeltaRow }) {
  const values = [row.last_month_kd, row.this_month_kd]
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = Math.max(max - min, 1)

  const toY = (value: number) => {
    const normalized = (value - min) / range
    return 18 - normalized * 14
  }

  const startY = toY(row.last_month_kd)
  const endY = toY(row.this_month_kd)

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 44 20"
      className={`h-5 w-11 ${deltaTone(row)} opacity-80`}
    >
      <path
        d={`M 2 ${startY} L 42 ${endY}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="2" cy={startY} r="1.8" fill="currentColor" opacity="0.6" />
      <circle cx="42" cy={endY} r="2.2" fill="currentColor" />
    </svg>
  )
}

export function MonthDeltaCard({
  rows,
  loading,
  error,
}: {
  rows: MonthDeltaRow[]
  loading: boolean
  error?: string | null
}) {
  return (
    <article className="section-panel">
      <div className="section-header justify-start gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-semibold">Spend vs Last Month</h2>
      </div>
      <div className="section-body">
        {loading ? (
          <div className="space-y-2">
            <div className="skeleton h-12" />
            <div className="skeleton h-12" />
            <div className="skeleton h-12" />
          </div>
        ) : error ? (
          <div className="status-card status-card-danger">
            {error}
          </div>
        ) : rows.length === 0 ? (
          <div className="surface-dashed-card p-4 text-center text-sm text-muted-foreground">
            Not enough month-over-month data yet.
          </div>
        ) : (
          <div className="scroll-panel-list space-y-1.5">
            {rows.map((row) => (
              <div
                key={row.category}
                className="surface-row-card flex items-center gap-3 px-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.category}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    This month <span className="whitespace-nowrap tabular-nums text-foreground">{formatKD(row.this_month_kd)}</span>
                    {" · "}
                    Last month <span className="whitespace-nowrap tabular-nums">{formatKD(row.last_month_kd)}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <TrendSparkline row={row} />
                  <div className="text-right">
                    <div className={`flex items-center justify-end gap-1 text-sm font-semibold ${deltaTone(row)}`}>
                      <DeltaIcon row={row} />
                      <span className="whitespace-nowrap">
                        {row.delta_kd >= 0 ? "+" : ""}
                        {formatKD(row.delta_kd)}
                      </span>
                    </div>
                    <div className="text-xs opacity-75">
                      ({row.delta_kd >= 0 ? "+" : ""}{row.delta_pct.toFixed(0)}%)
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}
