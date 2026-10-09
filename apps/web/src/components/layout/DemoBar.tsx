// MOB-R95 C7 — the demo's bar on Home, Activity, Plan and Insights (AppShell renders it only in the demo;
// /log has its own Save bar and no shell). It sits in the page's flow at the top of the content, never fixed,
// so it covers nothing: not the FAB, not the last row, not the tab bar. Sign up is a full page load, which
// drops the demo's memory and cache.
import { DEMO_SIGN_UP_HREF, isDemoMode } from "@/lib/demo/mode"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function DemoBar() {
  if (!isDemoMode()) return null
  return (
    <div
      role="region"
      aria-label="Demo"
      data-testid="demo-bar"
      className="mb-4 flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border bg-card px-4 py-3"
    >
      <p className="text-sm font-medium text-foreground">Like it? Keep your own</p>
      <a href={DEMO_SIGN_UP_HREF} className={cn(buttonVariants({ size: "sm" }), "shrink-0")}>
        Sign up
      </a>
    </div>
  )
}
