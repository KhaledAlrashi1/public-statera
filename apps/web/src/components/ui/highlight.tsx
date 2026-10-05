import * as React from "react"

import { cn } from "@/lib/utils"

/** MOB-R68 C2 — a word set on the highlight token, in highlight-ink. */
export function Highlight({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "rounded-[0.3rem] bg-highlight px-1.5 text-highlight-ink [box-decoration-break:clone]",
        className
      )}
      {...props}
    />
  )
}
