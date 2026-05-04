import { Building2 } from "lucide-react"

import { formatKD } from "@/lib/utils"

export type MerchantInsightRow = {
  merchant: string
  amount_kd: number
  count: number
}

export function MerchantIntelligenceCard({
  rows,
  loading,
  error,
  onMerchantClick,
}: {
  rows: MerchantInsightRow[]
  loading: boolean
  error?: string | null
  onMerchantClick: (merchant: string) => void
}) {
  const maxAmount = rows[0]?.amount_kd || 1

  return (
    <article className="section-panel">
      <div className="section-header">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">Top Merchants</h2>
        </div>
        <span className="text-xs text-muted-foreground">Last 90 days</span>
      </div>
      <div className="section-body">
        {loading ? (
          <div className="space-y-2">
            <div className="skeleton h-10" />
            <div className="skeleton h-10" />
            <div className="skeleton h-10" />
            <div className="skeleton h-10" />
          </div>
        ) : error ? (
          <div className="status-card status-card-danger">
            {error}
          </div>
        ) : rows.length === 0 ? (
          <div className="surface-dashed-card p-4 text-center text-sm text-muted-foreground">
            Add more categorized spending to see your top merchants here.
          </div>
        ) : (
          <div className="scroll-panel-list space-y-1.5">
            {rows.map((row) => {
              const barWidth = `${Math.max(4, (row.amount_kd / maxAmount) * 100)}%`
              return (
                <button
                  key={row.merchant}
                  type="button"
                  className="surface-row-card group w-full px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                  onClick={() => onMerchantClick(row.merchant)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{row.merchant}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatKD(row.amount_kd)}
                      <span className="ml-1 opacity-60">· {row.count} txns</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted">
                    <div
                      className="h-1.5 rounded-full bg-primary/60 transition-all group-hover:bg-primary"
                      style={{ width: barWidth }}
                    />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </article>
  )
}
