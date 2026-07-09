import { formatDisplayDate, formatKD } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

interface CategoryRow {
  id: number
  date: string
  merchant: string | null
  name: string
  amount_kd: string
}

export function CategoryDetailModal({
  open,
  onClose,
  activeCategory,
  selectedMonth,
  categoryRows,
  categoryRowsTotal,
  categoryHasMore,
  categoryLoadingMore,
  categoryError,
  onLoadMore,
  onRetryCategoryLoad,
  categoryTotal,
  categoryShare,
  categoryDelta,
  categoryDeltaPct,
  categoryPrevTotal,
  prevMonth,
}: {
  open: boolean
  onClose: () => void
  activeCategory: string | null
  selectedMonth: string
  categoryRows: CategoryRow[]
  categoryRowsTotal: number
  categoryHasMore: boolean
  categoryLoadingMore?: boolean
  categoryError?: string | null
  onLoadMore: () => void
  onRetryCategoryLoad?: () => void
  categoryTotal: number
  categoryShare: number
  categoryDelta: number
  categoryDeltaPct: number
  categoryPrevTotal: number
  prevMonth: string
}) {
  if (!activeCategory) return null
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-1rem)] max-w-5xl flex-col p-0 sm:w-full">
        <DialogHeader className="border-b border-border px-4 py-4 sm:px-6 sm:py-5">
          <DialogTitle>Transactions — {activeCategory}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2 pt-1">
            <span className="rounded-full bg-muted px-3 py-1 text-xs">
              {activeCategory}
            </span>
            <span className="rounded-full bg-muted px-3 py-1 text-xs">
              {selectedMonth || "—"}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <div className="inner-card">
              <div className="text-xs font-semibold tracking-wide text-muted-foreground">
                Category Total
              </div>
              <div className="mt-2 text-lg font-semibold tabular-nums">
                {formatKD(categoryTotal)}
              </div>
            </div>
            <div className="inner-card">
              <div className="text-xs font-semibold tracking-wide text-muted-foreground">
                Share of Month
              </div>
              <div className="mt-2 text-lg font-semibold tabular-nums">
                {categoryShare.toFixed(1)}%
              </div>
            </div>
            <div className="inner-card">
              <div className="text-xs font-semibold tracking-wide text-muted-foreground">
                vs {prevMonth || "Prev"}
              </div>
              <div
                className={`mt-2 text-lg font-semibold tabular-nums ${
                  categoryDelta >= 0 ? "text-destructive" : "text-success"
                }`}
              >
                {categoryDelta >= 0 ? "+" : "-"}
                {formatKD(Math.abs(categoryDelta))}
                {categoryPrevTotal > 0 && (
                  <span className="ml-2 text-sm font-medium text-muted-foreground">
                    ({categoryDeltaPct >= 0 ? "+" : "-"}
                    {Math.abs(categoryDeltaPct).toFixed(1)}%)
                  </span>
                )}
              </div>
            </div>
          </div>

          {categoryError ? (
            <div className="rounded-xl border border-warning/35 bg-warning/10 px-4 py-4 text-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-warning">Category transactions unavailable</p>
                  <p className="mt-1 text-muted-foreground">{categoryError}</p>
                </div>
                {onRetryCategoryLoad ? (
                  <Button type="button" variant="outline" size="sm" onClick={onRetryCategoryLoad}>
                    Retry
                  </Button>
                ) : null}
              </div>
            </div>
          ) : categoryRows.length === 0 ? (
            <div className="rounded-xl border border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
              No transactions for this category in the selected month.
            </div>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {categoryRows.map((t) => {
                  const primaryLabel = t.merchant || t.name || "—"
                  const secondaryLabel =
                    t.merchant && t.name && t.name !== t.merchant ? t.name : null

                  return (
                    <article key={t.id} className="inner-card space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold" title={primaryLabel}>
                            {primaryLabel}
                          </div>
                          {secondaryLabel ? (
                            <p className="mt-1 truncate text-xs text-muted-foreground" title={secondaryLabel}>
                              {secondaryLabel}
                            </p>
                          ) : null}
                          <p className="mt-2 text-xs text-muted-foreground">{formatDisplayDate(t.date)}</p>
                        </div>
                        <div className="text-right text-base font-semibold tabular-nums">
                          {formatKD(t.amount_kd)}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
              <div className="hidden inner-card max-h-[420px] overflow-auto p-0 md:block">
                <table className="w-full text-sm">
                  <thead className="table-head">
                    <tr>
                      <th className="th-standard">Date</th>
                      <th className="th-standard">Merchant</th>
                      <th className="th-standard">Item</th>
                      <th className="th-standard-r">Amount (KD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryRows.map((t) => (
                      <tr key={t.id} className="border-b border-border/60 table-row-hover">
                        <td className="px-4 py-3.5">{formatDisplayDate(t.date)}</td>
                        <td className="px-4 py-3.5">{t.merchant || "—"}</td>
                        <td className="px-4 py-3.5">{t.name || "—"}</td>
                        <td className="px-4 py-3.5 text-right font-medium tabular-nums">
                          {formatKD(t.amount_kd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>
                  Showing {categoryRows.length} of{" "}
                  {categoryRowsTotal > 0 ? categoryRowsTotal : categoryRows.length}
                </span>
                <Button
                  type="button"
                  variant="pill"
                  size="default"
                  loading={Boolean(categoryLoadingMore)}
                  className="h-9 px-3 text-sm font-medium"
                  onClick={onLoadMore}
                  disabled={!categoryHasMore || Boolean(categoryLoadingMore)}
                >
                  {categoryLoadingMore ? "Loading..." : "Load More"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
