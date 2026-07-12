import { ArrowRight, Repeat } from "lucide-react"

import { formatKD } from "@/lib/utils"
import type { RecurringPattern } from "@/types/api"
import { Button } from "@/components/ui/button"

function frequencyLabel(frequency: RecurringPattern["frequency"]): string {
  switch (frequency) {
    case "monthly":
      return "Monthly"
    case "bi-weekly":
      return "Bi-weekly"
    case "weekly":
      return "Weekly"
    default:
      return "Irregular"
  }
}

export function RecurringBillsCard({
  patterns,
  loading,
  onOpenActivity,
}: {
  patterns: RecurringPattern[]
  loading: boolean
  onOpenActivity: () => void
}) {
  const topPatterns = patterns.slice(0, 5)
  const monthlyCommitment = topPatterns
    .filter((pattern) => pattern.frequency === "monthly")
    .reduce((sum, pattern) => sum + Number(pattern.avg_amount_kd || 0), 0)

  return (
    <article className="inner-card">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Repeat className="h-4 w-4 text-primary" />
        Recurring Bills
      </div>

      {loading ? (
        <div className="mt-3 space-y-2">
          <div className="skeleton h-4" />
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton h-4 w-1/2" />
        </div>
      ) : topPatterns.length === 0 ? (
        <div className="surface-muted-card mt-3 p-3 text-sm text-muted-foreground">
          Add more transactions in this time range to detect recurring bills automatically.
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm">
            Total monthly commitment: <span className="whitespace-nowrap font-semibold">{formatKD(monthlyCommitment)}</span>
          </p>
          <ul className="space-y-2">
            {topPatterns.map((pattern) => (
              <li key={`${pattern.name}-${pattern.last_seen}`} className="flex items-start justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{pattern.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {pattern.occurrences} occurrence{pattern.occurrences === 1 ? "" : "s"} • {pattern.confidence} confidence
                  </p>
                </div>
                <div className="text-right">
                  <p className="whitespace-nowrap font-medium tabular-nums">{formatKD(pattern.avg_amount_kd)}</p>
                  <span className="inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {frequencyLabel(pattern.frequency)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        className="mt-4 w-full justify-between"
        onClick={onOpenActivity}
      >
        Open Activity
        <ArrowRight className="h-4 w-4" />
      </Button>
    </article>
  )
}
