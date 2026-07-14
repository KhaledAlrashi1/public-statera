import { CircleAlert, Plus, SearchX, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"

export default function DevUiPage() {
  return (
    <div className="space-y-6 p-6 md:p-8">
      <section className="section-panel">
        <div className="section-header">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">UI Guardrails Gallery</h1>
            <p className="text-xs text-muted-foreground">
              Snapshot this page to catch style regressions quickly.
            </p>
          </div>
        </div>
        <div className="section-body">
          <div className="inner-card">
            <p className="text-sm text-muted-foreground">
              Route: <code>/dev-ui</code>
            </p>
          </div>
        </div>
      </section>

      <section className="section-panel">
        <div className="section-header">
          <h2 className="text-sm font-semibold">Buttons</h2>
        </div>
        <div className="section-body space-y-5">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Variants</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="default" size="default">default</Button>
              <Button variant="outline" size="default">outline</Button>
              <Button variant="secondary" size="default">secondary</Button>
              <Button variant="ghost" size="default">ghost</Button>
              <Button variant="link" size="default">link</Button>
              <Button variant="destructive" size="default">destructive</Button>
              <Button variant="pill" size="pill">pill</Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Sizes</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm">size-sm</Button>
              <Button variant="outline" size="default">size-default</Button>
              <Button variant="outline" size="lg">size-lg</Button>
              <Button variant="outline" size="icon" aria-label="Add item">
                <Plus />
              </Button>
              <Button variant="outline" size="pill">size-pill</Button>
            </div>
          </div>
        </div>
      </section>

      <section className="section-panel">
        <div className="section-header">
          <h2 className="text-sm font-semibold">Status Badges</h2>
        </div>
        <div className="section-body">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge-success inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
              Success
            </span>
            <span className="badge-warning inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
              Warning
            </span>
            <span className="badge-danger inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
              Danger
            </span>
            <span className="badge-neutral inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
              Neutral
            </span>
          </div>
        </div>
      </section>

      <section className="section-panel">
        <div className="section-header">
          <h2 className="text-sm font-semibold">Surface Comparison</h2>
        </div>
        <div className="section-body grid gap-4 md:grid-cols-2">
          <div className="section-panel p-4">
            <p className="text-sm font-semibold">section-panel sample</p>
            <p className="mt-1 text-xs text-muted-foreground">Use for major page sections.</p>
          </div>
          <div className="inner-card">
            <p className="text-sm font-semibold">inner-card sample</p>
            <p className="mt-1 text-xs text-muted-foreground">Use inside section bodies.</p>
          </div>
        </div>
      </section>

      <section className="section-panel">
        <div className="section-header">
          <h2 className="text-sm font-semibold">Skeletons</h2>
        </div>
        <div className="section-body space-y-3">
          <div className="skeleton h-5 w-40" />
          <div className="skeleton h-16 w-full" />
          <div className="grid gap-3 md:grid-cols-3">
            <div className="skeleton h-24" />
            <div className="skeleton h-24" />
            <div className="skeleton h-24" />
          </div>
        </div>
      </section>

      <section className="section-panel">
        <div className="section-header">
          <h2 className="text-sm font-semibold">Empty States</h2>
        </div>
        <div className="section-body grid gap-4 md:grid-cols-2">
          <div className="inner-card">
            <EmptyState
              compact
              icon={<SearchX className="h-6 w-6" />}
              title="No matching transactions"
              description="Try changing filters or clear the current query."
              action={<Button variant="outline" size="sm">Clear filters</Button>}
            />
          </div>

          <div className="inner-card">
            <EmptyState
              compact
              icon={<CircleAlert className="h-6 w-6" />}
              title="No budgets configured"
              description="Add a monthly budget to enable pace and overspend warnings."
              action={(
                <Button variant="default" size="sm">
                  <Wallet className="h-4 w-4" />
                  Add budget
                </Button>
              )}
            />
          </div>
        </div>
      </section>
    </div>
  )
}
