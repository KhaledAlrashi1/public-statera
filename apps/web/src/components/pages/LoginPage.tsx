import { Link } from "react-router-dom"
import { Scale, Sparkles, ShieldCheck } from "lucide-react"

export default function LoginPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 app-surface" />

      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 lg:flex-row lg:items-stretch">
        <section className="section-panel flex-1 p-7 float-in stagger-1">
          <div className="flex items-center gap-3">
            <div className="icon-shell h-12 w-12 border-primary/20 bg-primary/10 text-primary">
              <Scale className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Statera
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Welcome back</h1>
            </div>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            Track budgets, monitor cash flow, and keep every expense aligned with your goals.
          </p>

          <div className="mt-6 space-y-3">
            <div className="surface-muted-card flex items-start gap-3 p-4">
              <Sparkles className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">Clear monthly overview</p>
                <p className="text-sm text-muted-foreground">
                  Keep income, expenses, and budget usage in one focused dashboard.
                </p>
              </div>
            </div>
            <div className="surface-muted-card flex items-start gap-3 p-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">Secure by design</p>
                <p className="text-sm text-muted-foreground">
                  Your data stays protected with modern authentication workflows.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="section-panel float-in stagger-2 w-full max-w-md p-7">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-foreground">Sign in</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Use your Google account to continue.
            </p>
          </div>
          <a
            href="/api/auth/login"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
          >
            Continue with Google
          </a>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Link to="/privacy" className="hover:underline">
              Privacy
            </Link>
            <span className="mx-2" aria-hidden="true">
              ·
            </span>
            <Link to="/terms" className="hover:underline">
              Terms
            </Link>
          </p>
        </section>
      </div>
    </div>
  )
}
