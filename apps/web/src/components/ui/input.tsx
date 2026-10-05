import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // pointer-coarse:min-h-11 — same 44px touch minimum as the button primitive, desktop
          // untouched. h-9 (36px) is the declared height; min-h raises it only under a coarse
          // pointer. MOB-R69 D2 — pointer-coarse:text-[1rem]: iOS zooms the page on focus of any
          // field under 16px (text-base here is 15px), and the zoomed page then pans sideways.
          // A caller that passes a LARGER size (text-lg and up) must also pass pointer-coarse:<size>,
          // because tailwind-merge keeps this variant; no caller does today (MOB-R69 search).
          "flex h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-3 py-1 text-base shadow-sm transition-colors pointer-coarse:min-h-11 pointer-coarse:text-[1rem] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
