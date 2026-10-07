import { useMemo } from "react"
import { AlertTriangle } from "lucide-react"

import { cn } from "@/lib/utils"

export function HomeFreshness({ analyticsUpdatedAt, className }: { analyticsUpdatedAt?: string | null; className?: string }) {
  const freshness = useMemo(() => {
    if (!analyticsUpdatedAt) return null
    const updatedAt = new Date(analyticsUpdatedAt)
    if (Number.isNaN(updatedAt.getTime())) return null

    const diffMinutes = Math.max(0, Math.floor((Date.now() - updatedAt.getTime()) / 60_000))
    const stale = diffMinutes > 30

    if (diffMinutes < 1) {
      return { label: "Updated just now", stale }
    }
    if (diffMinutes < 60) {
      return {
        label: `Updated ${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`,
        stale,
      }
    }

    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) {
      return {
        label: `Updated ${diffHours} hour${diffHours === 1 ? "" : "s"} ago`,
        stale,
      }
    }

    const diffDays = Math.floor(diffHours / 24)
    return {
      label: `Updated ${diffDays} day${diffDays === 1 ? "" : "s"} ago`,
      stale,
    }
  }, [analyticsUpdatedAt])
  if (!freshness) return null
  return (
    <div className={cn("flex justify-end text-xs", className)}>
      {freshness.stale ? (
        <div className="inline-flex items-start gap-2 rounded-full border border-warning/25 bg-warning/10 px-3 py-1 text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <div>
            <div className="font-semibold">Data may be out of date</div>
            <div className="text-[11px] text-warning/80">{freshness.label}</div>
          </div>
        </div>
      ) : (
        <span className="text-muted-foreground">{freshness.label}</span>
      )}
    </div>
  )
}
