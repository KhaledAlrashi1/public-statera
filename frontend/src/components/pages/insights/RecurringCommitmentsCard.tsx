import { CalendarClock, X } from "lucide-react"

import { formatKD } from "@/lib/utils"

export type RecurringCommitmentRow = {
  name: string
  avg_amount_kd: number
  expected_day: number
  next_expected_date: string
  status: "Due soon" | "Paid" | "Overdue" | "Upcoming"
  group: "Subscriptions" | "Utilities" | "Loan Payments" | "Other"
}

function statusTone(status: RecurringCommitmentRow["status"]): string {
  switch (status) {
    case "Paid":
      return "bg-success/15 text-success border-success/20"
    case "Due soon":
      return "bg-warning/15 text-warning border-warning/20"
    case "Overdue":
      return "bg-destructive/15 text-destructive border-destructive/20"
    default:
      return "bg-muted/60 text-muted-foreground border-border"
  }
}

const GROUP_LABELS: Record<RecurringCommitmentRow["group"], string> = {
  Subscriptions: "Subscriptions",
  Utilities: "Utilities",
  "Loan Payments": "Loan Payments",
  Other: "Other recurring",
}

export function RecurringCommitmentsCard({
  rows,
  loading,
  error,
  onDismiss,
  onOpenActivity,
}: {
  rows: RecurringCommitmentRow[]
  loading: boolean
  error?: string | null
  onDismiss: (name: string) => void
  onOpenActivity: () => void
}) {
  const grouped = {
    Subscriptions: rows.filter((row) => row.group === "Subscriptions"),
    Utilities: rows.filter((row) => row.group === "Utilities"),
    "Loan Payments": rows.filter((row) => row.group === "Loan Payments"),
    Other: rows.filter((row) => row.group === "Other"),
  }

  return (
    <article className="section-panel">
      <div className="section-header">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">Recurring Commitments</h2>
        </div>
        <button
          type="button"
          onClick={onOpenActivity}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          View activity →
        </button>
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
            Add more transaction history to surface recurring commitments automatically.
          </div>
        ) : (
          <div className="scroll-panel-list space-y-4">
            {(Object.keys(grouped) as Array<keyof typeof grouped>).map((groupName) =>
              grouped[groupName].length > 0 ? (
                <div key={groupName} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {GROUP_LABELS[groupName]}
                  </p>
                  {grouped[groupName].map((row) => (
                    <div key={`${groupName}:${row.name}`} className="inner-card">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{row.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatKD(row.avg_amount_kd)} · Due {row.next_expected_date}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusTone(row.status)}`}
                          >
                            {row.status}
                          </span>
                          <button
                            type="button"
                            onClick={() => onDismiss(row.name)}
                            className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label={`Dismiss ${row.name} as non-recurring`}
                            title="Dismiss as non-recurring"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null
            )}
          </div>
        )}
      </div>
    </article>
  )
}
