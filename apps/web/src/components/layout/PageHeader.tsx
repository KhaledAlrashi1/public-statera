import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type PageHeaderProps = {
  badge: string
  badgeDotClassName?: string
  badgeSuffix?: ReactNode
  /** Visible page title. Omit to render no <h1> (e.g. Home uses its narration line as the heading and supplies its own sr-only h1). */
  title?: ReactNode
  actions?: ReactNode
  className?: string
  actionsClassName?: string
}

export default function PageHeader({
  badge,
  badgeDotClassName = "bg-primary",
  badgeSuffix,
  title,
  actions,
  className,
  actionsClassName,
}: PageHeaderProps) {
  return (
    <header className={cn("float-in flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="min-w-0 flex-1">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>{badge}</span>
          <span className={cn("h-1.5 w-1.5 rounded-full", badgeDotClassName)} />
          {badgeSuffix ? <span>{badgeSuffix}</span> : null}
        </div>
        {title ? (
          <h1 className="mt-3 text-[2rem] font-bold leading-[1.1] tracking-tight">{title}</h1>
        ) : null}
      </div>
      {actions ? (
        <div className={cn("flex w-full flex-wrap items-center gap-3 sm:w-auto sm:shrink-0 sm:justify-end", actionsClassName)}>
          {actions}
        </div>
      ) : null}
    </header>
  )
}
