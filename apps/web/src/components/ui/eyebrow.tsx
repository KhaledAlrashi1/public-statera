import * as React from "react"

import { cn } from "@/lib/utils"

/** MOB-R68 C1 — a small uppercase label above a heading. Muted text; no brass text. */
export function Eyebrow({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground", className)}
      {...props}
    />
  )
}
