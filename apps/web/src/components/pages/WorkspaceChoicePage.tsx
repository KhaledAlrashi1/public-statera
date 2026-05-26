import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowRight, BarChart3, DatabaseZap, Sparkles, Scale } from "lucide-react"
import { Navigate, useNavigate, useSearchParams } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toaster"
import { getUserFirstName, useAuth } from "@/contexts/AuthContext"
import { ApiError, authApi } from "@/lib/api"

export default function WorkspaceChoicePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [loadingDemo, setLoadingDemo] = useState(false)
  const [searchParams] = useSearchParams()
  const fromSignup = searchParams.get("source") === "signup"

  if (!fromSignup) {
    return <Navigate to="/" replace />
  }

  const firstName = getUserFirstName(user) || "there"

  const continueEmpty = () => {
    navigate("/", { replace: true })
  }

  const loadDemoWorkspace = async () => {
    setLoadingDemo(true)
    try {
      const summary = await authApi.loadDemoData()
      await queryClient.invalidateQueries()
      toast.success(
        `Loaded ${summary.transactions_created} demo transactions across ${summary.months_seeded} months.`
      )
      navigate("/", { replace: true })
    } catch (error) {
      if (error instanceof ApiError && error.code === "demo_data_not_empty") {
        navigate("/", { replace: true })
      }
      toast.error(error instanceof Error ? error.message : "We couldn't load the demo workspace right now.")
    } finally {
      setLoadingDemo(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 app-surface" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-10">
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
              You can start with a clean workspace and add your own data, or load a realistic demo
              workspace to evaluate the dashboard, planning tools, and insights immediately.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="surface-muted-card p-4">
                <Sparkles className="h-5 w-5 text-primary" />
                <p className="mt-3 text-sm font-semibold text-foreground">See value fast</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Demo mode shows six months of realistic spend, budgets, debt, and goals.
                </p>
              </div>
              <div className="surface-muted-card p-4">
                <BarChart3 className="h-5 w-5 text-primary" />
                <p className="mt-3 text-sm font-semibold text-foreground">Stay in control</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  The demo workspace can be cleared later or replaced by your first real import.
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
                <li>- Categorize your income transactions so planning uses real inflows</li>
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
              <p className="text-sm font-semibold text-foreground">Explore the demo workspace</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Load a seeded six-month sample and inspect the product before committing your own
                data.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li>- 40+ realistic income and spending transactions</li>
                <li>- Current-month budgets, starter debt, and a savings goal</li>
                <li>- Can be cleared or replaced when you import real data</li>
              </ul>
              <Button
                type="button"
                className="mt-5 w-full justify-between"
                loading={loadingDemo}
                disabled={loadingDemo}
                onClick={() => {
                  void loadDemoWorkspace()
                }}
              >
                {loadingDemo ? "Loading demo workspace..." : "Load demo workspace"}
                {!loadingDemo ? <ArrowRight className="h-4 w-4" /> : null}
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
