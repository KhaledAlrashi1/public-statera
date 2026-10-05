import * as React from "react"

import { cn } from "@/lib/utils"

const KD_PREFIX = "KD "

/**
 * MOB-R68 C3 — a bounded KPI tile: a label behind a 7px highlight square, a value in IBM Plex Mono
 * with a small "KD" before it (tabular digits), and one footer line. The "panel" variant is the
 * dark Remaining tile (with a 1px highlight border in dark mode).
 *
 * A money value is given as `money`: `text` is what shows now (it may be a count-up frame) and is
 * hidden from screen readers; `finalText` is the only text they get.
 */
export function KpiTile({
  label,
  money,
  value,
  footer,
  variant = "default",
  className,
  ...props
}: {
  label: string
  money?: { text: string; finalText: string }
  value?: React.ReactNode
  footer?: React.ReactNode
  variant?: "default" | "panel"
} & Omit<React.HTMLAttributes<HTMLDivElement>, "children">) {
  const panel = variant === "panel"
  return (
    <div
      className={cn(
        "min-w-0 rounded-[1rem] border p-4 shadow-[var(--shadow-level-2)]",
        panel
          ? "border-panel-border bg-panel text-panel-text"
          : "border-border bg-card text-card-foreground",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em]",
          panel ? "text-panel-muted" : "text-muted-foreground"
        )}
      >
        <span aria-hidden="true" className="size-[7px] shrink-0 bg-highlight" />
        {label}
      </div>
      <div className="mt-2 font-mono text-lg font-semibold tabular-nums leading-tight lg:text-2xl">
        {money ? (
          <>
            <span aria-hidden="true">
              {money.text.startsWith(KD_PREFIX) ? (
                <>
                  <span className={cn("me-1 text-sm font-medium", panel ? "text-panel-muted" : "text-muted-foreground")}>KD</span>
                  <span>{money.text.slice(KD_PREFIX.length)}</span>
                </>
              ) : (
                money.text
              )}
            </span>
            <span className="sr-only">{money.finalText}</span>
          </>
        ) : (
          value
        )}
      </div>
      {footer ? (
        <div className={cn("mt-3 text-xs", panel ? "text-panel-muted" : "text-muted-foreground")}>{footer}</div>
      ) : null}
    </div>
  )
}
