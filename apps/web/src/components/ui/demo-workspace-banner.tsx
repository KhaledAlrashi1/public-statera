import { Sparkles, Trash2, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { DemoWorkspaceState } from "@/types/api"

export function DemoWorkspaceBanner({
  demoWorkspace,
  onOpenImport,
  onClearDemoWorkspace,
  clearing,
}: {
  demoWorkspace: DemoWorkspaceState
  onOpenImport: () => void
  onClearDemoWorkspace: () => void
  clearing?: boolean
}) {
  return (
    <section className="section-panel border-warning/30 bg-warning/5" aria-label="Demo workspace banner">
      <div className="section-body flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-warning/15 text-warning">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold">Demo workspace is still active</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Replace the sample data on your first import so your real transactions do not mix with the demo history.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {demoWorkspace.transactions} demo transactions, {demoWorkspace.budgets} budgets,{" "}
              {demoWorkspace.debt_accounts} debt account, and {demoWorkspace.savings_goals} savings goal are loaded.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={onOpenImport}
            className="border-warning/40 bg-background/70 hover:bg-background"
          >
            <Upload className="mr-2 h-4 w-4" />
            Import real data
          </Button>
          <Button
            variant="outline"
            onClick={onClearDemoWorkspace}
            loading={Boolean(clearing)}
            disabled={Boolean(clearing)}
          >
            {!clearing ? <Trash2 className="mr-2 h-4 w-4" /> : null}
            {clearing ? "Clearing..." : "Clear demo workspace"}
          </Button>
        </div>
      </div>
    </section>
  )
}
