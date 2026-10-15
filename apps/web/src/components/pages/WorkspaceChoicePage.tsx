import { ArrowRight, BarChart3, DatabaseZap, Sparkles, Scale } from "lucide-react"
import { Navigate, useNavigate, useSearchParams } from "react-router-dom"

import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getUserFirstName, useAuth } from "@/contexts/AuthContext"

export default function WorkspaceChoicePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fromSignup = searchParams.get("source") === "signup"

  if (!fromSignup) {
    return <Navigate to="/" replace />
  }

  const firstName = getUserFirstName(user) || "there"

  const continueEmpty = () => {
    navigate("/", { replace: true })
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 app-surface" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-10 pt-[calc(2.5rem+var(--safe-top))]">
        <div className="grid w-full gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="section-panel float-in stagger-1 p-8">
            <div className="flex items-center gap-3">
              <div className="icon-shell h-12 w-12 border-primary/20 bg-primary/10 text-primary">
                <Scale className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Statera
                </p>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                  Choose your starting point, {firstName}
                </h1>
              </div>
            </div>

            <p className="mt-4 max-w-2xl text-sm text-muted-foreground">
              You can start with a clean workspace and add your own data, or see a demo to evaluate
              the dashboard, planning tools, and insights immediately.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="surface-muted-card p-4">
                <Sparkles className="h-5 w-5 text-primary" />
                <p className="mt-3 text-sm font-semibold text-foreground">See value fast</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  The demo shows three months of sample spending and budgets.
                </p>
              </div>
              <div className="surface-muted-card p-4">
                <BarChart3 className="h-5 w-5 text-primary" />
                <p className="mt-3 text-sm font-semibold text-foreground">Stay in control</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your account stays empty until you add your own.
                </p>
              </div>
              <div className="surface-muted-card p-4">
                <DatabaseZap className="h-5 w-5 text-primary" />
                <p className="mt-3 text-sm font-semibold text-foreground">Keep it simple</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Starting empty drops you straight into the normal onboarding checklist.
                </p>
              </div>
            </div>
          </section>

          <section className="grid gap-4 float-in stagger-2">
            <div className="inner-card border-border/70">
              <p className="text-sm font-semibold text-foreground">Start empty</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Use your own income, transactions, and budgets from the beginning.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li>- Add your first transaction or import your own CSV</li>
                <li>- Enter your monthly income so planning starts from your real numbers</li>
                <li>- Build a budget from your own categories</li>
              </ul>
              <Button
                type="button"
                variant="outline"
                className="mt-5 w-full justify-between"
                onClick={continueEmpty}
              >
                Start with my own data
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="inner-card border-primary/25 bg-primary/5">
              <p className="text-sm font-semibold text-foreground">See a demo</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Look around a sample account with three months of spending.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li>- Three months of sample spending</li>
                <li>- A sample plan with a budget per category</li>
                <li>- Nothing you do there is saved to your account.</li>
              </ul>
              {/* MOB-R100 D2 — the old loader wrote demo rows into her account; this choice is now the demo
                  itself, as on the welcome page (LoginPage.tsx): a full page load to /demo, nothing saved. */}
              {/* A plain styled <a>: Button's asChild path drops its children (CLAUDE.md, 10c-3). */}
              <a href="/demo" className={cn(buttonVariants(), "mt-5 w-full justify-between")}>
                See a demo
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
